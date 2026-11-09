/**
 * 首访引导条（2026-11-08 说明性内容批 · L4）
 *
 * 只在「从没看过」时出现在内容区顶部，一行话 + 两个动作（去看说明 / 知道了）。
 * 刻意**不做遮罩式 tour**：没有第三方 UI 库，自己写高亮要处理定位/缩放/滚动跟随，
 * 跨六个页面维护不划算；更关键的是全真模拟刚因为「关键按钮被挤到首屏之外」
 * 被打回过一次，遮罩比横幅更容易挡住真正的操作位。
 *
 * 「已读」由 App 落 localStorage（`hsr-sim.help.seen`）；关掉之后顶栏的 `?` 仍在，
 * 所以用户不会因为点了一次「知道了」就再也找不到说明。
 */
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

export interface HelpBannerProps {
  /** 点「看使用说明」：调用方负责落已达标记并跳到 /help */
  onOpen: () => void;
  /** 点「知道了」：调用方负责落标记并隐藏（组件本身不碰存储） */
  onDismiss: () => void;
}

export function HelpBanner({ onOpen, onDismiss }: HelpBannerProps): ReactNode {
  const { t } = useTranslation();
  return (
    <div className="help-banner" role="note">
      <div className="help-banner__text">
        <strong>{t('help.bannerTitle')}</strong>
        <span className="muted">{t('help.bannerBody')}</span>
      </div>
      <div className="help-banner__actions">
        <button type="button" className="primary" onClick={onOpen}>
          {t('help.bannerOpen')}
        </button>
        <button type="button" onClick={onDismiss}>
          {t('help.bannerDismiss')}
        </button>
      </div>
    </div>
  );
}
