import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import './i18n.js';
import {
  ActionRail,
  CommandBar,
  SimHud,
  shortcutAction,
  type CommandBarProps,
} from './fullsim-console.js';
import { BattleStage, type StageAlly } from './battle-stage.js';

/**
 * 命令区（2026-11-07 命令区一体化批）渲染烟测。
 *
 * 为什么要锁这一块：这批改动把「确定/取消/目标」从页面第三块面板搬进战场底栏，
 * 修的是「点完普攻后确定在首屏之外 460px」；只要有人把 `canConfirm`/`canAct` 的接线弄反，
 * 就会出现「点了确定没反应」或「确定恒可点」——typecheck 与引擎测试都发现不了。
 */

const BASE: CommandBarProps = {
  running: false,
  ended: false,
  paused: false,
  actor: { name: '丹恒•腾荒', rosterId: '1414', acting: true },
  basicLabel: '普攻',
  skillLabel: '战技',
  skillDisabled: false,
  canAct: true,
  speed: 1,
  speeds: [0.5, 1, 2],
  onSpeed: () => {},
};

const PENDING: NonNullable<CommandBarProps['pending']> = {
  label: '我方1（丹恒•腾荒） · 普攻',
  hint: '点击敌方头像选择目标，再点一次该头像即释放',
  targets: [
    { id: 'monster1', label: '敌方1', note: '100%' },
    { id: 'monster3', label: '敌方3', note: '42%' },
  ],
  selTarget: 'monster3',
  onPick: () => {},
  canConfirm: true,
  onConfirm: () => {},
  onCancel: () => {},
};

const ALLY: StageAlly = {
  id: 'jingyuan',
  rosterId: '1204',
  name: '景元',
  hp: 3000,
  maxHp: 3000,
  shield: 0,
  energy: 65,
  energyMax: 130,
  dead: false,
  ultReady: false,
};

describe('SimHud（战场顶部 HUD）', () => {
  it('渲染状态文案与四个战斗控制，禁用态跟随入参', () => {
    const html = renderToStaticMarkup(
      <SimHud
        statusText="等待操作"
        tone="wait"
        paused={false}
        ended={false}
        canUndo={false}
        canFastForward={false}
        onPause={() => {}}
        onUndo={() => {}}
        onRestart={() => {}}
        onFastForward={() => {}}
      />,
    );
    expect(html).toContain('等待操作');
    expect(html).toContain('暂停');
    expect(html).toContain('撤回');
    expect(html).toContain('重新开始');
    // 快进/撤回不可用时是 disabled，不会让玩家点了没反应
    expect(html.match(/disabled=""/g)?.length ?? 0).toBe(2);
  });
});

describe('CommandBar（战场底栏命令区）', () => {
  it('轮到该角色：出现普攻/战技，且在同一个条里就能看到倍速', () => {
    const html = renderToStaticMarkup(<CommandBar {...BASE} pending={null} />);
    expect(html).toContain('普攻');
    expect(html).toContain('战技');
    expect(html).toContain('丹恒•腾荒');
    expect(html).toContain('倍速');
    expect(html).not.toContain('确定');
  });

  it('战技点不足时战技不可点（不靠页面另一处再判一次）', () => {
    const html = renderToStaticMarkup(<CommandBar {...BASE} skillDisabled pending={null} />);
    expect(html).toContain('disabled=""');
  });

  it('待确认：目标按钮 + 确定/取消同屏，选中目标高亮（primary）', () => {
    const html = renderToStaticMarkup(<CommandBar {...BASE} canAct={false} pending={PENDING} />);
    expect(html).toContain('我方1（丹恒•腾荒） · 普攻');
    expect(html).toContain('敌方1');
    expect(html).toContain('敌方3');
    expect(html).toContain('确定');
    expect(html).toContain('取消');
    // 未选目标时确定必须禁用（引擎需要主目标）
    const blocked = renderToStaticMarkup(
      <CommandBar {...BASE} canAct={false} pending={{ ...PENDING, selTarget: null, canConfirm: false }} />,
    );
    expect(blocked).toContain('disabled=""');
  });

  it('跟放终结技候选：已点选的带 ✓，二级目标行替代候选行', () => {
    const withPicks = renderToStaticMarkup(
      <CommandBar
        {...BASE}
        canAct={false}
        pending={{
          ...PENDING,
          after: {
            candidates: [
              { id: 'sunday', label: '星期日立即释放终结技', picked: true },
              { id: 'jingyuan', label: '景元立即释放终结技', picked: false },
            ],
            onToggle: () => {},
            picksText: '星期日',
          },
        }}
      />,
    );
    expect(withPicks).toContain('✓ 星期日立即释放终结技');
    expect(withPicks).toContain('跟放序列');

    const picking = renderToStaticMarkup(
      <CommandBar
        {...BASE}
        canAct={false}
        pending={{
          ...PENDING,
          after: {
            candidates: [],
            onToggle: () => {},
            picksText: '',
            pickLabel: '星期日的终结技目标:',
            pickOptions: [{ id: 'jingyuan', label: '我方3（景元）' }],
            onChoose: vi.fn(),
            onCancelPick: vi.fn(),
          },
        }}
      />,
    );
    expect(picking).toContain('星期日的终结技目标');
    expect(picking).toContain('我方3（景元）');
  });
});

describe('ActionRail（左侧竖排行动条）', () => {
  const entries = [
    { id: 'a1', label: '我方3（景元）', time: 50, element: 'Wind', imgSrc: '/portraits/1204.webp' },
    { id: 'monster1', label: '敌方1（木桩）', time: 100, enemy: true },
  ];

  it('按给定顺序渲染圆头像与行动值，敌方用红边', () => {
    const html = renderToStaticMarkup(<ActionRail entries={entries} />);
    expect(html).toContain('我方3（景元） · 50.00');
    expect(html).toContain('50.0');
    expect(html).toContain('100.0');
    expect(html).toContain('portraits/1204.webp');
    // 元素色来自 battle-anim 的 POP_ELEMENT_COLORS（风=#57e0a0），敌方固定红
    expect(html.toLowerCase()).toContain('#57e0a0');
    expect(html.toLowerCase()).toContain('#e6443a');
  });

  it('没有在场单位时不渲染（不占位）', () => {
    expect(renderToStaticMarkup(<ActionRail entries={[]} />)).toBe('');
  });

  it('超出上限时只画前 N 个（战报抽屉不会被拉长）', () => {
    const many = Array.from({ length: 20 }, (_, i) => ({ id: `u${i}`, label: `单位${i}`, time: i }));
    const html = renderToStaticMarkup(<ActionRail entries={many} max={5} />);
    expect(html).toContain('单位4');
    expect(html).not.toContain('单位5');
  });
});

describe('shortcutAction（键盘快捷键映射）', () => {
  const idle = { canAct: true, pending: false, canConfirm: false, ended: false };
  const picking = { canAct: false, pending: true, canConfirm: true, ended: false };
  const blocked = { canAct: false, pending: true, canConfirm: false, ended: false };

  it('1/2 只在轮到该角色且未进目标选择时生效', () => {
    expect(shortcutAction('1', idle)).toBe('basic');
    expect(shortcutAction('2', idle)).toBe('skill');
    expect(shortcutAction('1', picking)).toBeNull();
    expect(shortcutAction('2', picking)).toBeNull();
  });

  it('Enter 只在目标已选好时确认；Esc 有选择就能取消', () => {
    expect(shortcutAction('Enter', picking)).toBe('confirm');
    expect(shortcutAction('Enter', blocked)).toBeNull();
    expect(shortcutAction('Escape', blocked)).toBe('cancel');
    expect(shortcutAction('Escape', idle)).toBeNull();
  });

  it('空格永远是暂停/继续，战斗结束后所有键都不响应', () => {
    expect(shortcutAction(' ', idle)).toBe('pause');
    expect(shortcutAction(' ', picking)).toBe('pause');
    expect(shortcutAction('1', { ...idle, ended: true })).toBeNull();
    expect(shortcutAction(' ', { ...idle, ended: true })).toBeNull();
  });

  it('未定义的键不吞事件', () => {
    expect(shortcutAction('a', idle)).toBeNull();
    expect(shortcutAction('Tab', idle)).toBeNull();
  });
});

describe('战技点去重（2026-11-07 用户裁定）', () => {
  it('战技点只在底栏出现一次，不再每张卡画一遍', () => {
    const allies: StageAlly[] = [
      { ...ALLY, id: 'a1' },
      { ...ALLY, id: 'a2', rosterId: '1313', name: '星期日' },
    ];
    const html = renderToStaticMarkup(
      <BattleStage allies={allies} enemies={[]} sp={3} center={{ round: 0, time: 0, totalDamage: 0, enemyHpLeft: 0, allyHpLeft: 0 }} />,
    );
    expect(html.match(/3\/5/g)?.length ?? 0).toBe(1);
  });
});

describe('BattleStage 新插槽（2026-11-07 第二批）', () => {
  const CENTER = { round: 1, time: 50, totalDamage: 1000, enemyHpLeft: 500, allyHpLeft: 900 };

  it('共享资源（笑点）显示在本行动伤害上方', () => {
    const html = renderToStaticMarkup(
      <BattleStage
        allies={[ALLY]}
        enemies={[]}
        sp={3}
        center={{
          ...CENTER,
          shared: [{ key: 'laugh', label: '笑点', value: '4' }],
          actionDamage: 4321,
        }}
      />,
    );
    expect(html).toContain('笑点');
    // 顺序：笑点在前、本行动伤害在后（用户要求「放在本行动伤害上面」）
    expect(html.indexOf('笑点')).toBeLessThan(html.indexOf('本行动伤害'));
  });

  it('没有共享资源时不渲染那一行', () => {
    const html = renderToStaticMarkup(
      <BattleStage allies={[ALLY]} enemies={[]} sp={3} center={{ ...CENTER, shared: [] }} />,
    );
    expect(html).not.toContain('笑点');
  });

  it('传入 rail 时左侧多一列行动条（不传则保持三列）', () => {
    const withRail = renderToStaticMarkup(
      <BattleStage
        allies={[ALLY]}
        enemies={[]}
        sp={3}
        center={CENTER}
        rail={<ActionRail entries={[{ id: 'a1', label: '我方1', time: 20 }]} />}
      />,
    );
    expect(withRail).toContain('stage-col--rail');
    expect(withRail).toContain('20.0');

    const without = renderToStaticMarkup(
      <BattleStage allies={[ALLY]} enemies={[]} sp={3} center={CENTER} />,
    );
    expect(without).not.toContain('stage-col--rail');
  });
});
