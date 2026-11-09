import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { LIGHTCONE_ROSTER } from './data/lightcone-roster.js';
import { RELICSET_ROSTER } from './data/relicset-roster.js';
import { PATH_ORDER } from './data/relic-set-groups.js';
import { assetUrl } from './asset-url.js';

/** 光锥 / 遗器套装「看图选择」弹层（2026-10-29）。
 * 与 char-picker 同风格：卡片网格 + 图标 + 名字 + 徽章；图片来自 apps/web/public/
 * （scripts/fetch-equipment-icons.mjs 下载自 static.nanoka.cc）。 */

const RARITIES = [5, 4, 3] as const;

const pathIcon = (p: string): string => assetUrl(`pathicon/${p.toLowerCase()}.webp`);
const lcImg = (id: string): string => assetUrl(`lightcones/${id}.webp`);
const relicImg = (id: string): string => assetUrl(`relicsets/${id}.webp`);

const chipStyle = (sel: boolean): CSSProperties => ({
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
  padding: '4px 10px',
  minHeight: 26,
  borderRadius: 'var(--chip-radius, 6px)',
  border: `1px solid ${sel ? 'var(--btn-primary-bg)' : 'var(--input-border)'}`,
  background: sel ? 'var(--nav-active-bg)' : 'var(--input-bg)',
  color: 'var(--text)',
  fontSize: 12,
  lineHeight: 1.2,
  cursor: 'pointer',
});

const searchStyle: CSSProperties = {
  marginLeft: 'auto',
  width: 200,
  padding: '5px 8px',
  background: 'var(--input-bg)',
  border: '1px solid var(--input-border)',
  borderRadius: 'var(--input-radius, 6px)',
  color: 'var(--input-fg)',
  fontSize: 13,
};

/** 已选装备的缩略图 + 更换按钮（放在原生 select 下方） */
export function EquipmentPick({
  src,
  name,
  label,
  onOpen,
  size = 22,
}: {
  src?: string;
  name?: string;
  label: string;
  onOpen: () => void;
  size?: number;
}): React.JSX.Element {
  return (
    <span
      role="button"
      tabIndex={0}
      aria-label={label}
      title={name ?? label}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onOpen();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpen();
        }
      }}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        width: '100%',
        minHeight: 32,
        padding: '4px 8px',
        background: 'var(--input-bg)',
        border: '1px solid var(--input-border)',
        borderRadius: 'var(--input-radius, 6px)',
        color: 'var(--input-fg)',
        fontSize: 13,
        lineHeight: 1.3,
        cursor: 'pointer',
        boxSizing: 'border-box',
      }}
    >
      {src && (
        <img
          src={src}
          alt=""
          width={size}
          height={size}
          loading="lazy"
          style={{ objectFit: 'cover', borderRadius: 4, flex: '0 0 auto' }}
          onError={(e) => {
            e.currentTarget.style.visibility = 'hidden';
          }}
        />
      )}
      <span style={{ flex: '1 1 auto', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {name ?? label}
      </span>
      <span className="muted" style={{ flex: '0 0 auto', fontSize: 11 }}>
        ▾
      </span>
    </span>
  );
}

function ModalShell({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
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
          width: 'min(920px, 100%)',
          maxHeight: '86vh',
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
          <strong style={{ flex: 1, color: 'var(--text)' }}>{title}</strong>
          <button type="button" onClick={onClose} aria-label="close">
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function LightconePickerModal({
  open,
  value,
  candidateIds,
  onSelect,
  onClose,
}: {
  open: boolean;
  value: string;
  candidateIds?: readonly string[];
  onSelect: (id: string) => void;
  onClose: () => void;
}) {
  const { t, i18n } = useTranslation();
  const [pathSel, setPathSel] = useState<string[]>([]);
  const [raritySel, setRaritySel] = useState<number[]>([]);
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (open) {
      setPathSel([]);
      setRaritySel([]);
      setQuery('');
    }
  }, [open]);

  if (!open) return null;

  const q = query.trim().toLowerCase();
  const order = candidateIds ? new Map(candidateIds.map((id, i) => [id, i])) : null;
  const items = LIGHTCONE_ROSTER.filter((c) => {
    if (pathSel.length > 0 && !pathSel.includes(c.path)) return false;
    if (raritySel.length > 0 && !raritySel.includes(c.rarity)) return false;
    if (q && !c.zh.toLowerCase().includes(q) && !c.en.toLowerCase().includes(q)) return false;
    return true;
  }).sort((a, b) => (order?.get(a.id) ?? 1e9) - (order?.get(b.id) ?? 1e9));
  const toggle = <T,>(list: T[], setList: (v: T[]) => void, v: T): void => {
    setList(list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  };

  return (
    <ModalShell title={t('picker.lcTitle')} onClose={onClose}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <span className="muted" style={{ fontSize: 12 }}>
          {t('picker.pathLabel')}
        </span>
        <button type="button" style={chipStyle(pathSel.length === 0)} onClick={() => setPathSel([])}>
          {t('picker.all')}
        </button>
        {PATH_ORDER.map((p) => (
          <button key={p} type="button" style={chipStyle(pathSel.includes(p))} onClick={() => toggle(pathSel, setPathSel, p)}>
            <img src={pathIcon(p)} alt="" width={14} height={14} loading="lazy" />
            {t(`paths.${p}`)}
          </button>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <span className="muted" style={{ fontSize: 12 }}>
          {t('picker.rarity')}
        </span>
        <button type="button" style={chipStyle(raritySel.length === 0)} onClick={() => setRaritySel([])}>
          {t('picker.all')}
        </button>
        {RARITIES.map((r) => (
          <button key={r} type="button" style={chipStyle(raritySel.includes(r))} onClick={() => toggle(raritySel, setRaritySel, r)}>
            {'★'.repeat(r)}
          </button>
        ))}
        <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('picker.lcSearch')} style={searchStyle} />
      </div>
      <div
        style={{
          flex: 1,
          minHeight: 120,
          overflowY: 'auto',
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(104px, 1fr))',
          gap: 10,
          alignContent: 'start',
          padding: 4,
        }}
      >
        {items.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => onSelect(c.id)}
            title={i18n.language === 'en' ? c.en : c.zh}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 4,
              padding: '8px 6px 8px',
              background: c.id === value ? 'var(--nav-active-bg)' : 'var(--input-bg)',
              border: `1px solid ${c.id === value ? 'var(--btn-primary-bg)' : 'var(--input-border)'}`,
              borderRadius: 'var(--panel-radius, 8px)',
              color: 'var(--text)',
              cursor: 'pointer',
            }}
          >
            <img
              src={lcImg(c.id)}
              alt=""
              width={72}
              height={72}
              loading="lazy"
              style={{ objectFit: 'cover', borderRadius: 6, background: 'var(--panel-bg)' }}
              onError={(e) => {
                e.currentTarget.style.visibility = 'hidden';
              }}
            />
            <span style={{ fontWeight: 600, fontSize: 12, lineHeight: 1.2 }}>{c.zh}</span>
            <span className="muted" style={{ fontSize: 10 }}>
              {c.en}
            </span>
            <span style={{ display: 'flex', gap: 3, alignItems: 'center', fontSize: 10, color: 'var(--text-muted)' }}>
              <img src={pathIcon(c.path)} alt="" width={11} height={11} loading="lazy" />
              {'★'.repeat(c.rarity)}
            </span>
          </button>
        ))}
        {items.length === 0 && (
          <p className="muted" style={{ gridColumn: '1 / -1', textAlign: 'center' }}>
            {t('picker.empty')}
          </p>
        )}
      </div>
    </ModalShell>
  );
}

export function RelicSetPickerModal({
  open,
  kind,
  value,
  onSelect,
  onClose,
}: {
  open: boolean;
  kind: 'four' | 'planar';
  value: string;
  onSelect: (id: string) => void;
  onClose: () => void;
}) {
  const { t, i18n } = useTranslation();
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (open) setQuery('');
  }, [open]);

  if (!open) return null;

  const q = query.trim().toLowerCase();
  const items = RELICSET_ROSTER.filter((s) => (kind === 'four' ? s.fourPiece : !s.fourPiece)).filter((s) => {
    if (q && !s.zh.toLowerCase().includes(q) && !s.en.toLowerCase().includes(q)) return false;
    return true;
  });

  return (
    <ModalShell title={t('picker.relicTitle')} onClose={onClose}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <span className="muted" style={{ fontSize: 12 }}>
          {kind === 'four' ? t('picker.four') : t('picker.planar')}
        </span>
        <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('picker.relicSearch')} style={searchStyle} />
      </div>
      <div
        style={{
          flex: 1,
          minHeight: 120,
          overflowY: 'auto',
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(112px, 1fr))',
          gap: 10,
          alignContent: 'start',
          padding: 4,
        }}
      >
        {items.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => onSelect(s.id)}
            title={i18n.language === 'en' ? s.en : s.zh}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 4,
              padding: '8px 6px',
              background: s.id === value ? 'var(--nav-active-bg)' : 'var(--input-bg)',
              border: `1px solid ${s.id === value ? 'var(--btn-primary-bg)' : 'var(--input-border)'}`,
              borderRadius: 'var(--panel-radius, 8px)',
              color: 'var(--text)',
              cursor: 'pointer',
            }}
          >
            <img
              src={relicImg(s.id)}
              alt=""
              width={64}
              height={64}
              loading="lazy"
              style={{ objectFit: 'contain', background: 'var(--panel-bg)', borderRadius: 6 }}
              onError={(e) => {
                e.currentTarget.style.visibility = 'hidden';
              }}
            />
            <span style={{ fontWeight: 600, fontSize: 12, lineHeight: 1.2 }}>{s.zh}</span>
            <span className="muted" style={{ fontSize: 10 }}>
              {s.en}
            </span>
          </button>
        ))}
        {items.length === 0 && (
          <p className="muted" style={{ gridColumn: '1 / -1', textAlign: 'center' }}>
            {t('picker.empty')}
          </p>
        )}
      </div>
    </ModalShell>
  );
}
