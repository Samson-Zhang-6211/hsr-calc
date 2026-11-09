import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import './i18n.js';
import { BattleStage, type StageAlly, type StageEnemy } from './battle-stage.js';
import { planFrames, type AnimFrame } from './battle-anim.js';

/**
 * 立绘战场区（BattleStage）渲染烟测：锁住「两页共用的那一块」的关键结构。
 *
 * 为什么要有这条：战场区同时被全真模拟（内联 markup）与数值代理模拟（组件）使用，
 * 动画类名/飘字/演出层一旦被改错，typecheck 与纯函数测试都发现不了，只有渲染能发现。
 */

const ALLY: StageAlly = {
  id: 'jingyuan',
  rosterId: '1204',
  name: '景元',
  element: 'Thunder',
  path: 'Mage',
  hp: 3000,
  maxHp: 3000,
  shield: 0,
  energy: 65,
  energyMax: 130,
  dead: false,
  ultReady: false,
};

const ENEMY: StageEnemy = {
  id: 'monster2',
  name: '敌方2',
  hp: 800,
  maxHp: 1000,
  toughness: 100,
  maxToughness: 300,
  broken: false,
  artId: '8001030',
};

const CENTER = { round: 2, time: 45, totalDamage: 12345, enemyHpLeft: 800, allyHpLeft: 3000 };

/** 千分位在不同 ICU 区域设置下可能是 4,321 或 4.321 */
const grouped = (n: number): RegExp => new RegExp(String(n).replace(/(\d)(?=(\d{3})+$)/g, '$1[,. ]'));

describe('BattleStage（立绘战场区）', () => {
  it('渲染我方立绘 / 敌方槽位 / 战技点 / 中间信息', () => {
    const html = renderToStaticMarkup(
      <BattleStage allies={[ALLY]} enemies={[ENEMY]} sp={3} center={CENTER} />,
    );
    expect(html).toContain('景元');
    expect(html).toContain('portraits-shop/1204.webp');
    expect(html).toContain('monster-art/8001030.webp');
    expect(html).toContain('3/5');
    expect(html).toMatch(grouped(12345));
    // 无动画帧时不出现动画零件
    expect(html).not.toContain('stage-pop');
    expect(html).not.toContain('stage-ult-layer');
  });

  it('我方出手帧：出手者前冲 + 飘字，且动画时长走 --anim-dur', () => {
    const frame: AnimFrame = {
      id: 7,
      kind: 'ally',
      actor: 'jingyuan',
      targets: ['monster2'],
      numbers: [
        {
          target: 'monster2',
          value: 4321,
          color: '#ffffff',
          delayMs: 0,
          tier: 'main',
          angleDeg: -5,
          offsetX: 12,
          offsetY: -4,
          tag: 'crit',
          rainbow: false,
        },
      ],
      totalDamage: 4321,
      durationMs: 420,
    };
    const html = renderToStaticMarkup(
      <BattleStage allies={[ALLY]} enemies={[ENEMY]} sp={3} center={CENTER} frame={frame} />,
    );
    expect(html).toContain('stage-lunge-r');
    expect(html).toContain('stage-pop');
    expect(html).toContain('--anim-dur:420ms');
    expect(html).toMatch(grouped(4321));
    // 主伤害 + 描边色变量 + 自身倾斜 + 「暴击」文字标签（2026-10-25 按录屏核定）
    expect(html).toContain('stage-pop--main');
    expect(html).toContain('--pop-rot:-5deg');
    expect(html).toContain('stage-pop-tag');
    expect(html).toContain('暴击');
    // 出手者才会前冲：敌方头像不带动画类
    expect(html).toContain('stage-flash');
  });

  it('欢愉飘字走彩虹渐变类；击破飘字跳「击破」', () => {
    const frame: AnimFrame = {
      id: 11,
      kind: 'ally',
      actor: 'jingyuan',
      targets: ['monster2'],
      numbers: [
        {
          target: 'monster2',
          value: 9876,
          color: '#ffffff',
          delayMs: 0,
          tier: 'sub',
          angleDeg: 3,
          offsetX: 0,
          offsetY: 0,
          rainbow: true,
        },
        {
          target: 'monster2',
          value: 555,
          color: '#ffd24a',
          delayMs: 90,
          tier: 'sub',
          angleDeg: -3,
          offsetX: 18,
          offsetY: -8,
          tag: 'break',
          rainbow: false,
        },
      ],
      totalDamage: 10431,
      durationMs: 420,
    };
    const html = renderToStaticMarkup(
      <BattleStage allies={[ALLY]} enemies={[ENEMY]} sp={3} center={CENTER} frame={frame} />,
    );
    expect(html).toContain('stage-pop--rainbow');
    expect(html).toContain('击破');
    expect(html).not.toContain('暴击');
  });

  it('敌方出手帧：我方立绘抖动 + 掉血飘字带负号', () => {
    const frame: AnimFrame = {
      id: 8,
      kind: 'enemy',
      actor: 'monster2',
      targets: ['jingyuan'],
      numbers: [
        {
          target: 'jingyuan',
          value: 999,
          color: '#ff5b5b',
          delayMs: 0,
          tier: 'main',
          angleDeg: 0,
          offsetX: 0,
          offsetY: 0,
          rainbow: false,
        },
      ],
      totalDamage: 999,
      durationMs: 460,
    };
    const html = renderToStaticMarkup(
      <BattleStage allies={[ALLY]} enemies={[ENEMY]} sp={3} center={CENTER} frame={frame} />,
    );
    expect(html).toContain('stage-shake');
    expect(html).toContain('-999');
  });

  it('终结技帧：白屏闪光 + 放射光束 + 技能名', () => {
    const frame: AnimFrame = {
      id: 9,
      kind: 'ult',
      actor: 'jingyuan',
      targets: ['monster2'],
      numbers: [
        {
          target: 'monster2',
          value: 10000,
          color: '#ffffff',
          delayMs: 0,
          tier: 'main',
          angleDeg: 0,
          offsetX: 0,
          offsetY: 0,
          rainbow: false,
        },
      ],
      totalDamage: 10000,
      durationMs: 680,
      label: '神君·太虚一炁',
    };
    const html = renderToStaticMarkup(
      <BattleStage allies={[ALLY]} enemies={[ENEMY]} sp={3} center={CENTER} frame={frame} />,
    );
    expect(html).toContain('stage-ult-layer');
    expect(html).toContain('stage-ult-whiteout');
    expect(html).toContain('stage-ult-name');
    expect(html).toContain('神君·太虚一炁');
    // 2026-10-26 用户裁定：去掉四射光束特效
    expect(html).not.toContain('stage-ult-rays');
  });

  it('终结技立绘：有 portrait 时渲染中央立绘（底部给技能名留位）', () => {
    const frame: AnimFrame = {
      id: 12,
      kind: 'ult',
      actor: 'jingyuan',
      targets: ['monster2'],
      numbers: [],
      totalDamage: 0,
      durationMs: 2400,
      label: '神君·太虚一炁',
      portrait: '1204',
    };
    const html = renderToStaticMarkup(
      <BattleStage allies={[ALLY]} enemies={[ENEMY]} sp={3} center={CENTER} frame={frame} />,
    );
    expect(html).toContain('stage-ult-portrait');
    expect(html).toContain('1204.webp');
  });

  it('召唤物窄卡：在场可点/段数标签，不在场虚化', () => {
    const withSummon: StageAlly = {
      ...ALLY,
      summons: [{ id: 'shenjun', owner: 'jingyuan', present: true, stacks: 6 }],
    };
    const html = renderToStaticMarkup(
      <BattleStage allies={[withSummon]} enemies={[ENEMY]} sp={3} center={CENTER} />,
    );
    expect(html).toContain('6');
    expect(html).toContain('grayscale');
  });

  it('planFrames 产出的帧可以直接喂给组件（端到端串起来）', () => {
    const frames = planFrames(
      [{ time: 0, round: 1, kind: 'action', unitId: 'jingyuan', skillCode: 'jingyuan.skill', hitSeqs: [1] }],
      [
        {
          seq: 1,
          time: 0,
          round: 1,
          source: 'jingyuan',
          skillCode: 'jingyuan.skill',
          kind: 'direct',
          total: 5555,
          target: 'monster2',
          factors: [],
        },
      ],
      { speed: 1, elementOf: () => 'Thunder' },
    );
    expect(frames).toHaveLength(1);
    const html = renderToStaticMarkup(
      <BattleStage allies={[ALLY]} enemies={[ENEMY]} sp={3} center={CENTER} frame={frames[0]} />,
    );
    expect(html).toContain('stage-lunge-r');
    expect(html).toMatch(grouped(5555));
  });
});
