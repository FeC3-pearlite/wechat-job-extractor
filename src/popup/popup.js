/*!
 * 微信推文关键信息提取器 — 工具栏弹窗 (popup.js)
 */
(function () {
  'use strict';

  var WJE = window.WJE;
  var F = WJE.format;
  var current = null;

  var $ = function (id) { return document.getElementById(id); };

  /** 与 manifest.content_scripts.js 保持一致的注入顺序（links.js 依赖 profiles/literature.js）。 */
  var INJECT_FILES = [
    'src/core/rules.js', 'src/core/classify.js',
    'src/core/profiles/literature.js', 'src/core/parse.js', 'src/core/links.js', 'src/core/insights.js',
    'src/core/profiles/recruit.js', 'src/core/profiles/general.js',
    'src/core/fields.js', 'src/core/format.js', 'src/core/extract.js',
    'src/content/panel.js', 'src/content/content.js'
  ];

  function esc(s) {
    return String(s === undefined || s === null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function toast(msg) {
    var el = $('toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { el.classList.remove('show'); }, 1500);
  }

  function copy(text, label) {
    navigator.clipboard.writeText(text).then(
      function () { toast((label || '已复制') + ' ✓'); },
      function () { toast('复制失败'); }
    );
  }

  function activeTab() {
    return new Promise(function (resolve) {
      chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) { resolve(tabs && tabs[0]); });
    });
  }

  function sendToTab(tabId, msg) {
    return new Promise(function (resolve) {
      chrome.tabs.sendMessage(tabId, msg, function (resp) {
        if (chrome.runtime.lastError) return resolve(null);
        resolve(resp);
      });
    });
  }

  /** 内容脚本未注入时（例如刚安装扩展就打开的老页面），动态注入一次再试。 */
  function injectAndRetry(tabId) {
    return new Promise(function (resolve) {
      chrome.scripting.executeScript({ target: { tabId: tabId }, files: INJECT_FILES }, function () {
        if (chrome.runtime.lastError) return resolve(null);
        sendToTab(tabId, { type: 'WJE_EXTRACT' }).then(resolve);
      });
    });
  }

  function render(res) {
    current = res;
    var f = res.fields;
    var p = f.paper;
    var det = res.detection || {};
    var html = [];

    if (det.label) {
      html.push('<h2>识别类型</h2><div class="typebox"><span class="badge ' + esc(det.activeProfile || '') + '">' +
        esc(det.label) + '</span></div>');
    }

    if (p && (p.title || p.doi)) {
      html.push('<h2>论文信息</h2><table class="kv">');
      var prow = function (k, v) {
        if (!v) return;
        html.push('<tr><td class="k">' + k + '</td><td>' + esc(v) + '</td></tr>');
      };
      prow('标题', p.title);
      if (p.titleEn && p.titleEn !== p.title) prow('英文标题', p.titleEn);
      prow('作者', p.authors && p.authors.join(', '));
      prow('通讯作者', p.correspondingAuthor && p.correspondingAuthor.join(', '));
      prow('期刊', p.journal);
      prow('年份', p.year);
      prow('卷期页', [p.volume, p.issue, p.pages].filter(Boolean).join(' / '));
      prow('DOI', p.doi);
      prow('arXiv', p.arxiv);
      prow('影响因子', p.impactFactor);
      prow('分区', [p.jcr, p.cas].filter(Boolean).join(' / '));
      html.push('</table>');
      if (p.citations && p.citations.gbt7714) {
        html.push('<h2>GB/T 7714 引用</h2><pre class="cite">' + esc(p.citations.gbt7714) + '</pre>');
      }
    }

    if (f.org || f.batch || f.deadline) {
      html.push('<h2>关键字段</h2><table class="kv">');
      var row = function (k, v) {
        if (!v) return;
        html.push('<tr><td class="k">' + k + '</td><td>' + esc(v) + '</td></tr>');
      };
      row('招聘主体', f.org && f.org.value);
      row('批次', f.batch && f.batch.value);
      row('类型', f.recruitType && f.recruitType.value);
      row('投递截止', f.deadline && f.deadline.value);
      row('学历', f.education && f.education.list.join('、'));
      row('地点', f.locations && f.locations.list.slice(0, 10).join('、'));
      row('岗位', f.positions && f.positions.list.slice(0, 10).join('、'));
      row('专业', f.majors && f.majors.list.slice(0, 10).join('、'));
      row('联系方式', f.contacts && [].concat(f.contacts.emails || [], f.contacts.phones || []).join('　'));
      html.push('</table>');
    }

    var lit = (det.activeProfile === 'literature') || (det.activeProfile === 'hybrid' && p && p.title);
    html.push('<h2>' + (lit ? '原文链接' : '投递入口') + '</h2>');
    var primary = res.links.primary || res.links.apply || [];
    if (primary.length) {
      primary.slice(0, 4).forEach(function (l) {
        html.push('<span class="tag">' + esc(F.kindLabel(l.kind)) + '</span>' +
          '<a class="link" href="' + esc(l.url) + '" target="_blank" rel="noopener noreferrer">' + esc(l.url) + '</a>');
      });
    } else {
      html.push('<div class="empty">未识别到' + (lit ? '原文链接' : '投递入口') +
        (res.meta.articleKind === 'image' ? '（图片型推文，链接可能在长图中）' : '') + '</div>');
    }

    if (res.links.readOriginal) {
      html.push('<h2>阅读原文</h2><a class="link" href="' + esc(res.links.readOriginal.url) +
        '" target="_blank" rel="noopener noreferrer">' + esc(res.links.readOriginal.url) + '</a>');
    }

    if (res.warnings.length) {
      html.push('<h2>提示</h2>');
      res.warnings.forEach(function (w) { html.push('<div class="warn">⚠️ ' + esc(w) + '</div>'); });
    }

    $('body').innerHTML = html.join('');
    $('sub').textContent = (res.meta.account ? res.meta.account + ' · ' : '') +
      (res.meta.publishTime || '') + (res.meta.title ? ' · ' + res.meta.title.slice(0, 26) : '');
  }

  function showNotArticle(tab) {
    current = null;
    $('sub').textContent = '当前页面不是微信公众号文章';
    $('body').innerHTML =
      '<div class="empty" style="margin-bottom:10px">本扩展用于微信公众号推文（mp.weixin.qq.com/s/…），自动识别招聘帖与文献帖。<br>' +
      (tab && tab.url ? '当前页面：<br><span style="word-break:break-all;color:#8a9099">' + esc(tab.url.slice(0, 120)) + '</span>' : '') +
      '</div>' +
      '<button class="primary" id="btn-force" style="width:100%">仍然尝试在本页提取</button>';
    var btn = $('btn-force');
    if (btn) {
      btn.addEventListener('click', function () {
        $('body').innerHTML = '<div class="empty">正在提取…</div>';
        chrome.scripting.executeScript({ target: { tabId: tab.id }, files: INJECT_FILES }, function () {
          if (chrome.runtime.lastError) {
            $('body').innerHTML = '<div class="empty">提取失败：本页禁止注入脚本（如 chrome:// 或扩展商店页面）。</div>';
            return;
          }
          sendToTab(tab.id, { type: 'WJE_EXTRACT' }).then(function (resp) {
            if (resp && resp.ok) render(resp.result);
            else $('body').innerHTML = '<div class="empty">提取失败：本页可能不包含可解析的文章正文。</div>';
          });
        });
      });
    }
  }

  function guard(fn) {
    return function () {
      if (!current) return toast('还没有提取结果');
      fn(current);
    };
  }

  function init() {
    $('btn-md').addEventListener('click', guard(function (r) { copy(F.toMarkdown(r), 'Markdown 已复制'); }));
    $('btn-json').addEventListener('click', guard(function (r) { copy(F.toJSON(r), 'JSON 已复制'); }));
    $('btn-links').addEventListener('click', guard(function (r) { copy(F.toLinkList(r), '投递链接已复制'); }));

    $('btn-panel').addEventListener('click', function () {
      activeTab().then(function (tab) {
        if (!tab || tab.id == null) return;
        sendToTab(tab.id, { type: 'WJE_SHOW_PANEL' }).then(function (resp) {
          if (resp && resp.ok) window.close();
          else toast('请在公众号文章页使用');
        });
      });
    });

    $('btn-batch').addEventListener('click', function () {
      chrome.tabs.create({ url: chrome.runtime.getURL('src/batch/batch.html') });
      window.close();
    });

    activeTab().then(function (tab) {
      if (!tab || tab.id == null) return showNotArticle(null);
      var isWechatArticle = /^https:\/\/mp\.weixin\.qq\.com\/s/.test(tab.url || '');
      if (!isWechatArticle) return showNotArticle(tab);

      sendToTab(tab.id, { type: 'WJE_EXTRACT' }).then(function (resp) {
        if (resp && resp.ok) return render(resp.result);
        injectAndRetry(tab.id).then(function (resp2) {
          if (resp2 && resp2.ok) render(resp2.result);
          else showNotArticle(tab);
        });
      });
    });
  }

  document.addEventListener('DOMContentLoaded', init);
})();
