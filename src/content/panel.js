/*!
 * 微信求职信息提取器 — 页面内面板 (panel.js)
 * 使用 Shadow DOM 隔离样式，避免与微信页面 CSS 冲突。
 */
(function (root) {
  'use strict';

  var CSS = [
    ':host { all: initial; }',
    '* { box-sizing: border-box; }',
    '.fab { position: fixed; right: 18px; bottom: 88px; z-index: 2147483000;',
    '  display: flex; align-items: center; gap: 6px; height: 40px; padding: 0 14px;',
    '  border: 0; border-radius: 20px; cursor: pointer;',
    '  background: linear-gradient(135deg,#07c160,#05a352); color: #fff;',
    '  font: 600 13px/1 -apple-system,"PingFang SC","Microsoft YaHei",sans-serif;',
    '  box-shadow: 0 6px 20px rgba(7,193,96,.35); transition: transform .15s, box-shadow .15s; }',
    '.fab:hover { transform: translateY(-2px); box-shadow: 0 10px 26px rgba(7,193,96,.45); }',
    '.fab.busy { opacity: .7; cursor: progress; }',

    '.panel { position: fixed; top: 0; right: 0; width: 384px; max-width: 96vw; height: 100vh;',
    '  z-index: 2147483001; display: flex; flex-direction: column;',
    '  background: #fff; color: #1f2329;',
    '  font: 13px/1.6 -apple-system,"PingFang SC","Microsoft YaHei",sans-serif;',
    '  box-shadow: -8px 0 32px rgba(0,0,0,.18); transform: translateX(102%);',
    '  transition: transform .22s cubic-bezier(.22,.61,.36,1); }',
    '.panel.open { transform: translateX(0); }',

    '.hd { flex: 0 0 auto; padding: 14px 16px 12px; background: #f7f8fa; border-bottom: 1px solid #eceef1; }',
    '.hd-row { display: flex; align-items: flex-start; gap: 8px; }',
    '.hd h1 { margin: 0; font-size: 14px; font-weight: 700; line-height: 1.45; flex: 1; }',
    '.hd .meta { margin-top: 6px; font-size: 11.5px; color: #8a9099; }',
    '.x { flex: 0 0 auto; width: 26px; height: 26px; border: 0; border-radius: 6px; background: transparent;',
    '  color: #8a9099; font-size: 18px; line-height: 1; cursor: pointer; }',
    '.x:hover { background: #e9ebef; color: #1f2329; }',

    '.chips { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 10px; }',
    '.chip { padding: 3px 9px; border-radius: 999px; font-size: 11.5px; font-weight: 600;',
    '  background: #e8f7ee; color: #05874a; }',
    '.chip.warn { background: #fff4e5; color: #b76b00; }',
    '.chip.info { background: #eef2ff; color: #3b5bdb; }',

    '.bd { flex: 1 1 auto; overflow-y: auto; padding: 12px 16px 24px; }',
    '.bd::-webkit-scrollbar { width: 8px; }',
    '.bd::-webkit-scrollbar-thumb { background: #d8dbe0; border-radius: 4px; }',

    '.sec { margin-bottom: 16px; }',
    '.sec > h2 { margin: 0 0 8px; font-size: 12px; font-weight: 700; color: #5b6270;',
    '  letter-spacing: .04em; display: flex; align-items: center; gap: 6px; }',
    '.sec > h2::after { content: ""; flex: 1; height: 1px; background: #eceef1; }',

    'table.kv { width: 100%; border-collapse: collapse; }',
    'table.kv td { padding: 5px 0; vertical-align: top; border-bottom: 1px dashed #f0f1f3; }',
    'table.kv td.k { width: 74px; color: #8a9099; white-space: nowrap; }',
    'table.kv td.v { color: #1f2329; word-break: break-word; }',
    '.conf { font-size: 10.5px; color: #b76b00; margin-left: 4px; }',

    '.link { border: 1px solid #eceef1; border-radius: 8px; padding: 9px 10px; margin-bottom: 8px; background: #fcfcfd; }',
    '.link.best { border-color: #9fe0bd; background: #f4fdf7; }',
    '.link .u { display: block; color: #0b6bcb; text-decoration: none; word-break: break-all; font-size: 12px; }',
    '.link .u:hover { text-decoration: underline; }',
    '.link .r { margin-top: 5px; font-size: 11px; color: #8a9099; }',
    '.acts { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 7px; }',

    'button.b { border: 1px solid #d8dbe0; background: #fff; color: #1f2329; border-radius: 6px;',
    '  padding: 4px 10px; font-size: 11.5px; cursor: pointer; font-family: inherit; }',
    'button.b:hover { border-color: #07c160; color: #05874a; }',
    'button.b.primary { background: #07c160; border-color: #07c160; color: #fff; font-weight: 600; }',
    'button.b.primary:hover { background: #05a352; color: #fff; }',

    '.quote { margin: 0 0 6px; padding: 7px 10px; background: #f7f8fa; border-left: 3px solid #07c160;',
    '  border-radius: 0 6px 6px 0; font-size: 12px; color: #40454d; }',

    '.warn { padding: 8px 10px; border-radius: 6px; background: #fff8e6; border: 1px solid #ffe2a8;',
    '  color: #8a6100; font-size: 11.5px; margin-bottom: 6px; }',

    '.ft { flex: 0 0 auto; padding: 10px 16px; border-top: 1px solid #eceef1; background: #f7f8fa;',
    '  display: flex; flex-wrap: wrap; gap: 6px; }',
    '.ft button.b { flex: 1 1 auto; }',

    '.imgs { display: flex; flex-wrap: wrap; gap: 6px; }',
    '.imgs img { width: 62px; height: 62px; object-fit: cover; border-radius: 6px; border: 1px solid #eceef1; cursor: zoom-in; }',
    '.empty { color: #8a9099; font-size: 12px; padding: 8px 0; }',
    '.toast { position: fixed; right: 24px; bottom: 140px; z-index: 2147483002; padding: 8px 14px;',
    '  border-radius: 8px; background: rgba(31,35,41,.92); color: #fff; font-size: 12px;',
    '  opacity: 0; transform: translateY(6px); transition: opacity .18s, transform .18s; pointer-events: none; }',
    '.toast.show { opacity: 1; transform: translateY(0); }'
  ].join('\n');

  var esc = function (s) {
    return String(s === undefined || s === null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  };

  var state = { host: null, shadow: null, open: false, result: null, busy: false };

  function ensureHost() {
    if (state.host && document.documentElement.contains(state.host)) return;
    var host = document.createElement('div');
    host.id = 'wje-host';
    host.style.cssText = 'all:initial;position:static;';
    var shadow = host.attachShadow({ mode: 'open' });
    shadow.innerHTML =
      '<style>' + CSS + '</style>' +
      '<button class="fab" part="fab" title="提取本页招聘关键信息（Alt+Shift+E）">🔍 提取招聘信息</button>' +
      '<aside class="panel" role="dialog" aria-label="微信求职信息提取结果">' +
      '  <div class="hd">' +
      '    <div class="hd-row"><h1 class="title">提取中…</h1><button class="x" title="关闭">×</button></div>' +
      '    <div class="meta"></div>' +
      '    <div class="chips"></div>' +
      '  </div>' +
      '  <div class="bd"></div>' +
      '  <div class="ft"></div>' +
      '</aside>' +
      '<div class="toast"></div>';
    (document.body || document.documentElement).appendChild(host);

    state.host = host;
    state.shadow = shadow;

    shadow.querySelector('.fab').addEventListener('click', function () { toggle(); });
    shadow.querySelector('.x').addEventListener('click', function () { hide(); });
    shadow.querySelector('.bd').addEventListener('click', onBodyClick);
    shadow.querySelector('.ft').addEventListener('click', onFooterClick);
  }

  function toast(msg) {
    var el = state.shadow.querySelector('.toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { el.classList.remove('show'); }, 1600);
  }

  function copy(text, label) {
    var done = function () { toast((label || '已复制') + ' ✓'); };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, function () { fallbackCopy(text, done); });
    } else {
      fallbackCopy(text, done);
    }
  }

  function fallbackCopy(text, done) {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.style.cssText = 'position:fixed;left:-9999px;top:0;';
    (document.body || document.documentElement).appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); done(); } catch (e) { toast('复制失败，请手动选择'); }
    ta.remove();
  }

  function download(name, content, mime) {
    var blob = new Blob([content], { type: mime || 'text/plain;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
  }

  /* ------------------------------ 渲染 ------------------------------ */

  function render(result) {
    state.result = result;
    var sh = state.shadow;
    var F = root.WJE.format;
    var f = result.fields;

    sh.querySelector('.title').textContent = result.meta.title || '(未识别到标题)';
    sh.querySelector('.meta').textContent = [
      result.meta.account && ('公众号：' + result.meta.account),
      result.meta.publishTime && ('发布：' + result.meta.publishTime),
      result.meta.articleKind === 'image' ? '图片型推文' : (result.meta.articleKind === 'mixed' ? '图文混合' : '文字型推文')
    ].filter(Boolean).join('　·　');

    var chips = [];
    if (f.org) chips.push('<span class="chip">' + esc(f.org.value) + '</span>');
    if (f.batch) chips.push('<span class="chip info">' + esc(f.batch.value) + '</span>');
    if (f.recruitType) chips.push('<span class="chip info">' + esc(f.recruitType.value) + '</span>');
    if (f.deadline) chips.push('<span class="chip warn">截止 ' + esc(f.deadline.value) + '</span>');
    if (result.links.best) chips.push('<span class="chip">' + esc(result.links.best.host) + '</span>');
    sh.querySelector('.chips').innerHTML = chips.join('');

    var html = [];

    // 投递入口
    html.push('<div class="sec"><h2>投递入口</h2>');
    if (result.links.apply.length) {
      result.links.apply.forEach(function (l, i) {
        html.push(
          '<div class="link' + (i === 0 ? ' best' : '') + '">' +
          '<a class="u" href="' + esc(l.url) + '" target="_blank" rel="noopener noreferrer">' + esc(l.url) + '</a>' +
          '<div class="r">' + esc(F.kindLabel(l.kind)) + '　评分 ' + l.score +
          (l.reasons && l.reasons.length ? '　·　' + esc(l.reasons.slice(0, 2).join('；')) : '') + '</div>' +
          '<div class="acts">' +
          '<button class="b primary" data-act="open" data-url="' + esc(l.url) + '">打开</button>' +
          '<button class="b" data-act="copy-url" data-url="' + esc(l.url) + '">复制链接</button>' +
          '</div></div>'
        );
      });
    } else {
      html.push('<div class="empty">未识别到投递入口' +
        (result.meta.articleKind === 'image' ? '。本篇是图片型推文，链接可能印在长图里，请展开下方图片查看或使用二维码。' : '。') +
        '</div>');
    }
    html.push('</div>');

    // 阅读原文
    if (result.links.readOriginal) {
      html.push('<div class="sec"><h2>阅读原文跳转</h2>' +
        '<div class="link"><a class="u" href="' + esc(result.links.readOriginal.url) + '" target="_blank" rel="noopener noreferrer">' +
        esc(result.links.readOriginal.url) + '</a>' +
        '<div class="r">来源：' + esc(result.links.readOriginal.from) + '</div>' +
        '<div class="acts"><button class="b" data-act="copy-url" data-url="' + esc(result.links.readOriginal.url) + '">复制链接</button></div>' +
        '</div></div>');
    }

    // 字段表
    var rows = [];
    var push = function (k, v, conf) {
      if (v === undefined || v === null || v === '') return;
      rows.push('<tr><td class="k">' + k + '</td><td class="v">' + esc(v) +
        (conf ? '<span class="conf">' + esc(conf) + '</span>' : '') + '</td></tr>');
    };
    push('招聘主体', f.org && f.org.value, f.org && f.org.confidence !== 'high' ? '（待确认）' : '');
    if (f.org && f.org.aliases && f.org.aliases.length) push('全称', f.org.aliases.join('、'));
    push('招聘批次', f.batch && f.batch.value);
    push('招聘类型', f.recruitType && f.recruitType.value);
    push('投递截止', f.deadline && f.deadline.value, f.deadline && f.deadline.confidence === 'medium' ? '（年份据发布时间推断）' : '');
    push('学历要求', f.education && f.education.list.join('、'), f.education && f.education.minRequirement ? '（' + f.education.minRequirement + '及以上）' : '');
    push('工作地点', f.locations && (f.locations.list.slice(0, 18).join('、') + (f.locations.list.length > 18 ? ' 等 ' + f.locations.list.length + ' 地' : '')));
    push('招聘岗位', f.positions && f.positions.list.join('、'));
    push('需求专业', f.majors && f.majors.list.join('、'));
    push('招聘人数', f.headcount && String(f.headcount.value));
    push('联系方式', f.contacts && [].concat(f.contacts.emails, f.contacts.phones).join('　'));
    if (rows.length) html.push('<div class="sec"><h2>关键字段</h2><table class="kv">' + rows.join('') + '</table></div>');

    // 告警
    if (result.warnings.length) {
      html.push('<div class="sec"><h2>提示</h2>' +
        result.warnings.map(function (w) { return '<div class="warn">⚠️ ' + esc(w) + '</div>'; }).join('') + '</div>');
    }

    // 关键句
    if (result.keySentences.length) {
      html.push('<div class="sec"><h2>关键句摘录</h2>' +
        result.keySentences.slice(0, 8).map(function (s) { return '<p class="quote">' + esc(s) + '</p>'; }).join('') + '</div>');
    }

    // 图片（图片型推文时最关键）
    if (result.meta.articleKind !== 'text' && result.images.length) {
      html.push('<div class="sec"><h2>正文图片（' + result.meta.imageCount + '）</h2><div class="imgs">' +
        result.images.slice(0, 12).map(function (im) {
          return '<img src="' + esc(im.src) + '" alt="' + esc(im.alt || '') + '" data-act="zoom" data-url="' + esc(im.src) + '" loading="lazy">';
        }).join('') + '</div></div>');
    }

    sh.querySelector('.bd').innerHTML = html.join('');

    sh.querySelector('.ft').innerHTML =
      '<button class="b primary" data-act="copy-md">复制 Markdown</button>' +
      '<button class="b" data-act="copy-json">复制 JSON</button>' +
      '<button class="b" data-act="copy-links">只复制投递链接</button>' +
      '<button class="b" data-act="dl-md">下载 .md</button>' +
      '<button class="b" data-act="dl-json">下载 .json</button>' +
      '<button class="b" data-act="highlight">高亮正文关键词</button>';
  }

  function onBodyClick(ev) {
    var t = ev.target.closest('[data-act]');
    if (!t) return;
    var act = t.getAttribute('data-act');
    var url = t.getAttribute('data-url');
    if (act === 'copy-url') { copy(url, '链接已复制'); }
    else if (act === 'open') { window.open(url, '_blank', 'noopener'); }
    else if (act === 'zoom') { window.open(url, '_blank', 'noopener'); }
  }

  function onFooterClick(ev) {
    var t = ev.target.closest('[data-act]');
    if (!t || !state.result) return;
    var F = root.WJE.format;
    var res = state.result;
    var act = t.getAttribute('data-act');
    var base = (res.meta.title || 'wechat-job').replace(/[\\/:*?"<>|\s]+/g, '_').slice(0, 60);

    if (act === 'copy-md') copy(F.toMarkdown(res), 'Markdown 已复制');
    else if (act === 'copy-json') copy(F.toJSON(res), 'JSON 已复制');
    else if (act === 'copy-links') copy(F.toLinkList(res), '投递链接已复制');
    else if (act === 'dl-md') download(base + '.md', F.toMarkdown(res), 'text/markdown;charset=utf-8');
    else if (act === 'dl-json') download(base + '.json', F.toJSON(res), 'application/json;charset=utf-8');
    else if (act === 'highlight') highlight();
  }

  /** 在正文里高亮关键词，便于快速定位投递信息。 */
  function highlight() {
    var RE = /(投递|网申|报名|截止|阅读原文|招聘官网|投递方式|投递入口|简历投递|申请|官网|二维码)/g;
    var box = document.querySelector('#js_content') || document.querySelector('.rich_media_content');
    if (!box) { toast('未找到正文容器'); return; }
    var n = 0;
    var walker = document.createTreeWalker(box, NodeFilter.SHOW_TEXT, null);
    var nodes = [];
    var node;
    while ((node = walker.nextNode())) {
      if (node.parentNode && /^(SCRIPT|STYLE|MARK)$/.test(node.parentNode.nodeName)) continue;
      if (RE.test(node.nodeValue)) nodes.push(node);
      RE.lastIndex = 0;
    }
    nodes.slice(0, 300).forEach(function (tn) {
      var frag = document.createDocumentFragment();
      var text = tn.nodeValue;
      var last = 0, m;
      RE.lastIndex = 0;
      while ((m = RE.exec(text)) !== null) {
        if (m.index > last) frag.appendChild(document.createTextNode(text.slice(last, m.index)));
        var mk = document.createElement('mark');
        mk.textContent = m[0];
        mk.style.cssText = 'background:#fff3a3;padding:0 1px;border-radius:2px;';
        frag.appendChild(mk);
        last = m.index + m[0].length;
        n++;
      }
      if (last < text.length) frag.appendChild(document.createTextNode(text.slice(last)));
      if (tn.parentNode) tn.parentNode.replaceChild(frag, tn);
    });
    toast(n ? ('已高亮 ' + n + ' 处关键词') : '未找到可高亮的匹配');
  }

  /* ------------------------------ 控制 ------------------------------ */

  function show(result) {
    ensureHost();
    if (result) render(result);
    state.shadow.querySelector('.panel').classList.add('open');
    state.open = true;
  }

  function hide() {
    if (!state.shadow) return;
    state.shadow.querySelector('.panel').classList.remove('open');
    state.open = false;
  }

  function toggle() {
    if (state.open) hide();
    else if (state.result) show();
    else extractAndShow();
  }

  function setBusy(b) {
    state.busy = b;
    if (!state.shadow) return;
    var fab = state.shadow.querySelector('.fab');
    if (fab) {
      fab.classList.toggle('busy', b);
      fab.textContent = b ? '⏳ 提取中…' : '🔍 提取招聘信息';
    }
  }

  function extractAndShow() {
    ensureHost();
    setBusy(true);
    // 抓取前先展开被折叠的正文，避免漏内容
    expandCollapsed();
    setTimeout(function () {
      var res = root.WJE.extract.fromDocument(document, { pageUrl: location.href, keepRaw: false });
      setBusy(false);
      show(res);
    }, 60);
  }

  /** 微信正文里偶尔有“展开全文”，点一下再解析。 */
  function expandCollapsed() {
    try {
      var btn = document.querySelector('#js_content .js_expand_article, #js_expand_article, .rich_media_content .expand_article');
      if (btn && typeof btn.click === 'function') btn.click();
    } catch (e) { /* 忽略 */ }
  }

  root.WJE = root.WJE || {};
  root.WJE.panel = {
    ensureHost: ensureHost,
    show: show,
    hide: hide,
    toggle: toggle,
    render: render,
    setBusy: setBusy,
    extractAndShow: extractAndShow,
    highlight: highlight,
    toast: toast,
    copy: copy,
    state: state
  };
})(typeof window !== 'undefined' ? window : globalThis);
