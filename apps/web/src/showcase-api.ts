/**
 * 展示柜取数层（2026-10-26 首版 Enka；2026-10-27 加 mihomo 为主源）。
 *
 * **两个数据源都不返回 CORS 头**（实测：Enka 带 Origin 也没有、OPTIONS 405；
 * `api.mihomo.me` 同样没有）→ 浏览器直连必被拦，线上必须走「代理前缀」。
 *
 * 为什么默认 mihomo：Enka 在国内网络实测 `ECONNRESET`/超时（被阻断），
 * 而 `api.mihomo.me` 3/3 可达（0.7–1.7s）。Enka 适配器保留，可随时切回。
 *
 * 缓存按响应 `ttl`（Enka 实测 60s；mihomo 无该字段按 60s）落 localStorage ——
 * 重复请求照样吃对方限额，本地不缓存等于自己把自己限流。
 */

export type ShowcaseSource = 'mihomo' | 'enka';

export const ENKA_UID_BASE = 'https://enka.network/api/hsr/uid/';
export const MIHOMO_UID_BASE = 'https://api.mihomo.me/sr_info_parsed/';

const CACHE_PREFIX = 'hsr-sim.showcase.';
const FETCH_TIMEOUT_MS = 20000;
const MIN_TTL_SECONDS = 30;
const MAX_TTL_SECONDS = 1800;

export type ShowcaseErrorKind =
  | 'invalid-uid'
  | 'not-found'
  | 'private-showcase'
  | 'rate-limited'
  | 'maintenance'
  | 'upstream'
  | 'cors'
  | 'network'
  | 'server'
  | 'bad-payload';

export class ShowcaseError extends Error {
  readonly kind: ShowcaseErrorKind;
  readonly status: number | null;

  constructor(kind: ShowcaseErrorKind, message: string, status: number | null = null) {
    super(message);
    this.name = 'ShowcaseError';
    this.kind = kind;
    this.status = status;
  }
}

/** 只接受 9 位数字（国服/国际服同格式）；非法返回 null */
export function normalizeUid(input: string): string | null {
  const uid = input.trim();
  return /^\d{9}$/.test(uid) ? uid : null;
}

/** 直连 URL（无代理时） */
export function directUrl(uid: string, source: ShowcaseSource): string {
  return source === 'mihomo' ? `${MIHOMO_UID_BASE}${uid}?lang=cn` : `${ENKA_UID_BASE}${uid}`;
}

/**
 * 取数 URL。代理前缀支持两种写法：
 * - 前缀：`https://x.pages.dev/hsr/uid` → `…/hsr/uid/{uid}`
 * - 占位符：`https://x.com/enka?uid={uid}` → 原样替换
 * 代理自身负责决定转发到哪个源（页面会把 `source` 一起告诉它见 docs/showcase-uid.md）。
 */
export function buildShowcaseUrl(
  uid: string,
  options: { source?: ShowcaseSource; proxyBase?: string } = {},
): string {
  const source = options.source ?? 'mihomo';
  const base = (options.proxyBase ?? '').trim();
  if (!base) return directUrl(uid, source);
  if (base.includes('{uid}')) return base.replaceAll('{uid}', uid);
  return `${base.replace(/\/+$/, '')}/${uid}`;
}

export interface ShowcaseSnapshot {
  /** 原始响应，交由 showcase.ts / showcase-mihomo.ts 解析 */
  json: unknown;
  source: ShowcaseSource;
  /** 数据抓取时间（ms） */
  fetchedAt: number;
  /** 本地缓存到期时间（ms） */
  expiresAt: number;
  /** 是否命中本地缓存（未发请求） */
  cached: boolean;
}

interface CacheEntry {
  json: unknown;
  source: ShowcaseSource;
  fetchedAt: number;
  expiresAt: number;
}

function clampTtl(seconds: number | undefined): number {
  const s = Number(seconds);
  if (!Number.isFinite(s) || s <= 0) return 60;
  return Math.min(MAX_TTL_SECONDS, Math.max(MIN_TTL_SECONDS, s));
}

function cacheKey(source: ShowcaseSource, uid: string): string {
  return `${CACHE_PREFIX}${source}.${uid}`;
}

function readCache(source: ShowcaseSource, uid: string): CacheEntry | null {
  try {
    const raw = localStorage.getItem(cacheKey(source, uid));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<CacheEntry>;
    if (!parsed || typeof parsed.expiresAt !== 'number' || !parsed.json) return null;
    return {
      json: parsed.json,
      source,
      fetchedAt: typeof parsed.fetchedAt === 'number' ? parsed.fetchedAt : 0,
      expiresAt: parsed.expiresAt,
    };
  } catch {
    return null;
  }
}

function writeCache(uid: string, entry: CacheEntry): void {
  try {
    localStorage.setItem(cacheKey(entry.source, uid), JSON.stringify(entry));
  } catch {
    /* 超配额则放弃持久化 */
  }
}

/** 清掉某个 UID 的本地缓存（强制刷新用；两个源一起清） */
export function clearShowcaseCache(uid: string): void {
  try {
    localStorage.removeItem(cacheKey('mihomo', uid));
    localStorage.removeItem(cacheKey('enka', uid));
  } catch {
    /* 忽略 */
  }
}

function kindOfStatus(status: number, code: string): ShowcaseErrorKind {
  if (status === 400 || code === 'wrong_uid') return 'invalid-uid';
  if (status === 404 || code === 'not_found') return 'not-found';
  if (status === 424 || code === 'maintenance') return 'maintenance';
  if (status === 429 || code === 'rate_limited') return 'rate-limited';
  if (status === 500 || code === 'upstream_fail') return 'upstream';
  return 'server';
}

/** 各源的「成功响应」校验：结构不对说明代理转错了目标 */
function validatePayload(source: ShowcaseSource, body: Record<string, unknown>): boolean {
  if (source === 'mihomo') {
    return typeof body.player === 'object' && body.player !== null;
  }
  return typeof body.detailInfo === 'object' && body.detailInfo !== null;
}

/**
 * 拉取展示柜数据（带 localStorage 缓存）。
 * @throws {ShowcaseError}
 */
export async function fetchShowcase(
  rawUid: string,
  options: { source?: ShowcaseSource; proxyBase?: string; force?: boolean } = {},
): Promise<ShowcaseSnapshot> {
  const source = options.source ?? 'mihomo';
  const uid = normalizeUid(rawUid);
  if (!uid) {
    throw new ShowcaseError('invalid-uid', `invalid uid: ${rawUid}`);
  }
  if (!options.force) {
    const cached = readCache(source, uid);
    if (cached && cached.expiresAt > Date.now()) {
      return {
        json: cached.json,
        source,
        fetchedAt: cached.fetchedAt,
        expiresAt: cached.expiresAt,
        cached: true,
      };
    }
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(buildShowcaseUrl(uid, { source, proxyBase: options.proxyBase }), {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
  } catch (err) {
    // 浏览器 CORS 拦截只会抛 TypeError，拿不到状态码：默认直连时按「需代理」提示
    const kind: ShowcaseErrorKind = options.proxyBase?.trim() ? 'network' : 'cors';
    const reason = err instanceof Error ? err.message : String(err);
    throw new ShowcaseError(kind, `fetch failed: ${reason}`);
  } finally {
    clearTimeout(timer);
  }

  const text = await res.text();
  let body: Record<string, unknown> & { code?: string; message?: string; detail?: string; ttl?: number };
  try {
    body = JSON.parse(text) as typeof body;
  } catch {
    throw new ShowcaseError('bad-payload', `non-json response: ${text.slice(0, 120)}`, res.status);
  }

  if (!res.ok) {
    const code = body.code ?? '';
    const message = body.message ?? body.detail ?? `HTTP ${res.status}`;
    throw new ShowcaseError(kindOfStatus(res.status, code), String(message), res.status);
  }
  if (!validatePayload(source, body)) {
    throw new ShowcaseError(
      'bad-payload',
      source === 'mihomo'
        ? 'missing player（代理可能转发到了别的接口）'
        : 'missing detailInfo（代理可能转发到了别的接口）',
      res.status,
    );
  }

  const ttl = clampTtl(body.ttl);
  const now = Date.now();
  const snapshot: ShowcaseSnapshot = {
    json: body,
    source,
    fetchedAt: now,
    expiresAt: now + ttl * 1000,
    cached: false,
  };
  writeCache(uid, {
    json: body,
    source,
    fetchedAt: snapshot.fetchedAt,
    expiresAt: snapshot.expiresAt,
  });
  return snapshot;
}
