#!/usr/bin/env node
/*!
 * 校验打包后的 Userscript 制品：在没有 module / document / chrome 的纯净上下文中
 * 加载 dist/wechat-job-extractor.user.js 的前半部分（核心模块），并用真实夹具跑一遍。
 *
 * 运行： node tests/verify-userscript.cjs
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const BUNDLE = path.join(ROOT, 'dist', 'wechat-job-extractor.user.js');
const FIXTURES = path.join(ROOT, 'tests', 'fixtures');

let pass = 0, fail = 0;
function check(name, fn) {
  try { fn(); pass++; console.log('  \u2713 ' + name); }
  catch (e) { fail++; console.log('  \u2717 ' + name + '\n      ' + e.message); }
}
function eq(a, b, m) { if (a !== b) throw new Error((m || 'not equal') + ': expected ' + JSON.stringify(b) + ', got ' + JSON.stringify(a)); }
function ok(c, m) { if (!c) throw new Error(m || 'assertion failed'); }

if (!fs.existsSync(BUNDLE)) {
  console.error('未找到 ' + BUNDLE + '，请先运行 node tools/build-userscript.cjs');
  process.exit(1);
}

const code = fs.readFileSync(BUNDLE, 'utf8');

// 元数据头校验
console.log('Userscript 制品校验：');
check('包含 ==UserScript== 元数据头', () => {
  ok(code.startsWith('// ==UserScript=='), '文件未以 UserScript 头开始');
});
check('@match 指向微信文章页', () => {
  ok(/@match\s+https:\/\/mp\.weixin\.qq\.com\/s\*/.test(code), '缺少 @match');
});
check('内联了全部 12 个核心/UI 模块', () => {
  ['core/rules', 'core/classify', 'core/profiles/literature', 'core/links', 'core/insights',
    'core/profiles/recruit', 'core/profiles/general', 'core/parse', 'core/fields',
    'core/format', 'core/extract', 'content/panel'].forEach((m) => {
    ok(code.indexOf('src/' + m + '.js') !== -1, '缺少模块 src/' + m + '.js');
  });
});
check('不含裸 require 调用（只在 typeof module 分支内）', () => {
  let idx = code.indexOf('require(');
  let n = 0;
  while (idx !== -1) {
    n++;
    // 回溯窗口要足够大：fields.js / extract.js 的依赖对象里有 7~8 个 require，
    // 最后一个距离 `typeof module` 已经超过 220 字符。
    const before = code.slice(Math.max(0, idx - 900), idx);
    ok(/typeof\s+module/.test(before), '第 ' + n + ' 处 require( 不在 typeof module 分支内');
    idx = code.indexOf('require(', idx + 1);
  }
  ok(n > 0, '核心模块应保留 Node 分支的 require');
});

// 只取核心模块部分（去掉末尾的启动逻辑，它会访问 document/location）
const MARK = '/* ---------------------------- 启动逻辑 ---------------------------- */';
const coreOnly = code.slice(0, code.indexOf(MARK));
ok(coreOnly.length > 1000, '未能切分出核心模块');

// 在纯净上下文中执行（无 module / document / chrome）
const sandbox = {};
sandbox.globalThis = sandbox;
if (typeof URL !== 'undefined') sandbox.URL = URL;
if (typeof console !== 'undefined') sandbox.console = console;
sandbox.Date = Date;
sandbox.JSON = JSON;
sandbox.Math = Math;
sandbox.Object = Object;
sandbox.Array = Array;
sandbox.String = String;
sandbox.RegExp = RegExp;
sandbox.parseInt = parseInt;
sandbox.isFinite = isFinite;
sandbox.decodeURIComponent = decodeURIComponent;
sandbox.encodeURIComponent = encodeURIComponent;
sandbox.Number = Number;
sandbox.Boolean = Boolean;
vm.createContext(sandbox);

check('在无 module/document 的上下文里可正常加载', () => {
  vm.runInContext(coreOnly, sandbox, { filename: 'userscript-core.js' });
  ok(sandbox.WJE, 'WJE 命名空间未创建');
  ok(sandbox.WJE.extract && sandbox.WJE.extract.fromHtml, 'WJE.extract.fromHtml 缺失');
  ok(sandbox.WJE.panel && sandbox.WJE.panel.toggle, 'WJE.panel 缺失');
});

const WJE = sandbox.WJE;
const read = (n) => fs.readFileSync(path.join(FIXTURES, n), 'utf8');

check('制品解析中信银行夹具，主体/截止/投递入口正确', () => {
  const r = WJE.extract.fromHtml(read('citic-2027.html'), { nowYear: 2026 });
  eq(r.fields.org.value, '中信银行');
  eq(r.fields.deadline.value, '2026-10-09');
  eq(r.links.best.host, 'job.citicbank.com');
});

check('制品解析光大银行图片型夹具，给出图片告警', () => {
  const r = WJE.extract.fromHtml(read('cebbank-2027-image.html'), { nowYear: 2026 });
  eq(r.meta.articleKind, 'image');
  ok(r.warnings.some((w) => w.indexOf('图片') !== -1), '缺少图片型告警');
});

check('制品能输出 Markdown / CSV', () => {
  const r = WJE.extract.fromHtml(read('hxb-2027.html'), { nowYear: 2026 });
  const md = WJE.format.toMarkdown(r);
  ok(md.indexOf('## 投递入口') !== -1, 'Markdown 缺少投递入口段');
  ok(md.indexOf('wecruit.hotjob.cn') !== -1, 'Markdown 缺少投递链接');
  const csv = WJE.format.toCSV([r]);
  eq(csv.split('\r\n').length, 2, 'CSV 行数不对');
});

console.log('\n通过 ' + pass + ' / ' + (pass + fail) + '，失败 ' + fail);
process.exit(fail ? 1 : 0);
