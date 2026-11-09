import { beforeEach, describe, expect, it } from 'vitest';
import {
  parseSnapshot,
  serializeSnapshot,
  SNAPSHOT_APP,
  SNAPSHOT_VERSION,
  storage,
  type SaveSnapshot,
  type StoredBattleEntry,
  type StoredCharacter,
} from './storage';

// ── 存档快照（2026-11-08）──
// 面板 / 计算历史 / 战报 / 关卡段只存在 localStorage，是用户唯一的资产。
// 这里锁三件事：① 导出的文件能被原样读回；② 别人家的 JSON 一律拒绝且给出可区分的原因；
// ③ 写回时战报仍受 30 条上限约束（否则导入一份大档会把配额撑爆）。
// vitest 的 environment 是 node，没有 localStorage —— 每个用例自装一份内存版。

const CHAR: StoredCharacter = {
  id: 'c1',
  name: '测试角色',
  element: 'Fire',
  level: 80,
  atk: 3000,
  hp: 4000,
  def: 900,
  critRate: 0.7,
  critDmg: 1.4,
  breakEffect: 0.6,
  damageBonus: 0.4,
};

/** 战报只用到外层四个字段，result 在解析/写回里不被触碰 */
const battleEntry = (i: number): StoredBattleEntry =>
  ({ id: `b${i}`, time: i, summary: '', total: 0, result: null }) as unknown as StoredBattleEntry;

function installStorage(): Map<string, string> {
  const m = new Map<string, string>();
  const stub = {
    get length() {
      return m.size;
    },
    clear: () => m.clear(),
    getItem: (k: string) => m.get(k) ?? null,
    key: (i: number) => Array.from(m.keys())[i] ?? null,
    removeItem: (k: string) => {
      m.delete(k);
    },
    setItem: (k: string, v: string) => {
      m.set(k, String(v));
    },
  };
  Object.defineProperty(globalThis, 'localStorage', { value: stub, configurable: true, writable: true });
  return m;
}

/** 存储不可用（隐私模式 / 配额）的桩：读写都抛 */
function installBrokenStorage(): void {
  const boom = () => {
    throw new Error('storage denied');
  };
  Object.defineProperty(globalThis, 'localStorage', {
    value: { getItem: boom, setItem: boom, removeItem: boom, clear: boom, key: boom, length: 0 },
    configurable: true,
    writable: true,
  });
}

const snapshotOf = (over: Partial<SaveSnapshot> = {}): SaveSnapshot => ({
  app: SNAPSHOT_APP,
  version: SNAPSHOT_VERSION,
  exportedAt: 1_700_000_000_000,
  characters: [CHAR],
  history: [],
  battleHistory: [],
  stagePresetKey: '',
  ...over,
});

beforeEach(() => {
  installStorage();
});

describe('导出 → 解析 往返', () => {
  it('四类数据原样读回，outdated exportedAt 透传', () => {
    storage.saveCharacters([CHAR]);
    storage.saveHistory([{ id: 'h1', time: 1, kind: 'calc', total: 123, summary: '摘要' }]);
    storage.saveBattleHistory(Array.from({ length: 3 }, (_, i) => battleEntry(i)));
    storage.saveStagePresetKey('moc-p43|12');

    const snap = storage.exportSnapshot(42);
    expect(snap.app).toBe(SNAPSHOT_APP);
    expect(snap.version).toBe(SNAPSHOT_VERSION);
    expect(snap.exportedAt).toBe(42);

    const res = parseSnapshot(serializeSnapshot(snap));
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.snapshot.characters).toEqual([CHAR]);
    expect(res.snapshot.history.map((h) => h.id)).toEqual(['h1']);
    expect(res.snapshot.battleHistory.map((b) => b.id)).toEqual(['b0', 'b1', 'b2']);
    expect(res.snapshot.stagePresetKey).toBe('moc-p43|12');
  });

  it('空存档也能往返（还没录面板的新用户）', () => {
    const res = parseSnapshot(serializeSnapshot(storage.exportSnapshot()));
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.snapshot.characters).toEqual([]);
    expect(res.snapshot.stagePresetKey).toBe('');
  });
});

describe('拒绝非本工具的存档', () => {
  it('坏 JSON', () => {
    expect(parseSnapshot('not json{')).toEqual({ ok: false, reason: 'invalid-json' });
  });

  it('数组 / 标量 / 缺 app 的对象都不是存档', () => {
    for (const raw of ['[]', '[{"id":"c1","name":"x"}]', '"text"', 'null', '{"version":1}']) {
      const res = parseSnapshot(raw);
      expect(res.ok, raw).toBe(false);
      if (!res.ok) expect(res.reason).toBe('not-snapshot');
    }
  });

  it('版本不符时带上 found，便于提示用户', () => {
    const res = parseSnapshot(JSON.stringify({ ...snapshotOf(), version: 99 }));
    expect(res).toEqual({ ok: false, reason: 'version', found: '99' });
  });

  it('三组数组缺失或元素不是对象 → shape', () => {
    const cases = [
      { ...snapshotOf(), characters: {} },
      { ...snapshotOf(), battleHistory: undefined },
      { ...snapshotOf(), history: [1, 2] },
      { ...snapshotOf(), characters: [null] },
    ];
    for (const c of cases) {
      expect(parseSnapshot(JSON.stringify(c))).toEqual({ ok: false, reason: 'shape' });
    }
  });
});

describe('写回 localStorage', () => {
  it('覆盖而非合并，并把战报截断到 30 条', () => {
    storage.saveCharacters([{ ...CHAR, id: 'old', name: '旧档' }]);

    const many = Array.from({ length: 35 }, (_, i) => battleEntry(i));
    const snap = snapshotOf({ characters: [CHAR], battleHistory: many, stagePresetKey: 'apo-p21|6' });
    expect(storage.applySnapshot(snap)).toBe(true);

    expect(storage.getCharacters().map((c) => c.id)).toEqual(['c1']);
    expect(storage.getBattleHistory()).toHaveLength(30);
    expect(storage.getBattleHistory()[0]?.id).toBe('b0');
    expect(storage.getStagePresetKey()).toBe('apo-p21|6');
  });

  it('存储不可用时返回 false 而不是抛错', () => {
    installBrokenStorage();
    const snap = snapshotOf();
    expect(() => storage.applySnapshot(snap)).not.toThrow();
    expect(storage.applySnapshot(snap)).toBe(false);
  });

  it('存储不可用时导出得到空内容而不是崩溃', () => {
    installBrokenStorage();
    const snap = storage.exportSnapshot();
    expect(snap.characters).toEqual([]);
    expect(snap.battleHistory).toEqual([]);
    expect(snap.stagePresetKey).toBe('');
  });
});
