// 构建「解压后双击 index.html 就能跑」的离线包（2026-11-08）。
//
// 流程：
//   ① 生成经典脚本数据分片（gen-offline-data.mjs）；
//   ② 编译 shared / engine（离线包从 dist 取引擎，见下方说明）；
//   ③ OFFLINE=1 跑 vite build（base='./' + 数据加载替换 + HashRouter）；
//   ④ 把唯一的 JS/CSS 内联进 index.html，拷数据分片与图片，产出 offline/；
//   ⑤ 对**真实产物**做断言。
//
// 为什么必须内联：file:// 下 `<script type="module" src="...">` 会被 CORS 拒绝
// （origin 为 null），内联后没有外部请求就能正常执行。
//
// 用法：node scripts/build-offline.mjs
// 注意：本机 esbuild 处理 >1MB 输入时会走临时文件并删不掉（EACCES），所以离线
//   构建把引擎指向编译产物（.js 不进 esbuild），并把 esbuild 临时目录指到一个
//   已验证可用的位置（默认沿用 vite.config 的 .tmp-esbuild，可用 HSR_ESBUILD_TMP 覆盖）。
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const WEB = join(ROOT, 'apps', 'web');
const DIST = join(WEB, 'dist');
const DATA_OUT = join(WEB, '.offline-data');
const PACKAGE = join(ROOT, 'offline');
const CATEGORIES = ['characters', 'lightcones', 'relicsets', 'monsters', 'monster-growth'];

function run(label, command, args, options = {}) {
  console.log(`\n▶ ${label}`);
  // 注意：默认不用 shell —— node 的绝对路径含空格（C:\Program Files\...），
  // 走 cmd 会被空格截断。只有 pnpm（.cmd）需要 shell: true。
  const res = spawnSync(command, args, { stdio: 'inherit', cwd: ROOT, ...options });
  if (res.status !== 0) {
    console.error(`\n✗ ${label} 失败（exit ${res.status}）`);
    if (options.hint) console.error(options.hint);
    process.exit(res.status ?? 1);
  }
}

/** 相对路径 → dist 内的绝对路径（构建产物里写的是 `./assets/xxx`） */
const distFile = (ref) => join(DIST, ref.replace(/^\.\//, ''));

/** 内联唯一的外链 JS/CSS，返回内联掉的引用（随后从 dist 删除） */
function inlineAssets(html) {
  const inlined = [];
  let out = html;

  const css = out.match(/<link[^>]*\bhref="([^"]+\.css)"[^>]*>/);
  if (css) {
    const text = readFileSync(distFile(css[1]), 'utf8').replace(/<\/style/gi, '<\\/style');
    out = out.replace(css[0], () => `<style>\n${text}\n</style>`);
    inlined.push(css[1]);
  }

  const js = out.match(/<script[^>]*\bsrc="([^"]+\.js)"[^>]*><\/script>/);
  if (js) {
    const text = readFileSync(distFile(js[1]), 'utf8').replace(/<\/script/gi, '<\\/script');
    out = out.replace(js[0], () => `<script type="module">\n${text}\n</script>`);
    inlined.push(js[1]);
  }

  return { html: out, inlined };
}

function assert(condition, message) {
  if (!condition) {
    console.error(`\n✗ 校验失败：${message}`);
    process.exit(1);
  }
  console.log(`  ✓ ${message}`);
}

function dirSizeMb(path) {
  let total = 0;
  const walk = (p) => {
    for (const entry of readdirSync(p, { withFileTypes: true })) {
      const full = join(p, entry.name);
      if (entry.isDirectory()) walk(full);
      else total += statSync(full).size;
    }
  };
  walk(path);
  return total / (1024 * 1024);
}

// ── ① 数据分片 ───────────────────────────────────────────────────────────────
run('生成离线数据分片', process.execPath, [join('scripts', 'gen-offline-data.mjs')]);

// ── ② 引擎编译产物 ───────────────────────────────────────────────────────────
// 离线包 alias 到 packages/engine/dist（.js）：vite 的 esbuild 只处理 .ts/.tsx，
// 而本机 esbuild 对约 2MB 的 battle.ts 会走临时文件路径并删除失败。
run('构建 shared', 'pnpm', ['--filter', '@hsr-calc/shared', 'build'], { shell: true });
run('构建 engine（dist）', 'pnpm', ['--filter', '@hsr-calc/engine', 'build'], { shell: true });

// ── ③ 离线构建 ───────────────────────────────────────────────────────────────
run('vite build（OFFLINE=1，base=./）', 'pnpm', ['--filter', '@hsr-calc/web', 'exec', 'vite', 'build'], {
  shell: true,
  env: { ...process.env, OFFLINE: '1' },
  hint:
    '如果报错是「remove …: Access is denied」（esbuild 删不掉临时文件，Windows 实时扫描占用）：\n' +
    '  把临时目录指到一个可用位置再跑，例如：\n' +
    '    $env:HSR_ESBUILD_TMP="$env:LOCALAPPDATA\\Temp\\hsr-esbuild"\n' +
    '  或在 Windows 安全中心给本项目目录加一条排除项。',
});

// ── ④ 内联 + 打包 ────────────────────────────────────────────────────────────
const indexPath = join(DIST, 'index.html');
const { html, inlined } = inlineAssets(readFileSync(indexPath, 'utf8'));
writeFileSync(indexPath, html, 'utf8');
for (const ref of inlined) rmSync(distFile(ref), { force: true });

cpSync(DATA_OUT, join(DIST, 'data-offline'), { recursive: true });
rmSync(PACKAGE, { recursive: true, force: true });
cpSync(DIST, PACKAGE, { recursive: true });
// 内联后 assets/ 已空（没有分片），空目录不进交付包
const assetsDir = join(PACKAGE, 'assets');
if (existsSync(assetsDir) && readdirSync(assetsDir).length === 0) {
  rmSync(assetsDir, { recursive: true, force: true });
}

writeFileSync(
  join(PACKAGE, '使用说明.txt'),
  [
    '崩铁战斗计算器 · 离线版',
    '',
    '【怎么用】',
    '  双击本文件夹里的 index.html，用浏览器打开即可。不需要安装任何东西，也不需要联网。',
    '  推荐 Chrome / Edge。手机上把整个文件夹拷进去，用文件管理器打开 index.html 也能用。',
    '',
    '【数据存在哪】',
    '  面板、计算历史、战报都只存在你当前浏览器的本地存储里，不上传任何服务器。',
    '  换电脑 / 换浏览器 / 清理浏览器数据之前，请先在「角色管理」页点「导出存档」备份成 JSON；',
    '  到新环境后再「导入存档」还原。',
    '',
    '【目录说明】',
    '  index.html        程序和样式全部内联在这里',
    '  data-offline/     角色/光锥/遗器/怪物/关卡成长表的数据分片（按需加载）',
    '  portraits/ 等      角色与怪物立绘、图标',
    '',
    '【注意】',
    '  · 改动文件夹结构会导致裂图或功能不可用，请整体拷贝。',
    '  · 同一个浏览器里打开多个副本会共用一份存档（浏览器按 file:// 统一存放）。',
    '',
    '  本工具非官方作品，与米哈游 / HoYoverse 无关；游戏数据与美术资源版权归原权利人。',
  ].join('\r\n'),
  'utf8',
);

// ── ⑤ 校验（对真实产物，不是对逻辑）──────────────────────────────────────────
console.log('\n▶ 校验产物');
assert(existsSync(join(PACKAGE, 'index.html')), 'index.html 已生成');
assert(!/<script[^>]*\bsrc=/.test(html), '没有外链 script（file:// 下会被 CORS 拒绝）');
assert(!/<link[^>]*\bhref="\.\/?assets\//.test(html), '没有外链 stylesheet');
assert(html.includes('<script type="module">'), '主脚本已内联为 module');

const leftoverJs = readdirSync(join(DIST, 'assets')).filter((f) => f.endsWith('.js'));
assert(
  leftoverJs.length === 0,
  `没有残留 JS 分片（若不为 0 说明还有动态 import，file:// 下会挂）：${leftoverJs.slice(0, 3).join(', ')}`,
);

for (const category of CATEGORIES) {
  const file = join(PACKAGE, 'data-offline', `${category}.js`);
  assert(existsSync(file), `数据分片 ${category}.js 已打包`);
  // 真跑一遍：能解析、且确实把整类文档注入了 window.__HSR_STATIC__[category]。
  // （曾经生成过语法错误的分片：点号写法带连字符的类别名，加载即抛 SyntaxError）
  const sandbox = {};
  vm.runInNewContext(readFileSync(file, 'utf8'), sandbox);
  const table = sandbox.__HSR_STATIC__?.[category];
  const count = table ? Object.keys(table).length : 0;
  assert(count > 0, `数据分片 ${category}.js 可执行并注入 ${count} 篇`);
}
assert(existsSync(join(PACKAGE, 'portraits')), '角色立绘目录已打包');
assert(existsSync(join(PACKAGE, 'monster-art-lg')), '怪物大图目录已打包');

console.log(`\n✅ 离线包已生成：${PACKAGE}`);
console.log(`   体积 ${dirSizeMb(PACKAGE).toFixed(1)} MB，双击 index.html 即可使用`);
