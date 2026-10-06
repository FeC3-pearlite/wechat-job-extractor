#!/usr/bin/env node
/*!
 * 用无头 Edge 真实渲染夹具页面，执行 content script 实际使用的 parseDocument 路径。
 *
 * 为什么需要它：run-tests.cjs 走的是 parseHtml（纯字符串解析），
 * verify-panel.cjs 用的是自制 DOM 桩；两者都没有碰过真实浏览器 DOM。
 * 这里把夹具 HTML 放进真浏览器，注入核心模块，调用 WJE.extract.fromDocument(document)，
 * 再把结果从 --dump-dom 里取回来断言。
 *
 * 运行： node tests/verify-dom-browser.cjs
 */
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const FIXTURES = path.join(__dirname, 'fixtures');

const EDGE_CANDIDATES = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe'
];

let pass = 0, fail = 0;
function check(name, fn) {
  try { fn(); pass++; console.log('  \u2713 ' + name); }
  catch (e) { fail++; console.log('  \u2717 ' + name + '\n      ' + (e && e.message || e)); }
}
function ok(c, m) { if (!c) throw new Error(m || 'assertion failed'); }
function eq(a, b, m) { if (a !== b) throw new Error((m || 'not equal') + ': expected ' + JSON.stringify(b) + ', got ' + JSON.stringify(a)); }
function includes(arr, v, m) { if (!Array.isArray(arr) || arr.indexOf(v) === -1) throw new Error((m || 'missing') + ': ' + v + ' in ' + JSON.stringify(arr)); }

const browser = EDGE_CANDIDATES.find((p) => fs.existsSync(p));
if (!browser) {
  console.error('未找到 Edge/Chrome，跳过浏览器 DOM 测试。');
  process.exit(0);
}
console.log('浏览器: ' + browser + '\n');

const MODULES = ['src/core/rules.js', 'src/core/parse.js', 'src/core/fields.js', 'src/core/format.js', 'src/core/extract.js'];

const RUNNER = `
<script>
(function () {
  var out = { ok: false };
  try {
    var res = window.WJE.extract.fromDocument(document, { pageUrl: location.href });
    out = {
      ok: true,
      origin: 'dom',
      title: res.meta.title,
      account: res.meta.account,
      publishTime: res.meta.publishTime,
      articleKind: res.meta.articleKind,
      textLength: res.meta.textLength,
      anchorsCount: res.meta.anchorsCount,
      org: res.fields.org && res.fields.org.value,
      orgConfidence: res.fields.org && res.fields.org.confidence,
      batch: res.fields.batch && res.fields.batch.value,
      recruitType: res.fields.recruitType && res.fields.recruitType.value,
      deadline: res.fields.deadline && res.fields.deadline.value,
      best: res.links.best && res.links.best.url,
      bestHost: res.links.best && res.links.best.host,
      readOriginal: res.links.readOriginal && res.links.readOriginal.url,
      readOriginalFrom: res.links.readOriginal && res.links.readOriginal.from,
      education: res.fields.education && res.fields.education.list,
      majors: res.fields.majors && res.fields.majors.list,
      positions: res.fields.positions && res.fields.positions.list,
      emails: res.fields.contacts && res.fields.contacts.emails,
      warningCount: res.warnings.length
    };
  } catch (e) {
    out = { ok: false, error: String(e && e.stack || e) };
  }
  var pre = document.createElement('pre');
  pre.id = '__wje_result__';
  pre.textContent = JSON.stringify(out);
  document.body.appendChild(pre);
})();
</script>
`;

function buildHarness(fixtureName, outName) {
  const html = fs.readFileSync(path.join(FIXTURES, fixtureName), 'utf8');
  const tags = MODULES.map((m) => '<script src="../' + m.replace(/\\/g, '/') + '"></script>').join('\n');
  // 注入到 </body> 之前；核心模块必须在 fixture 自身脚本之后、runner 之前
  const injected = tags + '\n' + RUNNER;
  const patched = html.includes('</body>')
    ? html.replace('</body>', injected + '\n</body>')
    : html + injected;
  const outPath = path.join(__dirname, outName);
  fs.writeFileSync(outPath, patched, 'utf8');
  return outPath;
}

function runHeadless(file) {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'wje-prof-'));
  const args = [
    '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    '--disable-extensions', '--allow-file-access-from-files',
    '--virtual-time-budget=6000',
    '--user-data-dir=' + profile,
    '--dump-dom',
    'file:///' + file.replace(/\\/g, '/')
  ];
  let out = '';
  try {
    out = execFileSync(browser, args, { encoding: 'utf8', timeout: 90000, maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] });
  } catch (e) {
    out = (e && e.stdout) || '';
  }
  try { fs.rmSync(profile, { recursive: true, force: true }); } catch (e) { /* 忽略 */ }

  // 注意：--dump-dom 会把 <script> 源码也一并序列化，
  // 所以只能按 <pre id="__wje_result__"> 元素取结果，不能用裸标记正则。
  const m = out.match(/<pre[^>]*id="__wje_result__"[^>]*>([\s\S]*?)<\/pre>/);
  if (!m) throw new Error('未在 dump-dom 输出中找到结果元素（浏览器可能未执行脚本）\n输出片段: ' + out.slice(0, 400));
  const json = m[1]
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'").replace(/&amp;/g, '&');
  return JSON.parse(json);
}

/* ------------------------------ 中信银行 ------------------------------ */

console.log('真实浏览器 DOM 路径测试：');

const citicFile = buildHarness('citic-2027.html', '_tmp_harness_citic.html');
let citic = null;

check('真实 DOM 下解析中信银行夹具（不抛异常）', () => {
  citic = runHeadless(citicFile);
  ok(citic.ok, '执行出错: ' + citic.error);
  eq(citic.origin, 'dom', '应走 DOM 解析路径');
});

check('DOM 路径：标题 / 公众号 / 发布时间', () => {
  ok(citic.title.indexOf('中信银行2027年校园招聘') !== -1, '标题错误: ' + citic.title);
  eq(citic.account, '中信银行招聘');
  ok(citic.publishTime.indexOf('2026-08-31') !== -1, '发布时间错误: ' + citic.publishTime);
});

check('DOM 路径：主体 / 批次 / 截止时间与字符串路径一致', () => {
  eq(citic.org, '中信银行');
  eq(citic.batch, '2027届');
  eq(citic.deadline, '2026-10-09');
  eq(citic.recruitType, '校园招聘');
});

check('DOM 路径：投递入口与阅读原文', () => {
  ok(citic.best && citic.best.indexOf('https://job.citicbank.com') === 0, '投递入口错误: ' + citic.best);
  eq(citic.bestHost, 'job.citicbank.com');
  eq(citic.readOriginal, 'https://job.citicbank.com/');
  eq(citic.readOriginalFrom, 'msg_source_url');
});

check('DOM 路径：学历 / 专业 / 岗位 / 邮箱', () => {
  includes(citic.education, '本科');
  includes(citic.majors, '经济学类');
  includes(citic.positions, '管培生');
  includes(citic.emails, 'job@citicbank.com');
});

/* ------------------------------ 光大银行（图片型） ------------------------------ */

const cebFile = buildHarness('cebbank-2027-image.html', '_tmp_harness_ceb.html');
let ceb = null;

check('真实 DOM 下识别图片型推文并告警', () => {
  ceb = runHeadless(cebFile);
  ok(ceb.ok, '执行出错: ' + ceb.error);
  eq(ceb.articleKind, 'image');
  ok(ceb.warningCount > 0, '应有告警');
});

check('DOM 路径：阅读原文解出光大招贤馆公告页', () => {
  eq(ceb.readOriginal, 'https://eoap.cebbank.com/uiap/wt/CEB/zpzhm/dynamic/detail?columnId=102302');
  eq(ceb.bestHost, 'eoap.cebbank.com');
});

/* ------------------------------ 华夏银行 ------------------------------ */

const hxbFile = buildHarness('hxb-2027.html', '_tmp_harness_hxb.html');
let hxb = null;

check('真实 DOM 下解析华夏银行：主体/截止/招聘系统链接', () => {
  hxb = runHeadless(hxbFile);
  ok(hxb.ok, '执行出错: ' + hxb.error);
  eq(hxb.org, '华夏银行');
  eq(hxb.deadline, '2026-10-25');
  eq(hxb.bestHost, 'wecruit.hotjob.cn');
  includes(hxb.positions, '经办岗');
});

/* --------------------- DOM 路径 vs 字符串路径 一致性 --------------------- */

check('两条解析路径在关键字段上完全一致（中信）', () => {
  const stringPath = require('../src/core/extract.js').fromHtml(fs.readFileSync(path.join(FIXTURES, 'citic-2027.html'), 'utf8'), { nowYear: 2026 });
  eq(citic.org, stringPath.fields.org.value, '机构名');
  eq(citic.batch, stringPath.fields.batch.value, '批次');
  eq(citic.deadline, stringPath.fields.deadline.value, '截止时间');
  eq(citic.best, stringPath.links.best.url, '投递入口');
  eq(citic.readOriginal, stringPath.links.readOriginal.url, '阅读原文');
});

check('两条解析路径在关键字段上完全一致（华夏）', () => {
  const stringPath = require('../src/core/extract.js').fromHtml(fs.readFileSync(path.join(FIXTURES, 'hxb-2027.html'), 'utf8'), { nowYear: 2026 });
  eq(hxb.org, stringPath.fields.org.value, '机构名');
  eq(hxb.deadline, stringPath.fields.deadline.value, '截止时间');
  eq(hxb.best, stringPath.links.best.url, '投递入口');
});

/* ------------------------------ 清理 ------------------------------ */

['_tmp_harness_citic.html', '_tmp_harness_ceb.html', '_tmp_harness_hxb.html'].forEach((f) => {
  try { fs.unlinkSync(path.join(__dirname, f)); } catch (e) { /* 忽略 */ }
});

console.log('\n通过 ' + pass + ' / ' + (pass + fail) + '，失败 ' + fail);
process.exit(fail ? 1 : 0);
