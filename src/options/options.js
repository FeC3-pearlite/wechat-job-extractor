/*!
 * 微信求职信息提取器 — 设置页 (options.js)
 */
(function () {
  'use strict';

  var DEFAULTS = {
    autoBadge: true,
    autoPanel: false,
    highlight: false
  };

  var KEYS = Object.keys(DEFAULTS);
  var $ = function (id) { return document.getElementById(id); };

  function load() {
    chrome.storage.sync.get(DEFAULTS, function (s) {
      KEYS.forEach(function (k) {
        var el = $(k);
        if (el) el.checked = s[k] !== false && s[k] !== undefined ? !!s[k] : DEFAULTS[k];
      });
    });
  }

  function save() {
    var data = {};
    KEYS.forEach(function (k) {
      var el = $(k);
      if (el) data[k] = el.checked;
    });
    chrome.storage.sync.set(data, function () {
      var st = $('status');
      st.classList.add('show');
      setTimeout(function () { st.classList.remove('show'); }, 1600);
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    if (new URLSearchParams(location.search).get('welcome')) {
      $('welcome').style.display = 'block';
    }
    load();
    $('save').addEventListener('click', save);
    KEYS.forEach(function (k) {
      var el = $(k);
      if (el) el.addEventListener('change', save);
    });
  });
})();
