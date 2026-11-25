// 版本巡检：对比 data/source.lock.json 与数据源站点当前版本，供定时任务做「是否需要更新」的第一步。
// 用法：node scripts/check-data-version.mjs
// 退出码：0 = 已是最新；1 = 站点有新版本（需要跑 sync-data）；2 = 探测失败（网络/页面结构变化）
import { detectLatestVersion, readLock } from './lib/data-source.mjs';

const lock = await readLock();
const local = lock?.version ?? '(缺锁文件)';

let remote;
try {
  remote = await detectLatestVersion();
} catch (err) {
  console.error(`[探测失败] ${err?.message ?? err}`);
  console.error('本地锁版本：', local);
  process.exit(2);
}

if (!remote) {
  console.error('[探测失败] 未能在站点首页找到 4.x.y 版本号（页面结构可能变了）');
  console.error('本地锁版本：', local);
  process.exit(2);
}

const byType = lock?.byType ?? {};
const mixed = Object.entries(byType).filter(([, v]) => v !== local);

console.log(`本地锁版本：${local}`);
console.log(`站点最新版：${remote}`);
if (mixed.length > 0) {
  console.log(`⚠ 锁内类型版本不一致：${mixed.map(([k, v]) => `${k}=${v}`).join(' / ')}`);
}

if (remote === local) {
  console.log('判定：已是最新，无需更新。');
  process.exit(0);
}

console.log(`判定：站点已到 ${remote}（本地 ${local}）→ 需要更新。`);
console.log('下一步：node scripts/sync-data.mjs            # 只落暂存 + 出差异报告，不写回');
process.exit(1);
