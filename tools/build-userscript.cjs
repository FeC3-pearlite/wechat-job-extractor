#!/usr/bin/env node
/*!
 * 构建脚本：把 src/core + src/content 打包成单文件 Userscript（Tampermonkey / Violentmonkey 可直接装）。
 * 用法： node tools/build-userscript.cjs
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8'));

const FILES = [
  'src/core/rules.js',
  'src/core/parse.js',
  'src/core/fields.js',
  'src/core/format.js',
  'src/core/extract.js',
  'src/content/panel.js'
];

const HEADER = `// ==UserScript==
// @name         微信求职信息提取器
// @namespace    https://github.com/local/wechat-job-extractor
// @version      ${pkg.version}
// @description  从微信公众号招聘推文里一键提取招聘单位、届别、岗位、投递截止时间与官方投递链接，可复制/下载 Markdown、JSON。
// @author       local
// @match        https://mp.weixin.qq.com/s*
// @icon         data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='7' fill='%2307c160'/%3E%3C/svg%3E
// @grant        none
// @run-at       document-idle
// @license      MIT
// ==/UserScript==
`;

const BOOTSTRAP = `
/* ---------------------------- 启动逻辑 ---------------------------- */
(function () {
  'use strict';
  if (window.__WJE_CONTENT_LOADED__) return;
  window.__WJE_CONTENT_LOADED__ = true;

  var WJE = window.WJE;
  if (!WJE || !WJE.extract || !WJE.panel) return;

  function isArticlePage() {
    return /^\\/s(\\/|\\?|$)/.test(location.pathname) || /__biz=/.test(location.search);
  }

  function waitForContent(timeoutMs) {
    return new Promise(function (resolve) {
      var deadline = Date.now() + (timeoutMs || 8000);
      (function tick() {
        var el = document.querySelector('#js_content') || document.querySelector('.rich_media_content');
        if (el && el.textContent.trim().length + el.querySelectorAll('img').length > 0) return resolve(el);
        if (Date.now() > deadline) return resolve(null);
        setTimeout(tick, 250);
      })();
    });
  }

  if (!isArticlePage()) return;

  waitForContent(8000).then(function () {
    WJE.panel.ensureHost();
  });

  // 挂到全局方便调试
  window.__WJE_EXTRACT__ = function () {
    return WJE.extract.fromDocument(document, { pageUrl: location.href });
  };
})();
`;

const parts = [HEADER];
parts.push('/* 本文件由 tools/build-userscript.cjs 自动生成，请勿直接修改；改动请编辑 src/ 后重新构建。 */\n');

for (const rel of FILES) {
  const full = path.join(ROOT, rel);
  const code = fs.readFileSync(full, 'utf8');
  parts.push(`\n/* ==================== ${rel} ==================== */\n`);
  parts.push(code.replace(/^\uFEFF/, ''));
}
parts.push(BOOTSTRAP);

const outDir = path.join(ROOT, 'dist');
fs.mkdirSync(outDir, { recursive: true });
const outFile = path.join(outDir, 'wechat-job-extractor.user.js');
fs.writeFileSync(outFile, parts.join(''), 'utf8');

const size = fs.statSync(outFile).size;
console.log('生成 Userscript: ' + path.relative(ROOT, outFile) + '  (' + (size / 1024).toFixed(1) + ' KB)');
