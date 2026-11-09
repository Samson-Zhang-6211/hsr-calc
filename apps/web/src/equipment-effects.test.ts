import { describe, expect, it } from 'vitest';
import { markEidolonClausesEngine, parseEquipmentEffect } from './equipment-effects.js';

describe('parseEquipmentEffect', () => {
  it('「提高数值等同于…」→ 标条件，不烘面板（21014 此时恰好）', () => {
    const clauses = parseEquipmentEffect(
      'lc',
      '使装备者的效果抵抗提高<unbreak>#1[i]%</unbreak>%，并使装备者的治疗量提高，提高数值等同于效果抵抗的<unbreak>#2[i]%</unbreak>%，最多使治疗量提高<unbreak>#3[i]%</unbreak>%。',
      [0.16, 0.33, 0.15],
    );
    const healBaked = clauses.filter(
      (c) => c.property === 'HealRatioBase' && !c.conditional && c.value > 0,
    );
    expect(healBaked).toHaveLength(0);
    expect(clauses.find((c) => c.raw.includes('效果抵抗'))!.zone).toBe('panel');
  });

  it('引擎接管增伤（ENGINE_DMG_LC）：damageBonus 子句改标 engine，面板句照旧烘焙', () => {
    // 23006 只需等待：无条件增伤句由引擎挂 buff（防 commonBonus 双计）
    const clauses = parseEquipmentEffect(
      'lc',
      '使装备者造成的伤害提高<unbreak>#1[i]%</unbreak>。使装备者的速度提高<unbreak>#2[i]%</unbreak>。',
      [0.18, 0.06],
      { lightconeId: '23006' },
    );
    expect(clauses.find((c) => c.raw.includes('造成的伤害'))!.zone).toBe('engine');
    expect(clauses.find((c) => c.raw.includes('速度'))!.zone).toBe('panel');
    // 未纳入集合的光锥维持原分类
    const plain = parseEquipmentEffect('lc', '使装备者造成的伤害提高<unbreak>#1[i]%</unbreak>。', [0.12], {
      lightconeId: '21009',
    });
    expect(plain[0]!.zone).toBe('damageBonus');
  });

  it('无条件面板词条 → panel 区', () => {
    const clauses = parseEquipmentEffect('lc', '使装备者的攻击力提高<unbreak>#1[i]%</unbreak>。', [0.3]);
    expect(clauses).toHaveLength(1);
    expect(clauses[0]).toMatchObject({
      zone: 'panel',
      property: 'AttackAddedRatio',
      value: 0.3,
      conditional: false,
    });
  });

  it('条件增伤：条件子句继承 conditional，增伤进 damageBonus', () => {
    const clauses = parseEquipmentEffect(
      'lc',
      '当有敌方目标的弱点被击破时，装备者造成的伤害提高<unbreak>#1[i]%</unbreak>，持续1回合。',
      [0.09],
    );
    expect(clauses).toHaveLength(1);
    expect(clauses[0]).toMatchObject({
      zone: 'damageBonus',
      value: 0.09,
      conditional: true,
    });
  });

  it('击破伤害提高优先于泛匹配伤害提高', () => {
    expect(
      parseEquipmentEffect('r4', '造成的击破伤害提高<unbreak>#1[i]%</unbreak>。', [0.12])[0].zone,
    ).toBe('breakDmgBoost');
    expect(
      parseEquipmentEffect('r4', '造成的伤害提高<unbreak>#1[i]%</unbreak>。', [0.12])[0].zone,
    ).toBe('damageBonus');
  });

  it('无视防御 / 受到的伤害提高 / 防御力降低', () => {
    expect(
      parseEquipmentEffect('r4', '无视其<unbreak>#1[i]%</unbreak>防御力。', [0.2])[0].zone,
    ).toBe('defIgnore');
    expect(
      parseEquipmentEffect('r4', '使敌方受到的伤害提高<unbreak>#1[i]%</unbreak>。', [0.1])[0].zone,
    ).toBe('vulnerability');
    expect(
      parseEquipmentEffect('r4', '敌方防御力降低<unbreak>#1[i]%</unbreak>。', [0.1])[0].zone,
    ).toBe('defReduction');
  });

  it('纯描述子句（无效果动词）不展示', () => {
    expect(parseEquipmentEffect('lc', '该效果最多叠加5层。', [])).toHaveLength(0);
  });

  it('暴击伤害与击破特攻映射面板 property', () => {
    expect(
      parseEquipmentEffect('lc', '暴击伤害提高<unbreak>#1[i]%</unbreak>。', [0.4])[0].property,
    ).toBe('CriticalDamageBase');
    expect(
      parseEquipmentEffect('lc', '击破特攻提高<unbreak>#1[i]%</unbreak>。', [0.2])[0].property,
    ).toBe('BreakDamageAddedRatioBase');
  });

  it('欢愉度提高 → elationDegree', () => {
    expect(
      parseEquipmentEffect('r4', '欢愉度提高<unbreak>#1[i]%</unbreak>。', [0.1])[0].zone,
    ).toBe('elationDegree');
  });

  it('批5：312「其他角色」子句标条件，不误烘进佩戴者 commonBonus', () => {
    const clauses = parseEquipmentEffect(
      'p2',
      '使装备者的能量恢复效率提高<unbreak>#1[i]%</unbreak>。使队伍中与装备者属性相同的我方其他角色造成的伤害提高<unbreak>#2[i]%</unbreak>。',
      [0.05, 0.1],
    );
    const teamDmg = clauses.find((c) => c.zone === 'damageBonus');
    expect(teamDmg).toMatchObject({ value: 0.1, conditional: true });
    const energy = clauses.find((c) => c.property === 'SPRatioBase');
    expect(energy).toMatchObject({ value: 0.05, conditional: false });
  });

  it('批5：317「如果…」句首标条件，第一位角色 atk 子句继承 conditional', () => {
    const clauses = parseEquipmentEffect(
      'p2',
      '使装备者的能量恢复效率提高<unbreak>#1[i]%</unbreak>，如果装备者不是编队中的第一位角色，使编队中的第一位角色攻击力提高<unbreak>#2[i]%</unbreak>。',
      [0.05, 0.12],
    );
    const firstAtk = clauses.find((c) => c.property === 'AttackAddedRatio');
    expect(firstAtk).toMatchObject({ value: 0.12, conditional: true });
    const energy = clauses.find((c) => c.property === 'SPRatioBase');
    expect(energy).toMatchObject({ value: 0.05, conditional: false });
  });

  it('额外提高变体同样识别', () => {
    expect(
      parseEquipmentEffect('lc', '暴击伤害额外提高<unbreak>#1[i]%</unbreak>。', [0.4])[0],
    ).toMatchObject({ zone: 'panel', property: 'CriticalDamageBase' });
    expect(
      parseEquipmentEffect('lc', '造成的伤害额外提高<unbreak>#1[i]%</unbreak>。', [0.1])[0].zone,
    ).toBe('damageBonus');
  });

  it('受到的伤害降低 → damageReduction', () => {
    expect(
      parseEquipmentEffect('r4', '我方全体受到的伤害降低<unbreak>#1[i]%</unbreak>。', [0.08])[0],
    ).toMatchObject({ zone: 'damageReduction', value: 0.08 });
  });

  it('英文文本不解析，整段作为 unknown 返回', () => {
    const clauses = parseEquipmentEffect('lc', 'Increases ATK by 30%.', []);
    expect(clauses).toHaveLength(1);
    expect(clauses[0].zone).toBe('unknown');
    expect(clauses[0].conditional).toBe(false);
  });

  it('基础速度提高N点 → panel/SpeedDelta 非条件子句（23065啊哈/23036织锦/23044黎明）', () => {
    // 23065 啊哈专武全句（占位符形态照抄 data：`#4[i]%` 在 unbreak 内、% 属占位符）
    const aha = parseEquipmentEffect(
      'lc',
      '使装备者的基础速度提高<unbreak>#1[i]</unbreak>点。对我方其他单体施放战技时，获得<unbreak>#2[i]</unbreak>个笑点，该效果每<unbreak>#3[i]</unbreak>回合最多触发1次，随后使我方全体在本场战斗中造成伤害时无视敌方目标<unbreak>#4[i]%</unbreak>的防御力，该效果无法叠加。',
      [12, 10, 2, 0.16],
    );
    expect(aha[0]).toMatchObject({
      zone: 'panel',
      property: 'SpeedDelta',
      value: 12,
      conditional: false,
    });
    const defIgnore = aha.find((c) => c.zone === 'defIgnore');
    expect(defIgnore).toMatchObject({ value: 0.16, conditional: true });

    // 23036 织锦 / 23044 黎明：文案「基础速度提高#1」（无「点」字）
    for (const desc of [
      '使装备者的基础速度提高<unbreak>#1[i]</unbreak>，装备者和装备者的忆灵在攻击后使装备者获得1层【织锦】。',
      '使装备者的基础速度提高<unbreak>#1[i]</unbreak>，造成伤害时无视目标<unbreak>#2[i]%</unbreak>的防御力。',
    ]) {
      const c = parseEquipmentEffect('lc', desc, [12, 0.18])[0];
      expect(c).toMatchObject({ zone: 'panel', property: 'SpeedDelta', value: 12, conditional: false });
    }
  });

  it('无「基础速度」字样的速度百分比 → panel/SpeedAddedRatio（遗器2件套速度6%，2026-10-10 裁定接入）', () => {
    // 占位符形态照抄 data：#N[i]% 的 % 属占位符（写标签外会把 0.06 舍成 0）
    const c = parseEquipmentEffect('r2', '使装备者的速度提高<unbreak>#1[i]%</unbreak>。', [0.06])[0];
    expect(c).toMatchObject({
      zone: 'panel',
      property: 'SpeedAddedRatio',
      value: 0.06,
      conditional: false,
    });
  });

  it('水砂专武23064：暴击率面板 + 风口/潮流/回SP子句', () => {
    // data/lightcones/23064.json 原文（占位符在 color+unbreak 内）
    const desc =
      '使装备者的暴击率提高<color=#f29e38ff><unbreak>#1[i]%</unbreak></color>。装备者施放欢愉技时，获得【风口】，【风口】使装备者的速度提高<color=#f29e38ff><unbreak>#2[i]%</unbreak></color>。若施放的欢愉技与上一次施放的欢愉技不同，则额外获得【潮流】，【潮流】使装备者的欢愉度提高<color=#f29e38ff><unbreak>#3[i]%</unbreak></color>。\n每个波次开始时或装备者每施放<unbreak>#4[i]</unbreak>次欢愉技后，恢复1个战技点。';
    const clauses = parseEquipmentEffect('lc', desc, [0.18, 0.24, 0.4, 3]);
    // 首句无条件 → 面板暴击率
    expect(clauses[0]).toMatchObject({
      zone: 'panel',
      property: 'CriticalChanceBase',
      value: 0.18,
      conditional: false,
    });
    // 风口速度%（无「基础速度」字样）→ unknown 条件子句
    const speed = clauses.find((c) => c.zone === 'unknown' && c.value === 0.24);
    expect(speed).toMatchObject({ value: 0.24, conditional: true });
    // 潮流欢愉度 → elationDegree 条件子句
    const trend = clauses.find((c) => c.zone === 'elationDegree');
    expect(trend).toMatchObject({ value: 0.4, conditional: true });
    // 回战技点句（含恢复动词）→ unknown 条件子句
    const sp = clauses.find((c) => c.value === 3 || (c.zone === 'unknown' && c.conditional && c.value !== 0.24));
    expect(sp).toBeDefined();
    expect(sp!.conditional).toBe(true);
  });

  it('战斗引擎已接入专武23054：全子句 engine（速度句不进面板防双计），不传 opts 正常分类', () => {
    // 23054 缩略文案（占位符形态照抄 data：#N[i]% 的 % 在 unbreak 内）
    const desc =
      '使装备者的速度提高<unbreak>#1[i]%</unbreak>。装备者进入战斗或对我方目标施放终结技时，使装备者获得【上上签】，持续<unbreak>#4[i]</unbreak>回合。每个波次开始时，装备者固定恢复<unbreak>#6[i]</unbreak>点能量。';
    const clauses = parseEquipmentEffect('lc', desc, [0.18, 0.1, 0.3, 3, 0.12, 15], {
      lightconeId: '23054',
    });
    expect(clauses.length).toBeGreaterThanOrEqual(2);
    for (const c of clauses) {
      expect(c.zone).toBe('engine');
      expect(c.property).toBeNull();
      expect(c.conditional).toBe(false);
    }
    // 含恢复动词的波次能量句在列（用户投诉句）
    expect(clauses.some((c) => c.raw.includes('固定恢复'))).toBe(true);
    // 不传 lightconeId → 速度句正常分类（panel 速度%规则不受影响）
    const plain = parseEquipmentEffect('lc', '使装备者的速度提高<unbreak>#1[i]%</unbreak>。', [0.06]);
    expect(plain[0]).toMatchObject({
      zone: 'panel',
      property: 'SpeedAddedRatio',
      value: 0.06,
      conditional: false,
    });
  });

  it('专武23053 SP上限子句 → engine（引擎 maxSp 已接入，勿渲染「未接入计算」）', () => {
    // data/lightcones/23053.json「花花世界迷人眼」原文（占位符在 unbreak 内）
    const desc =
      '使装备者的暴击伤害提高<color=#f29e38ff><unbreak>#1[i]%</unbreak></color>。装备者在场时，队伍中每有1名「欢愉」命途的角色，战技点上限提高<unbreak>#2[i]</unbreak>点，最多提高<unbreak>#3[i]</unbreak>点；装备者每消耗1个战技点使自身造成的欢愉伤害无视敌方目标<color=#f29e38ff><unbreak>#6[f1]%</unbreak></color>的防御力，最多叠加<unbreak>#5[i]</unbreak>层。';
    const clauses = parseEquipmentEffect('lc', desc, [0.48, 1, 3, 0.05, 4, 0.06]);
    // 暴伤照常烘面板（引擎 lcCritDmg 未使用，防丢计算）
    expect(clauses[0]).toMatchObject({
      zone: 'panel',
      property: 'CriticalDamageBase',
      value: 0.48,
    });
    const spCap = clauses.find((c) => c.raw.includes('战技点上限提高'));
    expect(spCap?.zone).toBe('engine');
    // 句内继承：「最多提高3点」无关键词，承接同句前件 engine
    const spCapMax = clauses.find((c) => c.raw.startsWith('最多提高'));
    expect(spCapMax?.zone).toBe('engine');
    // 新句不继承：无视防御子句维持原分类
    expect(clauses.find((c) => c.zone === 'defIgnore')).toBeDefined();
  });

  it('23046「战技点上限大于等于6点」条件引用不误命中 engine 规则', () => {
    const clauses = parseEquipmentEffect(
      'lc',
      '使装备者的暴击率提高<unbreak>#1[i]%</unbreak>。进入战斗时，若我方的战技点上限大于等于<unbreak>#2[i]</unbreak>点，使装备者的攻击力提高<unbreak>#3[i]%</unbreak>。',
      [0.16, 6, 0.4],
    );
    expect(clauses.some((c) => c.zone === 'engine')).toBe(false);
    const atk = clauses.find((c) => c.property === 'AttackAddedRatio');
    expect(atk?.zone).toBe('panel');
  });
});

describe('markEidolonClausesEngine', () => {
  it('仅翻转 e1..e6 的 unknown 子句（抗穿类），已分类星魂与光锥子句不动', () => {
    // 抗穿不在 classify 白名单 → unknown（星魂显示口径修正的前置事实）
    const eidolon = parseEquipmentEffect('e1', '绯英E1：全属性抗性穿透提高20%。', []);
    expect(eidolon[0].zone).toBe('unknown');
    // 已分类星魂子句（伤害提高 → damageBonus，确进计算器）保持原样
    const dmg = parseEquipmentEffect('e2', '造成的伤害提高10%。', [0.1]);
    expect(dmg[0].zone).toBe('damageBonus');
    // 光锥前缀 lc 的 unknown 子句不动（未裁定扩面）
    const lc = parseEquipmentEffect('lc', '全属性抗性穿透提高10%。', []);
    expect(lc[0].zone).toBe('unknown');

    markEidolonClausesEngine([...eidolon, ...dmg, ...lc]);

    expect(eidolon[0].zone).toBe('engine'); // 改标「战斗模拟已接入」
    expect(eidolon[0].raw).toContain('20%'); // 原文与值不受影响
    expect(dmg[0].zone).toBe('damageBonus');
    expect(lc[0].zone).toBe('unknown');
  });
});
