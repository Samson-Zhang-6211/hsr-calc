// 数据源地址由环境变量提供（仓库内不保存任何站点地址）。
//
// 用法：
//   PowerShell:  $env:HSR_DATA_BASE="<数据根地址>"; $env:HSR_ASSET_BASE="<静态资源根地址>"
//   bash:        HSR_DATA_BASE=... HSR_ASSET_BASE=... node scripts/xxx.mjs
export function dataBase() {
  const raw = process.env.HSR_DATA_BASE;
  if (!raw) {
    console.error('[data-source] 未设置 HSR_DATA_BASE（数据根地址）');
    process.exit(1);
  }
  return raw.replace(/\/+$/, '');
}

export function assetBase(suffix = '') {
  const raw = process.env.HSR_ASSET_BASE;
  if (!raw) {
    console.error('[data-source] 未设置 HSR_ASSET_BASE（静态资源根地址）');
    process.exit(1);
  }
  const base = raw.replace(/\/+$/, '');
  return suffix ? `${base}/${suffix}` : base;
}
