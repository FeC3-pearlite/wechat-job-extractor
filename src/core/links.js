/*!
 * 微信求职信息提取器 — 链接归集与打分 (links.js)
 *
 * 同一批链接在不同画像下"哪个才是关键链接"完全不同：
 *   招聘画像 → 投递入口（招聘官网 / 网申系统）
 *   文献画像 → 原文链接（DOI 解析页 / 出版社 / 预印本 / PDF / 文献库）
 * 因此打分分两层：通用基础分（rules.scoreLink）+ 画像加成。
 */
(function (root, factory) {
  var api = factory(
    (typeof module !== 'undefined' && module.exports)
      ? { rules: require('./rules.js'), parse: require('./parse.js'), literature: require('./profiles/literature.js') }
      : null   // 浏览器里不在此刻取依赖，改为调用时惰性解析（见 dep()）
  );
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) { root.WJE = root.WJE || {}; root.WJE.links = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (nodeDeps) {
  'use strict';

  // ── 依赖解析 ─────────────────────────────────────────────────────────
  // 内容脚本是按 manifest 里的顺序逐个加载的普通脚本，模块间存在依赖时，
  // 在「加载时」取依赖会引入脆弱的顺序耦合（曾经因为 links.js 排在 parse.js
  // 之前而整条链路拿到 undefined）。这里改成调用时解析，顺序就不再重要。
  var _cache = {};
  function dep(name) {
    if (nodeDeps && nodeDeps[name]) return nodeDeps[name];
    if (_cache[name]) return _cache[name];
    var w = (typeof globalThis !== 'undefined' ? globalThis : {});
    var W = w.WJE || {};
    var v = name === 'literature'
      ? (W.profiles && W.profiles.literature)
      : W[name];
    if (v) _cache[name] = v;
    return v;
  }
  function rulesMod() { return dep('rules'); }
  function parseMod() { return dep('parse'); }
  function litMod() { return dep('literature'); }

  var LIT_ANCHOR = /(原文|全文|PDF|下载|阅读|查看|链接|DOI|doi|原文地址|原文链接|文章链接|获取全文|Access|Full\s*Text|Download|View)/;
  var LIT_ASSET_NOISE = /\.(png|jpe?g|gif|webp|svg|mp4|mp3|zip|rar|docx?|xlsx?|pptx?)$/i;

  var KIND_BONUS = {
    doi: 80,
    preprint: 72,
    publisher: 66,
    database: 56,
    pdf: 52
  };

  var KIND_LABEL = {
    doi: 'DOI 解析页',
    preprint: '预印本',
    publisher: '出版社官网',
    database: '文献数据库',
    pdf: 'PDF 全文',
    ats: '招聘系统',
    official: '官网/官方域名',
    redirect: '跳转中间页',
    wechat: '微信站内',
    other: '其他',
    invalid: '无效'
  };

  function label(kind) { return KIND_LABEL[kind] || kind; }

  /** 综合打分：基础分 + 画像加成。 */
  function scoreOne(item, profile) {
    var rules = rulesMod();
    var literature = litMod();
    var base = rules.scoreLink(item.originalUrl || item.url, item.text, item.near);
    var score = base.score;
    var reasons = base.reasons.slice();
    var kind = base.kind;

    if (profile === 'literature') {
      var lk = literature.linkKind(item.url, item.host);
      if (lk) {
        kind = lk;
        score += KIND_BONUS[lk] || 0;
        reasons.push('学术出版资源（' + label(lk) + '，+' + (KIND_BONUS[lk] || 0) + '）');
      }
      if (LIT_ANCHOR.test(item.text || '')) { score += 20; reasons.push('锚文本指向全文/原文'); }
      if (item.near && /(原文|全文|DOI|链接|文献)/.test(item.near)) { score += 12; reasons.push('邻近“原文/全文”语义'); }
      // 文献画像下，招聘域名不该拿高分
      if (/job|zhaopin|recruit|campus|career|wecruit|hotjob|51job/i.test(item.host || '')) {
        score -= 25; reasons.push('招聘类域名，文献画像下降权');
      }
    }

    if (LIT_ASSET_NOISE.test(item.url)) { score -= 40; reasons.push('静态资源文件'); }

    return { score: score, kind: kind, reasons: reasons };
  }

  /**
   * 归集正文所有链接并打分排序。
   * @param {object} raw parse.js 的原始素材
   * @param {string} profile 'recruit' | 'literature' | 'general'
   */
  function classifyAndRank(raw, profile) {
    var rules = rulesMod();
    var parse = parseMod();
    profile = profile || 'recruit';
    var seen = Object.create(null);
    var list = [];

    function add(url, text, near, source) {
      if (!url) return;
      var abs = parse.absolutize(url, raw.baseUrl);
      if (!abs) return;
      var unwrapped = rules.unwrapUrl(abs);
      var key = unwrapped.replace(/[#?].*$/, '').replace(/\/$/, '').toLowerCase();
      if (seen[key]) {
        var ex = seen[key];
        if (text && ex.text.indexOf(text) === -1) ex.text = (ex.text ? ex.text + ' / ' : '') + text;
        if (source && ex.sources.indexOf(source) === -1) ex.sources.push(source);
        return;
      }
      var item = {
        url: unwrapped,
        originalUrl: abs,
        host: rules.safeHost(unwrapped),
        text: text || '',
        near: near || '',
        kind: 'other',
        score: 0,
        reasons: [],
        sources: source ? [source] : []
      };
      var sc = scoreOne(item, profile);
      item.kind = sc.kind;
      item.score = sc.score;
      item.reasons = sc.reasons;
      seen[key] = item;
      list.push(item);
    }

    if (raw.readOriginal && raw.readOriginal.url) {
      add(raw.readOriginal.url, raw.readOriginal.text || '阅读原文', '阅读原文', 'read_original:' + raw.readOriginal.from);
    }
    (raw.anchors || []).forEach(function (a) {
      if (!a.href) return;
      var abs = parse.absolutize(a.href, raw.baseUrl) || '';
      if (/mmbiz\.qpic\.cn|mmbiz\.qlogo\.cn|res\.wx\.qq\.com/.test(rules.safeHost(abs))) return;
      add(a.href, a.text, a.near, 'content_anchor');
    });
    (raw.bareUrls || []).forEach(function (b) { add(b.url, '(正文文本)', b.near, 'content_text'); });

    list.forEach(function (it) {
      if (/read_original/.test(it.sources.join(','))) {
        it.score += profile === 'literature' ? 10 : 18;
        it.reasons.push('来自「阅读原文」');
      }
    });

    list.sort(function (a, b) { return b.score - a.score; });

    var threshold = profile === 'literature' ? 40 : 25;
    var primary = list.filter(function (i) {
      return i.score >= threshold && i.kind !== 'wechat' && !LIT_ASSET_NOISE.test(i.url);
    });
    // 兜底：一个都没过线时，至少把最高的站外链接拿出来
    if (!primary.length) {
      var fallback = list.filter(function (i) { return i.kind !== 'wechat' && i.kind !== 'invalid'; });
      if (fallback.length) primary = [fallback[0]];
    }

    var groups = { doi: [], preprint: [], publisher: [], database: [], pdf: [] };
    list.forEach(function (i) { if (groups[i.kind]) groups[i.kind].push(i); });

    return {
      all: list,
      primary: primary,
      apply: primary,               // 招聘画像下的别名，保持向后兼容
      best: primary[0] || null,
      groups: groups,
      profile: profile
    };
  }

  return {
    classifyAndRank: classifyAndRank,
    scoreOne: scoreOne,
    label: label,
    KIND_LABEL: KIND_LABEL
  };
});
