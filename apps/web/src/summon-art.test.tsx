import { describe, expect, it } from 'vitest';
import { existsSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import './i18n.js';
import { BattleStage, type StageAlly } from './battle-stage.js';
import { SUMMON_ICON_IDS, summonIconUrl } from './summon-art.js';

/**
 * 召唤物 / 忆灵美术（2026-11-07 用户反馈「景元的召唤物不是神君」后的回归锁）。
 *
 * 事故：窄卡原先复用主人立绘 + 偏移裁切，景元的卡旁边画的是景元本人的脸。
 * 现在只有两种合法画法：
 *   ① `iconSrc` 给了 → 画召唤物自己的头像（CDN servanticonteam 那套）；
 *   ② 没给 → 画「元素徽记 + 名字」。
 * **任何情况下都不许出现主人立绘** —— 这条就是本测试守的东西。
 */

const PUBLIC = fileURLToPath(new URL('../public', import.meta.url));

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

const CENTER = { round: 1, time: 50, totalDamage: 100, enemyHpLeft: 10, allyHpLeft: 900 };

describe('召唤物美术映射（summon-art）', () => {
  it('6 个有现成忆灵头像的召唤物都有本地文件', () => {
    for (const id of SUMMON_ICON_IDS) {
      const file = join(PUBLIC, 'summon-icon', `${id}.webp`);
      expect(existsSync(file), `${id}.webp 缺失（跑 node scripts/fetch-summon-icons.mjs）`).toBe(true);
      expect(statSync(file).size).toBeGreaterThan(3 * 1024);
    }
  });

  it('有图的返回 URL，没图的（神君/龙灵/浮元/晴空乐手）返回 undefined', () => {
    expect(summonIconUrl('silong')).toContain('summon-icon/silong.webp');
    expect(summonIconUrl('mimi')).toContain('summon-icon/mimi.webp');
    for (const id of ['shenjun', 'longling', 'fuyuan', 'memo']) {
      expect(summonIconUrl(id), `${id} 不该有图（CDN 404）`).toBeUndefined();
    }
  });
});

describe('召唤物窄卡渲染', () => {
  /** 只取召唤物那张窄卡自己的 markup（主人卡里当然会有主人立绘，不能整段比对） */
  const tileOf = (html: string, id: string): string => {
    const i = html.indexOf(`data-summon="${id}"`);
    return i < 0 ? '' : html.slice(i, i + 1200);
  };

  it('有头像时画召唤物自己的图，不画主人立绘', () => {
    const html = renderToStaticMarkup(
      <BattleStage
        allies={[
          { ...ALLY, summons: [{ id: 'silong', owner: 'jingyuan', present: true, iconSrc: '/summon-icon/silong.webp' }] },
        ]}
        enemies={[]}
        sp={3}
        center={CENTER}
      />,
    );
    const tile = tileOf(html, 'silong');
    expect(tile).toContain('summon-icon/silong.webp');
    expect(tile).not.toContain('portraits-shop');
  });

  it('没有头像时退成「元素徽记 + 名字」，同样不画主人立绘（神君就是这种情况）', () => {
    const html = renderToStaticMarkup(
      <BattleStage
        allies={[{ ...ALLY, summons: [{ id: 'shenjun', owner: 'jingyuan', present: true, stacks: 6 }] }]}
        enemies={[]}
        sp={3}
        center={CENTER}
      />,
    );
    const tile = tileOf(html, 'shenjun');
    // 名称来自 timeline.team.unitNames.shenjun（「神君」），元素徽记来自 element/thunder.webp
    expect(tile).toContain('神君');
    expect(tile).toContain('element/thunder.webp');
    expect(tile).not.toContain('portraits-shop');
  });
});
