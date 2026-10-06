/*!
 * 微信求职信息提取器 — 文献阅读画像 (profiles/literature.js)
 *
 * 面向「文献分享 / 论文推送 / 学术科普」类公众号推文，提取：
 *   标题（中/英）、作者（含第一/通讯作者）、期刊、年份卷期页、
 *   DOI / arXiv / PMID、影响因子与分区、摘要、关键词、引用格式。
 *
 * 公众号文献推送的排版高度口语化（emoji 前缀、中英混排、一行一个字段），
 * 因此这里走「标签优先 + 结构模式兜底 + 硬凭据」三层策略。
 */
(function (root, factory) {
  var api = factory(
    (typeof module !== 'undefined' && module.exports)
      ? { rules: require('../rules.js') }
      : { rules: root && root.WJE && root.WJE.rules }
  );
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) {
    root.WJE = root.WJE || {};
    root.WJE.profiles = root.WJE.profiles || {};
    root.WJE.profiles.literature = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (deps) {
  'use strict';

  var rules = deps.rules;

  /* ================================================================== *
   * 硬标识符
   * ================================================================== */

  var DOI_RE = /(?:doi\s*[:：]?\s*|doi\.org\/|dx\.doi\.org\/)?(10\.\d{4,9}\/[-._;()\/:a-zA-Z0-9<>]+)/gi;
  var ARXIV_NEW_RE = /arXiv\s*[:：]?\s*(\d{4}\.\d{4,5})(v\d+)?/i;
  var ARXIV_OLD_RE = /arXiv\s*[:：]?\s*([a-z\-]+(?:\.[A-Z]{2})?\/\d{7})(v\d+)?/;
  var PMID_RE = /\bPMID\s*[:：]?\s*(\d{7,8})/i;
  var ISBN_RE = /\bISBN[\s:：]*((?:97[89][-\s]?)?[\d][\d\-\s]{8,16}[\dXx])/i;

  /** 去掉 DOI 末尾被正则吞进来的标点。 */
  function cleanDoi(s) {
    var t = String(s || '').trim();
    t = t.replace(/[.,;:、。，；]+$/, '');
    // 括号配平：多出来的右括号要剪掉
    var opens = (t.match(/\(/g) || []).length;
    var closes = (t.match(/\)/g) || []).length;
    while (closes > opens && t.charAt(t.length - 1) === ')') {
      t = t.slice(0, -1);
      closes--;
    }
    t = t.replace(/[.,;:、。，；]+$/, '');
    return t;
  }

  /** 归一化 DOI：小写、去前缀、去尾部标点。 */
  function normalizeDoi(raw) {
    if (!raw) return null;
    var t = cleanDoi(raw).replace(/^(?:https?:\/\/)?(?:dx\.)?doi\.org\//i, '').replace(/^doi\s*[:：]\s*/i, '');
    return /^10\.\d{4,9}\//.test(t) ? t : null;
  }

  function extractDois(text) {
    if (!text) return [];
    var out = [];
    DOI_RE.lastIndex = 0;
    var m;
    while ((m = DOI_RE.exec(text)) !== null) {
      var d = normalizeDoi(m[1]);
      if (d && out.indexOf(d) === -1) out.push(d);
    }
    return out;
  }

  function extractIdentifiers(text) {
    if (!text) return {};
    var doiList = extractDois(text);
    var m;
    return {
      doi: doiList[0] || null,
      dois: doiList,
      arxiv: (m = text.match(ARXIV_NEW_RE)) ? m[1] + (m[2] || '') : ((m = text.match(ARXIV_OLD_RE)) ? m[1] + (m[2] || '') : null),
      pmid: (m = text.match(PMID_RE)) ? m[1] : null,
      isbn: (m = text.match(ISBN_RE)) ? m[1].trim() : null
    };
  }

  /* ================================================================== *
   * 分段工具
   * ================================================================== */

  /** 从文本中按标签取值，取到行尾或下一个明显分隔为止。 */
  function labeledValue(text, labels, maxLen) {
    if (!text) return null;
    maxLen = maxLen || 300;
    for (var i = 0; i < labels.length; i++) {
      var re = new RegExp('(?:^|[\\n\\r。；;，,]|\\s)' + labels[i] + '\\s*[:：]?\\s*([^\\n\\r]{2,' + maxLen + '})', 'i');
      var m = text.match(re);
      if (m) {
        var v = m[1].replace(/^[\s:：\-—·、]+/, '').replace(/\s+$/, '').trim();
        // 去掉行内 emoji 前缀残留
        v = v.replace(/^[\u2600-\u27BF\uD83C-\uDBFF\uDC00-\uDFFF\u2B00-\u2BFF]+\s*/g, '').trim();
        if (v.length >= 2) return v;
      }
    }
    return null;
  }

  /** 截取一个段落：从 startRe 之后开始，遇到 stopRe 之一或超长为止。 */
  function sliceSection(text, startRe, stopRe, maxLen) {
    if (!text) return null;
    var m = text.match(startRe);
    if (!m) return null;
    var rest = text.slice(m.index + m[0].length);
    var end = rest.length;
    if (stopRe) {
      var s = rest.match(stopRe);
      if (s && s.index > 0) end = s.index;
    }
    var seg = rest.slice(0, Math.min(end, maxLen)).trim();
    seg = seg.replace(/^[\s:：\-—]+/, '').trim();
    return seg.length >= 30 ? seg : null;
  }

  // 注意：这里**不能**用 \b 收尾。JS 的 \b 基于 ASCII \w，中文「关键词」与「：」之间
  // 不存在词边界，\b 会让整条 stop 规则失效（摘要就会一路吞到关键词段里）。
  // 改用「后面不是拉丁字母/数字」来兼顾英文单词边界。
  var SECTION_STOP = /\n\s*(?:关\s*键\s*词|关键字|References?|参考文献|引用格式|原文链接|原文地址|DOI|作者简介|通讯作者|第一作者|Citation|How to cite|图\s*\d|表\s*\d|Abstract|摘\s*要)(?![A-Za-z0-9])/i;

  /* ================================================================== *
   * 标题
   * ================================================================== */

  var TITLE_LABELS_ZH = ['原文标题', '论文题目', '文献题目', '论文标题', '文献标题', '文章标题', '论文名称', '文献名称', '中文标题', '题目', '标题'];
  var TITLE_LABELS_EN = ['Original\\s*Title', 'Article\\s*Title', 'Paper\\s*Title', 'Title'];

  var TITLE_NOISE = /(公众号|微信|点击|关注|扫码|二维码|阅读原文|转载|版权|来源[:：]|编辑[:：]|https?:\/\/|www\.|@)/;

  function looksLikeTitle(s) {
    if (!s) return false;
    var t = s.trim();
    if (t.length < 6 || t.length > 260) return false;
    if (TITLE_NOISE.test(t)) return false;
    if (/^[\d\s.、)）]+$/.test(t)) return false;
    return true;
  }

  /** 中文标题：优先标签 / 《》，否则用推文标题去掉前缀标签与副标题。 */
  function extractTitleZh(raw, text) {
    var v = labeledValue(text, TITLE_LABELS_ZH, 200);
    if (looksLikeTitle(v) && /[\u4e00-\u9fa5]/.test(v)) return { value: v.trim(), from: 'label' };

    var m = text.match(/《([^》\n]{4,120})》/);
    if (m && /[\u4e00-\u9fa5]/.test(m[1])) return { value: m[1].trim(), from: 'bookmark' };

    // 推文标题：去掉【…】/「…」前缀与 ｜ 后的栏目前缀
    var t = rules.normalize(raw.title || '');
    t = t.replace(/^[【\[［(（][^】\]］)）]{1,24}[】\]］)）]\s*/, '');
    t = t.replace(/^(?:文献分享|论文推送|好文推荐|学术前沿|科研动态|一周文献|导读)\s*[|｜:：\-—]?\s*/, '');
    var parts = t.split(/[|｜]/);
    if (parts.length > 1) {
      // 取更长的一段作为标题主体
      parts.sort(function (a, b) { return b.length - a.length; });
      t = parts[0];
    }
    t = t.replace(/[（(]\s*(?:文献|论文)?(?:分享|推荐|导读)\s*[)）]/g, '').trim();
    if (looksLikeTitle(t) && /[\u4e00-\u9fa5]/.test(t)) return { value: t, from: 'article_title' };
    return null;
  }

  /** 英文标题：标签优先，其次找「一行里 ≥4 个拉丁词」的行。 */
  var TITLE_LABEL_STRIP = /^(?:原文标题|论文标题|文献标题|文章标题|论文题目|文献题目|中文标题|标题|题目|Original\s*Title|Article\s*Title|Paper\s*Title|Title)\s*[:：]\s*/i;
  // 这些标签开头的行是「字段行」，不可能是标题
  var NON_TITLE_LABEL = /^\s*(?:作者团队|作者列表|全部作者|文章作者|论文作者|作者|单位|机构|通讯作者|通信作者|第一作者|期刊|杂志|发表期刊|期刊名称|刊物|DOI|doi|PMID|arXiv|原文链接|原文地址|文章链接|链接|网址|URL|时间|日期|发表时间|发表日期|卷期|卷期页|页码|影响因子|分区|关键词|关键字|摘要|引用|引用格式|参考文献|邮箱|Email|电话|收稿)\s*[:：]/;

  function extractTitleEn(text) {
    var v = labeledValue(text, TITLE_LABELS_EN, 260);
    if (v && looksLikeTitle(v) && countLatinWords(v) >= 3) return { value: v.trim(), from: 'label' };

    var lines = String(text || '').split(/\n+/);
    var best = null;
    for (var i = 0; i < Math.min(lines.length, 60); i++) {
      var rawLine = lines[i].trim().replace(/^[\u2600-\u27BF\uD83C-\uDBFF\uDC00-\uDFFF\u2B00-\u2BFF\s]+/, '');
      var fromLabel = TITLE_LABEL_STRIP.test(rawLine);
      var ln = rawLine.replace(TITLE_LABEL_STRIP, '');
      if (NON_TITLE_LABEL.test(ln)) continue;
      var words = countLatinWords(ln);
      if (words < 4 || ln.length < 20 || ln.length > 260) continue;
      if (TITLE_NOISE.test(ln)) continue;
      if (/^[A-Z0-9 .,&'\-:;()]+$/.test(ln) && words < 5) continue;   // 全大写短句多半是标签
      var score = words * 2 + Math.min(ln.length, 120) / 20;
      if (/[:：?？]/.test(ln)) score += 3;                              // 论文标题常有冒号副标题
      if (/^[A-Z]/.test(ln)) score += 2;
      if (fromLabel) score += 20;                                      // 明确写了「标题：」的最可信
      if (/(?:揭示|研究|mechanism|prediction|analysis|structure|effect|role)\b/i.test(ln)) score += 2;
      if (!best || score > best.score) best = { value: ln, score: score, from: fromLabel ? 'label_line' : 'line_scan' };
    }
    return best ? { value: best.value, from: best.from } : null;
  }

  function countLatinWords(s) {
    if (!s) return 0;
    var m = s.match(/[A-Za-z][A-Za-z'\-]{2,}/g);
    return m ? m.length : 0;
  }

  /* ================================================================== *
   * 作者
   * ================================================================== */

  var AUTHOR_LABELS = ['作者团队', '作者列表', '全部作者', '文章作者', '论文作者', 'Authors?', '作者', '撰写', '执笔', 'Written\\s*by', 'By'];
  var FIRST_AUTHOR_LABELS = ['第一作者', '首位作者', 'First\\s*Author'];
  var CORRESPONDING_LABELS = ['通讯作者', '通信作者', 'Corresponding\\s*Author'];

  var CN_NAME = /^[\u4e00-\u9fa5]{2,4}$/;
  var EN_NAME_FULL = /^[A-Z][a-zA-Z'\-]+(?:\s+[A-Z]\.?){0,4}\s+[A-Z][a-zA-Z'\-]+$/;
  var EN_NAME_INITIAL = /^[A-Z][a-zA-Z'\-]+,\s*(?:[A-Z]\.\s*){1,4}$/;

  function splitNames(segment) {
    if (!segment) return [];
    // 支持 "张三1, 李四2"、"Jumper, J., Evans, R."、"张三、李四、王五"
    var cleaned = segment
      .replace(/[（(][^）)]{0,40}[）)]/g, ' ')          // 去掉单位上标括号
      .replace(/\s*[*＊†‡§]+\s*/g, ' ')
      .replace(/\s*\d+(?:\s*,\s*\d+)*\s*(?=[,，、;；]|$)/g, ' ')  // 去掉上标数字
      .trim();

    var parts = cleaned.split(/[、,，;；]|\s{2,}|\s+(?:and|&)\s+/i);
    var out = [];
    parts.forEach(function (p) {
      var t = p.trim().replace(/^[\s.]+|[\s.]+$/g, '');
      if (!t) return;
      if (CN_NAME.test(t)) { out.push(t); return; }
      if (EN_NAME_FULL.test(t)) { out.push(t); return; }
      if (EN_NAME_INITIAL.test(t)) { out.push(t); return; }
      // "Jumper J" / "Jumper J." 这种倒装
      if (/^[A-Z][a-zA-Z'\-]+\s+(?:[A-Z]\.?){1,3}$/.test(t)) out.push(t);
    });
    return out;
  }

  /** 从一段自由文本里扫英文姓名（作者段专用，避免全文误检）。 */
  function scanEnglishNames(segment) {
    if (!segment) return [];
    var out = [];
    var re1 = /\b[A-Z][a-zA-Z'\-]{1,20}(?:\s+[A-Z]\.){1,3}\s+[A-Z][a-zA-Z'\-]{1,20}\b/g;
    var re2 = /\b[A-Z][a-zA-Z'\-]{1,20},\s*(?:[A-Z]\.\s*){1,3}(?=[,;]|\s|$)/g;
    var m;
    while ((m = re1.exec(segment)) !== null) if (out.indexOf(m[0]) === -1) out.push(m[0]);
    while ((m = re2.exec(segment)) !== null) { var v = m[0].trim().replace(/,$/, ''); if (out.indexOf(v) === -1) out.push(v); }
    return out;
  }

  function extractAuthors(text) {
    var seg = labeledValue(text, AUTHOR_LABELS, 260);
    if (!seg) return null;
    // 英文作者段（"Jumper, J., Evans, R." 这种）不能按逗号切，否则会把人名切碎。
    // 先判断整段是否以拉丁字符为主，是则优先走姓名正则扫描。
    var latin = (seg.match(/[A-Za-z]/g) || []).length;
    var cjk = (seg.match(/[\u4e00-\u9fa5]/g) || []).length;
    var list = (latin > cjk * 2) ? scanEnglishNames(seg) : [];
    if (!list.length) list = splitNames(seg);
    if (!list.length) list = scanEnglishNames(seg);
    if (!list.length) return null;
    return {
      list: rules.uniq(list).slice(0, 30),
      raw: seg,
      evidence: '作者字段：“' + seg.slice(0, 60) + '”'
    };
  }

  function extractSingleAuthorField(text, labels) {
    var v = labeledValue(text, labels, 120);
    if (!v) return null;
    var latin = (v.match(/[A-Za-z]/g) || []).length;
    var cjk = (v.match(/[\u4e00-\u9fa5]/g) || []).length;
    var list = (latin > cjk * 2) ? scanEnglishNames(v) : [];
    if (!list.length) list = splitNames(v);
    return (list.length ? list : [v.trim()]).slice(0, 4);
  }

  /* ================================================================== *
   * 期刊 / 出版信息
   * ================================================================== */

  var JOURNAL_LABELS = ['发表期刊', '期刊名称', '期刊', '杂志', '刊物', '发表杂志', 'Journal', 'Published\\s*in', '刊载于', '发表于', 'Source', '出处'];

  var KNOWN_JOURNALS = [
    'Nature Reviews Materials', 'Nature Reviews Physics', 'Nature Reviews Chemistry', 'Nature Reviews Cancer',
    'Nature Communications', 'Nature Biotechnology', 'Nature Medicine', 'Nature Materials', 'Nature Physics',
    'Nature Chemistry', 'Nature Neuroscience', 'Nature Genetics', 'Nature Methods', 'Nature Energy',
    'Nature Climate Change', 'Nature Sustainability', 'Nature Human Behaviour', 'Nature Food', 'Nature Water',
    'Science Advances', 'Science Immunology', 'Science Robotics', 'Science Translational Medicine',
    'New England Journal of Medicine', 'The Lancet', 'JAMA', 'The BMJ', 'Annals of Internal Medicine',
    'Physical Review Letters', 'Physical Review X', 'Reviews of Modern Physics',
    'Journal of the American Chemical Society', 'Angewandte Chemie', 'Advanced Materials', 'Advanced Science',
    'Chemical Reviews', 'Chemical Society Reviews', 'Energy & Environmental Science',
    'IEEE Transactions on Pattern Analysis and Machine Intelligence', 'IEEE Transactions on Neural Networks and Learning Systems',
    'Proceedings of the National Academy of Sciences', 'Cell Research', 'Cell Reports', 'Molecular Cell',
    'Nature', 'Science', 'Cell', 'PNAS', 'eLife', 'PLOS ONE', 'BMJ Open',
    // 中文人文社科 / 理工类核心期刊
    '中国社会科学', '经济研究', '管理世界', '金融研究', '法学研究', '社会学研究', '心理学报', '世界经济',
    '中国工业经济', '南开管理评论', '会计研究', '中国行政管理', '政治学研究', '新闻与传播研究',
    '中国科学', '科学通报', '计算机学报', '软件学报', '自动化学报', '电子学报', '物理学报', '化学学报'
  ];
  var KNOWN_JOURNALS_SORTED = KNOWN_JOURNALS.slice().sort(function (a, b) { return b.length - a.length; });

  function extractJournal(text, rawTitle) {
    var v = labeledValue(text, JOURNAL_LABELS, 80);
    if (v) {
      var cleaned = v.replace(/\s*[（(]\s*(?:IF|影响因子)[^）)]*[)）]\s*/i, '').replace(/[，,。;；]\s*$/, '').trim();
      if (cleaned.length >= 2) return { value: cleaned, from: 'label' };
    }
    for (var i = 0; i < KNOWN_JOURNALS_SORTED.length; i++) {
      var j = KNOWN_JOURNALS_SORTED[i];
      if (text.indexOf(j) !== -1) return { value: j, from: 'known_list' };
      if ((rawTitle || '').indexOf(j) !== -1) return { value: j, from: 'article_title' };
    }
    return null;
  }

  /** 年 / 卷 / 期 / 页 */
  function extractNumbering(text) {
    var out = { year: null, volume: null, issue: null, pages: null, articleNumber: null };
    var m;

    // ① GB/T 7714 形如：2024, 45(3): 123-135
    if ((m = text.match(/((?:19|20)\d{2})\s*[,，]\s*(\d{1,4})\s*[（(]\s*(\d{1,4})\s*[)）]\s*[:：]\s*([\dA-Za-z]+\s*[-–—~]\s*[\dA-Za-z]+|\d{1,6})/))) {
      out.year = +m[1]; out.volume = m[2]; out.issue = m[3]; out.pages = m[4].replace(/\s/g, '');
    }
    // ①b 不带年份的「卷(期): 页」，常见于「卷期页：596(7873): 583-589」
    if (!out.volume && (m = text.match(/(?:^|[\s:：，,（(])(\d{1,4})\s*[（(]\s*(\d{1,4})\s*[)）]\s*[:：]\s*([\dA-Za-z]+\s*[-–—~]\s*[\dA-Za-z]+)/))) {
      out.volume = m[1]; out.issue = m[2]; out.pages = m[3].replace(/\s/g, '');
    }
    // ② APA 形如：Nature, 596(7873), 583-589.
    if (!out.volume && (m = text.match(/[,，]\s*(\d{1,4})\s*[（(]\s*(\d{1,4})\s*[)）]\s*[,，]\s*([\dA-Za-z]+\s*[-–—~]\s*[\dA-Za-z]+)/))) {
      out.volume = m[1]; out.issue = m[2]; out.pages = m[3].replace(/\s/g, '');
    }
    // ③ Nature 引用形如：Nature 596, 583–589 (2021)
    if (!out.volume && (m = text.match(/\b(\d{1,4})\s*,\s*([\dA-Za-z]+\s*[-–—~]\s*[\dA-Za-z]+)\s*[（(]\s*((?:19|20)\d{2})\s*[)）]/))) {
      out.volume = m[1]; out.pages = m[2].replace(/\s/g, ''); out.year = +m[3];
    }
    // ④ 标签形式
    if (!out.year) {
      m = text.match(/(?:发表(?:时间|年份|日期)?|出版(?:时间|年份)?|年份|Published|Year)\s*[:：]?\s*((?:19|20)\d{2})/i);
      if (m) out.year = +m[1];
    }
    if (!out.year && (m = text.match(/[（(]\s*((?:19|20)\d{2})\s*[)）]/))) out.year = +m[1];
    if (!out.volume && (m = text.match(/(?:卷|Vol\.?|Volume)\s*[:：]?\s*(\d{1,4})/i))) out.volume = m[1];
    if (!out.issue && (m = text.match(/(?:期|No\.?|Issue)\s*[:：]?\s*(\d{1,4})/i))) out.issue = m[1];
    if (!out.pages) {
      m = text.match(/(?:页码|页\s*码|Pages?|pp\.?)\s*[:：]?\s*([\dA-Za-z]+\s*[-–—~]\s*[\dA-Za-z]+|\d{1,6})/i);
      if (m) out.pages = m[1].replace(/\s/g, '');
    }
    if (!out.articleNumber && (m = text.match(/(?:文章编号|Article\s*(?:number|no\.?))\s*[:：]?\s*([\d.A-Za-z]+)/i))) {
      out.articleNumber = m[1];
    }
    return out;
  }

  /** 影响因子 / 分区 */
  function extractMetrics(text) {
    var out = { impactFactor: null, jcr: null, cas: null, citations: null };
    var m;
    if ((m = text.match(/(?:影响因子|IF|Impact\s*Factor)\s*[:：]?\s*([\d.]+)/i))) out.impactFactor = m[1];
    if ((m = text.match(/\bJCR\s*(?:分区)?\s*[:：]?\s*(Q[1-4])/i))) out.jcr = m[1].toUpperCase();
    if (!out.jcr && (m = text.match(/(?:JCR|分区)\s*[:：]?\s*(Q[1-4])\b/i))) out.jcr = m[1].toUpperCase();
    if ((m = text.match(/中科院\s*(?:分区|大类|小类)?\s*[:：]?\s*([一二三四]\s*区)/))) out.cas = m[1].replace(/\s/g, '');
    if (!out.cas && (m = text.match(/([一二三四])\s*区\s*(?:期刊|Top)?/))) out.cas = m[1] + '区';
    if ((m = text.match(/(?:被引(?:次数)?|引用次数|Citations?)\s*[:：]?\s*(\d{1,6})/i))) out.citations = +m[1];
    return (out.impactFactor || out.jcr || out.cas || out.citations) ? out : null;
  }

  /* ================================================================== *
   * 摘要 / 关键词
   * ================================================================== */

  function extractAbstract(text) {
    var out = { zh: null, en: null };
    out.zh = sliceSection(text, /(?:^|\n)\s*(?:内容)?摘\s*要\s*[:：]?\s*/, SECTION_STOP, 2000);
    out.en = sliceSection(text, /(?:^|\n)\s*Abstract\s*[:：]?\s*/i, SECTION_STOP, 2600);
    // 兜底：正文里没有「摘要：」标签时，中文文献常在开头直接给一段长摘要
    if (!out.zh && !out.en && text.length > 200) {
      var first = text.split(/\n\s*\n/).map(function (s) { return s.trim(); })
        .filter(function (s) { return s.length >= 80 && s.length <= 1200 && /[\u4e00-\u9fa5]/.test(s); })[0];
      if (first) out.zh = first;
    }
    if (!out.zh && !out.en) return null;
    return out;
  }

  function extractKeywords(text) {
    var out = { zh: [], en: [] };
    var zh = null, en = null;
    var m = text.match(/(?:关\s*键\s*词|关键字)\s*[:：]?\s*([^\n]{2,300})/);
    if (m) zh = m[1];
    m = text.match(/Key\s*words?\s*[:：]?\s*([^\n]{2,300})/i);
    if (m) en = m[1];

    function split(s) {
      if (!s) return [];
      return rules.uniq(s.split(/[;；,，、|/]/).map(function (x) {
        return x.replace(/^[\s.·]+|[\s.·]+$/g, '').trim();
      }).filter(function (x) { return x.length >= 2 && x.length <= 40; }));
    }
    out.zh = split(zh).slice(0, 20);
    out.en = split(en).slice(0, 20);
    return (out.zh.length || out.en.length) ? out : null;
  }

  /* ================================================================== *
   * 论文类型 / 开放获取
   * ================================================================== */

  var PAPER_TYPES = [
    [/综述|Review\b|研究进展|系统评价|Meta[- ]?分析|Meta-analysis/i, '综述'],
    [/预印本|preprint|arXiv|bioRxiv|medRxiv|SSRN/i, '预印本'],
    [/学位论文|博士学位论文|硕士学位论文|毕业论文|Dissertation|Thesis/i, '学位论文'],
    [/会议论文|Proceedings|Conference|研讨会|Workshop|Symposium/i, '会议论文'],
    [/社论|Editorial|评论|Commentary|Perspective|观点|News\s*&?\s*Views/i, '评论/社论'],
    [/病例报告|Case\s*Report/i, '病例报告'],
    [/勘误|Erratum|Correction|撤稿|Retraction/i, '勘误/撤稿']
  ];

  function extractPaperType(text) {
    for (var i = 0; i < PAPER_TYPES.length; i++) {
      if (PAPER_TYPES[i][0].test(text)) return { value: PAPER_TYPES[i][1], from: 'keyword' };
    }
    return { value: '研究论文', from: 'default' };
  }

  function detectOpenAccess(urls, journal) {
    var s = (urls || []).join(' ') + ' ' + (journal || '');
    if (/pmc\.ncbi|doi\.org\/10\.1371|plos\.org|frontiersin|mdpi\.com|elife|nature\.com\/articles\/.*#?.*(?:open|OA)/i.test(s)) return true;
    if (/arXiv|bioRxiv|medRxiv|SSRN|ResearchGate/i.test(s)) return true;
    if (/PLOS|Frontiers|MDPI|eLife|Nature Communications|Science Advances|Open Access/i.test(journal || '')) return true;
    return false;
  }

  /* ================================================================== *
   * 引用格式
   * ================================================================== */

  /**
   * GB/T 7714 作者写法：姓 + 空格 + 名首字母（**首字母后不加点**）。
   * 例："Jumper, J." → "Jumper J"；"Jumper, J. A." → "Jumper J A"；"张三" 原样保留。
   */
  function gbtAuthor(name) {
    var t = String(name || '').trim();
    function initials(s) { return s.replace(/[.\s]+/g, ' ').trim(); }   // "J. A." → "J A"
    var m = t.match(/^([A-Z][a-zA-Z'\-]+),\s*((?:[A-Z]\.?\s*){1,4})$/);
    if (m) return m[1] + ' ' + initials(m[2]);
    var m2 = t.match(/^([A-Z][a-zA-Z'\-]+)\s+((?:[A-Z]\.?\s*){1,4})$/);
    if (m2) return m2[1] + ' ' + initials(m2[2]);
    // "Jumper J. A." / "Jumper J A" 倒装式
    var m3 = t.match(/^([A-Z][a-zA-Z'\-]+)(?:\s+[A-Z]\.?){1,3}$/);
    if (m3) return m3[1] + ' ' + t.slice(m3[1].length).replace(/[.\s]+/g, ' ').trim();
    return t;
  }

  /** BibTeX 作者写法：姓, 名首字母（保留点号）。 */
  function bibAuthor(name) {
    var t = String(name || '').trim();
    if (/^[A-Z][a-zA-Z'\-]+,\s*(?:[A-Z]\.?\s*){1,4}$/.test(t)) {
      return t.replace(/\s+/g, ' ').replace(/,\s*/, ', ').trim();
    }
    var m = t.match(/^([A-Z][a-zA-Z'\-]+)\s+((?:[A-Z]\.?\s*){1,4})$/);
    if (m) return m[1] + ', ' + m[2].trim();
    return t;
  }

  /** "Jumper, J." 保持；"张三" 不做音译，原样保留。 */
  function apaAuthor(name) {
    var t = String(name || '').trim();
    if (/^[A-Z][a-zA-Z'\-]+,\s*(?:[A-Z]\.\s*){1,4}$/.test(t)) return t.replace(/\s+/g, ' ').trim();
    var m = t.match(/^([A-Z][a-zA-Z'\-]+)\s+((?:[A-Z]\.\s*){1,4})$/);
    if (m) return m[1] + ', ' + m[2].replace(/\s+/g, ' ').trim();
    return t;
  }

  function joinAuthors(list, mapper, sep, max, ellipsis) {
    var arr = (list || []).slice(0, max).map(mapper);
    var s = arr.join(sep);
    if ((list || []).length > max) s += ellipsis;
    return s;
  }

  /** APA 7 的作者串：≤20 人全列，末位前加 &；>20 人列前 19 + … + 末位。 */
  function apaAuthorList(list) {
    var arr = (list || []).map(apaAuthor);
    if (!arr.length) return '';
    if (arr.length === 1) return arr[0];
    if (arr.length > 20) return arr.slice(0, 19).join(', ') + ', ... ' + arr[arr.length - 1];
    return arr.slice(0, -1).join(', ') + ', & ' + arr[arr.length - 1];
  }

  function buildCitations(paper) {
    var authors = paper.authors || [];
    var isEn = authors.length ? !/^[\u4e00-\u9fa5]/.test(authors[0]) : false;
    // 著录用的题名要与作者语种一致：英文文献引用英文原题，中文文献引用中文题名。
    // 若只有推文里的中译标题、而作者是英文，仍优先用英文原题，避免"英文文献配中译题名"的怪结果。
    var title;
    if (isEn) title = paper.titleEn || paper.title || paper.titleZh || '';
    else title = paper.titleZh || paper.title || paper.titleEn || '';
    var journal = paper.journal || '';
    var y = paper.year || '';
    var vol = paper.volume || '';
    var iss = paper.issue || '';
    var pg = paper.pages || paper.articleNumber || '';
    var doi = paper.doi || '';
    var ellipsis = isEn ? ', et al' : ', 等';

    var out = {};

    // GB/T 7714-2015
    var aGbt = authors.length ? joinAuthors(authors, gbtAuthor, ', ', 3, ellipsis) : '';
    var loc = [y, vol ? vol + (iss ? '(' + iss + ')' : '') : ''].filter(Boolean).join(', ');
    var gbt = [aGbt ? aGbt + '.' : '', title + '[J].', journal ? journal + ',' : '', loc ? loc + (pg ? ': ' + pg : '') + '.' : (pg ? ': ' + pg + '.' : '')]
      .filter(Boolean).join(' ').replace(/\s+\./g, '.').replace(/\s+/g, ' ').trim();
    if (doi) gbt += ' DOI:' + doi + '.';
    out.gbt7714 = gbt;

    // APA 7th
    var aApa = apaAuthorList(authors);
    if (aApa && !/\.$/.test(aApa)) aApa += '.';
    var apa = [aApa ? aApa + ' ' : '', y ? '(' + y + '). ' : '', title ? title + '. ' : '',
      journal ? journal : '', vol ? ', ' + vol : '', iss ? '(' + iss + ')' : '', pg ? ', ' + pg : '', '.']
      .filter(Boolean).join('').replace(/\s+\./g, '.').replace(/\s+/g, ' ').trim();
    if (doi) apa += ' https://doi.org/' + doi;
    out.apa = apa;

    // BibTeX
    var key = (authors[0] ? authors[0].replace(/[^A-Za-z\u4e00-\u9fa5]/g, '') : 'ref') + (y || '');
    var ba = authors.map(function (a) { return bibAuthor(a); }).join(' and ');
    var lines = [
      '@article{' + key + ',',
      '  author  = {' + ba + '},',
      '  title   = {' + title + '},',
      journal ? '  journal = {' + journal + '},' : null,
      y ? '  year    = {' + y + '},' : null,
      vol ? '  volume  = {' + vol + '},' : null,
      iss ? '  number  = {' + iss + '},' : null,
      pg ? '  pages   = {' + pg + '},' : null,
      doi ? '  doi     = {' + doi + '},' : null,
      '}'
    ].filter(Boolean);
    out.bibtex = lines.join('\n');

    // 纯文本一行式，方便粘到笔记里
    out.oneline = [aGbt, title, journal, loc, pg].filter(Boolean).join('. ').replace(/\.\s*\./g, '.').trim();

    return out;
  }

  /* ================================================================== *
   * 主入口
   * ================================================================== */

  function extract(raw) {
    var text = raw.contentText || '';
    var title = raw.title || '';
    var hay = title + '\n' + (raw.description || '') + '\n' + text;

    var ids = extractIdentifiers(hay);
    var titleZh = extractTitleZh(raw, text);
    var titleEnRaw = extractTitleEn(text);
    // 若推文标题本身是英文，切到英文槽位
    if (!titleEnRaw && titleZh && !/[\u4e00-\u9fa5]/.test(titleZh.value)) {
      titleEnRaw = { value: titleZh.value, from: titleZh.from + '(en)' };
      titleZh = null;
    }

    var authors = extractAuthors(text);
    var firstAuthor = extractSingleAuthorField(text, FIRST_AUTHOR_LABELS);
    var corrAuthor = extractSingleAuthorField(text, CORRESPONDING_LABELS);
    var journal = extractJournal(text, title);
    var numbering = extractNumbering(text);
    var metrics = extractMetrics(text);
    var abstract = extractAbstract(text);
    var keywords = extractKeywords(text);
    var paperType = extractPaperType(hay);

    var paper = {
      titleZh: titleZh ? titleZh.value : null,
      titleEn: titleEnRaw ? titleEnRaw.value : null,
      title: (titleZh && titleZh.value) || (titleEnRaw && titleEnRaw.value) || rules.normalize(title) || null,
      authors: authors ? authors.list : [],
      authorsEvidence: authors ? authors.evidence : null,
      firstAuthor: firstAuthor,
      correspondingAuthor: corrAuthor,
      journal: journal ? journal.value : null,
      journalEvidence: journal ? journal.from : null,
      year: numbering.year,
      volume: numbering.volume,
      issue: numbering.issue,
      pages: numbering.pages,
      articleNumber: numbering.articleNumber,
      doi: ids.doi,
      dois: ids.dois,
      arxiv: ids.arxiv,
      pmid: ids.pmid,
      isbn: ids.isbn,
      impactFactor: metrics ? metrics.impactFactor : null,
      jcr: metrics ? metrics.jcr : null,
      cas: metrics ? metrics.cas : null,
      citations: metrics ? metrics.citations : null,
      abstractZh: abstract ? abstract.zh : null,
      abstractEn: abstract ? abstract.en : null,
      keywordsZh: keywords ? keywords.zh : [],
      keywordsEn: keywords ? keywords.en : [],
      paperType: paperType.value,
      openAccess: false
    };

    paper.citations = buildCitations(paper);

    var warnings = [];
    if (!paper.titleZh && !paper.titleEn) warnings.push('未能识别出明确的论文标题，请人工确认。');
    if (!paper.doi && !paper.arxiv && !paper.pmid) warnings.push('未在正文中发现 DOI / arXiv / PMID 等唯一标识符。');
    if (!paper.authors.length) warnings.push('未能从正文中提取到作者列表（公众号推文常省略或只写团队名）。');
    if (!paper.journal) warnings.push('未能识别期刊名，可能只提供了标题与链接。');
    if (paper.year && paper.year > new Date().getFullYear() + 1) warnings.push('识别到的年份 ' + paper.year + ' 异常，请核对。');

    return {
      fields: {
        paper: paper,
        org: null, batch: null, recruitType: null, deadline: null,
        education: null, majors: null, positions: null, locations: null,
        headcount: null, contacts: null
      },
      paper: paper,
      warnings: warnings
    };
  }

  /** 给出文献相关的链接分组（供 links.js 打分使用）。 */
  function linkKind(url, host) {
    var u = String(url || '');
    if (/\.pdf(\?|$)/i.test(u)) return 'pdf';
    if (/^10\.\d{4,9}\//.test(u)) return 'doi';
    if (/(?:^|\.)doi\.org$/.test(host) || /dx\.doi\.org$/.test(host)) return 'doi';
    if (/arxiv\.org|biorxiv\.org|medrxiv\.org|ssrn\.com|preprints?\.org|researchsquare/i.test(host)) return 'preprint';
    if (/pubmed|ncbi\.nlm\.nih\.gov|pmc\.ncbi/i.test(host)) return 'database';
    if (/cnki\.net|wanfangdata|cqvip|x-mol\.com|xueshu\.baidu|scholar\.google|semanticscholar|openreview|researchgate|scilit|sci-hub/i.test(host)) return 'database';
    if (classifyPublisherRe().test(host)) return 'publisher';
    return null;
  }

  var _pubRe = null;
  function classifyPublisherRe() {
    if (!_pubRe) {
      _pubRe = /(?:nature\.com|science\.org|sciencedirect|springer|wiley|ieeexplore|acs\.org|rsc\.org|tandfonline|sagepub|frontiersin|mdpi\.com|plos\.org|cell\.com|nejm\.org|thelancet|bmj\.com|jamanetwork|pnas\.org|iopscience|aps\.org|annualreviews|karger|thieme|jstor|cambridge\.org|oxford|academic\.oup\.com|epfl|cell\.com|elifesciences)/i;
    }
    return _pubRe;
  }

  return {
    extract: extract,
    linkKind: linkKind,
    classifyPublisherRe: classifyPublisherRe,
    extractIdentifiers: extractIdentifiers,
    extractDois: extractDois,
    normalizeDoi: normalizeDoi,
    extractAuthors: extractAuthors,
    extractJournal: extractJournal,
    extractNumbering: extractNumbering,
    extractMetrics: extractMetrics,
    extractAbstract: extractAbstract,
    extractKeywords: extractKeywords,
    buildCitations: buildCitations,
    extractTitleZh: extractTitleZh,
    extractTitleEn: extractTitleEn,
    extractPaperType: extractPaperType,
    detectOpenAccess: detectOpenAccess,
    KNOWN_JOURNALS: KNOWN_JOURNALS
  };
});
