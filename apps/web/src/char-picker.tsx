import { useEffect, useState, type CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import { CHARACTER_ROSTER, type RosterCharacter } from './data/character-roster.js';
import { PATH_ORDER } from './data/relic-set-groups.js';
import { assetUrl } from './asset-url.js';

/** 看图选人弹层：命途+属性 chips 多选叠加筛选 + 名字搜索，点卡片即选中（2026-10-13 用户裁定）。
 * 用于 模拟两页「添加角色」与 角色管理 角色选择（计算器页不用）。 */

const ELEMENT_ORDER = ['Physical', 'Fire', 'Ice', 'Wind', 'Thunder', 'Quantum', 'Imaginary'] as const;

const rosterById = new Map(CHARACTER_ROSTER.map((c) => [c.id, c]));

const elementIcon = (el: string): string => assetUrl(`element/${el.toLowerCase()}.webp`);
const pathIcon = (p: string): string => assetUrl(`pathicon/${p.toLowerCase()}.webp`);

export interface CharPickerModalProps {
  open: boolean;
  /** 候选角色 rosterId（调用方自行排除不可选项） */
  candidateIds: readonly string[];
  onSelect: (rosterId: string) => void;
  onClose: () => void;
}

export function CharPickerModal({ open, candidateIds, onSelect, onClose }: CharPickerModalProps) {
  const { t, i18n } = useTranslation();
  const [pathSel, setPathSel] = useState<string[]>([]);
  const [elemSel, setElemSel] = useState<string[]>([]);
  const [query, setQuery] = useState('');

  // 每次打开重置筛选（父级 open 切换即可，不依赖挂载时机）
  useEffect(() => {
    if (open) {
      setPathSel([]);
      setElemSel([]);
      setQuery('');
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const q = query.trim().toLowerCase();
  const items = candidateIds.reduce<RosterCharacter[]>((acc, id) => {
    const c = rosterById.get(id);
    if (!c) return acc;
    if (pathSel.length > 0 && !pathSel.includes(c.path)) return acc;
    if (elemSel.length > 0 && !elemSel.includes(c.element)) return acc;
    if (q && !c.zh.toLowerCase().includes(q) && !c.en.toLowerCase().includes(q)) return acc;
    acc.push(c);
    return acc;
  }, []);

  const chipStyle = (sel: boolean): CSSProperties => ({
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
    padding: '4px 10px',
    minHeight: 26,
    borderRadius: 'var(--chip-radius, 6px)',
    border: `1px solid ${sel ? 'var(--btn-primary-bg)' : 'var(--input-border)'}`,
    background: sel ? 'var(--nav-active-bg)' : 'var(--input-bg)',
    color: 'var(--text)',
    fontSize: 12,
    lineHeight: 1.2,
    cursor: 'pointer',
  });
  const toggle = (list: string[], setList: (v: string[]) => void, v: string): void => {
    setList(list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
        background: 'rgba(0,0,0,.6)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 'min(880px, 100%)',
          maxHeight: '86vh',
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
          padding: 16,
          background: 'var(--panel-bg)',
          border: '1px solid var(--panel-border)',
          boxShadow: 'var(--panel-shadow)',
          borderRadius: 'var(--panel-radius, 8px)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <strong style={{ flex: 1, color: 'var(--text)' }}>{t('picker.title')}</strong>
          <button type="button" onClick={onClose} aria-label="close">
            ✕
          </button>
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <span className="muted" style={{ fontSize: 12, minWidth: 34 }}>
            {t('picker.pathLabel')}
          </span>
          <button type="button" style={chipStyle(pathSel.length === 0)} onClick={() => setPathSel([])}>
            {t('picker.all')}
          </button>
          {PATH_ORDER.map((p) => (
            <button
              key={p}
              type="button"
              style={chipStyle(pathSel.includes(p))}
              onClick={() => toggle(pathSel, setPathSel, p)}
            >
              <img src={pathIcon(p)} alt="" width={14} height={14} loading="lazy" />
              {t(`paths.${p}`)}
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <span className="muted" style={{ fontSize: 12, minWidth: 34 }}>
            {t('picker.elemLabel')}
          </span>
          <button type="button" style={chipStyle(elemSel.length === 0)} onClick={() => setElemSel([])}>
            {t('picker.all')}
          </button>
          {ELEMENT_ORDER.map((el) => (
            <button
              key={el}
              type="button"
              style={chipStyle(elemSel.includes(el))}
              onClick={() => toggle(elemSel, setElemSel, el)}
            >
              <img src={elementIcon(el)} alt="" width={14} height={14} loading="lazy" />
              {t(`elements.${el}`)}
            </button>
          ))}
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('picker.search')}
            style={{
              marginLeft: 'auto',
              width: 180,
              padding: '5px 8px',
              background: 'var(--input-bg)',
              border: '1px solid var(--input-border)',
              borderRadius: 'var(--input-radius, 6px)',
              color: 'var(--input-fg)',
              fontSize: 13,
            }}
          />
        </div>

        <div
          style={{
            flex: 1,
            minHeight: 120,
            overflowY: 'auto',
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(118px, 1fr))',
            gap: 10,
            alignContent: 'start',
            padding: 4,
          }}
        >
          {items.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => onSelect(c.id)}
              title={i18n.language === 'en' ? c.en : c.zh}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 5,
                padding: '12px 6px 10px',
                background: 'var(--input-bg)',
                border: '1px solid var(--input-border)',
                borderRadius: 'var(--panel-radius, 8px)',
                color: 'var(--text)',
                cursor: 'pointer',
              }}
            >
              <img
                src={assetUrl(`portraits/${c.id}.webp`)}
                alt=""
                width={72}
                height={72}
                loading="lazy"
                onError={(e) => {
                  e.currentTarget.style.visibility = 'hidden';
                }}
                style={{
                  borderRadius: '50%',
                  objectFit: 'cover',
                  border: '2px solid var(--panel-border)',
                  background: 'var(--panel-bg)',
                }}
              />
              <span style={{ fontWeight: 600, fontSize: 14 }}>{c.zh}</span>
              <span className="muted" style={{ fontSize: 11 }}>
                {c.en}
              </span>
              <span style={{ fontSize: 11, color: 'var(--text-muted)', letterSpacing: 1 }}>
                {'★'.repeat(c.rarity)}
              </span>
              <span style={{ display: 'flex', gap: 4, flexWrap: 'wrap', justifyContent: 'center' }}>
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 3,
                    padding: '2px 6px',
                    fontSize: 11,
                    borderRadius: 'var(--chip-radius, 6px)',
                    border: '1px solid var(--input-border)',
                    background: 'var(--panel-bg)',
                    color: 'var(--text)',
                  }}
                >
                  <img src={elementIcon(c.element)} alt="" width={12} height={12} loading="lazy" />
                  {t(`elements.${c.element}`)}
                </span>
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 3,
                    padding: '2px 6px',
                    fontSize: 11,
                    borderRadius: 'var(--chip-radius, 6px)',
                    border: '1px solid var(--input-border)',
                    background: 'var(--panel-bg)',
                    color: 'var(--text)',
                  }}
                >
                  <img src={pathIcon(c.path)} alt="" width={12} height={12} loading="lazy" />
                  {t(`paths.${c.path}`)}
                </span>
              </span>
            </button>
          ))}
          {items.length === 0 && (
            <p className="muted" style={{ gridColumn: '1 / -1', textAlign: 'center' }}>
              {t('picker.empty')}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
