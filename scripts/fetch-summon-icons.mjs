// 下载「忆灵/召唤物」图标到 apps/web/public/summon-icon/。
//
// 路径约定来自角色数据 `zh.memosprite.icon`（如 `SpriteOutput/ServantIconTeam/11402B.png`），
// 站点把它转成了 `（静态资源根地址）/servanticonteam/<名字>.webp`（256×216，带 alpha）。
//
// 用法：
//   node scripts/fetch-summon-icons.mjs           只补缺失的
//   node scripts/fetch-summon-icons.mjs --force   全部重下
//
// ⚠ 已知 CDN 上没有图的四个（保留「元素徽记 + 名字」兜底，别在本表里瞎猜 id）：
//   shenjun 神君（景元 1204）      —— 角色数据无 memosprite 块，只有 ex_rank 花费图标 131204.png
//   longling 龙灵（丹恒•腾荒 1414） —— 同上
//   fuyuan 浮元（灵砂 1222）        —— 同上
//   memo 晴空乐手（知更鸟•晴歌 1512）—— 数据写了 11512B，CDN 404
import { existsSync, mkdirSync, writeFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assetBase } from './lib/env-base.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const OUT_DIR = join(ROOT, 'apps/web/public/summon-icon');
const CDN = assetBase('servanticonteam');
const FORCE = process.argv.includes('--force');
const MIN_BYTES = 3 * 1024;

/** 引擎召唤物 id → 站点文件名（`1` + 角色名册 id + `B`） */
export const SUMMON_ICONS = {
  yijiang: '11402B', // 衣匠（阿格莱雅 1402）
  silong: '11407B', // 死龙•玻吕刻斯（遐蝶 1407）
  xiaoyika: '11409B', // 小伊卡（风堇 1409）
  changye: '11413B', // 长夜（长夜月 1413）
  demiurge: '11415B', // 德谬歌（昔涟 1415）
  mimi: '18007B', // 迷迷（开拓者•记忆 8007/8008）
};

async function fetchImage(url) {
  for (let i = 0; i < 3; i += 1) {
    try {
      const res = await fetch(url);
      if (res.status === 404) return { skip: '404' };
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const type = res.headers.get('content-type') ?? '';
      if (!type.startsWith('image/')) return { err: `非图片响应 ${type}` };
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length < MIN_BYTES) return { err: `过小 ${buf.length}B` };
      return { buf };
    } catch (e) {
      if (i === 2) return { err: String(e?.message ?? e) };
      await new Promise((r) => setTimeout(r, 400 * (i + 1)));
    }
  }
  return { err: 'unknown' };
}

mkdirSync(OUT_DIR, { recursive: true });
let added = 0;
let kept = 0;
const failures = [];

for (const [id, name] of Object.entries(SUMMON_ICONS)) {
  const file = join(OUT_DIR, `${id}.webp`);
  if (existsSync(file) && !FORCE && statSync(file).size >= MIN_BYTES) {
    kept += 1;
    continue;
  }
  const { buf, err, skip } = await fetchImage(`${CDN}/${name}.webp`);
  if (buf) {
    writeFileSync(file, buf);
    added += 1;
    console.log(`+ ${id}.webp  ← ${name}.webp  ${(buf.length / 1024).toFixed(0)}KB`);
  } else {
    failures.push(`${id} (${name}): ${skip ?? err}`);
  }
}

console.log(`\n新增 ${added} / 已存在 ${kept} / 失败 ${failures.length}`);
if (failures.length) {
  console.log('失败清单（按上面的说明走元素徽记兜底）：');
  for (const f of failures) console.log(`  - ${f}`);
}
