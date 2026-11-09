import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveVersion } from './lib/data-source.mjs';
import { dataBase } from './lib/env-base.mjs';

// 版本口径唯一来源 = data/source.lock.json（显式传参仍优先）
const VERSION = await resolveVersion(process.argv[2], 'monsters');
const DATA_URL = `${dataBase()}/${VERSION}/monster.json`;
const OUT = fileURLToPath(
  new URL('../apps/web/src/data/monster-roster.ts', import.meta.url),
);

const res = await fetch(DATA_URL);
if (!res.ok) throw new Error(`fetch failed: ${res.status} ${DATA_URL}`);
const data = await res.json();

const rows = Object.entries(data)
  .map(([id, m]) => ({
    id,
    zh: m.zh ?? '',
    en: m.en ?? '',
    rank: m.rank ?? '',
    weak: m.weak ?? [],
  }))
  .sort((a, b) => Number(a.id) - Number(b.id));

const body = `// 由 scripts/gen-monsters.mjs 生成（数据源 static.社区数据源.cc，版本 ${VERSION}），请勿手改
export interface RosterMonster {
  id: string;
  zh: string;
  en: string;
  rank: string;
  weak: string[];
}

export const MONSTER_ROSTER_VERSION = '${VERSION}';

export const MONSTER_ROSTER: readonly RosterMonster[] = ${JSON.stringify(rows, null, 2)};
`;

await mkdir(dirname(OUT), { recursive: true });
await writeFile(OUT, body, 'utf8');
console.log(`wrote ${rows.length} monsters -> ${OUT}`);
