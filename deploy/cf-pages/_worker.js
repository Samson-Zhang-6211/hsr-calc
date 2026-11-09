/**
 * 星铁展示柜转发器（Cloudflare Pages · 单文件 `_worker.js`）
 * ============================================================
 * 为什么需要它：
 *   页面的 JS 在浏览器里读不了 `api.mihomo.me` / `enka.network` 的响应——这两个接口
 *   都不返回 `Access-Control-Allow-Origin`，跨域读取会被浏览器拦成
 *   `TypeError: Failed to fetch`。这个小脚本跑在 Cloudflare 上，替浏览器去取，
 *   再把结果加上 CORS 头返回，于是页面就能读了。
 *
 * 为什么是 Pages 而不是 Workers：
 *   国内网络实测 `*.workers.dev` 的 DNS 被污染（解析到 Facebook/Twitter 的 IP），
 *   而 `*.pages.dev` 可达。所以用 Pages 的「上传资产」方式拿 pages.dev 域名。
 *
 * 用法（部署后）：
 *   GET https://<项目名>.pages.dev/hsr/uid/{9位UID}     ← 默认走 mihomo（国内可达）
 *   GET https://<项目名>.pages.dev/hsr/enka/{9位UID}    ← 走 Enka（需要能访问境外）
 *   页面「接口代理地址」填：https://<项目名>.pages.dev/hsr/uid
 *   （若想用 Enka，把页面数据源切到 Enka、代理地址填 .../hsr/enka）
 *
 * 注意：这只是转发，不存任何数据；缓存只存在 Cloudflare 边缘，最长 60 秒。
 */

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,OPTIONS',
  'Access-Control-Allow-Headers': 'Accept,Content-Type',
  'Access-Control-Max-Age': '86400',
};

const UA = 'hsr-sim-showcase-relay/1.0';

function json(body, status, extra) {
  return new Response(typeof body === 'string' ? body : JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      ...CORS,
      ...(extra || {}),
    },
  });
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS });
    }

    const url = new URL(request.url);
    const m = /^\/hsr\/(uid|enka)\/(\d{9})\/?$/.exec(url.pathname);
    if (!m) {
      // 不归我管：若这个 Pages 项目还托管了站点静态文件，交给静态资源
      if (env && env.ASSETS) return env.ASSETS.fetch(request);
      return json(
        {
          detail: 'usage: /hsr/uid/<9-digit uid> (mihomo) or /hsr/enka/<9-digit uid> (enka)',
        },
        400,
      );
    }
    if (request.method !== 'GET') {
      return json({ detail: 'Method Not Allowed' }, 405);
    }
    const source = m[1] === 'enka' ? 'enka' : 'mihomo';
    const uid = m[2];
    const upstream =
      source === 'enka'
        ? `https://enka.network/api/hsr/uid/${uid}`
        : `https://api.mihomo.me/sr_info_parsed/${uid}?lang=cn`;

    // 边缘缓存：同一 UID 60 秒内只打一次上游（对方有限流，重复请求会互相伤害）
    const cache = typeof caches !== 'undefined' ? caches.default : null;
    const cacheKey = new Request(`https://hsr-showcase-cache.internal/${source}/${uid}`, {
      method: 'GET',
    });
    if (cache) {
      const hit = await cache.match(cacheKey);
      if (hit) return hit;
    }

    let res;
    try {
      res = await fetch(upstream, {
        headers: { Accept: 'application/json', 'User-Agent': UA },
        cf: { cacheTtl: 0 },
      });
    } catch (err) {
      return json({ detail: `upstream unreachable: ${String(err).slice(0, 120)}` }, 502);
    }

    const text = await res.text();
    const out = new Response(text, {
      status: res.status,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': res.ok ? 'public, max-age=60' : 'no-store',
        ...CORS,
      },
    });

    // 只缓存成功响应：404（无此 UID）/429（限流）不该被钉住
    if (cache && res.ok) {
      try {
        await cache.put(cacheKey, out.clone());
      } catch {
        /* 缓存失败不影响返回 */
      }
    }
    return out;
  },
};
