import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveVersion } from './lib/data-source.mjs';

// 版本口径唯一来源 = data/source.lock.json（显式传参仍优先）
const VERSION = await resolveVersion(process.argv[2], 'lightcones');
const DATA_URL = `https://static.nanoka.cc/hsr/${VERSION}/lightcone.json`;
const OUT = fileURLToPath(
  new URL('../apps/web/src/data/lightcone-roster.ts', import.meta.url),
);

const res = await fetch(DATA_URL);
if (!res.ok) throw new Error(`fetch failed: ${res.status} ${DATA_URL}`);
const data = await res.json();

const rarityOf = (rank) => {
  const m = /(\d)$/.exec(rank ?? '');
  return m ? Number(m[1]) : 0;
};

const rows = Object.entries(data)
  .map(([id, c]) => ({
    id,
    zh: c.zh ?? '',
    en: c.en ?? '',
    path: c.baseType ?? '',
    rarity: rarityOf(c.rank),
  }))
  .sort((a, b) => Number(a.id) - Number(b.id));

const body = `// 由 scripts/gen-lightcones.mjs 生成（数据源 static.nanoka.cc，版本 ${VERSION}），请勿手改
export interface RosterLightcone {
  id: string;
  zh: string;
  en: string;
  path: string;
  rarity: number;
}

export const LIGHTCONE_ROSTER_VERSION = '${VERSION}';

export const LIGHTCONE_ROSTER: readonly RosterLightcone[] = ${JSON.stringify(rows, null, 2)};
`;

await mkdir(dirname(OUT), { recursive: true });
await writeFile(OUT, body, 'utf8');
console.log(`wrote ${rows.length} lightcones -> ${OUT}`);
