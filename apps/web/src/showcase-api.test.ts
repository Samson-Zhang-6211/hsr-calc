import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ENKA_UID_BASE,
  MIHOMO_UID_BASE,
  ShowcaseError,
  buildShowcaseUrl,
  clearShowcaseCache,
  directUrl,
  fetchShowcase,
  normalizeUid,
} from './showcase-api.js';

/**
 * 取数层单测：只锁「URL 拼接 / 缓存 / 错误分流 / 源校验」四类行为，不联网。
 * 背景（2026-10-26/27 实测）：Enka 与 mihomo 都不返回 CORS
 * 头，浏览器直连必被拦；且 Enka 在国内网络被阻断（ECONNRESET），故默认源是 mihomo。
 */

class MemoryStorage {
  private map = new Map<string, string>();
  getItem(key: string): string | null {
    return this.map.has(key) ? this.map.get(key)! : null;
  }
  setItem(key: string, value: string): void {
    this.map.set(key, String(value));
  }
  removeItem(key: string): void {
    this.map.delete(key);
  }
  clear(): void {
    this.map.clear();
  }
  key(index: number): string | null {
    return [...this.map.keys()][index] ?? null;
  }
  get length(): number {
    return this.map.size;
  }
}

const MIHOMO_BODY = {
  player: { uid: '100000001', nickname: '测试员', level: 70, is_display: true },
  characters: [],
};

const ENKA_BODY = {
  uid: '100000001',
  ttl: 60,
  region: 'CN',
  detailInfo: { nickname: '测试员', level: 70, avatarDetailList: [] },
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('showcase-api · UID 与 URL', () => {
  it('normalizeUid：只接受 9 位数字', () => {
    expect(normalizeUid(' 100000001 ')).toBe('100000001');
    expect(normalizeUid('10000001')).toBe(null);
    expect(normalizeUid('1000000012')).toBe(null);
    expect(normalizeUid('abcdefghi')).toBe(null);
    expect(normalizeUid('')).toBe(null);
  });

  it('仓库不内置上游地址：无代理时直连 URL 为空（必须自配转发）', () => {
    expect(MIHOMO_UID_BASE).toBe('');
    expect(ENKA_UID_BASE).toBe('');
    expect(directUrl('100000001', 'mihomo')).toBe('');
    expect(directUrl('100000001', 'enka')).toBe('');
    expect(buildShowcaseUrl('100000001')).toBe('');
  });

  it('代理前缀：前缀写法 / {uid} 占位符 / 尾斜杠', () => {
    expect(buildShowcaseUrl('100000001', { proxyBase: 'relay/hsr/uid/' })).toBe(
      'relay/hsr/uid/100000001',
    );
    expect(buildShowcaseUrl('100000001', { proxyBase: 'relay/enka?uid={uid}' })).toBe(
      'relay/enka?uid=100000001',
    );
  });
});

describe('showcase-api · 取数与缓存', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', new MemoryStorage());
    clearShowcaseCache('100000001');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('mihomo 成功：返回快照并写缓存，二次调用命中缓存不再请求', async () => {
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(jsonResponse(MIHOMO_BODY)));
    vi.stubGlobal('fetch', fetchMock);

    const first = await fetchShowcase('100000001', { proxyBase: 'relay/hsr/uid' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe('relay/hsr/uid/100000001');
    expect(first.cached).toBe(false);
    expect(first.source).toBe('mihomo');
    expect((first.json as typeof MIHOMO_BODY).player.nickname).toBe('测试员');
    // mihomo 不返回 ttl → 默认 60s
    expect(first.expiresAt - first.fetchedAt).toBe(60_000);

    const second = await fetchShowcase('100000001', { proxyBase: 'relay/hsr/uid' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(second.cached).toBe(true);
  });

  it('两个源的缓存互不串用', async () => {
    const fetchMock = vi
      .fn()
      .mockImplementation((url: string) =>
        Promise.resolve(jsonResponse(url.includes('mihomo') ? MIHOMO_BODY : ENKA_BODY)),
      );
    vi.stubGlobal('fetch', fetchMock);
    const m = await fetchShowcase('100000001', { proxyBase: 'relay/mihomo/uid' });
    expect(m.source).toBe('mihomo');
    const e = await fetchShowcase('100000001', { source: 'enka', proxyBase: 'relay/enka/uid' });
    expect(e.source).toBe('enka');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    // 再取一次 mihomo → 命中自己的缓存，不再发请求
    const again = await fetchShowcase('100000001', { proxyBase: 'relay/mihomo/uid' });
    expect(again.cached).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('force=true 绕过缓存重新请求', async () => {
    // 每次调用都要给新的 Response（同一个 Response 的 body 只能读一次）
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(jsonResponse(MIHOMO_BODY)));
    vi.stubGlobal('fetch', fetchMock);
    await fetchShowcase('100000001');
    await fetchShowcase('100000001', { force: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('404 → not-found；429 → rate-limited；400 → invalid-uid；500 → upstream', async () => {
    const cases: [number, unknown, string][] = [
      [404, { detail: 'User not found' }, 'not-found'],
      [429, { message: 'rate limited', code: 'rate_limited' }, 'rate-limited'],
      [400, { message: 'wrong uid', code: 'wrong_uid' }, 'invalid-uid'],
      [500, { message: 'boom', code: 'upstream_fail' }, 'upstream'],
      [424, { message: 'maintenance', code: 'maintenance' }, 'maintenance'],
    ];
    for (const [status, body, kind] of cases) {
      vi.stubGlobal('fetch', vi.fn().mockImplementation(() => Promise.resolve(jsonResponse(body, status))));
      const err = await fetchShowcase('100000001', { force: true }).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(ShowcaseError);
      expect((err as ShowcaseError).kind).toBe(kind);
      expect((err as ShowcaseError).status).toBe(status);
    }
  });

  it('网络层 TypeError：无代理按 cors（需配代理），有代理按 network', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    const direct = await fetchShowcase('100000001', { force: true }).catch((e: unknown) => e);
    expect((direct as ShowcaseError).kind).toBe('cors');

    const proxied = await fetchShowcase('100000001', {
      force: true,
      proxyBase: 'relay/hsr/uid',
    }).catch((e: unknown) => e);
    expect((proxied as ShowcaseError).kind).toBe('network');
  });

  it('非 JSON 响应 → bad-payload；结构不匹配（源转错）→ bad-payload', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('<html>404</html>', { status: 200 })));
    const html = await fetchShowcase('100000001', { force: true }).catch((e: unknown) => e);
    expect((html as ShowcaseError).kind).toBe('bad-payload');

    // 声明 mihomo 但拿到 Enka 结构 → 说明代理转错了目标
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(ENKA_BODY)));
    const wrong = await fetchShowcase('100000001', { force: true }).catch((e: unknown) => e);
    expect((wrong as ShowcaseError).kind).toBe('bad-payload');

    // 声明 Enka 但拿到 mihomo 结构
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(MIHOMO_BODY)));
    const wrong2 = await fetchShowcase('100000001', {
      force: true,
      source: 'enka',
    }).catch((e: unknown) => e);
    expect((wrong2 as ShowcaseError).kind).toBe('bad-payload');
  });
});
