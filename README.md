# 崩铁战斗计算器（hsr-calc）

> **[English](README.en.md)** · 中文

一个**纯本地**的《崩坏：星穹铁道》战斗数值模拟器。面板计算 → 伤害公式 → 行动轴（AV）→ 全真回合制模拟，一条链跑完；无后端、无账号，队伍与历史记录存在浏览器 `localStorage`。

- **数值代理模拟**：按面板与技能倍率逐段算伤害（直伤 / DoT / 击破 / 超击破 / 欢愉），逐乘区可展开核对。
- **全真模拟**：完整回合制流程，行动顺序、buff 结算、召唤物（忆灵）与关卡机制都按时间轴推进。
- **角色管理**：面板录入、光锥、遗器四件套 + 位面、星魂与行迹。
- **展示柜**：输入 UID 拉取公开面板（需自备转发代理，见下）。
- **Helper**：内置使用说明层，中英双语（`i18n.ts`）。

覆盖范围：99 名角色 / 665 只怪物（含 5 个关卡包：忘却、异相仲裁、虚构叙事、末日幻影、寰宇蝗灾）/ 172 张光锥 / 64 套遗器。

## 快速开始

需要 Node `^20.19.0 || >=22.12.0`（Vite 7 的要求）与 pnpm 12（版本见 `package.json` 的 `packageManager`）。

```bash
pnpm install
pnpm --filter @hsr-calc/web dev     # http://localhost:5173/hsr/
```

> ⚠️ 站点按 `/hsr/` 前缀构建（`vite.config.ts` 的 `base`），所以**必须**访问 `http://localhost:5173/hsr/`。`127.0.0.1` 与 `[::1]` 都会失效。

## 离线包（解压即用，不需要服务器）

```bash
node scripts/build-offline.mjs
```

产出 `offline/` 目录（含全部立绘，约 210MB）：**双击其中的 `index.html` 即可使用**，不需要装任何东西、不需要联网。手机把整个文件夹拷过去，用文件管理器打开 `index.html` 也能用。

为什么不直接双击 `vite build` 的 `index.html`——`file://` 页面 origin 是 `null`，三处会被拦死，构建脚本逐一绕开了：

| 拦路点 | 处理 |
| --- | --- |
| `<script type="module" src>` 被 CORS 拒绝 | 主脚本内联进 HTML（内联 module 不发起请求） |
| 数据 JSON 靠动态 `import()` 拉分片 | 预生成经典脚本 `data-offline/*.js` 注入 `window.__HSR_STATIC__`（经典 `<script>` 不受 CORS 限制） |
| `BrowserRouter` 依赖 history，`file://` 下路径是磁盘路径 | 离线构建自动切 `HashRouter`（`#/calculator`） |

> ⚠️ 若构建报 `remove …: Access is denied`（esbuild 删不掉临时文件，被 Windows 实时扫描占用）：
> 把临时目录指到可用位置再跑，例如 `$env:HSR_ESBUILD_TMP="$env:LOCALAPPDATA\Temp\hsr-esbuild"`，
> 或在 Windows 安全中心给本项目目录加一条排除项。

## 资源准备（clone 后建议做一次）

官方立绘与怪物图鉴体积太大，**不入库**。仓库只带 5MB 小图标，大图需自行拉取（数据源 `static.nanoka.cc`，需要能联网）：

| 缺什么 | 命令 | 体积 | 不跑的后果 |
| --- | --- | --- | --- |
| `public/portraits/` + `portraits-shop/` | `node scripts/fetch-portraits.mjs --kind=both` | 99MB | 角色竖卡、战场立绘、战斗行动条头像裂图 |
| `public/monster-art/` + `monster-art-lg/` | `node scripts/fetch-monster-art.mjs` | 49MB | 怪物图鉴与战场敌方立绘裂图 |
| `public/lightcones/` | `node scripts/fetch-equipment-icons.mjs` | 10MB | 光锥图标裂图（遗器套装图另存，已入库） |
| `public/relicpieces/` | `node scripts/fetch-relic-pieces.mjs` | 6.5MB | 遗器部位图标裂图 |

**已随仓库提交**（不用拉）：`skillicon` 380 张、`relicsets` 64 张、`element` 7 张、`pathicon` 9 张、`summon-icon` 6 张。其中 6 张召唤物图标被 `src/summon-art.test.tsx` 用 `existsSync` 断言，所以必须入库。

只拉部分图也能启动，缺失处显示裂图，不影响数值计算与测试。

## 打开页面后怎么用

1. **首页**：一开始两份卡是**锁着的**（还没录面板），点「先录入面板」跳到角色管理。
2. **角色管理**：选角色 → 填等级、光锥、遗器（四件套 + 位面）、星魂、行迹 → 保存；录好后可用「导出存档」备份成 JSON，换设备或清缓存后用「导入存档」还原。
3. **数值代理模拟**：算单次伤害 / DoT / 击破 / 超击破 / 欢愉，逐乘区展开核对。
4. **全真模拟**：完整回合制；快捷键 `1` 普攻 / `2` 战技 / `Enter` 确定 / `Esc` 取消 / `空格` 暂停。
5. **历史**：战报回看；全真模拟存下的战报同样在 `/timeline?battle=<id>` 回放。
6. **帮助**：顶栏 `?`、每页首屏的折叠提示、首次访问横幅，三处共用同一份文案。

## 常用命令

```bash
pnpm -r typecheck     # 引擎 + 前端类型检查（含测试侧 tsconfig）
pnpm lint
pnpm -r test          # 引擎 198 个测试文件 / 1358 用例；前端 37 个 / 227 用例
pnpm -r build         # 引擎 tsc + 前端 vite build
```

- 单独跑某个包：`pnpm --filter @hsr-calc/engine exec vitest run test/<file>.ts`
- 在受限沙箱里 vitest 默认的 forks 池可能起不来（`spawn EPERM`），加 `--pool=threads`。
- 改了 `packages/engine` 后先 `pnpm --filter @hsr-calc/engine exec tsc -p tsconfig.json` 刷 `dist`，否则前端 `tsc` 解析 `dist/index.d.ts` 会报旧类型。

构建产物（`apps/web/dist/`）里的资源路径写死为 `/hsr/...`，所以要把它挂在静态服务的 `/hsr/` 目录下；本地可用 `pnpm --filter @hsr-calc/web preview`（`http://localhost:4173/hsr/`）。

## 目录结构

| 路径 | 内容 |
| --- | --- |
| `packages/engine/` | 纯逻辑层：`damage.ts`（伤害公式）、`zones.ts`（乘区）、`panel.ts`、`timeline.ts`（行动值）、`combat/battle.ts`（回合制核心，几乎所有机制都在这里） |
| `packages/shared/` | 两端共用的小工具 |
| `apps/web/` | React 19 + Vite 7 前端：计算器、数值代理模拟、全真模拟、角色管理、展示柜、历史、帮助 |
| `data/` | 游戏数据（角色 / 怪物 / 光锥 / 遗器 / 关卡包 / 抵抗表），`source.lock.json` 记录版本口径 |
| `scripts/` | 数据拉取与代码生成管线 |

生成物（`combat/skill-data.ts`、`apps/web/src/data/*-roster.ts`、`combat/monster-stages.ts` 等）由 `scripts/gen-*.mjs` 产出，**不要手改**；要改数值请改 `data/` 后重跑管线：

```
sync-data → apply-*-enhanced → gen-combat-raw → gen-combat-skill-data
  → gen-relic-set-data → gen-lightcone-data → gen-monster-stages → gen-monster-resist
  → gen-roster → gen-lightcones → gen-relicsets → gen-monsters → gen-main-stats
```

## 展示柜（UID 查询）

`api.mihomo.me` 与 `enka.network` 都不返回 CORS 头，浏览器直连必然被拦。两种做法：

- 本地：把展示柜页的「代理地址」填 `http://localhost:5173/hsr/mihomo-proxy`（vite 已在 `server.proxy` 里备好）。
- 线上：用 `deploy/cf-pages/_worker.js` 部署一个 Cloudflare Pages 转发（无状态、无密钥）。

## 已知限制

- **存档只在浏览器 `localStorage`**：清缓存或换浏览器前，请先在角色管理页点「导出存档」；换设备后用「导入存档」还原（文件含面板、计算历史、战报与上次选中的关卡段，导入会覆盖当前数据，界面有确认条）。
- **没有在线演示**：需要自己按上文起本地服务或部署静态站点。
- 怪物技能覆盖率仍在补全：目前约 60 只有技能表，部分倍率为占位值；击破控制（冻结/纠缠/禁锢）与部分敌方减速、目盲只挂状态标记，未逐帧模拟。
- 中文网络下 `enka.network` 不可达，展示柜请用 mihomo。

## 致谢与参考

- 游戏数据源：[nanoka](https://hsr.nanoka.cc/) 与官方数据，版本口径见 `data/source.lock.json`（当前 4.6.54）。
- 展示柜接口：mihomo、Enka.Network。

## 免责声明

非官方项目，与米哈游 / HoYoverse 无关。游戏内文案、数值数据与美术资源版权归米哈游所有，本项目仅用于学习与数值研究，不作商业用途。代码以 MIT 许可发布，**该许可不覆盖 `data/` 与 `public/` 下的游戏素材**。

## 许可

代码：[MIT](LICENSE)。`data/` 与 `apps/web/public/` 中的游戏数据及素材不适用 MIT，版权归原权利人。
