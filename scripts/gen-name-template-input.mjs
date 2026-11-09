// 生成名字模板的输入清单：64 个遗器套装名 + 99 个角色名（data/ 为唯一来源）。
// 输出 .tmp-font/names.json，供 render-name-templates.ps1 用汉仪旗黑 65W 渲染。
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';

const out = [];
for (const file of readdirSync('data/relicsets')) {
  if (!/^\d+\.json$/.test(file)) continue;
  const doc = JSON.parse(readFileSync(`data/relicsets/${file}`, 'utf8'));
  const name = doc?.zh?.name;
  if (name) out.push({ kind: 'relic', id: doc.id ?? file.replace('.json', ''), name });
}
for (const file of readdirSync('data/characters')) {
  if (!/^\d+\.json$/.test(file)) continue;
  const doc = JSON.parse(readFileSync(`data/characters/${file}`, 'utf8'));
  const name = doc?.zh?.name;
  if (name) out.push({ kind: 'char', id: doc.id ?? file.replace('.json', ''), name });
}
writeFileSync('.tmp-font/names.json', JSON.stringify(out, null, 1), 'utf8');
console.log('names', out.length, 'relic', out.filter((x) => x.kind === 'relic').length, 'char', out.filter((x) => x.kind === 'char').length);
