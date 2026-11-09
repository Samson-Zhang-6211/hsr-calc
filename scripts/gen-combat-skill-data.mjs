import fs from 'node:fs';

const raw = fs.readFileSync('packages/engine/src/combat/skill-raw.json', 'utf8').replace(/^\uFEFF/, '');
const data = JSON.parse(raw);

const header = `/**
 * 战斗技能参数表（本地 data/characters 4.6.51 提取：level -> param_list）。
 * 百分比参数为比值口径（0.7 = 70%），与伤害引擎一致。
 * stance = show_stance_list：单攻/弹射取 [0]，AoEAttack 取 [1]（全体同值）。
 */

export interface SkillTable {
  type?: string | null;
  tag: string;
  stance: [number, number, number];
  /** 终结技/普攻能量（sp_base；秘技等无 = null） */
  sp?: number | null;
  /** SP 消耗（>0；无 = null） */
  bpN?: number | null;
  /** SP 获得（普攻 +1；无 = null） */
  bpA?: number | null;
  params: Record<string, number[]>;
}

export const SKILL_TABLES: Record<string, SkillTable> = `;

const footer = `;

/** 取指定等级参数（clamp 1~15；缺档回退到最近的更低档） */
export function skillParams(skillId: string, level: number): number[] {
  const table = SKILL_TABLES[skillId];
  if (!table) throw new Error(\`unknown skill \${skillId}\`);
  const lv = Math.min(15, Math.max(1, Math.round(level)));
  for (let i = lv; i >= 1; i -= 1) {
    const p = table.params[String(i)];
    if (p) return p;
  }
  const first = table.params['1'];
  if (!first) throw new Error(\`no params for skill \${skillId}\`);
  return first;
}

/** 技能标签（SingleAttack / Blast / AoEAttack 等；缺失返回 null） */
export function skillTag(skillId: string): string | null {
  return SKILL_TABLES[skillId]?.tag ?? null;
}

/** 该技能对单个目标的削韧点数（单攻/弹射取主目标，AoE 取全体值） */
export function stanceOf(skillId: string, level: number): number {
  void level; // stance 不随等级变；保留参数兼容调用点
  const table = SKILL_TABLES[skillId];
  if (!table) return 0;
  return table.tag === 'AoEAttack' ? table.stance[1] : table.stance[0];
}
`;

let body = JSON.stringify(data, null, 2);
body = body.replace(/^(\s*)"(\w+)":/gm, '$1$2:');
body = body.replace(/"/g, "'");
fs.writeFileSync('packages/engine/src/combat/skill-data.ts', header + body + footer, 'utf8');
console.log('written skill-data.ts');
