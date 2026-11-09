import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import i18n from './i18n.js';

// ── note 文案覆盖（2026-10-30 第三十二轮）──
// 明细表「备注」列走 `noteLabel(n) = t('timeline.team.noteLabels.' + n)`：
// **缺键会把裸键名直接显示给用户**（如 `enemyPhaseUp` / `karmaFeignDeathSkip`）。
// 本用例扫引擎源码里「note 键的产生点」，与 `noteLabels` 对照，缺一条就红。
//
// 扫描口径（刻意保守，只认两种形态）：
//   ① `note: ['a', 'b']` —— 单层数组字面量（不跨行、不嵌套）
//   ② `<某个以 otes 结尾的变量>.push('a')` —— 如 `notes.push` / `dahliaPendingNotes.push`
// 条件表达式包裹的 `push(x ? 'a' : 'b')` 不会命中（不是字面量），这类需要人工补；
// 因此本用例是「下限保护」，不是全量证明。

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ENGINE_SRC = path.resolve(HERE, '../../../packages/engine/src');

function collectEngineFiles(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) collectEngineFiles(p, out);
    else if (p.endsWith('.ts') && !p.endsWith('.d.ts')) out.push(p);
  }
  return out;
}

/** 扫描引擎源码，返回所有会被当作 note 显示的键 → 出处文件 */
function noteKeys(): Map<string, Set<string>> {
  const keys = new Map<string, Set<string>>();
  const add = (k: string, file: string) => {
    if (!keys.has(k)) keys.set(k, new Set());
    keys.get(k)!.add(path.relative(ENGINE_SRC, file));
  };
  for (const file of collectEngineFiles(ENGINE_SRC)) {
    const src = fs.readFileSync(file, 'utf8');
    for (const m of src.matchAll(/note:\s*\[([^[\]]{0,400})\]/g)) {
      for (const q of m[1].matchAll(/'([A-Za-z][\w.-]*)'/g)) add(q[1], file);
    }
    for (const line of src.split('\n')) {
      const pm = line.match(/([A-Za-z_]\w*[Oo]tes)\s*\.\s*push\(\s*'([A-Za-z][\w.-]*)'\s*\)/);
      if (pm) add(pm[2], file);
    }
  }
  return keys;
}

const labels = (lng: 'zh' | 'en'): Set<string> => {
  // noteLabels 嵌在 `timeline.team` 下（UI 用 `t('timeline.team.noteLabels.' + n)`）
  const bundle = i18n.getResourceBundle(lng, 'translation') as
    | { timeline?: { team?: { noteLabels?: Record<string, string> } } }
    | undefined;
  return new Set(Object.keys(bundle?.timeline?.team?.noteLabels ?? {}));
};

describe('i18n · note 文案覆盖', () => {
  it('引擎会发出的每个 note 键都有中英文案', () => {
    const zh = labels('zh');
    const en = labels('en');
    expect(zh.size).toBeGreaterThan(0);
    const keys = noteKeys();
    expect(keys.size).toBeGreaterThan(100); // 扫描本身没崩的兜底
    const missing = [...keys.entries()]
      .filter(([k]) => !zh.has(k) || !en.has(k))
      .map(([k, files]) => `${k} (${[...files].join(',')})`)
      .sort();
    expect(missing, `缺 note 文案: ${missing.join(' | ')}`).toEqual([]);
  });

  it('关卡包相关 note 全部有文案（转阶段/金血假死/笑点/连麦PK）', () => {
    const zh = labels('zh');
    for (const k of [
      'enemyPhaseUp',
      'karmaFeignDeathSkip',
      'enemyLaughGain',
      'pkOpen',
      'pkIsolate',
      'pkTick',
      'pkAlreadyOpen',
      'pkPhase2',
      'pkEndSuccess',
      'pkEndFail',
      'stageMiasma',
      'stageMiasmaAha',
      'stageEmber',
      'stageEmberAha',
    ]) {
      expect(zh.has(k), `缺 ${k}`).toBe(true);
    }
  });
});
