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

// 顺序与 manifest.content_scripts.js 保持一致。
// （links.js 已改为调用时惰性解析依赖，顺序不再是正确性前提，但仍保持同一顺序便于核对。）
const FILES = [
  'src/core/rules.js',
  'src/core/classify.js',
  'src/core/profiles/literature.js',
  'src/core/parse.js',
  'src/core/links.js',
  'src/core/insights.js',
  'src/core/profiles/recruit.js',
  'src/core/profiles/general.js',
  'src/core/fields.js',
  'src/core/format.js',
  'src/core/extract.js',
  'src/content/panel.js'
];

const HEADER = `// ==UserScript==
// @name         微信推文关键信息提取器
// @namespace    https://github.com/FeC3-pearlite/wechat-job-extractor
// @version      ${pkg.version}
// @description  自动判别公众号推文类型：招聘帖提取投递入口与截止时间，文献帖提取原文链接、作者、期刊、DOI 与引用格式，可导出 Markdown/JSON。
// @author       FeC3-pearlite
// @match        https://mp.weixin.qq.com/s*
// @icon         data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='7' fill='%2307c160'/%3E%3C/svg%3E
// @homepageURL  https://github.com/FeC3-pearlite/wechat-job-extractor
// @supportURL   https://github.com/FeC3-pearlite/wechat-job-extractor/issues
// @updateURL    https://raw.githubusercontent.com/FeC3-pearlite/wechat-job-extractor/main/dist/wechat-job-extractor.user.js
// @downloadURL  https://raw.githubusercontent.com/FeC3-pearlite/wechat-job-extractor/main/dist/wechat-job-extractor.user.js
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
