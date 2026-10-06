/*!
 * 微信求职信息提取器 — 批量提取页 (batch.js)
 *
 * 两种抓取模式：
 *   1) fetch 模式：扩展页直接带登录态请求文章 HTML，再走纯字符串解析（快，无窗口闪烁）。
 *   2) 标签页模式：后台标签页真实打开文章，等 #js_content 渲染后用内容脚本解析（最稳，能过验证页）。
 */
(function () {
  'use strict';

  var WJE = window.WJE;
  var F = WJE.format;
  var $ = function (id) { return document.getElementById(id); };

  var jobs = [];        // { url, status, result, error }
  var running = false;
  var abort = false;

  function esc(s) {
    return String(s === undefined || s === null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  var sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };

  /* --------------------------- URL 预处理 --------------------------- */

  function parseUrls(text) {
    var out = [];
    String(text || '').split(/[\s,;]+/).forEach(function (raw) {
      var u = raw.trim().replace(/[)\]】》，。]+$/, '');
      if (!u) return;
      if (!/^https?:\/\//i.test(u)) {
        // 允许直接粘贴一长串营销文案，从中抠出链接
        var m = u.match(/https?:\/\/[^\s"'<>]+/);
        if (!m) return;
        u = m[0];
      }
      if (!/mp\.weixin\.qq\.com/i.test(u)) return;
      // 归一化：只保留 /s/xxx 或 /s?...  去掉 scene / click_id 等跟踪参数
      try {
        var parsed = new URL(u);
        if (/^\/s\//.test(parsed.pathname)) {
          u = parsed.origin + parsed.pathname;
        } else {
          ['scene', 'click_id', 'srcid', 'chksm', 'sessionid', 'subscene', 'version', 'nettype', 'abtest_cookie', 'ascene', 'devicetype', 'fontScale', 'pass_ticket', 'wx_header', 'key', 'uin', 'escape'].forEach(function (k) {
            parsed.searchParams.delete(k);
          });
          u = parsed.toString();
        }
      } catch (e) { /* 保留原样 */ }
      if (out.indexOf(u) === -1) out.push(u);
    });
    return out;
  }

  /* ------------------------------ 抓取 ------------------------------ */

  function looksLikeCaptcha(html) {
    return /wappoc_appmsgcaptcha|环境异常|当前环境异常/.test(html) && !/id="js_content"/.test(html);
  }

  async function fetchMode(url) {
    var resp = await fetch(url, { credentials: 'include', redirect: 'follow', cache: 'no-store' });
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    var html = await resp.text();
    if (looksLikeCaptcha(html)) {
      throw new Error('微信返回验证页（环境异常）。建议勾选「标签页模式」重试。');
    }
    var res = WJE.fromHtml(html, { pageUrl: url, useDom: true });
    if (!res.meta.title && !res.meta.textLength) throw new Error('未解析到文章内容（可能不是图文页）');
    res.meta.url = url;
    return res;
  }

  function openTab(url) {
    return new Promise(function (resolve) {
      chrome.tabs.create({ url: url, active: false }, function (tab) {
        if (chrome.runtime.lastError || !tab) return resolve(null);
        resolve(tab);
      });
    });
  }

  function closeTab(tabId) {
    return new Promise(function (resolve) {
      chrome.tabs.remove(tabId, function () { void chrome.runtime.lastError; resolve(); });
    });
  }

  function waitTabComplete(tabId, timeoutMs) {
    return new Promise(function (resolve) {
      var done = false;
      var finish = function (v) { if (!done) { done = true; chrome.tabs.onUpdated.removeListener(onUpd); resolve(v); } };
      var onUpd = function (id, info) {
        if (id === tabId && info.status === 'complete') {
          setTimeout(function () { finish(true); }, 900);   // 给微信前端渲染留点时间
        }
      };
      chrome.tabs.onUpdated.addListener(onUpd);
      setTimeout(function () { finish(false); }, timeoutMs || 25000);
    });
  }

  function extractInTab(tabId) {
    return new Promise(function (resolve) {
      chrome.tabs.sendMessage(tabId, { type: 'WJE_EXTRACT' }, function (resp) {
        if (!chrome.runtime.lastError && resp && resp.ok) return resolve(resp.result);
        // 内容脚本没注入 → 手动注入再试（顺序须与 manifest 一致）
        var files = [
          'src/core/rules.js', 'src/core/classify.js',
          'src/core/profiles/literature.js', 'src/core/parse.js', 'src/core/links.js', 'src/core/insights.js',
          'src/core/profiles/recruit.js', 'src/core/profiles/general.js',
          'src/core/fields.js', 'src/core/format.js', 'src/core/extract.js',
          'src/content/panel.js', 'src/content/content.js'
        ];
        chrome.scripting.executeScript({ target: { tabId: tabId }, files: files }, function () {
          if (chrome.runtime.lastError) return resolve(null);
          chrome.tabs.sendMessage(tabId, { type: 'WJE_EXTRACT' }, function (resp2) {
            if (chrome.runtime.lastError || !resp2 || !resp2.ok) return resolve(null);
            resolve(resp2.result);
          });
        });
      });
    });
  }

  async function tabMode(url) {
    var tab = await openTab(url);
    if (!tab) throw new Error('无法打开标签页');
    try {
      await waitTabComplete(tab.id, 25000);
      var res = await extractInTab(tab.id);
      if (!res) throw new Error('标签页里未解析到内容');
      res.meta.url = url;
      return res;
    } finally {
      await closeTab(tab.id);
    }
  }

  /* ------------------------------ 运行 ------------------------------ */

  async function runOne(job, useTabMode, delay) {
    job.status = 'run';
    render();
    try {
      job.result = useTabMode ? await tabMode(job.url) : await fetchMode(job.url);
      job.status = 'ok';
      job.error = null;
    } catch (err) {
      job.status = 'err';
      job.error = String(err && err.message || err);
    }
    render();
    if (delay > 0 && !abort) await sleep(delay);
  }

  async function run() {
    var urls = parseUrls($('urls').value);
    if (!urls.length) {
      alert('没有识别到有效的微信公众号文章链接。\n请粘贴形如 https://mp.weixin.qq.com/s/xxxx 的地址。');
      return;
    }
    var useTabMode = $('tabMode').checked;
    var delay = Math.max(0, parseInt($('delay').value, 10) || 0);

    jobs = urls.map(function (u) { return { url: u, status: 'wait', result: null, error: null }; });
    running = true;
    abort = false;
    $('run').disabled = true;
    $('stop').disabled = false;
    render();

    for (var i = 0; i < jobs.length; i++) {
      if (abort) { jobs[i].status = 'wait'; continue; }
      await runOne(jobs[i], useTabMode, delay);
    }

    running = false;
    $('run').disabled = false;
    $('stop').disabled = true;
    render();
  }

  /* ------------------------------ 渲染 ------------------------------ */

  function stats() {
    var ok = jobs.filter(function (j) { return j.status === 'ok'; }).length;
    var err = jobs.filter(function (j) { return j.status === 'err'; }).length;
    var wait = jobs.filter(function (j) { return j.status === 'wait'; }).length;
    var processed = ok + err;
    $('s-total').textContent = jobs.length;
    $('s-ok').textContent = ok;
    $('s-fail').textContent = err;
    $('s-wait').textContent = wait;
    $('prog').style.width = (jobs.length ? Math.round(processed / jobs.length * 100) : 0) + '%';
  }

  function statusPill(j) {
    if (j.status === 'wait') return '<span class="pill wait">待处理</span>';
    if (j.status === 'run') return '<span class="pill run">抓取中…</span>';
    if (j.status === 'err') return '<span class="pill err">失败</span>';
    var kind = j.result.meta.articleKind;
    if (kind === 'image') return '<span class="pill warn">图片型</span>';
    if (kind === 'mixed') return '<span class="pill warn">图文混合</span>';
    return '<span class="pill ok">已提取</span>';
  }

  function cell(j, fn) {
    if (j.status !== 'ok' || !j.result) return '';
    try { return fn(j.result) || ''; } catch (e) { return ''; }
  }

  function render() {
    stats();
    if (!jobs.length) {
      $('tableBox').innerHTML = '<div class="empty">还没有结果。粘贴链接后点「开始抓取」。</div>';
      return;
    }
    var rows = jobs.map(function (j, i) {
      var det = cell(j, function (r) { return r.detection ? r.detection.activeProfile : ''; });
      var detLabel = cell(j, function (r) { return r.detection ? r.detection.label : ''; });
      var org = cell(j, function (r) { return r.fields.org ? r.fields.org.value : ''; });
      var paper = cell(j, function (r) {
        var p = r.fields.paper;
        return p ? (p.title || p.doi || '') : '';
      });
      var paperMeta = cell(j, function (r) {
        var p = r.fields.paper;
        if (!p) return '';
        return [p.journal, p.year, p.doi].filter(Boolean).join(' · ');
      });
      var batch = cell(j, function (r) { return r.fields.batch ? r.fields.batch.value : ''; });
      var deadline = cell(j, function (r) { return r.fields.deadline ? r.fields.deadline.value : ''; });
      var best = j.status === 'ok' && j.result.links.best ? j.result.links.best : null;
      var applies = j.status === 'ok' ? (j.result.links.primary || j.result.links.apply || []).slice(0, 2) : [];
      var links = applies.map(function (l) {
        return '<a href="' + esc(l.url) + '" target="_blank" rel="noopener noreferrer">' + esc(l.url) + '</a>';
      }).join('<br>');
      if (!links && best) links = '<a href="' + esc(best.url) + '" target="_blank" rel="noopener noreferrer">' + esc(best.url) + '</a>';

      // 主列：招聘帖显示单位，文献帖显示论文标题
      var isLit = det === 'literature' || (det === 'hybrid' && paper);
      var mainCell = isLit
        ? '<b>' + esc(paper) + '</b>' + (paperMeta ? '<br><span style="color:#8a9099">' + esc(paperMeta) + '</span>' : '')
        : '<b>' + esc(org) + '</b>' + (batch ? '<br><span style="color:#8a9099">' + esc(batch) + '</span>' : '');

      return '<tr class="done">' +
        '<td>' + (i + 1) + '</td>' +
        '<td>' + statusPill(j) + (detLabel ? '<br><span class="pill ' + esc(det) + '">' + esc(detLabel) + '</span>' : '') + '</td>' +
        '<td>' + mainCell + '</td>' +
        '<td>' + esc(isLit ? (cell(j, function (r) { return r.fields.paper && r.fields.paper.year ? String(r.fields.paper.year) : ''; })) : deadline) + '</td>' +
        '<td class="u">' + (links || '<span style="color:#8a9099">—</span>') + '</td>' +
        '<td class="u">' + (j.status === 'err'
          ? '<span class="err">' + esc(j.error) + '</span>'
          : '<a href="' + esc(j.url) + '" target="_blank" rel="noopener noreferrer">' + esc(j.url.replace(/^https:\/\/mp\.weixin\.qq\.com/, '')) + '</a>') +
        '</td>' +
        '</tr>';
    }).join('');

    $('tableBox').innerHTML =
      '<div style="overflow:auto;max-height:620px"><table>' +
      '<thead><tr><th>#</th><th>状态 / 类型</th><th>招聘主体 · 论文标题</th><th>截止 · 年份</th><th>关键链接</th><th>原文</th></tr></thead>' +
      '<tbody>' + rows + '</tbody></table></div>';
  }

  /* ------------------------------ 导出 ------------------------------ */

  function results() { return jobs.filter(function (j) { return j.status === 'ok' && j.result; }).map(function (j) { return j.result; }); }

  function download(name, content, mime) {
    var blob = new Blob([content], { type: mime || 'text/plain;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 5000);
  }

  function stamp() {
    var d = new Date();
    var p = function (n) { return (n < 10 ? '0' : '') + n; };
    return d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + '-' + p(d.getHours()) + p(d.getMinutes());
  }

  function needResults() {
    if (!results().length) { alert('还没有成功抓取的结果。'); return false; }
    return true;
  }

  function init() {
    $('run').addEventListener('click', run);
    $('stop').addEventListener('click', function () { abort = true; $('stop').disabled = true; });
    $('clear').addEventListener('click', function () {
      if (running) return;
      jobs = [];
      $('urls').value = '';
      render();
    });

    $('dl-csv').addEventListener('click', function () {
      if (!needResults()) return;
      download('公众号招聘-' + stamp() + '.csv', '\ufeff' + F.toCSV(results()), 'text/csv;charset=utf-8');
    });
    $('dl-md').addEventListener('click', function () {
      if (!needResults()) return;
      var md = results().map(function (r) { return F.toMarkdown(r); }).join('\n\n---\n\n');
      download('公众号招聘-' + stamp() + '.md', md, 'text/markdown;charset=utf-8');
    });
    $('dl-json').addEventListener('click', function () {
      if (!needResults()) return;
      download('公众号招聘-' + stamp() + '.json', JSON.stringify(results(), null, 2), 'application/json;charset=utf-8');
    });
    $('copy-links').addEventListener('click', function () {
      if (!needResults()) return;
      var all = [];
      results().forEach(function (r) {
        r.links.apply.forEach(function (l) { if (all.indexOf(l.url) === -1) all.push(l.url); });
      });
      navigator.clipboard.writeText(all.join('\n')).then(function () { alert('已复制 ' + all.length + ' 条投递链接。'); });
    });

    // 允许用 ?urls=... 预填
    var pre = new URLSearchParams(location.search).get('urls');
    if (pre) $('urls').value = decodeURIComponent(pre).split(',').join('\n');
  }

  document.addEventListener('DOMContentLoaded', init);
})();
