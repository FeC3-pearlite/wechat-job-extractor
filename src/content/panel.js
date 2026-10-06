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

    '.pbar { display: flex; align-items: center; gap: 8px; margin-top: 9px; }',
    '.badge { padding: 3px 10px; border-radius: 999px; font-size: 11.5px; font-weight: 700;',
    '  background: #eef2ff; color: #3b5bdb; white-space: nowrap; }',
    '.badge.recruit { background: #e8f7ee; color: #05874a; }',
    '.badge.literature { background: #f3ecff; color: #6b3fd4; }',
    '.badge.general { background: #f2f3f5; color: #6b7280; }',
    '.badge.hybrid { background: #fff4e5; color: #b76b00; }',
    '.psel { flex: 1; min-width: 0; padding: 3px 6px; border: 1px solid #d8dbe0; border-radius: 6px;',
    '  font: inherit; font-size: 11.5px; color: #40454d; background: #fff; cursor: pointer; }',
    '.psel:focus { outline: none; border-color: #07c160; }',

    '.cite { margin: 0 0 8px; }',
    '.cite .lbl { font-size: 11px; font-weight: 700; color: #5b6270; margin-bottom: 3px; }',
    '.cite pre { margin: 0; padding: 8px 10px; background: #f7f8fa; border: 1px solid #eceef1;',
    '  border-radius: 6px; font: 11.5px/1.6 ui-monospace, Consolas, monospace;',
    '  white-space: pre-wrap; word-break: break-word; color: #24292f; }',
    '.abs { font-size: 12px; color: #40454d; background: #f7f8fa; border-left: 3px solid #6b3fd4;',
    '  border-radius: 0 6px 6px 0; padding: 8px 10px; margin: 0 0 8px; max-height: 220px; overflow-y: auto; }',

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
      '<button class="fab" part="fab" title="提取本页关键信息（Alt+Shift+E）">🔍 提取关键信息</button>' +
      '<aside class="panel" role="dialog" aria-label="微信推文关键信息提取结果">' +
      '  <div class="hd">' +
      '    <div class="hd-row"><h1 class="title">提取中…</h1><button class="x" title="关闭">×</button></div>' +
      '    <div class="meta"></div>' +
      '    <div class="pbar">' +
      '      <span class="badge" title="内容类型自动判别结果">…</span>' +
      '      <select class="psel" title="手动切换提取画像">' +
      '        <option value="">自动判别</option>' +
      '        <option value="recruit">按招聘提取</option>' +
      '        <option value="literature">按文献提取</option>' +
      '        <option value="general">按通用提取</option>' +
      '        <option value="hybrid">招聘 + 文献</option>' +
      '      </select>' +
      '    </div>' +
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
    shadow.querySelector('.psel').addEventListener('change', function (ev) {
      state.forceProfile = ev.target.value || null;
      extractAndShow();
    });
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
    var det = result.detection || { type: 'recruit', label: '招聘求职', confidence: 'medium' };

    sh.querySelector('.title').textContent = result.meta.title || '(未识别到标题)';
    sh.querySelector('.meta').textContent = [
      result.meta.account && ('公众号：' + result.meta.account),
      result.meta.publishTime && ('发布：' + result.meta.publishTime),
      result.meta.articleKind === 'image' ? '图片型推文' : (result.meta.articleKind === 'mixed' ? '图文混合' : '文字型推文')
    ].filter(Boolean).join('　·　');

    // 类型徽标 + 手动切换
    var badge = sh.querySelector('.badge');
    badge.className = 'badge ' + det.activeProfile;
    var confZh = { high: '高', medium: '中', low: '低' }[det.confidence] || det.confidence;
    badge.textContent = det.label + '（' + confZh + '）';
    var s = det.scores || {};
    badge.title = '自动判别：' + det.autoLabel + '\n招聘信号 ' + (s.recruit || 0) + '（基础 ' + (s.recruitBase || 0) + '）' +
      '\n文献信号 ' + (s.literature || 0) + '（基础 ' + (s.literatureBase || 0) + ' + 硬凭据 ' + (s.literatureHard || 0) + '）' +
      '\n' + (det.evidence || []).join('\n');
    var psel = sh.querySelector('.psel');
    psel.value = det.overridden ? det.activeProfile : '';

    var chips = [];
    var html = [];

    if (isLit(result)) renderLiterature(f, det, chips, html);
    if (isRec(result)) renderRecruit(f, chips, html, result);
    if (det.activeProfile === 'general') renderGeneral(f, chips, html);

    // 阅读原文（与主链接重复时不重复展示）
    var read = result.links.readOriginal;
    var bestUrl = result.links.best ? result.links.best.url : '';
    if (read && read.url && read.url !== bestUrl) {
      html.push('<div class="sec"><h2>阅读原文跳转</h2>' +
        '<div class="link"><a class="u" href="' + esc(read.url) + '" target="_blank" rel="noopener noreferrer">' +
        esc(read.url) + '</a>' +
        '<div class="r">来源：' + esc(read.from) + '</div>' +
        '<div class="acts"><button class="b" data-act="copy-url" data-url="' + esc(read.url) + '">复制链接</button></div>' +
        '</div></div>');
    }

    // 图片（图片型推文时最关键）
    if (result.meta.articleKind !== 'text' && result.images.length) {
      html.push('<div class="sec"><h2>正文图片（' + result.meta.imageCount + '）</h2><div class="imgs">' +
        result.images.slice(0, 12).map(function (im) {
          return '<img src="' + esc(im.src) + '" alt="' + esc(im.alt || '') + '" data-act="zoom" data-url="' + esc(im.src) + '" loading="lazy">';
        }).join('') + '</div></div>');
    }

    // 告警
    if (result.warnings.length) {
      html.push('<div class="sec"><h2>提示</h2>' +
        result.warnings.map(function (w) { return '<div class="warn">⚠️ ' + esc(w) + '</div>'; }).join('') + '</div>');
    }

    // 关键句
    if (result.keySentences.length) {
      html.push('<div class="sec"><h2>关键句摘录</h2>' +
        result.keySentences.slice(0, 8).map(function (s2) { return '<p class="quote">' + esc(s2) + '</p>'; }).join('') + '</div>');
    }

    // 判定依据（可折叠）
    if (det.evidence && det.evidence.length) {
      html.push('<div class="sec"><h2>判定依据</h2><div class="r" style="font-size:11.5px;color:#8a9099;line-height:1.8">' +
        det.evidence.map(function (e) { return '· ' + esc(e); }).join('<br>') + '</div></div>');
    }

    sh.querySelector('.chips').innerHTML = chips.join('');
    sh.querySelector('.bd').innerHTML = html.join('');

    // 底部按钮随画像变化
    var ft = '<button class="b primary" data-act="copy-md">复制 Markdown</button>';
    if (isLit(result)) {
      ft += '<button class="b" data-act="copy-cite">复制 GB/T 引用</button>' +
        '<button class="b" data-act="copy-apa">复制 APA</button>' +
        '<button class="b" data-act="copy-bibtex">复制 BibTeX</button>' +
        '<button class="b" data-act="copy-card">复制题录</button>' +
        '<button class="b" data-act="copy-links">复制原文链接</button>';
    } else {
      ft += '<button class="b" data-act="copy-links">复制主要链接</button>';
    }
    ft += '<button class="b" data-act="copy-json">复制 JSON</button>' +
      '<button class="b" data-act="dl-md">下载 .md</button>' +
      '<button class="b" data-act="dl-json">下载 .json</button>' +
      '<button class="b" data-act="highlight">高亮正文关键词</button>';
    sh.querySelector('.ft').innerHTML = ft;
  }

  function isLit(res) {
    var p = res.detection ? res.detection.activeProfile : 'recruit';
    return (p === 'literature' || p === 'hybrid') && res.fields.paper && (res.fields.paper.title || res.fields.paper.doi);
  }
  function isRec(res) {
    var p = res.detection ? res.detection.activeProfile : 'recruit';
    return p === 'recruit' || p === 'hybrid';
  }

  /* ---------------------- 文献渲染 ---------------------- */

  function renderLiterature(f, det, chips, html) {
    var p = f.paper;
    if (p.doi) chips.unshift('<span class="chip info">DOI ' + esc(p.doi) + '</span>');
    if (p.journal) chips.push('<span class="chip">' + esc(p.journal) + (p.year ? ' ' + p.year : '') + '</span>');
    if (p.authors && p.authors.length) chips.push('<span class="chip">' + esc(p.authors[0]) + (p.authors.length > 1 ? ' 等 ' + p.authors.length + ' 人' : '') + '</span>');
    if (p.openAccess) chips.push('<span class="chip">开放获取</span>');

    // 原文链接
    html.push('<div class="sec"><h2>原文链接</h2>');
    if (f && p && (p.doi || p.arxiv)) {
      var ids = [];
      if (p.doi) ids.push('<div class="link"><a class="u" href="https://doi.org/' + esc(p.doi) + '" target="_blank" rel="noopener noreferrer">https://doi.org/' + esc(p.doi) + '</a>' +
        '<div class="r">DOI 解析页（点击直达出版社）</div>' +
        '<div class="acts"><button class="b primary" data-act="open" data-url="https://doi.org/' + esc(p.doi) + '">打开</button>' +
        '<button class="b" data-act="copy-url" data-url="https://doi.org/' + esc(p.doi) + '">复制</button></div></div>');
      if (p.arxiv) ids.push('<div class="link"><a class="u" href="https://arxiv.org/abs/' + esc(p.arxiv) + '" target="_blank" rel="noopener noreferrer">https://arxiv.org/abs/' + esc(p.arxiv) + '</a>' +
        '<div class="r">arXiv 预印本</div></div>');
      html.push(ids.join(''));
    }
    var primary = (state.result.links.primary || []);
    if (primary.length) {
      primary.forEach(function (l, i) {
        if (p && p.doi && l.url.indexOf('doi.org/' + p.doi) !== -1) return;   // 上面已渲染
        html.push('<div class="link' + (i === 0 ? ' best' : '') + '">' +
          '<a class="u" href="' + esc(l.url) + '" target="_blank" rel="noopener noreferrer">' + esc(l.url) + '</a>' +
          '<div class="r">' + esc(root.WJE.format.kindLabel(l.kind)) + '　评分 ' + l.score +
          (l.reasons && l.reasons.length ? '　·　' + esc(l.reasons.slice(0, 2).join('；')) : '') + '</div>' +
          '<div class="acts"><button class="b" data-act="open" data-url="' + esc(l.url) + '">打开</button>' +
          '<button class="b" data-act="copy-url" data-url="' + esc(l.url) + '">复制链接</button></div></div>');
      });
    } else if (!p.doi && !p.arxiv) {
      html.push('<div class="empty">未识别到原文链接。</div>');
    }
    html.push('</div>');

    // 论文信息表
    var rows = [];
    var push = function (k, v) {
      if (v === undefined || v === null || v === '') return;
      rows.push('<tr><td class="k">' + k + '</td><td class="v">' + esc(v) + '</td></tr>');
    };
    push('标题', p.title);
    if (p.titleEn && p.titleEn !== p.title) push('英文标题', p.titleEn);
    if (p.authors && p.authors.length) push('作者', p.authors.join(', '));
    if (p.firstAuthor && p.firstAuthor.length) push('第一作者', p.firstAuthor.join(', '));
    if (p.correspondingAuthor && p.correspondingAuthor.length) push('通讯作者', p.correspondingAuthor.join(', '));
    push('期刊', p.journal);
    var loc = [];
    if (p.year) loc.push(p.year + ' 年');
    if (p.volume) loc.push('第 ' + p.volume + ' 卷');
    if (p.issue) loc.push('第 ' + p.issue + ' 期');
    if (p.pages) loc.push('页 ' + p.pages);
    push('出处', loc.join('，'));
    push('DOI', p.doi);
    push('arXiv', p.arxiv);
    push('PMID', p.pmid);
    push('影响因子', p.impactFactor);
    push('分区', [p.jcr, p.cas].filter(Boolean).join(' / '));
    push('被引', p.citations);
    push('文献类型', p.paperType);
    push('关键词', (p.keywordsZh || []).join('、') || (p.keywordsEn || []).join(', '));
    if (rows.length) html.push('<div class="sec"><h2>论文信息</h2><table class="kv">' + rows.join('') + '</table></div>');

    // 摘要
    if (p.abstractZh || p.abstractEn) {
      html.push('<div class="sec"><h2>摘要</h2>');
      if (p.abstractZh) html.push('<div class="abs">' + esc(p.abstractZh) + '</div>');
      if (p.abstractEn) html.push('<div class="abs" style="border-left-color:#3b5bdb">' + esc(p.abstractEn) + '</div>');
      html.push('</div>');
    }

    // 引用格式
    if (p.citations) {
      html.push('<div class="sec"><h2>引用格式</h2>');
      [['GB/T 7714', p.citations.gbt7714, 'gbt'], ['APA 7th', p.citations.apa, 'apa']].forEach(function (c) {
        if (!c[1]) return;
        html.push('<div class="cite"><div class="lbl">' + c[0] + '</div><pre>' + esc(c[1]) + '</pre>' +
          '<div class="acts"><button class="b" data-act="copy-cite-' + c[2] + '">复制</button></div></div>');
      });
      if (p.citations.bibtex) {
        html.push('<div class="cite"><div class="lbl">BibTeX</div><pre>' + esc(p.citations.bibtex) + '</pre>' +
          '<div class="acts"><button class="b" data-act="copy-cite-bibtex">复制</button></div></div>');
      }
      html.push('</div>');
    }
  }

  /* ---------------------- 招聘渲染 ---------------------- */

  function renderRecruit(f, chips, html, result) {
    if (f.org) chips.push('<span class="chip">' + esc(f.org.value) + '</span>');
    if (f.batch) chips.push('<span class="chip info">' + esc(f.batch.value) + '</span>');
    if (f.recruitType) chips.push('<span class="chip info">' + esc(f.recruitType.value) + '</span>');
    if (f.deadline) chips.push('<span class="chip warn">截止 ' + esc(f.deadline.value) + '</span>');

    html.push('<div class="sec"><h2>投递入口</h2>');
    var primary = result.links.primary || result.links.apply || [];
    if (primary.length) {
      primary.forEach(function (l, i) {
        html.push(
          '<div class="link' + (i === 0 ? ' best' : '') + '">' +
          '<a class="u" href="' + esc(l.url) + '" target="_blank" rel="noopener noreferrer">' + esc(l.url) + '</a>' +
          '<div class="r">' + esc(root.WJE.format.kindLabel(l.kind)) + '　评分 ' + l.score +
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
  }

  /* ---------------------- 通用渲染 ---------------------- */

  function renderGeneral(f, chips, html) {
    if (f.org) chips.push('<span class="chip">' + esc(f.org.value) + '（推测）</span>');
    if (f.timeline && f.timeline.length) chips.push('<span class="chip info">' + f.timeline.length + ' 个日期</span>');

    html.push('<div class="sec"><h2>主要链接</h2>');
    var primary = state.result.links.primary || [];
    if (primary.length) {
      primary.forEach(function (l, i) {
        html.push('<div class="link' + (i === 0 ? ' best' : '') + '">' +
          '<a class="u" href="' + esc(l.url) + '" target="_blank" rel="noopener noreferrer">' + esc(l.url) + '</a>' +
          '<div class="r">' + esc(root.WJE.format.kindLabel(l.kind)) + '　评分 ' + l.score + '</div>' +
          '<div class="acts"><button class="b" data-act="copy-url" data-url="' + esc(l.url) + '">复制链接</button></div></div>');
      });
    } else {
      html.push('<div class="empty">未识别到明确链接。</div>');
    }
    html.push('</div>');

    var rows = [];
    var push = function (k, v) {
      if (v === undefined || v === null || v === '') return;
      rows.push('<tr><td class="k">' + k + '</td><td class="v">' + esc(v) + '</td></tr>');
    };
    push('疑似主体', f.org && f.org.value);
    push('主办/来源', f.organizer && f.organizer.value);
    push('事件类型', f.events && f.events.list.join('、'));
    push('联系方式', f.contacts && [].concat(f.contacts.emails || [], f.contacts.phones || []).join('　'));
    push('文中日期', f.timeline && f.timeline.map(function (d) { return d.value; }).slice(0, 8).join('、'));
    if (rows.length) html.push('<div class="sec"><h2>通用字段</h2><table class="kv">' + rows.join('') + '</table></div>');
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
    else if (act === 'copy-links') copy(F.toLinkList(res), '链接已复制');
    else if (act === 'dl-md') download(base + '.md', F.toMarkdown(res), 'text/markdown;charset=utf-8');
    else if (act === 'dl-json') download(base + '.json', F.toJSON(res), 'application/json;charset=utf-8');
    else if (act === 'highlight') highlight();
    else if (act === 'copy-cite') copy(F.toCitation(res, 'gbt7714'), 'GB/T 7714 引用已复制');
    else if (act === 'copy-apa') copy(F.toCitation(res, 'apa'), 'APA 引用已复制');
    else if (act === 'copy-bibtex') copy(F.toCitation(res, 'bibtex'), 'BibTeX 已复制');
    else if (act === 'copy-card') copy(F.toPaperCard(res), '题录已复制');
    else if (act === 'copy-cite-gbt') copy(F.toCitation(res, 'gbt7714'), 'GB/T 7714 引用已复制');
    else if (act === 'copy-cite-apa') copy(F.toCitation(res, 'apa'), 'APA 引用已复制');
    else if (act === 'copy-cite-bibtex') copy(F.toCitation(res, 'bibtex'), 'BibTeX 已复制');
  }

  /** 在正文里高亮关键词，便于快速定位关键信息。关键词随画像变化。 */
  function highlight() {
    var profile = state.result && state.result.detection ? state.result.detection.activeProfile : 'recruit';
    var RE;
    if (profile === 'literature') {
      RE = /(DOI|doi|arXiv|PMID|作者|期刊|发表|影响因子|分区|摘要|关键词|引用|原文|全文|PDF|通讯作者|第一作者|参考文献|课题组|单位|阅读原文)/g;
    } else if (profile === 'general') {
      RE = /(来源|原文|阅读原文|链接|作者|时间|地点|联系|电话|邮箱|详情|报名|截止)/g;
    } else {
      RE = /(投递|网申|报名|截止|阅读原文|招聘官网|投递方式|投递入口|简历投递|申请|官网|二维码|联系方式)/g;
    }
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
      fab.textContent = b ? '⏳ 提取中…' : '🔍 提取关键信息';
    }
  }

  function extractAndShow() {
    ensureHost();
    setBusy(true);
    expandCollapsed();
    setTimeout(function () {
      var opts = { pageUrl: location.href, keepRaw: false };
      if (state.forceProfile) opts.forceProfile = state.forceProfile;
      var res = root.WJE.extract.fromDocument(document, opts);
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
