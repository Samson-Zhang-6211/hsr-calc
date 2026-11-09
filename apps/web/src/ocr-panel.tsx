import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CHARACTER_ROSTER } from './data/character-roster.js';
import { LIGHTCONE_ROSTER } from './data/lightcone-roster.js';
import { RELICSET_ROSTER } from './data/relicset-roster.js';
import {
  alignPanel,
  buildDraft,
  mergePanels,
  recognizeImages,
  recognizePanel,
  type MergeWarning,
  type OcrBuildPatch,
  type OcrDraft,
  type OcrFieldRow,
  type OcrFormPatch,
  type PanelAlignment,
} from './ocr/index.js';
import {
  countEidolons,
  detectMenuPage,
  readTraceLevels,
  recognizeCharacterName,
  recognizeLightconePage,
  recognizeRelicNames,
  recognizeRelicPage,
  type AssetCandidate,
  type VideoPageKind,
} from './ocr/pages.js';

/**
 * 截图 / 视频识别面板（角色管理内嵌弹层）。
 *
 * 数据流：图片或视频帧 → canvas.getImageData → recognizeImages（面板/行/字/对齐）
 *        → mergePanels（多图多帧合并）→ buildDraft（映射成手填字段）
 *        → onApply 填回角色管理表单（用户核对后保存）。
 *
 * 铁律（2026-10-28 用户裁定）：识别到的是游戏内**最终面板**，所有非条件子句已计入；
 * 这里只产出 manual 字段，不产出 build/equipment，绝不触发面板重算。
 */

const MAX_IMAGES = 6;
const MAX_SCAN_FRAMES = 60;

interface OcrImage {
  id: string;
  name: string;
  url: string;
  file: File;
}

interface OcrVideo {
  name: string;
  url: string;
  file: File;
}

type Frame = { data: Uint8ClampedArray; width: number; height: number };

interface OcrVideoPage {
  kind: VideoPageKind;
  time: number;
  thumb: string;
  lightcone?: { candidates: AssetCandidate[]; level: number; refinement: number };
  relics?: { four: AssetCandidate[]; planar: AssetCandidate[]; counts: Record<string, number> };
  traces?: { basic: number; skill: number; ult: number; talent: number };
  eidolons?: number;
}

function thumbnailOf(frame: Frame): string {
  const full = document.createElement('canvas');
  full.width = frame.width;
  full.height = frame.height;
  const fctx = full.getContext('2d');
  if (!fctx) return '';
  fctx.putImageData(new ImageData(new Uint8ClampedArray(frame.data), frame.width, frame.height), 0, 0);
  const w = 200;
  const h = Math.max(1, Math.round((w * frame.height) / frame.width));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';
  ctx.drawImage(full, 0, 0, w, h);
  return canvas.toDataURL('image/jpeg', 0.65);
}

export interface OcrPanelProps {
  open: boolean;
  initialRosterId: string;
  /** 当前表单里的纯登记值，作为弹层初值（视频页登记只改这里） */
  initialBuild?: OcrBuildPatch;
  onClose: () => void;
  /** 用户确认后把识别结果交给角色管理表单（不直接写 localStorage） */
  onApply: (rosterId: string, patch: OcrFormPatch, draft: OcrDraft, build?: OcrBuildPatch) => void;
}

function clampLevel(raw: string): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return 80;
  return Math.max(1, Math.min(80, Math.round(n)));
}

async function decodeImage(file: File): Promise<Frame> {
  const canvas = document.createElement('canvas');
  if (typeof createImageBitmap === 'function') {
    const bitmap = await createImageBitmap(file);
    try {
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('no 2d context');
      ctx.drawImage(bitmap, 0, 0);
      const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
      return { data: image.data, width: image.width, height: image.height };
    } finally {
      bitmap.close?.();
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('no 2d context');
    ctx.drawImage(img, 0, 0);
    const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
    return { data: image.data, width: image.width, height: image.height };
  } finally {
    URL.revokeObjectURL(url);
  }
}

function grabFrame(video: HTMLVideoElement, scale = 1): Frame | null {
  const w = video.videoWidth;
  const h = video.videoHeight;
  if (!w || !h) return null;
  const dw = Math.max(1, Math.round(w * scale));
  const dh = Math.max(1, Math.round(h * scale));
  const canvas = document.createElement('canvas');
  canvas.width = dw;
  canvas.height = dh;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.drawImage(video, 0, 0, dw, dh);
  const image = ctx.getImageData(0, 0, dw, dh);
  return { data: image.data, width: dw, height: dh };
}

function seekTo(video: HTMLVideoElement, time: number): Promise<void> {
  return new Promise((resolve) => {
    let done = false;
    const finish = (): void => {
      if (done) return;
      done = true;
      video.removeEventListener('seeked', finish);
      resolve();
    };
    video.addEventListener('seeked', finish);
    video.currentTime = Math.max(0, Math.min(time, Math.max(0, (video.duration || 0) - 0.05)));
    window.setTimeout(finish, 1500);
  });
}

/** 等视频元数据（duration/videoWidth）就绪；隐藏的 <video> 也能正常解码 */
async function waitMetadata(video: HTMLVideoElement): Promise<void> {
  if (video.readyState >= 1 && Number.isFinite(video.duration) && video.duration > 0) return;
  await new Promise<void>((resolve) => {
    let done = false;
    const finish = (): void => {
      if (done) return;
      done = true;
      video.removeEventListener('loadedmetadata', finish);
      resolve();
    };
    video.addEventListener('loadedmetadata', finish);
    window.setTimeout(finish, 4000);
  });
}

export function OcrPanel({ open, initialRosterId, initialBuild, onClose, onApply }: OcrPanelProps) {
  const { t, i18n } = useTranslation();
  const [rosterId, setRosterId] = useState(initialRosterId);
  const [level, setLevel] = useState('80');
  const [tab, setTab] = useState<'image' | 'video'>('image');
  const [images, setImages] = useState<OcrImage[]>([]);
  const [video, setVideo] = useState<OcrVideo | null>(null);
  const [videoDuration, setVideoDuration] = useState(0);
  const [videoTime, setVideoTime] = useState(0);
  const [scanning, setScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState<{ done: number; total: number } | null>(null);
  const [showPlayer, setShowPlayer] = useState(false);
  const [scanToken, setScanToken] = useState(0);
  const [buildLightconeId, setBuildLightconeId] = useState(initialBuild?.lightconeId ?? '');
  const [buildRefinement, setBuildRefinement] = useState(initialBuild?.refinement ?? 1);
  const [buildRelicsetId, setBuildRelicsetId] = useState(initialBuild?.relicsetId ?? '');
  const [buildRelicset2Id, setBuildRelicset2Id] = useState(initialBuild?.relicsetId2 ?? '');
  const [buildPlanarsetId, setBuildPlanarsetId] = useState(initialBuild?.planarsetId ?? '');
  const [buildBasic, setBuildBasic] = useState(initialBuild?.skillLevels?.basic ?? 6);
  const [buildSkill, setBuildSkill] = useState(initialBuild?.skillLevels?.skill ?? 10);
  const [buildUlt, setBuildUlt] = useState(initialBuild?.skillLevels?.ult ?? 10);
  const [buildTalent, setBuildTalent] = useState(initialBuild?.skillLevels?.talent ?? 10);
  const [buildEidolon, setBuildEidolon] = useState(initialBuild?.eidolonLevel ?? 0);
  const [pages, setPages] = useState<OcrVideoPage[]>([]);
  const [alignments, setAlignments] = useState<PanelAlignment[]>([]);
  const [status, setStatus] = useState<'idle' | 'working' | 'done' | 'error'>('idle');
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [failed, setFailed] = useState(0);
  const [drag, setDrag] = useState(false);
  const imagesRef = useRef<OcrImage[]>([]);
  const videoRef = useRef<OcrVideo | null>(null);
  const videoEl = useRef<HTMLVideoElement | null>(null);
  imagesRef.current = images;
  videoRef.current = video;

  // 打开即重置；URL 在移除/关闭/卸载时回收
  useEffect(() => {
    if (!open) return;
    setRosterId(initialRosterId);
    setLevel('80');
    setTab('image');
    setImages((prev) => {
      for (const img of prev) URL.revokeObjectURL(img.url);
      return [];
    });
    setVideo((prev) => {
      if (prev) URL.revokeObjectURL(prev.url);
      return null;
    });
    setVideoDuration(0);
    setVideoTime(0);
    setScanning(false);
    setScanProgress(null);
    setShowPlayer(false);
    setScanToken(0);
    setBuildLightconeId(initialBuild?.lightconeId ?? '');
    setBuildRefinement(initialBuild?.refinement ?? 1);
    setBuildRelicsetId(initialBuild?.relicsetId ?? '');
    setBuildRelicset2Id(initialBuild?.relicsetId2 ?? '');
    setBuildPlanarsetId(initialBuild?.planarsetId ?? '');
    setBuildBasic(initialBuild?.skillLevels?.basic ?? 6);
    setBuildSkill(initialBuild?.skillLevels?.skill ?? 10);
    setBuildUlt(initialBuild?.skillLevels?.ult ?? 10);
    setBuildTalent(initialBuild?.skillLevels?.talent ?? 10);
    setBuildEidolon(initialBuild?.eidolonLevel ?? 0);
    setPages([]);
    setAlignments([]);
    setStatus('idle');
    setErrorKey(null);
    setFailed(0);
    setDrag(false);
  }, [open, initialRosterId]);

  useEffect(
    () => () => {
      for (const img of imagesRef.current) URL.revokeObjectURL(img.url);
      if (videoRef.current) URL.revokeObjectURL(videoRef.current.url);
    },
    [],
  );

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const addFiles = useCallback((files: FileList | File[]) => {
    const list = Array.from(files).filter((f) => f.type.startsWith('image/'));
    if (!list.length) return;
    setImages((prev) => {
      const room = Math.max(0, MAX_IMAGES - prev.length);
      return [
        ...prev,
        ...list.slice(0, room).map((file) => ({
          id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
          name: file.name,
          file,
          url: URL.createObjectURL(file),
        })),
      ];
    });
    setErrorKey(null);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onPaste = (e: ClipboardEvent): void => {
      const files = e.clipboardData?.files;
      if (files && files.length > 0) {
        e.preventDefault();
        addFiles(files);
      }
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [open, addFiles]);

  function removeImage(id: string): void {
    setImages((prev) =>
      prev.filter((img) => {
        if (img.id === id) {
          URL.revokeObjectURL(img.url);
          return false;
        }
        return true;
      }),
    );
  }

  /** 选/拖入视频：挂上 URL 后自动抽帧识别（不需要用户操作播放器） */
  function pickVideo(file: File): void {
    if (scanning) return;
    setVideo((prev) => {
      if (prev) URL.revokeObjectURL(prev.url);
      return { name: file.name, file, url: URL.createObjectURL(file) };
    });
    setVideoDuration(0);
    setVideoTime(0);
    setScanProgress(null);
    setErrorKey(null);
    setShowPlayer(false);
    setScanToken((n) => n + 1);
  }

  // 新视频挂载后自动扫描；scanVideo 内部会等 loadedmetadata，不依赖用户点播放
  useEffect(() => {
    if (scanToken === 0) return;
    void scanVideo();
    // scanVideo 每渲染重建；只以 token 触发，避免把函数放进依赖导致重复扫描
  }, [scanToken]);

  function clearAll(): void {
    if (scanning) return;
    for (const img of images) URL.revokeObjectURL(img.url);
    if (video) URL.revokeObjectURL(video.url);
    setImages([]);
    setVideo(null);
    setVideoDuration(0);
    setVideoTime(0);
    setAlignments([]);
    setPages([]);
    setStatus('idle');
    setErrorKey(null);
    setFailed(0);
    setScanProgress(null);
  }

  /** 把一帧/一组帧送进识别，成功后并入已有结果（多图多帧合并） */
  async function ingest(frames: Frame[]): Promise<void> {
    if (!frames.length) return;
    const result = recognizeImages(frames);
    if (result.alignments.length === 0) {
      setStatus('error');
      setErrorKey('chars.ocr.errNoPanel');
      return;
    }
    setAlignments((prev) => [...prev, ...result.alignments]);
    setFailed((n) => n + result.failed);
    setStatus('done');
    setErrorKey(null);
  }

  async function recognizeImagesTab(): Promise<void> {
    if (images.length === 0) {
      setErrorKey('chars.ocr.errNoImages');
      return;
    }
    setStatus('working');
    setErrorKey(null);
    await new Promise((resolve) => setTimeout(resolve, 0));
    const frames: Frame[] = [];
    let decodeFailed = 0;
    for (const img of images) {
      try {
        frames.push(await decodeImage(img.file));
      } catch {
        decodeFailed++;
      }
    }
    if (frames.length === 0) {
      setStatus('error');
      setErrorKey('chars.ocr.errDecode');
      return;
    }
    setFailed((n) => n + decodeFailed);
    await ingest(frames);
  }

  async function recognizeCurrentFrame(): Promise<void> {
    const v = videoEl.current;
    if (!video) {
      setErrorKey('chars.ocr.errNoVideo');
      return;
    }
    if (!v) return;
    setStatus('working');
    setErrorKey(null);
    await new Promise((resolve) => setTimeout(resolve, 0));
    // 播放中抓帧不稳：先暂停取当前帧，再恢复原播放状态
    const wasPaused = v.paused;
    if (!wasPaused) v.pause();
    const frame = grabFrame(v, 2);
    if (!wasPaused) void v.play();
    if (!frame) {
      setStatus('error');
      setErrorKey('chars.ocr.errNoPanel');
      return;
    }
    await ingest([frame]);
  }

  async function scanVideo(): Promise<void> {
    if (scanning) return;
    const v = videoEl.current;
    if (!video || !v) {
      setErrorKey('chars.ocr.errNoVideo');
      return;
    }
    setScanning(true);
    setStatus('working');
    setErrorKey(null);
    await waitMetadata(v);
    const duration = v.duration;
    if (!Number.isFinite(duration) || duration <= 0) {
      setScanning(false);
      setStatus('error');
      setErrorKey('chars.ocr.errNoPanel');
      return;
    }
    const step = Math.max(0.5, duration / MAX_SCAN_FRAMES);
    const total = Math.max(1, Math.min(MAX_SCAN_FRAMES, Math.ceil(duration / step)));
    const found: PanelAlignment[] = [];
    const pageFrames = new Map<VideoPageKind, { frame: Frame; time: number }>();
    const prevMuted = v.muted;
    v.muted = true;
    v.pause();
    try {
      for (let i = 0; i < total; i++) {
        await seekTo(v, i * step);
        setVideoTime(Math.min(duration, i * step));
        setScanProgress({ done: i + 1, total });
        // 720p 录屏面板直接识别会丢小数点；按 2× 放大取帧（内存只保留对齐结果）
        const frame = grabFrame(v, 2);
        if (frame) {
          const read = recognizePanel(frame);
          // 过滤全屏亮部/角色页误检：属性面板必须是居中、非满屏的浅色矩形
          const plausible =
            read &&
            read.rows.length >= 3 &&
            read.panel.left > frame.width * 0.05 &&
            read.panel.right < frame.width * 0.95 &&
            read.panel.right - read.panel.left < frame.width * 0.9;
          const aligned = plausible ? alignPanel(read) : null;
          // 只收「像属性面板」的帧：平均对齐代价低 + 至少 5 行有中等以上置信度。
          // 光锥卡、角色页、动画亮部也会被 detectPanel 命中，靠这两个门槛滤掉。
          if (
            aligned &&
            aligned.averageCost <= 0.42 &&
            aligned.rows.filter((r) => r.confidence >= 0.5).length >= 5
          ) {
            found.push(aligned);
          } else {
            // 非面板帧：看左侧菜单金色选中项，记录每页最后一帧（静态页取最后一帧最稳）
            const kind = detectMenuPage(frame);
            if (kind) pageFrames.set(kind, { frame, time: Math.min(duration, i * step) });
          }
        }
        await new Promise((resolve) => setTimeout(resolve, 0));
      }

      // 页面自动提取：卡面/套装图比对 + 行迹等级 + 星魂计数（用户裁定：图像比对 + 候选确认）
      const pageResults: OcrVideoPage[] = [];
      for (const [kind, entry] of pageFrames) {
        const page: OcrVideoPage = { kind, time: entry.time, thumb: thumbnailOf(entry.frame) };
        if (kind === 'lightcone') {
          const r = await recognizeLightconePage(entry.frame);
          if (r) {
            page.lightcone = r;
            setBuildLightconeId(r.candidates[0].id);
            setBuildRefinement(r.refinement);
          }
        } else if (kind === 'relics') {
          // 名字优先（右侧套装效果闭集匹配），中央部位图只做 4 件套/2+2 与冲突校验
          const names = recognizeRelicNames(entry.frame);
          const icons = await recognizeRelicPage(entry.frame);
          const four = names?.four.length
            ? names.four.map((x) => ({ id: x.id, score: x.score }))
            : icons?.four ?? [];
          const planar = names?.planar.length
            ? names.planar.map((x) => ({ id: x.id, score: x.score }))
            : icons?.planar ?? [];
          page.relics = { four, planar, counts: icons?.counts ?? {} };
          const top = four[0];
          const second = four[1];
          if (top) setBuildRelicsetId(top.id);
          // 名字里出现两套四件套 → 2+2；只有一套 → 四件套
          if (top && second && (names?.four.length ?? 0) >= 2) setBuildRelicset2Id(second.id);
          if (planar[0]) setBuildPlanarsetId(planar[0].id);
        } else if (kind === 'traces') {
          const lv = readTraceLevels(entry.frame);
          if (lv) {
            page.traces = lv;
            setBuildBasic(lv.basic);
            setBuildSkill(lv.skill);
            setBuildUlt(lv.ult);
            setBuildTalent(lv.talent);
          }
        } else if (kind === 'eidolons') {
          const n = countEidolons(entry.frame);
          page.eidolons = n;
          setBuildEidolon(n);
        }
        pageResults.push(page);
      }
      // 角色识别：任一角色页左上「命途 / 角色名」闭集匹配（99 个名字，汉仪旗黑 65W 模板）
      let charHit: ReturnType<typeof recognizeCharacterName> = null;
      for (const [, entry] of pageFrames) {
        const h = recognizeCharacterName(entry.frame);
        if (h && h.score > (charHit?.score ?? 0.55)) charHit = h;
      }
      if (charHit) setRosterId(charHit.id);
      setPages(pageResults);
    } finally {
      v.muted = prevMuted;
      setScanning(false);
    }
    if (found.length === 0) {
      setStatus('error');
      setErrorKey('chars.ocr.errNoPanel');
      return;
    }
    setAlignments((prev) => [...prev, ...found]);
    setStatus('done');
    setErrorKey(null);
  }

  const merged = useMemo(() => {
    // 合并前再滤一次：旧扫描/图片里的非面板帧也会被 detectPanel 命中
    const usable = alignments.filter(
      (a) => a.averageCost <= 0.42 && a.rows.filter((r) => r.confidence >= 0.5).length >= 5,
    );
    return usable.length ? mergePanels(usable) : null;
  }, [alignments]);
  const draft = useMemo(() => (merged ? buildDraft(merged, clampLevel(level)) : null), [merged, level]);

  const summary = useMemo(() => {
    if (!draft) return null;
    let conflict = 0;
    let missing = 0;
    let low = 0;
    let alignment = false;
    for (const w of draft.warnings as MergeWarning[]) {
      if (w.kind === 'conflict') conflict++;
      else if (w.kind === 'missing') missing++;
      else if (w.kind === 'low-confidence') low++;
      else if (w.kind === 'alignment') alignment = true;
    }
    return { conflict, missing, low, alignment, invalid: draft.warningsExtra.length };
  }, [draft]);

  if (!open) return null;

  const lang = i18n.language === 'en' ? 'en' : 'zh';
  const lcName = (id: string): string => {
    const lc = LIGHTCONE_ROSTER.find((x) => x.id === id);
    if (!lc) return id;
    return lang === 'en' ? lc.en : lc.zh;
  };
  const relicName = (id: string): string => {
    const s = RELICSET_ROSTER.find((x) => x.id === id);
    if (!s) return id;
    return lang === 'en' ? s.en : s.zh;
  };
  const sections = [
    { key: 'base', title: t('chars.ocr.sectionBase') },
    { key: 'advanced', title: t('chars.ocr.sectionAdvanced') },
    { key: 'damage', title: t('chars.ocr.sectionDamage') },
  ] as const;

  function rowLabel(row: OcrFieldRow): string {
    const label = row.meta.label;
    if (label.type === 'key') return t(label.key);
    return `${t(`elements.${row.meta.element ?? 'Physical'}`)} ${t(label.suffixKey)}`;
  }

  function badge(row: OcrFieldRow): { cls: string; text: string } {
    if (!row.present) return { cls: 'ocr-badge', text: t('chars.ocr.missing') };
    if (row.ignored) return { cls: 'ocr-badge', text: '—' };
    if (row.confidence >= 0.75) return { cls: 'ocr-badge ocr-badge--high', text: t('chars.ocr.high') };
    if (row.confidence >= 0.5) return { cls: 'ocr-badge ocr-badge--medium', text: t('chars.ocr.medium') };
    return { cls: 'ocr-badge ocr-badge--low', text: t('chars.ocr.low') };
  }

  function apply(): void {
    if (!draft || !rosterId) return;
    const build: OcrBuildPatch = {
      lightconeId: buildLightconeId || undefined,
      refinement: buildRefinement,
      relicsetId: buildRelicsetId || undefined,
      relicsetId2: buildRelicset2Id || undefined,
      planarsetId: buildPlanarsetId || undefined,
      skillLevels: { basic: buildBasic, skill: buildSkill, ult: buildUlt, talent: buildTalent },
      eidolonLevel: buildEidolon,
    };
    onApply(rosterId, { ...draft.patch, level: String(clampLevel(level)) }, draft, build);
  }

  const working = status === 'working' || scanning;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
        background: 'rgba(0,0,0,.6)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 'min(980px, 100%)',
          maxHeight: '90vh',
          overflowY: 'auto',
          overscrollBehavior: 'contain',
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
          padding: 16,
          background: 'var(--panel-bg)',
          border: '1px solid var(--panel-border)',
          boxShadow: 'var(--panel-shadow)',
          borderRadius: 'var(--panel-radius, 8px)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <strong style={{ flex: 1, color: 'var(--text)' }}>{t('chars.ocr.title')}</strong>
          <button type="button" onClick={onClose} aria-label={t('chars.ocr.cancel')}>
            ✕
          </button>
        </div>

        <div className="muted" style={{ fontSize: 12 }}>
          {t('chars.ocr.hint')}
        </div>

        <div style={{ display: 'flex', gap: 10, alignItems: 'end', flexWrap: 'wrap' }}>
          <label className="field" style={{ minWidth: 220, flex: '1 1 240px' }}>
            {t('chars.ocr.character')}
            <select value={rosterId} onChange={(e) => setRosterId(e.target.value)}>
              <option value="">{t('chars.ocr.noCharacter')}</option>
              {CHARACTER_ROSTER.map((c) => (
                <option key={c.id} value={c.id}>
                  {lang === 'en' ? c.en : c.zh}
                </option>
              ))}
            </select>
          </label>
          <label className="field" style={{ width: 120 }}>
            {t('chars.ocr.level')}
            <input type="number" min={1} max={80} value={level} onChange={(e) => setLevel(e.target.value)} />
          </label>
          <span className="muted" style={{ fontSize: 12 }}>
            {t('chars.ocr.imagesCount', { n: images.length })}
          </span>
        </div>

        <div style={{ display: 'flex', gap: 6 }}>
          {(['image', 'video'] as const).map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              style={{
                border: `1px solid ${tab === id ? 'var(--input-focus-border)' : 'var(--input-border)'}`,
                background: tab === id ? 'var(--nav-active-bg)' : 'var(--input-bg)',
                color: 'var(--text)',
                borderRadius: 'var(--input-radius)',
                padding: '4px 12px',
                cursor: 'pointer',
              }}
            >
              {id === 'image' ? t('chars.ocr.tabImage') : t('chars.ocr.tabVideo')}
            </button>
          ))}
        </div>

        {tab === 'image' ? (
          <>
            <label
              className={`ocr-drop${drag ? ' drag' : ''}`}
              onDragOver={(e) => {
                e.preventDefault();
                setDrag(true);
              }}
              onDragLeave={() => setDrag(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDrag(false);
                addFiles(e.dataTransfer.files);
              }}
            >
              <input
                type="file"
                accept="image/*"
                multiple
                style={{ display: 'none' }}
                onChange={(e) => {
                  if (e.target.files) addFiles(e.target.files);
                  e.target.value = '';
                }}
              />
              <span>{t('chars.ocr.dropHint')}</span>
              <span className="muted" style={{ fontSize: 12 }}>
                {t('chars.ocr.dropSub')}
              </span>
            </label>

            {images.length > 0 && (
              <div className="ocr-thumbs">
                {images.map((img) => (
                  <div className="ocr-thumb" key={img.id}>
                    <img src={img.url} alt={img.name} />
                    <button type="button" onClick={() => removeImage(img.id)} aria-label={t('chars.ocr.remove')}>
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <button type="button" className="primary" onClick={() => void recognizeImagesTab()} disabled={working}>
                {status === 'working' ? t('chars.ocr.recognizing') : t('chars.ocr.recognize')}
              </button>
            </div>
          </>
        ) : (
          <>
            <label
              className="ocr-drop"
              style={{ opacity: scanning ? 0.6 : 1, pointerEvents: scanning ? 'none' : undefined }}
              onDragOver={(e) => {
                e.preventDefault();
                setDrag(true);
              }}
              onDragLeave={() => setDrag(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDrag(false);
                const file = Array.from(e.dataTransfer.files).find((f) => f.type.startsWith('video/'));
                if (file) pickVideo(file);
              }}
            >
              <input
                type="file"
                accept="video/*"
                style={{ display: 'none' }}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) pickVideo(file);
                  e.target.value = '';
                }}
              />
              <span>{t('chars.ocr.videoDropHint')}</span>
              <span className="muted" style={{ fontSize: 12 }}>
                {t('chars.ocr.videoDropSub')}
              </span>
            </label>

            {video ? (
              <>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <span className="muted">
                    {video.name}
                    {videoDuration > 0 ? ` · ${videoDuration.toFixed(1)}s` : ''}
                  </span>
                  <button type="button" onClick={() => void scanVideo()} disabled={working}>
                    {scanning ? t('chars.ocr.scanning') : t('chars.ocr.rescan')}
                  </button>
                  <button type="button" onClick={() => setShowPlayer((v) => !v)}>
                    {t('chars.ocr.manualFrames')}
                  </button>
                </div>
                {(scanning || scanProgress) && (
                  <div className="muted" style={{ fontSize: 12 }}>
                    {scanning ? t('chars.ocr.autoScanning') : ''}
                    {scanProgress ? ` ${t('chars.ocr.scanProgress', scanProgress)}` : ''}
                  </div>
                )}
                <video
                  ref={videoEl}
                  src={video.url}
                  preload="auto"
                  muted
                  playsInline
                  controls={showPlayer}
                  className={showPlayer ? 'ocr-video' : 'ocr-video-hidden'}
                  onLoadedMetadata={(e) => setVideoDuration(e.currentTarget.duration || 0)}
                  onTimeUpdate={(e) => setVideoTime(e.currentTarget.currentTime)}
                />
                {showPlayer && (
                  <>
                    <input
                      type="range"
                      className="ocr-range"
                      min={0}
                      max={Math.max(0, videoDuration)}
                      step={0.1}
                      value={Math.min(videoTime, videoDuration)}
                      onChange={(e) => {
                        const v = videoEl.current;
                        const time = Number(e.target.value);
                        if (v) v.currentTime = time;
                        setVideoTime(time);
                      }}
                    />
                    <div className="muted" style={{ fontSize: 12 }}>
                      {t('chars.ocr.frameAt', { time: videoTime.toFixed(1) })}
                    </div>
                    <div>
                      <button type="button" onClick={() => void recognizeCurrentFrame()} disabled={working}>
                        {t('chars.ocr.recognizeFrame')}
                      </button>
                    </div>
                  </>
                )}
              </>
            ) : (
              <div className="muted" style={{ fontSize: 12 }}>
                {t('chars.ocr.videoHint')}
              </div>
            )}
          </>
        )}

        {pages.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <strong style={{ fontSize: 13 }}>{t('chars.ocr.pageTitle')}</strong>
            <div style={{ display: 'flex', gap: 8, overflowX: 'auto' }}>
              {pages.map((page) => (
                <div
                  key={page.kind}
                  style={{
                    flex: '0 0 220px',
                    border: '1px solid var(--panel-border)',
                    borderRadius: 6,
                    padding: 6,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 4,
                  }}
                >
                  <img src={page.thumb} alt="" style={{ width: '100%', borderRadius: 4 }} />
                  <div className="muted" style={{ fontSize: 12 }}>
                    {t(`chars.ocr.page_${page.kind}`)} · {page.time.toFixed(1)}s
                  </div>
                  {page.lightcone && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                      {page.lightcone.candidates.map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          style={{ textAlign: 'left', fontSize: 12 }}
                          onClick={() => {
                            setBuildLightconeId(c.id);
                            setBuildRefinement(page.lightcone?.refinement ?? 1);
                          }}
                        >
                          {lcName(c.id)} · {Math.round(c.score * 100)}%
                        </button>
                      ))}
                    </div>
                  )}
                  {page.relics && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                      <div className="muted" style={{ fontSize: 12 }}>
                        {t('calc.relicSet')}
                      </div>
                      {page.relics.four.map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          style={{ textAlign: 'left', fontSize: 12 }}
                          onClick={() => setBuildRelicsetId(c.id)}
                        >
                          {relicName(c.id)} · {Math.round(c.score * 100)}%
                        </button>
                      ))}
                      <div className="muted" style={{ fontSize: 12 }}>
                        {t('calc.relicSet2')}
                      </div>
                      {page.relics.four
                        .filter((c) => c.id !== buildRelicsetId)
                        .map((c) => (
                          <button
                            key={`b-${c.id}`}
                            type="button"
                            style={{ textAlign: 'left', fontSize: 12 }}
                            onClick={() => setBuildRelicset2Id(c.id)}
                          >
                            {relicName(c.id)} · {Math.round(c.score * 100)}%
                          </button>
                        ))}
                      <div className="muted" style={{ fontSize: 12 }}>
                        {t('calc.planarSetLabel')}
                      </div>
                      {page.relics.planar.map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          style={{ textAlign: 'left', fontSize: 12 }}
                          onClick={() => setBuildPlanarsetId(c.id)}
                        >
                          {relicName(c.id)} · {Math.round(c.score * 100)}%
                        </button>
                      ))}
                    </div>
                  )}
                  {page.traces && (
                    <div className="muted" style={{ fontSize: 12 }}>
                      {t('chars.ocr.pageTracesText', page.traces)}
                    </div>
                  )}
                  {page.eidolons !== undefined && (
                    <div className="muted" style={{ fontSize: 12 }}>
                      {t('chars.ocr.pageEidolonText', { n: page.eidolons })}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        <div
          className="ocr-build"
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
            padding: 8,
            border: '1px solid var(--panel-border)',
            borderRadius: 6,
          }}
        >
          <strong style={{ fontSize: 13 }}>{t('chars.ocr.buildTitle')}</strong>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
              gap: 8,
            }}
          >
            <label className="field">
              {t('calc.lightcone')}
              <select value={buildLightconeId} onChange={(e) => setBuildLightconeId(e.target.value)}>
                <option value="">{t('calc.none')}</option>
                {LIGHTCONE_ROSTER.map((lc) => (
                  <option key={lc.id} value={lc.id}>
                    {lang === 'en' ? lc.en : lc.zh}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              {t('calc.refinement')}
              <select
                value={buildRefinement}
                disabled={!buildLightconeId}
                onChange={(e) => setBuildRefinement(Number(e.target.value))}
              >
                {[1, 2, 3, 4, 5].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              {t('calc.relicSet')}
              <select value={buildRelicsetId} onChange={(e) => setBuildRelicsetId(e.target.value)}>
                <option value="">{t('calc.none')}</option>
                {RELICSET_ROSTER.filter((s) => s.fourPiece).map((s) => (
                  <option key={s.id} value={s.id}>
                    {lang === 'en' ? s.en : s.zh}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              {t('calc.relicSet2')}
              <select
                value={buildRelicset2Id}
                onChange={(e) => setBuildRelicset2Id(e.target.value)}
              >
                <option value="">{t('calc.none')}</option>
                {RELICSET_ROSTER.filter((s) => s.fourPiece && s.id !== buildRelicsetId).map((s) => (
                  <option key={s.id} value={s.id}>
                    {lang === 'en' ? s.en : s.zh}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              {t('calc.planarSetLabel')}
              <select value={buildPlanarsetId} onChange={(e) => setBuildPlanarsetId(e.target.value)}>
                <option value="">{t('calc.none')}</option>
                {RELICSET_ROSTER.filter((s) => !s.fourPiece).map((s) => (
                  <option key={s.id} value={s.id}>
                    {lang === 'en' ? s.en : s.zh}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              {t('chars.basicLevel')}
              <select
                value={buildBasic}
                onChange={(e) => setBuildBasic(Number(e.target.value))}
              >
                {[1, 2, 3, 4, 5, 6].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
            {(
              [
                ['skill', buildSkill, setBuildSkill],
                ['ult', buildUlt, setBuildUlt],
                ['talent', buildTalent, setBuildTalent],
              ] as const
            ).map(([key, value, setter]) => (
              <label className="field" key={key}>
                {t(`chars.${key === 'skill' ? 'skillLevel' : key === 'ult' ? 'ultLevel' : 'talentLevel'}`)}
                <select
                  value={value}
                  onChange={(e) => setter(Number(e.target.value))}
                >
                  {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </label>
            ))}
            <label className="field">
              {t('chars.eidolon')}
              <select
                value={buildEidolon}
                onChange={(e) => setBuildEidolon(Number(e.target.value))}
              >
                {[0, 1, 2, 3, 4, 5, 6].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="muted" style={{ fontSize: 12 }}>
            {t('chars.ocr.buildHint')}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          {(images.length > 0 || video || alignments.length > 0) && (
            <button type="button" onClick={clearAll} disabled={working}>
              {t('chars.ocr.clear')}
            </button>
          )}
          {failed > 0 && <span className="ocr-warn">{t('chars.ocr.failedImages', { n: failed })}</span>}
          {errorKey && <span className="ocr-warn">{t(errorKey)}</span>}
        </div>

        <div style={{ overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {draft && (
            <>
              <div style={{ display: 'flex', gap: 10, alignItems: 'baseline', flexWrap: 'wrap' }}>
                <strong style={{ fontSize: 14 }}>{t('chars.ocr.result')}</strong>
                <span className="muted" style={{ fontSize: 12 }}>
                  {t('chars.ocr.coverage', { n: Math.round(draft.coverage * 27) })}
                </span>
                {summary && summary.conflict > 0 && (
                  <span className="ocr-warn">{t('chars.ocr.warnConflict', { n: summary.conflict })}</span>
                )}
                {summary && summary.missing > 0 && (
                  <span className="ocr-warn">{t('chars.ocr.warnMissing', { n: summary.missing })}</span>
                )}
                {summary && summary.low > 0 && (
                  <span className="ocr-warn">{t('chars.ocr.warnLow', { n: summary.low })}</span>
                )}
                {summary && summary.alignment && <span className="ocr-warn">{t('chars.ocr.warnAlignment')}</span>}
                {summary && summary.invalid > 0 && (
                  <span className="ocr-warn">{t('chars.ocr.warnInvalid', { n: summary.invalid })}</span>
                )}
              </div>
              <div className="ocr-table-wrap">
                <table className="ocr-table">
                  <thead>
                    <tr>
                      <th>{t('chars.ocr.field')}</th>
                      <th>{t('chars.ocr.raw')}</th>
                      <th>{t('chars.ocr.write')}</th>
                      <th>{t('chars.ocr.confidence')}</th>
                    </tr>
                  </thead>
                  {sections.map((section) => (
                    <tbody key={section.key}>
                      <tr className="ocr-section">
                        <td colSpan={4}>{section.title}</td>
                      </tr>
                      {draft.fields
                        .filter((row) => row.meta.section === section.key)
                        .map((row) => {
                          const b = badge(row);
                          return (
                            <tr key={row.key} className={row.ignored || !row.present ? 'ocr-muted' : undefined}>
                              <td>{rowLabel(row)}</td>
                              <td>{row.present ? row.raw : '—'}</td>
                              <td>
                                {row.valueText}
                                {row.ignored && row.present ? ` (${t('chars.ocr.ignored')})` : ''}
                              </td>
                              <td>
                                <span className={b.cls}>{b.text}</span>
                              </td>
                            </tr>
                          );
                        })}
                    </tbody>
                  ))}
                </table>
              </div>
              <div className="ocr-note">{t('chars.ocr.finalNote')}</div>
              <div className="ocr-note">{t('chars.ocr.conditionalNote')}</div>
              <div className="ocr-note">{t('chars.ocr.applyHint')}</div>
            </>
          )}
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'flex-end' }}>
          {draft && !rosterId && <span className="ocr-warn" style={{ marginRight: 'auto' }}>{t('chars.ocr.needCharacter')}</span>}
          <button type="button" onClick={onClose}>
            {t('chars.ocr.cancel')}
          </button>
          <button type="button" className="primary" onClick={apply} disabled={!draft || !rosterId}>
            {t('chars.ocr.apply')}
          </button>
        </div>
      </div>
    </div>
  );
}
