import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { storage, type HistoryEntry, type StoredBattleEntry } from '../storage.js';
import { HintCard } from '../hint-card.js';

/** 关卡上下文的一行文案：`moc-p43#12 上半 · 机制 记忆紊流`（无机制则省略后半） */
function stageLabelOf(stage: {
  packId: string;
  stageIndex: number;
  half?: string;
  mechanics: string[];
}): string {
  const base = `${stage.packId}#${stage.stageIndex}${stage.half ? ' ' + stage.half : ''}`;
  return stage.mechanics.length > 0 ? `${base} · ${stage.mechanics.join(' / ')}` : base;
}

export default function HistoryPage() {
  const { t } = useTranslation();
  const [list, setList] = useState<HistoryEntry[]>(storage.getHistory());
  const [battleList, setBattleList] = useState<StoredBattleEntry[]>(storage.getBattleHistory());

  function persist(next: HistoryEntry[]) {
    storage.saveHistory(next);
    setList(next);
  }

  function persistBattle(next: StoredBattleEntry[]) {
    storage.saveBattleHistory(next);
    setBattleList(next);
  }

  return (
    <div>
      <section className="panel">
        <h2>{t('history.title')}</h2>
        <HintCard id="history" />
        <p>
          <button
            type="button"
            className="danger"
            onClick={() => persist([])}
            disabled={list.length === 0}
          >
            {t('history.clear')}
          </button>
        </p>
        {list.length === 0 ? (
          <p className="muted">{t('history.empty')}</p>
        ) : (
<div className="log-scroll">
            <table className="log-table" style={{ minWidth: 520 }}>
              <thead>
                <tr>
                  <th>{t('history.time')}</th>
                  <th>{t('history.kind')}</th>
                  <th>{t('history.total')}</th>
                  <th>{t('history.detail')}</th>
                  <th />
              </tr>
            </thead>
            <tbody>
              {list.map((h) => (
                <tr key={h.id}>
                  <td>{new Date(h.time).toLocaleString()}</td>
                  <td>{h.kind}</td>
                  <td>{h.total.toFixed(2)}</td>
                  <td className="muted" style={{ maxWidth: 360, wordBreak: 'break-all' }}>
                    {h.summary}
                  </td>
                  <td>
                    <button
                      type="button"
                      className="danger"
                      onClick={() => persist(list.filter((x) => x.id !== h.id))}
                    >
                      {t('history.deleteOne')}
                    </button>
                  </td>
                </tr>
))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="panel">
        <h2>{t('history.battleTitle')}</h2>
        <p>
          <button
            type="button"
            className="danger"
            onClick={() => persistBattle([])}
            disabled={battleList.length === 0}
          >
            {t('history.clearBattle')}
          </button>
        </p>
        {battleList.length === 0 ? (
          <p className="muted">{t('history.battleEmpty')}</p>
        ) : (
<div className="log-scroll">
              <table className="log-table" style={{ minWidth: 520 }}>
                <thead>
                  <tr>
                    <th>{t('history.time')}</th>
                    <th>{t('history.detail')}</th>
                    <th>{t('history.total')}</th>
                    <th />
                    <th />
              </tr>
            </thead>
            <tbody>
              {battleList.map((h) => (
                <tr key={h.id}>
                  <td>{new Date(h.time).toLocaleString()}</td>
                  <td className="muted" style={{ maxWidth: 420, wordBreak: 'break-all' }}>
                    {h.summary}
                    {h.stage && (
                      <div style={{ marginTop: 2 }}>
                        {`${t('history.stage')}: ${stageLabelOf(h.stage)}`}
                      </div>
                    )}
                  </td>
                  <td>{h.total.toFixed(2)}</td>
                  <td>
                    <Link to={`/timeline?battle=${h.id}`}>{t('history.viewBattle')}</Link>
                  </td>
                  <td>
                    <button
                      type="button"
                      className="danger"
                      onClick={() => persistBattle(battleList.filter((x) => x.id !== h.id))}
                    >
                      {t('history.deleteOne')}
                    </button>
                  </td>
                </tr>
))}
                </tbody>
              </table>
            </div>
          )}
      </section>
    </div>
  );
}
