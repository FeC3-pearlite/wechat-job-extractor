/*!
 * 微信求职信息提取器 — 内容脚本入口 (content.js)
 * 负责：等待正文渲染 → 挂载面板 → 响应 popup / 快捷键 / 右键菜单请求。
 */
(function () {
  'use strict';

  if (window.__WJE_CONTENT_LOADED__) return;
  window.__WJE_CONTENT_LOADED__ = true;

  var WJE = window.WJE;
  if (!WJE || !WJE.extract || !WJE.panel) {
    console.warn('[微信求职信息提取器] 核心模块未加载，已跳过。');
    return;
  }

  var DEFAULTS = {
    autoBadge: true,        // 打开文章时显示悬浮按钮
    autoPanel: false,       // 打开文章时自动展开面板
    highlight: false        // 提取后自动高亮正文关键词
  };

  function getSettings(cb) {
    try {
      chrome.storage.sync.get(DEFAULTS, function (s) { cb(Object.assign({}, DEFAULTS, s || {})); });
    } catch (e) { cb(DEFAULTS); }
  }

  function isArticlePage() {
    return /^\/s(\/|\?|$)/.test(location.pathname) || /__biz=/.test(location.search);
  }

  /** 轮询等待 #js_content 出现（微信正文有时异步渲染）。 */
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

  function extract() {
    return WJE.extract.fromDocument(document, { pageUrl: location.href });
  }

  /* ------------------------- 消息接口（popup / background） ------------------------- */

  chrome.runtime.onMessage.addListener(function (msg, sender, sendResponse) {
    if (!msg || !msg.type) return;
    if (msg.type === 'WJE_PING') {
      sendResponse({ ok: true, isArticle: isArticlePage(), url: location.href });
      return true;
    }
    if (msg.type === 'WJE_EXTRACT') {
      waitForContent(3000).then(function () {
        var res;
        try { res = extract(); } catch (e) { res = { error: String(e && e.message || e) }; }
        sendResponse({ ok: !res.error, result: res });
      });
      return true;   // 异步响应
    }
    if (msg.type === 'WJE_TOGGLE_PANEL') {
      WJE.panel.toggle();
      sendResponse({ ok: true });
      return true;
    }
    if (msg.type === 'WJE_SHOW_PANEL') {
      WJE.panel.extractAndShow();
      sendResponse({ ok: true });
      return true;
    }
    return undefined;
  });

  /* ------------------------------- 初始化 ------------------------------- */

  function boot() {
    getSettings(function (s) {
      if (s.autoBadge !== false) {
        WJE.panel.ensureHost();
      }
      if (s.autoPanel) {
        waitForContent(8000).then(function () {
          WJE.panel.extractAndShow();
          if (s.highlight) setTimeout(function () { WJE.panel.highlight(); }, 400);
        });
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }

  // 暴露给控制台调试
  window.__WJE_EXTRACT__ = extract;
})();
