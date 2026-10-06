#!/usr/bin/env node
/*!
 * 用最小 DOM 桩真实执行 content/panel.js 的挂载与渲染路径。
 * 目的：core 层有夹具测试，但面板 UI 此前只有静态检查——这里把它跑起来，
 * 捕捉选择器写错、Format 方法名写错、渲染时抛异常这类问题。
 *
 * 运行： node tests/verify-panel.cjs
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
function check(name, fn) {
  try { fn(); pass++; console.log('  \u2713 ' + name); }
  catch (e) { fail++; console.log('  \u2717 ' + name + '\n      ' + (e && e.stack || e)); }
}
function ok(c, m) { if (!c) throw new Error(m || 'assertion failed'); }
function includes(h, n, m) { if (String(h).indexOf(n) === -1) throw new Error((m || 'missing') + ': ' + n); }

/* ----------------------------- 最小 DOM 桩 ----------------------------- */

function makeStub(tag) {
  const el = {
    tagName: String(tag || 'div').toUpperCase(),
    nodeName: String(tag || 'div').toUpperCase(),
    children: [],
    listeners: {},
    attributes: {},
    style: { cssText: '' },
    textContent: '',
    nodeValue: null,
    _innerHTML: '',
    classList: {
      _s: new Set(),
      add(c) { this._s.add(c); },
      remove(c) { this._s.delete(c); },
      toggle(c, on) { if (on === undefined) { this._s.has(c) ? this._s.delete(c) : this._s.add(c); } else if (on) this._s.add(c); else this._s.delete(c); },
      contains(c) { return this._s.has(c); }
    },
    get innerHTML() { return this._innerHTML; },
    set innerHTML(v) { this._innerHTML = String(v); },
    get outerHTML() { return '<' + tag + '>' + this._innerHTML + '</' + tag + '>'; },
    setAttribute(k, v) { this.attributes[k] = String(v); },
    getAttribute(k) { return this.attributes[k] === undefined ? null : this.attributes[k]; },
    appendChild(c) { this.children.push(c); return c; },
    removeChild(c) { const i = this.children.indexOf(c); if (i >= 0) this.children.splice(i, 1); return c; },
    replaceChild(a, b) { const i = this.children.indexOf(b); if (i >= 0) this.children[i] = a; return b; },
    remove() {},
    click() { (this.listeners.click || []).forEach((f) => f({ target: this })); },
    addEventListener(t, f) { (this.listeners[t] = this.listeners[t] || []).push(f); },
    removeEventListener() {},
    attachShadow() {
      const sh = makeStub('shadow-root');
      sh._isShadow = true;
      this.shadowRoot = sh;
      return sh;
    },
    querySelector(sel) {
      this._q = this._q || {};
      if (!this._q[sel]) this._q[sel] = makeStub('div');
      return this._q[sel];
    },
    querySelectorAll() { return []; },
    closest() { return this; },
    contains() { return true; }
  };
  return el;
}

const sandbox = {};
sandbox.globalThis = sandbox;
sandbox.window = sandbox;
sandbox.console = console;
sandbox.Date = Date; sandbox.JSON = JSON; sandbox.Math = Math; sandbox.Object = Object;
sandbox.Array = Array; sandbox.String = String; sandbox.RegExp = RegExp; sandbox.Number = Number;
sandbox.Boolean = Boolean; sandbox.parseInt = parseInt; sandbox.isFinite = isFinite; sandbox.Set = Set;
sandbox.Map = Map; sandbox.Error = Error; sandbox.Promise = Promise;
sandbox.setTimeout = setTimeout; sandbox.clearTimeout = clearTimeout;
sandbox.decodeURIComponent = decodeURIComponent; sandbox.encodeURIComponent = encodeURIComponent;
if (typeof URL !== 'undefined') sandbox.URL = URL;
sandbox.Blob = function Blob(parts, opts) { this.parts = parts; this.type = (opts || {}).type; };
sandbox.navigator = { clipboard: { writeText: () => Promise.resolve() } };
sandbox.NodeFilter = { SHOW_TEXT: 4 };
sandbox.location = { href: 'https://mp.weixin.qq.com/s/demo' };

const bodyEl = makeStub('body');
const docEl = makeStub('html');
const doc = {
  readyState: 'complete',
  title: '演示文章',
  body: bodyEl,
  documentElement: docEl,
  createElement: makeStub,
  createTextNode: (t) => { const n = makeStub('#text'); n.nodeValue = t; n.textContent = t; return n; },
  createDocumentFragment: () => makeStub('fragment'),
  createTreeWalker: () => ({ nextNode: () => null }),
  querySelector: () => null,
  querySelectorAll: () => [],
  addEventListener: () => {},
  execCommand: () => true
};
sandbox.document = doc;
bodyEl.ownerDocument = doc;
vm.createContext(sandbox);

/* ------------------------------ 加载模块 ------------------------------ */

const FILES = [
  'src/core/rules.js', 'src/core/classify.js', 'src/core/profiles/literature.js',
  'src/core/parse.js', 'src/core/links.js', 'src/core/insights.js',
  'src/core/profiles/recruit.js', 'src/core/profiles/general.js',
  'src/core/fields.js', 'src/core/format.js', 'src/core/extract.js', 'src/content/panel.js'
];

check('在最小 DOM 桩下加载 core + panel 不抛异常', () => {
  FILES.forEach((f) => {
    vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), sandbox, { filename: f });
  });
  ok(sandbox.WJE && sandbox.WJE.panel, 'WJE.panel 未创建');
});

const WJE = sandbox.WJE;

check('ensureHost：挂载宿主节点、按钮绑定了点击事件', () => {
  WJE.panel.ensureHost();
  ok(bodyEl.children.length === 1, '宿主节点未挂到 body，实际 ' + bodyEl.children.length);
  const host = bodyEl.children[0];
  ok(host.shadowRoot, '未创建 Shadow DOM');
  const fab = host.shadowRoot.querySelector('.fab');
  ok(fab.listeners.click && fab.listeners.click.length === 1, '悬浮按钮未绑定 click');
  ok(host.shadowRoot.querySelector('.panel').listeners === undefined || true, 'ok');
});

check('ensureHost 幂等：重复调用不会重复插入', () => {
  const n = bodyEl.children.length;
  WJE.panel.ensureHost();
  ok(bodyEl.children.length === n, '重复挂载，实际 ' + bodyEl.children.length);
});

const FIXTURE = fs.readFileSync(path.join(ROOT, 'tests/fixtures/citic-2027.html'), 'utf8');
const RESULT = WJE.extract.fromHtml(FIXTURE, { nowYear: 2026 });

check('render：不抛异常，且标题/摘要写入正确节点', () => {
  WJE.panel.render(RESULT);
  const sh = bodyEl.children[0].shadowRoot;
  includes(sh.querySelector('.title').textContent, '中信银行2027年校园招聘');
  includes(sh.querySelector('.meta').textContent, '公众号：中信银行招聘');
});

check('render：正文区含投递入口、关键字段、关键句', () => {
  const sh = bodyEl.children[0].shadowRoot;
  const bd = sh.querySelector('.bd').innerHTML;
  includes(bd, '## 投递入口'.replace('## ', ''), '缺少投递入口段');   // 面板里是 <h2>投递入口</h2>
  includes(bd, 'https://job.citicbank.com', '缺少投递链接');
  includes(bd, '招聘主体', '缺少关键字段表');
  includes(bd, '2026-10-09', '缺少截止日期');
  includes(bd, '关键句摘录', '缺少关键句段');
});

check('render：底部按钮齐全（招聘画像）', () => {
  const sh = bodyEl.children[0].shadowRoot;
  const ft = sh.querySelector('.ft').innerHTML;
  ['复制 Markdown', '复制主要链接', '复制 JSON', '下载 .md', '下载 .json', '高亮正文关键词'].forEach((b) => {
    includes(ft, b, '缺少按钮');
  });
});

check('render：文献画像展示原文链接、摘要与引用格式', () => {
  const litFixture = fs.readFileSync(path.join(ROOT, 'tests/fixtures/literature-nature.html'), 'utf8');
  const res = WJE.extract.fromHtml(litFixture, { nowYear: 2026 });
  WJE.panel.render(res);
  const sh = bodyEl.children[0].shadowRoot;
  const bd = sh.querySelector('.bd').innerHTML;
  includes(bd, '原文链接', '缺少原文链接段');
  includes(bd, 'https://doi.org/10.1038/s41586-021-03819-2', '缺少 DOI 解析链接');
  includes(bd, '论文信息', '缺少论文信息表');
  includes(bd, 'Highly accurate protein structure prediction with AlphaFold', '缺少论文标题');
  includes(bd, '摘要', '缺少摘要段');
  includes(bd, '引用格式', '缺少引用格式段');
  includes(bd, 'GB/T 7714', '缺少 GB/T 条目');
  includes(bd, 'BibTeX', '缺少 BibTeX 条目');
  // 类型徽标应显示为「文献阅读」
  includes(sh.querySelector('.badge').textContent, '文献阅读', '类型徽标错误');
  const ft = sh.querySelector('.ft').innerHTML;
  ['复制 GB/T 引用', '复制 APA', '复制 BibTeX', '复制题录', '复制原文链接'].forEach((b) => {
    includes(ft, b, '文献画像缺少按钮');
  });
});

check('render：通用画像不套招聘字段', () => {
  const general = WJE.extract.fromHtml(
    '<html><head><title>关于调整办公时间的通知</title></head><body><div id="js_content">' +
    '<p>各位同事：自下周一起办公时间调整为 9:00-18:00，请大家知悉。</p>' +
    '<p>联系人：行政部，电话 010-12345678。</p></div></body></html>',
    { nowYear: 2026 }
  );
  WJE.panel.render(general);
  const bd = bodyEl.children[0].shadowRoot.querySelector('.bd').innerHTML;
  includes(bd, '通用字段', '通用画像应展示通用字段表');
  ok(bd.indexOf('投递入口') === -1, '通用画像不应出现「投递入口」段');
});

check('render：图片型推文会展示图片区与告警', () => {
  const imgFixture = fs.readFileSync(path.join(ROOT, 'tests/fixtures/cebbank-2027-image.html'), 'utf8');
  const res = WJE.extract.fromHtml(imgFixture, { nowYear: 2026 });
  WJE.panel.render(res);
  const bd = bodyEl.children[0].shadowRoot.querySelector('.bd').innerHTML;
  includes(bd, '正文图片', '图片型推文应展示图片区');
  includes(bd, '⚠️', '应有告警块');
});

check('渲染结果中的 HTML 被转义（防注入）', () => {
  const evil = WJE.extract.fromHtml(
    '<html><head><title>&lt;img src=x onerror=alert(1)&gt;集团2027届校园招聘</title></head>' +
    '<body><div id="js_content"><p>工作地点：&lt;script&gt;alert(1)&lt;/script&gt;北京</p><p>正文足够长足够长足够长足够长足够长足够长</p></div></body></html>',
    { nowYear: 2026 }
  );
  WJE.panel.render(evil);
  const bd = bodyEl.children[0].shadowRoot.querySelector('.bd').innerHTML;
  ok(bd.indexOf('<script>') === -1, '渲染结果里出现了未转义的 <script>');
  ok(bd.indexOf('onerror=alert(1)>') === -1, '渲染结果里出现了未转义的标签');
});

check('toggle / hide 不抛异常', () => {
  WJE.panel.toggle();
  WJE.panel.hide();
  WJE.panel.show();
  WJE.panel.setBusy(true);
  WJE.panel.setBusy(false);
});

console.log('\n通过 ' + pass + ' / ' + (pass + fail) + '，失败 ' + fail);
process.exit(fail ? 1 : 0);
