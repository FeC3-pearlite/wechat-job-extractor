#!/usr/bin/env node
/*!
 * 清单（manifest.json）与扩展页面自检。
 * 覆盖 Chrome 加载扩展时最容易踩的坑：引用了不存在的文件、default_locale 没有 _locales、
 * 页面里的 <script src> 指向不存在的文件、注入顺序不满足依赖关系。
 *
 * 运行： node tests/verify-manifest.cjs
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;

function check(name, fn) {
  try { fn(); pass++; console.log('  \u2713 ' + name); }
  catch (e) { fail++; console.log('  \u2717 ' + name + '\n      ' + e.message); }
}
function ok(c, m) { if (!c) throw new Error(m || 'assertion failed'); }
function eq(a, b, m) { if (a !== b) throw new Error((m || 'not equal') + ': expected ' + JSON.stringify(b) + ', got ' + JSON.stringify(a)); }
function exists(rel) { return fs.existsSync(path.join(ROOT, rel)); }
function mustExist(rel) { ok(exists(rel), '文件不存在：' + rel); }

const mfPath = path.join(ROOT, 'manifest.json');
let raw, mf;

check('manifest.json 是合法 JSON', () => {
  raw = fs.readFileSync(mfPath, 'utf8');
  mf = JSON.parse(raw);
});
check('manifest_version = 3 且版本号合法', () => {
  eq(mf.manifest_version, 3);
  ok(/^\d+\.\d+\.\d+$/.test(mf.version), '版本号格式不对：' + mf.version);
  ok(mf.name && mf.name.length <= 45, '名称缺失或超过 45 字符');
  ok(mf.description && mf.description.length <= 132, '描述缺失或超过 132 字符');
});

check('使用了 default_locale 就必须有 _locales/<locale>/messages.json', () => {
  if (!mf.default_locale) return;              // 没用到就跳过
  mustExist(path.join('_locales', mf.default_locale, 'messages.json'));
});

check('background.service_worker 存在', () => {
  mustExist(mf.background.service_worker);
});

check('action.default_popup 存在', () => {
  mustExist(mf.action.default_popup);
});

check('options_ui.page 存在', () => {
  mustExist(mf.options_ui.page);
});

check('content_scripts 的每个 js / css 都存在', () => {
  mf.content_scripts.forEach((cs, i) => {
    ok(Array.isArray(cs.matches) && cs.matches.length, 'content_scripts[' + i + '] 缺少 matches');
    (cs.js || []).forEach(mustExist);
    (cs.css || []).forEach(mustExist);
  });
});

check('content_scripts 注入顺序满足依赖（rules → parse → fields → format → extract → panel → content）', () => {
  const js = mf.content_scripts[0].js;
  const order = [
    'rules.js', 'classify.js', 'profiles/literature.js', 'parse.js', 'links.js', 'insights.js',
    'profiles/recruit.js', 'profiles/general.js', 'fields.js', 'format.js',
    'extract.js', 'panel.js', 'content.js'
  ];
  let last = -1;
  order.forEach((f) => {
    const i = js.findIndex((p) => p.endsWith(f));
    ok(i !== -1, 'content_scripts 缺少 ' + f);
    ok(i > last, f + ' 的注入顺序不对（应在其依赖之后）');
    last = i;
  });
});

check('所有 icons 路径存在且是 PNG', () => {
  const sizes = ['16', '32', '48', '128'];
  sizes.forEach((s) => {
    const p = mf.icons[s];
    ok(p, 'icons 缺少 ' + s);
    mustExist(p);
    ok(/\.png$/.test(p), s + ' 图标应为 PNG');
    const buf = fs.readFileSync(path.join(ROOT, p));
    ok(buf.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])), s + ' 不是有效 PNG');
  });
  Object.keys(mf.action.default_icon).forEach((s) => mustExist(mf.action.default_icon[s]));
});

check('host_permissions 覆盖 content_scripts 的站点', () => {
  ok(mf.host_permissions.some((h) => h.indexOf('mp.weixin.qq.com') !== -1), 'host_permissions 未包含 mp.weixin.qq.com');
});

check('扩展页面里的每个 <script src> / <link href> 都真实存在', () => {
  const pages = [mf.action.default_popup, mf.options_ui.page, 'src/batch/batch.html'];
  pages.forEach((page) => {
    const full = path.join(ROOT, page);
    mustExist(page);
    const html = fs.readFileSync(full, 'utf8');
    const dir = path.dirname(full);
    const refs = [...html.matchAll(/<script[^>]+src=["']([^"']+)["']/gi)].map((m) => m[1])
      .concat([...html.matchAll(/<link[^>]+href=["']([^"']+)["']/gi)].map((m) => m[1]));
    refs.forEach((ref) => {
      if (/^https?:|^data:/.test(ref)) return;
      const resolved = path.resolve(dir, ref);
      ok(fs.existsSync(resolved), page + ' 引用了不存在的文件：' + ref);
    });
  });
});

check('popup / batch 页面按依赖顺序引入了全部核心模块', () => {
  ['src/popup/popup.html', 'src/batch/batch.html'].forEach((page) => {
    const html = fs.readFileSync(path.join(ROOT, page), 'utf8');
    const order = ['rules.js', 'parse.js', 'fields.js', 'format.js', 'extract.js'];
    let last = -1;
    order.forEach((f) => {
      const i = html.indexOf(f);
      ok(i !== -1, page + ' 缺少 ' + f);
      ok(i > last, page + ' 中 ' + f + ' 的顺序不对');
      last = i;
    });
  });
});

check('web_accessible_resources 的资源路径存在', () => {
  mf.web_accessible_resources.forEach((w) => {
    (w.resources || []).forEach((r) => {
      if (r.endsWith('/*')) {
        ok(exists(r.slice(0, -2)), '目录不存在：' + r);
      } else {
        mustExist(r);
      }
    });
    ok(Array.isArray(w.matches) && w.matches.length, 'web_accessible_resources 缺少 matches');
  });
});

check('引用的权限都是已知的 Chrome 权限名', () => {
  const KNOWN = new Set([
    'activeTab', 'scripting', 'storage', 'tabs', 'downloads', 'contextMenus', 'clipboardWrite',
    'notifications', 'alarms', 'unlimitedStorage', 'cookies', 'webNavigation', 'declarativeContent'
  ]);
  (mf.permissions || []).forEach((p) => ok(KNOWN.has(p), '未知权限：' + p));
});

check('commands 的快捷键合法（含修饰键）', () => {
  Object.keys(mf.commands || {}).forEach((k) => {
    const key = mf.commands[k].suggested_key;
    if (!key || !key.default) return;
    ok(/^(Ctrl|Alt|Command|MacCtrl)(\+(Shift|Alt|Ctrl|Command))?\+[A-Z0-9]$/.test(key.default),
      '快捷键格式不对：' + key.default);
  });
});

console.log('\n通过 ' + pass + ' / ' + (pass + fail) + '，失败 ' + fail);
process.exit(fail ? 1 : 0);
