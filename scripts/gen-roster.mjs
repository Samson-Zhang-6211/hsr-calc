import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveVersion } from './lib/data-source.mjs';

// 版本口径唯一来源 = data/source.lock.json（显式传参仍优先）
const VERSION = await resolveVersion(process.argv[2], 'characters');
const DATA_URL = `https://static.nanoka.cc/hsr/${VERSION}/character.json`;
const OUT = fileURLToPath(
  new URL('../apps/web/src/data/character-roster.ts', import.meta.url),
);

const res = await fetch(DATA_URL);
if (!res.ok) throw new Error(`fetch failed: ${res.status} ${DATA_URL}`);
const data = await res.json();

const PATH_ZH = { Warrior: '毁灭', Knight: '存护', Shaman: '同谐', Memory: '记忆', Elation: '欢愉' };
const PATH_EN = {
  Warrior: 'Destruction', Knight: 'Preservation', Shaman: 'Harmony', Memory: 'Remembrance', Elation: 'Elation',
};
/** 开拓者占位符 {NICKNAME} → 「开拓者·命途」（2026-10-29 用户裁定） */
const nameOf = (c, lang) => {
  const raw = c[lang] ?? '';
  if (!raw.includes('{NICKNAME}')) return raw;
  const zh = PATH_ZH[c.baseType] ?? c.baseType;
  return lang === 'zh' ? `开拓者·${zh}` : `Trailblazer · ${PATH_EN[c.baseType] ?? c.baseType}`;
};

const rarityOf = (rank) => {
  const m = /Type(\d)$/.exec(rank ?? '');
  return m ? Number(m[1]) : 0;
};

const rows = Object.entries(data)
  .map(([id, c]) => ({
    id,
    zh: nameOf(c, 'zh'),
    en: nameOf(c, 'en'),
    element: c.damageType ?? '',
    path: c.baseType ?? '',
    rarity: rarityOf(c.rank),
  }))
  .sort((a, b) => Number(a.id) - Number(b.id));

const body = `// 由 scripts/gen-roster.mjs 生成（数据源 static.nanoka.cc，版本 ${VERSION}），请勿手改
export interface RosterCharacter {
  id: string;
  zh: string;
  en: string;
  element: string;
  path: string;
  rarity: number;
}

export const ROSTER_VERSION = '${VERSION}';

export const CHARACTER_ROSTER: readonly RosterCharacter[] = ${JSON.stringify(rows, null, 2)};
`;

await mkdir(dirname(OUT), { recursive: true });
await writeFile(OUT, body, 'utf8');
console.log(`wrote ${rows.length} characters -> ${OUT}`);
