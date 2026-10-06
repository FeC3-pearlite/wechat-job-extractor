// ==UserScript==
// @name         微信推文关键信息提取器
// @namespace    https://github.com/FeC3-pearlite/wechat-job-extractor
// @version      2.0.0
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
/* 本文件由 tools/build-userscript.cjs 自动生成，请勿直接修改；改动请编辑 src/ 后重新构建。 */

/* ==================== src/core/rules.js ==================== */
/*!
 * 微信求职信息提取器 — 规则库 (rules.js)
 * 零依赖 UMD：既可作为 content script 的普通脚本加载，也可被 Node 测试 require。
 */
(function (root, factory) {
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) { root.WJE = root.WJE || {}; root.WJE.rules = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  /* ------------------------------------------------------------------ *
   * 文本归一化
   * ------------------------------------------------------------------ */

  var FULLWIDTH_MAP = {
    '０': '0', '１': '1', '２': '2', '３': '3', '４': '4', '５': '5', '６': '6', '７': '7', '８': '8', '９': '9',
    'Ａ': 'A', 'Ｂ': 'B', 'Ｃ': 'C', 'Ｄ': 'D', 'Ｅ': 'E', 'Ｆ': 'F', 'Ｇ': 'G', 'Ｈ': 'H', 'Ｉ': 'I', 'Ｊ': 'J',
    'Ｋ': 'K', 'Ｌ': 'L', 'Ｍ': 'M', 'Ｎ': 'N', 'Ｏ': 'O', 'Ｐ': 'P', 'Ｑ': 'Q', 'Ｒ': 'R', 'Ｓ': 'S', 'Ｔ': 'T',
    'Ｕ': 'U', 'Ｖ': 'V', 'Ｗ': 'W', 'Ｘ': 'X', 'Ｙ': 'Y', 'Ｚ': 'Z',
    'ａ': 'a', 'ｂ': 'b', 'ｃ': 'c', 'ｄ': 'd', 'ｅ': 'e', 'ｆ': 'f', 'ｇ': 'g', 'ｈ': 'h', 'ｉ': 'i', 'ｊ': 'j',
    'ｋ': 'k', 'ｌ': 'l', 'ｍ': 'm', 'ｎ': 'n', 'ｏ': 'o', 'ｐ': 'p', 'ｑ': 'q', 'ｒ': 'r', 'ｓ': 's', 'ｔ': 't',
    'ｕ': 'u', 'ｖ': 'v', 'ｗ': 'w', 'ｘ': 'x', 'ｙ': 'y', 'ｚ': 'z',
    '％': '%', '＃': '#', '＆': '&', '／': '/', '－': '-', '＠': '@', '．': '.',
    '　': ' ',
    // 注意：中文标点（，。；：！？（）「」《》）**不转换**。
    // 折叠它们会让「本文提出了 AlphaFold，一个…」在面板里显示成半角逗号，中文可读性变差；
    // 而所有正则本来就用 [:：] / [,，] 这类双写容错写法，并不依赖折叠。
    '、': '、'
  };

  /** 全角转半角 + 统一空白。可逆性无关，供正则匹配使用。 */
  function normalize(text) {
    if (!text) return '';
    var s = String(text);
    var out = '';
    for (var i = 0; i < s.length; i++) {
      var ch = s[i];
      out += (FULLWIDTH_MAP[ch] !== undefined ? FULLWIDTH_MAP[ch] : ch);
    }
    return out
      .replace(/\u00a0|\u200b|\u2002|\u2003|\u3000/g, ' ')  // nbsp / 零宽 / 全角空格
      .replace(/[ \t\f\v]+/g, ' ')
      .replace(/\r\n?/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  /* ------------------------------------------------------------------ *
   * 机构名
   * ------------------------------------------------------------------ */

  var ORG_SUFFIX = [
    '股份有限公司', '有限责任公司', '有限公司', '集团有限公司', '控股集团', '集团',
    '农村商业银行', '农商银行', '村镇银行', '信用社', '信用合作联社', '银行',
    '证券', '保险', '基金管理', '基金', '信托', '理财', '金融租赁', '消费金融', '财务公司', '金融科技', '金控',
    '研究院', '研究所', '设计院', '勘察设计院', '大学', '学院', '职业技术学院', '中学', '小学', '医院',
    '会计师事务所', '律师事务所', '税务师事务所', '事务所',
    '国家电网', '南方电网', '电网', '电力', '能源', '石油', '石化', '海油', '燃气', '水务', '环保',
    '移动通信', '通信', '电子', '半导体', '集成电路', '软件', '科技', '信息技术', '网络', '数据',
    '汽车', '重工', '机械', '钢铁', '冶金', '化工', '建材', '建筑', '建设', '工程', '地产', '置业', '物业',
    '医药', '生物', '医疗', '食品', '乳业', '饮料', '服饰', '纺织', '家居', '家电', '电器',
    '航空', '航天', '机场', '港口', '物流', '航运', '铁路', '轨道交通', '地铁',
    '传媒', '文化', '出版', '电视台', '广播', '报业', '广告',
    '投资', '资本', '资产', '交易所', '中心', '总局', '管理局', '局', '院', '厂', '社'
  ];

  // 常见长后缀，匹配时优先取长
  var ORG_SUFFIX_SORTED = ORG_SUFFIX.slice().sort(function (a, b) { return b.length - a.length; });
  var ORG_SUFFIX_ALT = ORG_SUFFIX_SORTED.map(escapeRe).join('|');
  // 前缀用「非贪婪」：在每个起点取最短的合法机构名，避免把前文整句吞进来。
  var ORG_RE = new RegExp('([\\u4e00-\\u9fa5A-Za-z0-9()\\-·]{2,24}?)(?:' + ORG_SUFFIX_ALT + ')', 'g');

  // 合法机构名前缀：允许向左“扩展”的限定词
  var ORG_LEGIT_PREFIX = [
    '中国工商', '中国农业', '中国建设', '中国交通', '中国邮政', '中国石油', '中国石化', '中国海洋石油',
    '中国移动', '中国联通', '中国电信', '中国建筑', '中国中铁', '中国铁建', '中国中车', '中国船舶',
    '中国航天', '中国航空', '中国电子', '中国核工业', '中国五矿', '中国中化', '中国铝业', '中国大唐',
    '中国华能', '中国华电', '中国国电', '中国广核', '中国旅游', '中国中煤', '中国黄金', '中国信达',
    '中国人民', '国家电网', '南方电网', '中国科学院', '中国社科院',
    '中国', '中华', '国家', '中央', '全国', '中'
  ];
  var ORG_LEGIT_PREFIX_SORTED = ORG_LEGIT_PREFIX.slice().sort(function (a, b) { return b.length - a.length; });

  // 明显不是招聘主体的词，命中即丢弃
  var ORG_BLACKLIST = [
    '微信公众号', '微信公众平台', '公众号', '招聘官网', '招聘网站', '招聘系统', '招聘信息', '招聘公告',
    '校园招聘', '社会招聘', '秋季招聘', '春季招聘', '双向选择', '本行', '我行', '该行', '贵行',
    '教育部', '人力资源社会保障部', '国家统一招生计划', '公务员录用体检通用标准', '公务员录用体检操作手册',
    '学位证', '毕业证', '留学服务中心', '详情页', '阅读原文', '原文链接', '官方网站', '网申', '简历',
    '应聘者', '毕业生', '应届毕业生', '求职者', '全体员工', '新员工',
    // 纯后缀碎片
    '股份有限公司', '有限责任公司', '有限公司', '集团有限公司', '股份公司'
  ];

  // 以这些字开头的候选几乎一定不是机构名（注意：不能用「中/上/本」等可能入名的字）
  var ORG_STOP_HEAD = '年月日时的了在和与及等各为是有将被对从向给由经据按以并或而则就也都还又很更不没无未请可需应须第每某这那其此该我你他她它';

  // 常见引导词，出现在机构名前面时逐层剥离
  var ORG_LEAD_TOKENS = [
    '应聘人员', '应聘者', '求职者', '申请者', '候选人', '应届毕业生', '毕业生', '在校生', '学生', '考生', '用户',
    '请', '可', '需', '应', '须', '登录', '访问', '前往', '进入', '参见', '详见', '浏览', '查看', '点击',
    '欢迎', '诚聘', '拟聘', '招聘', '加入', '加盟', '关于', '根据', '依托', '按照', '通过', '面向',
    '以及', '所有', '全部', '本次', '即日', '日起', '在', '由', '经', '据', '与', '和', '及', '的', '了', '等', '各', '并', '或'
  ];
  var ORG_LEAD_SORTED = ORG_LEAD_TOKENS.slice().sort(function (a, b) { return b.length - a.length; });

  // 标题尾部噪声（“中国光大银行秋季校园招聘” → “中国光大银行”）
  var ORG_TAIL_NOISE = /(?:秋季|春季|暑期|寒假|校园|社会|面向|年度|秋|春|年|届|度|大型|专场|全国)+$/;

  /** 剥掉机构名前误吞的引导词与数字。 */
  function trimOrgLead(s) {
    var t = String(s || '');
    for (var guard = 0; guard < 8; guard++) {
      var before = t;
      t = t.replace(/^[\d\s:：,，.。、!！?？]+/, '');
      for (var i = 0; i < ORG_LEAD_SORTED.length; i++) {
        var tok = ORG_LEAD_SORTED[i];
        if (t.length > tok.length + 1 && t.slice(0, tok.length) === tok) { t = t.slice(tok.length); break; }
      }
      if (t === before) break;
    }
    return t.trim();
  }

  function cleanOrgCandidate(s) {
    var t = String(s || '')
      .replace(/^[（(【\[]+/, '')
      .replace(/[）)】\]]+$/, '')
      .replace(/[的及与和]$/, '');
    t = trimOrgLead(t);
    return t.trim();
  }

  function hasOrgSuffix(s) {
    for (var i = 0; i < ORG_SUFFIX_SORTED.length; i++) {
      var suf = ORG_SUFFIX_SORTED[i];
      if (s.length > suf.length && s.slice(-suf.length) === suf) return true;
    }
    return false;
  }

  function isBadOrg(s) {
    if (!s || s.length < 3 || s.length > 30) return true;
    if (!/[\u4e00-\u9fa5]/.test(s)) return true;
    if (ORG_STOP_HEAD.indexOf(s[0]) !== -1) return true;
    for (var k = 0; k < ORG_SUFFIX.length; k++) if (s === ORG_SUFFIX[k]) return true;
    if (/^(?:股份|有限|责任|控股|集团|公司|企业|单位|机构|分支)/.test(s) && s.length <= 8) return true;
    for (var i = 0; i < ORG_BLACKLIST.length; i++) {
      if (s.indexOf(ORG_BLACKLIST[i]) !== -1) return true;
    }
    if (/^(?:一|二|三|四|五|六|七|八|九|十|第|即日|本次|以上|以下|所有|各)/.test(s)) return true;
    return false;
  }

  /**
   * 从一段文本中枚举机构候选。
   *
   * 两个关键设计：
   *  1. 非贪婪前缀 + 允许重叠起点：在每个位置取“最短合法名”，
   *     因此“应聘者登录中信银行”会在偏移 5 处再产出“中信银行”。
   *  2. 按「匹配结束位置」归并：同一个结尾的多个候选只保留一个，
   *     若更长候选多出的前缀是合法限定词（中国/国家/…）则取长的，
   *     否则取短的（丢掉“征程中信银行”里的“征程”这类句子残渣）。
   *
   * @returns {Array<{name:string, index:number, end:number, weight:number}>}
   */
  function findOrgCandidates(text) {
    var raw = [];
    if (!text) return raw;
    ORG_RE.lastIndex = 0;
    var m, guard = 0;
    while ((m = ORG_RE.exec(text)) !== null && guard++ < 8000) {
      var name = cleanOrgCandidate(m[0]);
      if (!isBadOrg(name) && hasOrgSuffix(name)) {
        raw.push({
          name: name,
          index: m.index + Math.max(0, m[0].length - name.length),
          end: m.index + m[0].length,
          raw: m[0],
          weight: Math.min(name.length, 20)
        });
      }
      ORG_RE.lastIndex = m.index + 1;  // 允许重叠，避免漏掉被前文吞掉的名字起点
    }
    return mergeByEndOffset(raw);
  }

  function mergeByEndOffset(cands) {
    var byEnd = Object.create(null);
    cands.forEach(function (c) {
      (byEnd[c.end] = byEnd[c.end] || []).push(c);
    });
    var out = [];
    Object.keys(byEnd).forEach(function (k) {
      var group = byEnd[k].sort(function (a, b) { return a.name.length - b.name.length; });
      var best = group[0];
      for (var i = 1; i < group.length; i++) {
        var cand = group[i];
        // 更长的候选必须“刚好”多出一个合法限定前缀，才值得采用
        var extra = cand.name.slice(0, cand.name.length - best.name.length);
        if (cand.name.slice(extra.length) !== best.name) continue;
        if (isLegitExtraPrefix(extra, cand.name)) best = cand;
      }
      out.push(best);
    });
    return out.sort(function (a, b) { return a.index - b.index; });
  }

  function isLegitExtraPrefix(extra, fullName) {
    if (!extra) return false;
    for (var i = 0; i < ORG_LEGIT_PREFIX_SORTED.length; i++) {
      var p = ORG_LEGIT_PREFIX_SORTED[i];
      if (extra === p) return true;
      // “中国+光大银行”这类两段式：前缀是合法词且剩余部分仍以合法词开头
      if (extra.length > p.length && extra.slice(0, p.length) === p) {
        var rest = extra.slice(p.length);
        for (var j = 0; j < ORG_LEGIT_PREFIX_SORTED.length; j++) {
          if (rest === ORG_LEGIT_PREFIX_SORTED[j]) return true;
        }
      }
    }
    return false;
  }

  // 标题里的机构名模式：公众号招聘推文标题高度模板化，优先用规则直取
  var TITLE_ORG_PATTERNS = [
    /(?:^|[｜|·:：\-—>》】\]])\s*(?:20\d{2}\s*年?\s*)?([\u4e00-\u9fa5]{2,20}?)(?:\s*20\d{2}|\s*届|\s*年|\s*招聘|\s*校园招聘|\s*人才招聘|\s*启动|\s*公告|\s*简章|\s*开启)/,
    /([\u4e00-\u9fa5]{2,20}(?:银行|集团|公司|证券|保险|基金|研究院|研究所|大学|学院|医院|电网|电力|通信|科技|事务所|中心|局))\s*(?:20\d{2}|届)/,
    /^\s*([\u4e00-\u9fa5]{2,20}?(?:银行|集团|公司|证券|保险|基金|研究院|研究所|大学|学院|医院|电网|电力|通信|科技|事务所|中心|局))/
  ];

  /** 针对标题的机构名直取（最高优先级）。 */
  function extractOrgFromTitle(title) {
    if (!title) return null;
    var t = normalize(title);
    for (var i = 0; i < TITLE_ORG_PATTERNS.length; i++) {
      var m = t.match(TITLE_ORG_PATTERNS[i]);
      if (!m || !m[1]) continue;
      var name = cleanOrgCandidate(m[1].replace(ORG_TAIL_NOISE, ''));
      if (isBadOrg(name) && !hasOrgSuffix(name)) continue;
      if (name.length < 3 || name.length > 24) continue;
      if (!hasOrgSuffix(name)) continue;
      return { name: name, pattern: i, raw: m[0] };
    }
    return null;
  }

  /** 从公众号名里取机构：中信银行招聘 → 中信银行 */
  function extractOrgFromAccount(account) {
    if (!account) return null;
    var t = normalize(account)
      .replace(/(?:校园招聘|社会招聘|人才招聘|招聘|招贤馆|人力资源|人事|HR|hr|新闻|资讯|校招|推推|官方|服务号|订阅号|公众号)+$/g, '')
      .trim();
    if (t.length < 3) return null;
    var cands = findOrgCandidates(t);
    if (cands.length) return { name: cands[0].name, raw: account };
    if (hasOrgSuffix(t) && !isBadOrg(t)) return { name: t, raw: account };
    return null;
  }

  /** 找出某机构名的完整法律名称（用于别名展示）。 */
  function findFullOrgNames(text, brand) {
    if (!text || !brand) return [];
    var out = [];
    var tails = ['股份有限公司', '有限责任公司', '有限公司', '集团有限公司', '集团'];
    for (var i = 0; i < tails.length; i++) {
      var idx = text.indexOf(brand + tails[i]);
      if (idx !== -1) out.push(brand + tails[i]);
    }
    return uniq(out);
  }

  /* ------------------------------------------------------------------ *
   * 招聘批次 / 届别
   * ------------------------------------------------------------------ */

  function extractBatch(text) {
    if (!text) return null;
    var t = normalize(text);
    var m;
    // 2027届 / 2027 届毕业生
    if ((m = t.match(/(20\d{2})\s*届/))) return { year: +m[1], label: m[1] + '届', raw: m[0] };
    // 2027年校园招聘 / 2027年应届毕业生
    if ((m = t.match(/(20\d{2})\s*年(?:度)?\s*(?:校园招聘|校招|应届|毕业生|秋季招聘|春季招聘)/))) {
      return { year: +m[1], label: m[1] + '届', raw: m[0] };
    }
    // 面向2027年
    if ((m = t.match(/面向\s*(20\d{2})\s*年/))) return { year: +m[1], label: m[1] + '届', raw: m[0] };
    return null;
  }

  var RECRUIT_TYPE_RULES = [
    [/暑期实习|暑假实习/, '暑期实习'],
    [/寒假实习/, '寒假实习'],
    [/日常实习|实习生招聘|实习招聘/, '实习'],
    [/秋季校园招聘|秋季招聘|秋招/, '秋季校园招聘'],
    [/春季校园招聘|春季招聘|春招/, '春季校园招聘'],
    [/校园招聘|校招|应届毕业生招聘/, '校园招聘'],
    [/社会招聘|社招|experienced/, '社会招聘'],
    [/定向招聘|专项招聘/, '专项招聘']
  ];

  function extractRecruitType(text) {
    if (!text) return null;
    for (var i = 0; i < RECRUIT_TYPE_RULES.length; i++) {
      var m = text.match(RECRUIT_TYPE_RULES[i][0]);
      if (m) return { value: RECRUIT_TYPE_RULES[i][1], raw: m[0] };
    }
    return null;
  }

  /* ------------------------------------------------------------------ *
   * 时间 / 截止日期
   * ------------------------------------------------------------------ */

  var CN_NUM = { '一': 1, '二': 2, '三': 3, '四': 4, '五': 5, '六': 6, '七': 7, '八': 8, '九': 9, '十': 10, '十一': 11, '十二': 12 };

  function pad2(n) { return (n < 10 ? '0' : '') + n; }

  function toISODate(y, mo, d) {
    if (!y || !mo || !d) return null;
    if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
    return y + '-' + pad2(mo) + '-' + pad2(d);
  }

  var DATE_RE = /(20\d{2})\s*[年\-/.]\s*(\d{1,2})\s*[月\-/.]\s*(\d{1,2})\s*日?/g;
  var MONTHDAY_RE = /(\d{1,2})\s*月\s*(\d{1,2})\s*日/g;

  var DEADLINE_CTX = /(?:截止|截至|报名时间|报名日期|投递时间|网申时间|申请时间|结束时间|结束日期|deadline|Deadline|DEADLINE)/;

  /**
   * 提取投递/报名截止时间。
   * 策略：优先在“截止/报名/网申”等上下文词附近找完整日期；否则找“X月X日”并与上下文年份拼接。
   */
  function extractDeadline(text, fallbackYear, nowYear) {
    if (!text) return null;
    var t = normalize(text);
    var best = null;
    var nowY = nowYear || new Date().getFullYear();

    // 1) 上下文窗口内找完整日期
    var m;
    DATE_RE.lastIndex = 0;
    while ((m = DATE_RE.exec(t)) !== null) {
      var start = Math.max(0, m.index - 24);
      var ctx = t.slice(start, m.index + m[0].length + 12);
      if (DEADLINE_CTX.test(ctx)) {
        var iso = toISODate(+m[1], +m[2], +m[3]);
        if (iso && isPlausibleDeadline(iso, nowY)) {
          var score = 10;
          if (/截止|截至/.test(ctx)) score += 10;
          if (/简历|投递|报名|网申|申请/.test(ctx)) score += 5;
          if (!best || score > best.score) best = { value: iso, raw: m[0], score: score, ctx: ctx.trim() };
        }
      }
    }
    if (best) return drop(best);

    // 2) “X月X日” + 上下文年份
    MONTHDAY_RE.lastIndex = 0;
    while ((m = MONTHDAY_RE.exec(t)) !== null) {
      var s2 = Math.max(0, m.index - 24);
      var ctx2 = t.slice(s2, m.index + m[0].length + 12);
      if (!DEADLINE_CTX.test(ctx2)) continue;
      var yr = +m[1] >= 1 && +m[1] <= 12 && fallbackYear ? fallbackYear : null;
      // 先看窗前文里的年份
      var ym = ctx2.match(/(20\d{2})\s*年/);
      if (ym) yr = +ym[1];
      var iso2 = yr ? toISODate(yr, +m[1], +m[2]) : null;
      if (iso2 && isPlausibleDeadline(iso2, nowY)) {
        var sc = 8;
        if (/截止|截至/.test(ctx2)) sc += 8;
        if (!best || sc > best.score) best = { value: iso2, raw: m[0], score: sc, ctx: ctx2.trim(), yearAssumed: !ym };
      }
    }
    return best ? drop(best) : null;

    function drop(o) { return { value: o.value, raw: o.raw, evidence: o.ctx, yearAssumed: !!o.yearAssumed }; }
  }

  /** 招聘截止日期通常落在“当年起算 −1 ~ +1 年”内；超出则视为误匹配。 */
  function isPlausibleDeadline(iso, nowYear) {
    var y = +iso.slice(0, 4);
    var nowY = nowYear || new Date().getFullYear();
    return y >= nowY - 1 && y <= nowY + 1;
  }

  /** 提取正文中所有日期，用于“报名时间”区间等展示。 */
  function findAllDates(text) {
    var out = [];
    if (!text) return out;
    var m;
    DATE_RE.lastIndex = 0;
    while ((m = DATE_RE.exec(text)) !== null) {
      var iso = toISODate(+m[1], +m[2], +m[3]);
      if (iso) out.push({ value: iso, raw: m[0], index: m.index });
    }
    return out;
  }

  /* ------------------------------------------------------------------ *
   * 学历 / 专业 / 岗位 / 地点 / 人数 / 联系方式
   * ------------------------------------------------------------------ */

  var EDU_ORDER = ['大专', '专科', '本科', '硕士研究生', '硕士', '博士研究生', '博士', '研究生', 'MBA'];
  var EDU_CANON = {
    '大专': '大专', '专科': '大专', '本科': '本科', '学士': '本科',
    '硕士': '硕士', '硕士研究生': '硕士', 'MBA': 'MBA',
    '博士': '博士', '博士研究生': '博士', '研究生': '硕士及以上'
  };

  function extractEducation(text) {
    if (!text) return null;
    var found = [];
    for (var i = 0; i < EDU_ORDER.length; i++) {
      var k = EDU_ORDER[i];
      if (text.indexOf(k) !== -1) {
        var canon = EDU_CANON[k] || k;
        if (found.indexOf(canon) === -1) found.push(canon);
      }
    }
    if (!found.length) return null;
    var minReq = null;
    var m = text.match(/(大专|专科|本科|硕士|硕士研究生|研究生|博士|博士研究生)\s*(?:及以上|以上|或以上)/);
    if (m) minReq = EDU_CANON[m[1]] || m[1];
    return { list: found, minRequirement: minReq, raw: m ? m[0] : null };
  }

  var MAJOR_KEYWORDS = [
    '经济学类', '管理学类', '法学类', '理学类', '工学类', '文学类', '医学类', '教育学类', '农学类', '艺术学类',
    '经济学', '金融学', '金融工程', '经济统计学', '国际经济与贸易', '贸易经济', '财政学', '税收学', '税务',
    '会计学', '财务管理', '审计学', '审计', '统计学', '应用统计', '数学', '应用数学', '信息与计算科学',
    '计算机科学与技术', '计算机', '软件工程', '软件', '信息科技', '信息技术', '网络工程', '信息安全', '网络空间安全',
    '人工智能', '数据科学', '大数据', '智能科学与技术', '自动化', '电子信息工程', '电子科学与技术', '通信工程',
    '微电子', '集成电路', '物联网工程', '数字媒体技术',
    '管理科学与工程', '信息管理与信息系统', '工商管理', '市场营销', '人力资源管理', '行政管理', '公共管理',
    '物流管理', '电子商务', '工程管理', '项目管理', '旅游管理',
    '法学', '法律', '民商法', '经济法', '知识产权',
    '汉语言文学', '新闻传播学', '新闻学', '传播学', '广告学', '英语', '商务英语', '翻译',
    '机械工程', '机械设计制造及其自动化', '车辆工程', '土木工程', '建筑学', '工程力学', '材料科学与工程',
    '化学工程与工艺', '应用化学', '环境工程', '生物工程', '生物技术', '制药工程', '食品科学与工程',
    '电气工程及其自动化', '电气工程', '能源与动力工程', '新能源材料与器件',
    '物理学', '应用物理学', '化学', '生物科学', '心理学', '社会学', '政治学',
    '数学统计', '经济金融', '财务会计', '信息科技类', '产业', '其他专业'
  ];
  var MAJOR_SORTED = MAJOR_KEYWORDS.slice().sort(function (a, b) { return b.length - a.length; });

  function extractMajors(text) {
    if (!text) return null;
    // 优先取“招聘专业/需求专业”段落
    var seg = null;
    var m = text.match(/(?:招聘专业|需求专业|专业要求|所学专业|专业方向)\s*[:：]?\s*([\s\S]{0,200}?)(?:\n\s*\n|[。;；]|\n(?=[一二三四五六七八九十]+、))/);
    if (m) seg = m[1];
    var haystack = seg || text;
    var hits = [];
    for (var i = 0; i < MAJOR_SORTED.length; i++) {
      var kw = MAJOR_SORTED[i];
      if (haystack.indexOf(kw) === -1) continue;
      // 去重：若已有更长词包含它则跳过
      var dup = false;
      for (var j = 0; j < hits.length; j++) {
        if (hits[j].indexOf(kw) !== -1 || kw.indexOf(hits[j]) !== -1) { dup = true; break; }
      }
      if (!dup) hits.push(kw);
    }
    // 过滤掉过泛的“产业/其他专业”之外的单字噪声
    hits = hits.filter(function (s) { return s.length >= 2; });
    if (!hits.length) return null;
    return { list: hits.slice(0, 30), fromDedicatedSection: !!seg, raw: seg ? seg.trim().slice(0, 200) : null };
  }

  var POSITION_KEYWORDS = [
    '管理培训生', '管培生', '储备干部', '经办岗', '综合柜员', '柜员', '大堂经理', '客户经理', '理财经理',
    '产品经理', '项目经理', '研发工程师', '软件开发工程师', '软件工程师', '算法工程师', '数据工程师',
    '数据分析师', '数据科学家', '测试工程师', '运维工程师', '网络工程师', '信息安全工程师', '系统架构师',
    '前端开发', '后端开发', '全栈开发', '大数据开发', '人工智能工程师', '机器学习工程师',
    '风险管理', '风控', '合规', '内部审计', '审计岗', '财务会计', '财务岗', '会计岗', '税务岗',
    '人力资源', '行政', '法务', '法律事务', '市场营销', '市场推广', '品牌宣传', '运营', '客户服务',
    '投资银行', '金融市场', '交易银行', '国际业务', '资产管理', '财富管理', '私人银行', '授信审批',
    '信贷', '普惠金融', '零售银行', '公司银行', '同业业务', '托管', '票据', '资金交易', '研究分析',
    '信息科技岗', '科技岗', '业务岗', '营销岗', '技术岗', '职能岗', '综合岗', '管理岗', '专业岗'
  ];
  var POSITION_SORTED = POSITION_KEYWORDS.slice().sort(function (a, b) { return b.length - a.length; });

  function extractPositions(text) {
    if (!text) return null;
    var seg = null;
    var m = text.match(/(?:招聘岗位|招聘职位|岗位名称|职位名称|需求岗位|招聘方向)\s*[:：]?\s*([\s\S]{0,300}?)(?:\n\s*\n|四、|五、|六、)/);
    if (m) seg = m[1];
    var hits = [];
    var haystack = seg || text;
    for (var i = 0; i < POSITION_SORTED.length; i++) {
      var kw = POSITION_SORTED[i];
      if (haystack.indexOf(kw) === -1) continue;
      var dup = false;
      for (var j = 0; j < hits.length; j++) {
        if (hits[j].indexOf(kw) !== -1 || kw.indexOf(hits[j]) !== -1) { dup = true; break; }
      }
      if (!dup) hits.push(kw);
    }
    if (!hits.length) return null;
    return { list: hits.slice(0, 25), fromDedicatedSection: !!seg, raw: seg ? seg.trim().slice(0, 300) : null };
  }

  var PROVINCES = ['北京', '天津', '上海', '重庆', '河北', '山西', '辽宁', '吉林', '黑龙江', '江苏', '浙江', '安徽',
    '福建', '江西', '山东', '河南', '湖北', '湖南', '广东', '海南', '四川', '贵州', '云南', '陕西', '甘肃', '青海',
    '台湾', '内蒙古', '广西', '西藏', '宁夏', '新疆', '香港', '澳门'];

  var CITIES = ['北京', '天津', '上海', '重庆', '石家庄', '唐山', '保定', '廊坊', '太原', '大同', '呼和浩特', '包头',
    '沈阳', '大连', '鞍山', '长春', '吉林', '哈尔滨', '大庆', '南京', '苏州', '无锡', '常州', '南通', '徐州', '扬州',
    '盐城', '镇江', '泰州', '连云港', '杭州', '宁波', '温州', '嘉兴', '绍兴', '金华', '台州', '湖州', '丽水', '衢州',
    '舟山', '合肥', '芜湖', '蚌埠', '福州', '厦门', '泉州', '漳州', '南昌', '赣州', '九江', '济南', '青岛', '烟台',
    '潍坊', '临沂', '淄博', '济宁', '泰安', '威海', '东营', '郑州', '洛阳', '南阳', '新乡', '许昌', '武汉', '宜昌',
    '襄阳', '长沙', '株洲', '湘潭', '岳阳', '常德', '广州', '深圳', '珠海', '佛山', '东莞', '中山', '惠州', '江门',
    '肇庆', '汕头', '湛江', '南宁', '柳州', '桂林', '海口', '三亚', '成都', '绵阳', '德阳', '宜宾', '贵阳', '遵义',
    '昆明', '曲靖', '拉萨', '西安', '咸阳', '宝鸡', '兰州', '西宁', '银川', '乌鲁木齐', '克拉玛依'];

  function extractLocations(text) {
    if (!text) return null;
    var seg = null;
    var m = text.match(/(?:工作地点|工作城市|工作地域|工作地址|工作所在地|上班地点|base地)\s*[:：]?\s*([\s\S]{0,120}?)(?:\n|。|;|；)/);
    if (m) seg = m[1];

    var hits = [];
    var source = seg || text;

    // 城市/省份直接命中
    for (var i = 0; i < CITIES.length; i++) {
      var c = CITIES[i];
      if (source.indexOf(c) !== -1 && hits.indexOf(c) === -1) hits.push(c);
    }
    for (var p = 0; p < PROVINCES.length; p++) {
      var pv = PROVINCES[p];
      // 省份名同时是城市名（北京/上海/天津/重庆）时不重复计
      if (source.indexOf(pv) !== -1 && hits.indexOf(pv) === -1 && CITIES.indexOf(pv) === -1) hits.push(pv);
    }
    var nationwide = /全国|境内外|不限|各地|全国各(?:地|省)/.test(text);
    if (!hits.length && !nationwide) return null;
    return {
      list: hits.slice(0, 60),
      nationwide: nationwide,
      fromDedicatedSection: !!seg,
      raw: seg ? seg.trim() : null
    };
  }

  function extractHeadcount(text) {
    if (!text) return null;
    var m = text.match(/(?:招聘|需求|计划|拟招|招募)\s*(?:人数)?\s*[:：]?\s*(\d{1,5})\s*(?:余)?\s*人/);
    if (m) return { value: +m[1], raw: m[0] };
    m = text.match(/(\d{2,5})\s*人(?:左右|以上)?/);
    if (m) return { value: +m[1], raw: m[0], weak: true };
    return null;
  }

  function extractContacts(text) {
    if (!text) return null;
    var emails = uniq((text.match(/[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}/g) || [])
      .filter(function (e) { return !/\.(png|jpg|jpeg|gif|webp)$/i.test(e); }));
    var phones = uniq((text.match(/(?:\+?86[-\s]?)?1[3-9]\d{9}|0\d{2,3}[-\s]?\d{7,8}(?:[-\s]?\d{1,5})?/g) || [])
      .map(function (p) { return p.trim(); }));
    if (!emails.length && !phones.length) return null;
    return { emails: emails, phones: phones };
  }

  function uniq(arr) {
    var seen = Object.create(null), out = [];
    for (var i = 0; i < arr.length; i++) {
      var k = arr[i];
      if (!seen[k]) { seen[k] = 1; out.push(k); }
    }
    return out;
  }

  function escapeRe(s) { return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

  /* ------------------------------------------------------------------ *
   * 链接分类
   * ------------------------------------------------------------------ */

  var ATS_DOMAINS = [
    'hotjob.cn', 'wecruit.hotjob.cn', '51job.com', 'campus.51job.com', 'jobs.51job.com', 'zhaopin.com',
    'xiaoyuan.zhaopin.com', 'liepin.com', 'mokahr.com', 'app.mokahr.com', 'beisen.com', 'dayee.com',
    'campus.chinahr.com', 'chinahr.com', 'iguopin.com', 'career.51job.com', 'hirede.com', 'zhiye.com',
    'nowinsz.com', 'northcampus.com', 'wjx.cn', 'job.citicbank.com', 'eoap.cebbank.com', 'zhaopin.hxb.com.cn',
    'career.hxb.com.cn', 'bosc.cn', 'bankcomm.com', 'myjob.10086.cn', 'campus.icbc.com.cn', 'job.ccb.com',
    'career.abchina.com', 'campus.bankofchina.com', 'job.bankofbeijing.com.cn', 'campus.spdb.com.cn'
  ];

  var JOB_DOMAIN_HINT = /(^|[.\-/])(job|jobs|career|careers|hr|zhaopin|recruit|recruitment|campus|zp|xyzp|apply|talent|wecruit|zhiye|hro)([.\-/]|$)/i;
  var WECHAT_HOST = /(^|\.)(mp\.weixin\.qq\.com|weixin\.qq\.com|wework\.qq\.com)$/i;

  var ANCHOR_APPLY = /(投递|报名|网申|申请|应聘|简历|立即申请|去申请|apply|join\s*us|职位申请|在线申请|查看职位|进入官网|官网投递)/i;
  var ANCHOR_NOISE = /(分享|转发|点赞|在看|关注|订阅|二维码|扫码|微信|朋友圈|留言|评论|投诉|举报|版权|免责|广告|课程|培训|客服|下载\s*APP)/;

  function safeHost(url) {
    try {
      return new URL(url).hostname.toLowerCase();
    } catch (e) { return ''; }
  }

  function isWechatHost(host) { return WECHAT_HOST.test(host); }

  function isAtsDomain(host) {
    for (var i = 0; i < ATS_DOMAINS.length; i++) {
      var d = ATS_DOMAINS[i];
      if (host === d || host.endsWith('.' + d)) return true;
    }
    return false;
  }

  /**
   * 给一个链接打分，判断“这是不是投递入口”。
   * @returns {{score:number, kind:string, reasons:string[]}}
   */
  function scoreLink(url, anchorText, nearText) {
    var host = safeHost(url);
    var reasons = [];
    var score = 0;
    var kind = 'other';

    if (!host) return { score: -999, kind: 'invalid', reasons: ['URL 无法解析'] };

    if (isWechatHost(host)) {
      if (/\/s\?|__biz=/.test(url)) { kind = 'wechat'; score -= 60; reasons.push('微信站内文章链接'); }
      else if (/\/mp\/redirect/.test(url)) { kind = 'redirect'; score += 5; reasons.push('微信外链跳转中间页'); }
      else { kind = 'wechat'; score -= 40; reasons.push('微信域名'); }
    } else if (isAtsDomain(host)) {
      kind = 'ats'; score += 45; reasons.push('已知招聘系统域名 ' + host);
    } else if (JOB_DOMAIN_HINT.test(host)) {
      kind = 'official'; score += 40; reasons.push('域名含招聘/官网关键词 ' + host);
    } else {
      kind = 'official'; score += 10; reasons.push('站外链接 ' + host);
    }

    if (anchorText) {
      if (ANCHOR_APPLY.test(anchorText)) { score += 30; reasons.push('锚文本含投递语义：“' + anchorText.slice(0, 20) + '”'); }
      if (ANCHOR_NOISE.test(anchorText)) { score -= 35; reasons.push('锚文本疑似噪声'); }
    }
    if (nearText) {
      if (/(阅读原文|阅读全文)/.test(nearText)) { score += 12; reasons.push('邻近“阅读原文”'); }
      if (/(投递|网申|报名|申请)/.test(nearText)) { score += 10; reasons.push('邻近投递语义'); }
    }
    if (/\.(png|jpe?g|gif|webp|svg|mp4|mp3|zip|rar|docx?|xlsx?|pptx?|pdf)$/i.test(url)) {
      score -= 80; reasons.push('非网页资源');
    }
    return { score: score, kind: kind, reasons: reasons };
  }

  /** 解码微信跳转中间页 / 各类 URL 包装。 */
  function unwrapUrl(url) {
    if (!url) return url;
    var u = String(url).trim();
    for (var guard = 0; guard < 3; guard++) {
      var next = u;
      try {
        var parsed = new URL(u);
        var q = parsed.searchParams;
        var inner = q.get('url') || q.get('target_url') || q.get('u') || q.get('link') || q.get('redirect') || q.get('to');
        if (inner) {
          try { inner = decodeURIComponent(inner); } catch (e) { /* 已是明文 */ }
          if (/^https?:\/\//i.test(inner)) next = inner;
        } else if (/\/link$/.test(parsed.pathname) && q.get('target')) {
          next = q.get('target');
        }
      } catch (e) { /* 相对链接，忽略 */ }
      if (next === u) break;
      u = next;
    }
    return u;
  }

  return {
    normalize: normalize,
    escapeRe: escapeRe,
    uniq: uniq,

    ORG_SUFFIX: ORG_SUFFIX,
    ORG_SUFFIX_SORTED: ORG_SUFFIX_SORTED,
    ORG_BLACKLIST: ORG_BLACKLIST,
    findOrgCandidates: findOrgCandidates,
    findFullOrgNames: findFullOrgNames,
    extractOrgFromTitle: extractOrgFromTitle,
    extractOrgFromAccount: extractOrgFromAccount,
    hasOrgSuffix: hasOrgSuffix,
    cleanOrgCandidate: cleanOrgCandidate,
    trimOrgLead: trimOrgLead,
    isBadOrg: isBadOrg,

    extractBatch: extractBatch,
    extractRecruitType: extractRecruitType,
    extractDeadline: extractDeadline,
    findAllDates: findAllDates,
    toISODate: toISODate,

    extractEducation: extractEducation,
    extractMajors: extractMajors,
    extractPositions: extractPositions,
    extractLocations: extractLocations,
    extractHeadcount: extractHeadcount,
    extractContacts: extractContacts,

    ATS_DOMAINS: ATS_DOMAINS,
    JOB_DOMAIN_HINT: JOB_DOMAIN_HINT,
    safeHost: safeHost,
    isAtsDomain: isAtsDomain,
    isWechatHost: isWechatHost,
    scoreLink: scoreLink,
    unwrapUrl: unwrapUrl,

    CITIES: CITIES,
    PROVINCES: PROVINCES
  };
});

/* ==================== src/core/classify.js ==================== */
/*!
 * 微信求职信息提取器 — 内容类型判别 (classify.js)
 *
 * 公众号推送类型很杂：招聘启事、文献分享、政策解读、活动通知……
 * 这里用加权关键词给「招聘」与「文献」两类打分，自动决定该跑哪套提取器。
 *
 * 设计要点：
 *  - 标题权重 3、公众号名权重 2、正文权重 1；强特征词权重远高于弱特征词
 *  - DOI / arXiv / PMID 这类"硬凭据"直接给高分，不依赖措辞
 *  - 两类分数接近时判为 hybrid，两套提取器都跑，结果合并
 */
(function (root, factory) {
  var api = factory(
    (typeof module !== 'undefined' && module.exports) ? require('./rules.js') : (root && root.WJE && root.WJE.rules)
  );
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) { root.WJE = root.WJE || {}; root.WJE.classify = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (rules) {
  'use strict';

  var TYPE_RECRUIT = 'recruit';
  var TYPE_LITERATURE = 'literature';
  var TYPE_GENERAL = 'general';
  var TYPE_HYBRID = 'hybrid';

  /* --------------------------- 关键词表 --------------------------- */

  var RECRUIT_STRONG = [
    '校园招聘', '社会招聘', '秋季招聘', '春季招聘', '校招', '秋招', '春招', '网申', '简历投递', '投递简历',
    '应届毕业生', '应届生', '招聘岗位', '招聘公告', '招聘启事', '招聘简章', '投递截止', '报名截止', '招聘对象',
    '管理培训生', '管培生', '实习生招聘', '暑期实习', '笔试', '面试', '录用', 'offer', '应聘', '招聘流程',
    '薪酬福利', '五险一金', '工作地点', '学历要求', '专业要求', '网申通道', '简历筛选', '招聘官网'
  ];
  var RECRUIT_WEAK = [
    '招聘', '岗位', '职位', '简历', '待遇', '薪酬', '年薪', '月薪', '入职', '试用期', '编制', '双休',
    '单位简介', '应聘者', '求职', '宣讲会', '双选会', '人才引进', '定向选调', '选调生', '事业编'
  ];

  var LITERATURE_STRONG = [
    '文献', '论文', 'DOI', 'doi', '期刊', '摘要', '影响因子', '参考文献', '通讯作者', '第一作者',
    '共同一作', '综述', '预印本', 'arXiv', 'arxiv', 'PubMed', 'PMID', '引用格式', '文献分享',
    '论文标题', '论文导读', '文献导读', '科研', '学术论文', '研究成果', '课题组', '投稿', '审稿',
    '分区', 'Q1', 'Q2', '中科院', 'JCR', '卷期', 'pp.', 'et al', 'Accepted', 'Published'
  ];
  var LITERATURE_WEAK = [
    '研究', '作者', '发表', '教授', '博士', '院士', '实验', '方法', '结论', '数据', '模型', '机制',
    '分析', '综述', '团队', '机构', '大学', '学院', '实验室', '样本', '显著', '假设', '验证',
    '大学', '研究所', '学会', '会议', '报告'
  ];

  // 硬凭据：出现即强烈指向文献
  var HARD_PATTERNS = [
    { re: /\b10\.\d{4,9}\/[-._;()\/:a-zA-Z0-9<>]+/, weight: 60, label: 'DOI' },
    { re: /arXiv[:\s]*\d{4}\.\d{4,5}/i, weight: 55, label: 'arXiv 编号' },
    { re: /\bPMID[:\s]*\d{7,8}/i, weight: 50, label: 'PubMed ID' },
    { re: /(?:Nature|Science|Cell|Lancet|NEJM|JAMA|BMJ|PNAS)\s*[|｜,，]?\s*\d{4}/, weight: 35, label: '顶刊名+年份' },
    { re: /影响因子\s*[:：]?\s*[\d.]+/, weight: 40, label: '影响因子' },
    { re: /(?:中科院|JCR)\s*(?:大类)?\s*(?:一区|二区|三区|四区|Q[1-4])/i, weight: 40, label: '期刊分区' }
  ];

  var KNOWN_PUBLISHER_RE = /(?:nature\.com|science\.org|sciencedirect|springer|wiley|ieeexplore|acs\.org|rsc\.org|tandfonline|sagepub|frontiersin|mdpi\.com|plos\.org|cell\.com|nejm\.org|thelancet|bmj\.com|jamanetwork|pnas\.org|arxiv\.org|biorxiv|medrxiv|ssrn\.com|cnki\.net|wanfangdata|cqvip|x-mol\.com|doi\.org|pubmed)/i;

  /* --------------------------- 打分 --------------------------- */

  function countHits(text, list, weight) {
    if (!text) return { score: 0, hits: [] };
    var score = 0, hits = [];
    for (var i = 0; i < list.length; i++) {
      var kw = list[i];
      var idx = text.indexOf(kw);
      if (idx === -1) continue;
      // 命中一次得基础分，重复出现有递减加成（最多 +3 次）
      var n = 0, from = 0, p;
      while ((p = text.indexOf(kw, from)) !== -1 && n < 4) { n++; from = p + kw.length; }
      score += weight * (1 + Math.min(n - 1, 3) * 0.35);
      if (hits.length < 12) hits.push(kw);
    }
    return { score: score, hits: hits };
  }

  function scoreSignals(title, account, body, list, wTitle, wAccount, wBody) {
    var t = countHits(title, list, wTitle);
    var a = countHits(account, list, wAccount);
    var b = countHits(body, list, wBody);
    // 正文命中词种很多时给一个封顶的多样性奖励（避免长文靠堆词取胜）
    var diversity = Math.min(b.hits.length, 10) * wBody * 0.5;
    return {
      score: t.score + a.score + b.score + diversity,
      hits: rules.uniq(t.hits.concat(a.hits).concat(b.hits)),
      inTitle: t.hits
    };
  }

  /**
   * 判别推送类型。
   * @param {{title:string, account:string, contentText:string}} raw
   * @returns {{type:string, confidence:string, scores:object, evidence:Array, hints:Array}}
   */
  function detect(raw) {
    raw = raw || {};
    var title = rules.normalize(raw.title || '');
    var account = rules.normalize(raw.account || '');
    var bodyAll = raw.contentText || '';
    var bodyHead = bodyAll.slice(0, 2000);
    var body = bodyHead + '\n' + bodyAll.slice(-600);   // 头部+尾部，尾部常有"参考文献/引用格式"

    var R_S = scoreSignals(title, account, body, RECRUIT_STRONG, 6, 5, 1.2);
    var R_W = scoreSignals(title, account, bodyHead, RECRUIT_WEAK, 2.4, 2, 0.45);
    var L_S = scoreSignals(title, account, body, LITERATURE_STRONG, 6, 5, 1.2);
    var L_W = scoreSignals(title, account, bodyHead, LITERATURE_WEAK, 1.6, 1.4, 0.35);

    // 把「关键词/结构信号」与「硬凭据」分开记：
    // 硬凭据（DOI、影响因子…）动辄 +40~+60，会淹没关键词层面的平衡，
    // 所以 hybrid 判定只看基础分，总分只用于决定最终归属。
    var recruitBase = R_S.score + R_W.score;
    var literatureBase = L_S.score + L_W.score;
    var literatureHard = 0;
    var evidence = [];

    var hay = title + '\n' + body;
    HARD_PATTERNS.forEach(function (hp) {
      if (hp.re.test(hay)) {
        literatureHard += hp.weight;
        evidence.push('命中硬凭据：' + hp.label + '（+ ' + hp.weight + '）');
      }
    });

    // 链接里的学术域名 / 招聘域名（结构性证据，计入基础分）
    var links = (raw.anchors || []).concat((raw.bareUrls || []).map(function (b) { return { href: b.url }; }));
    var paperLinks = 0, jobLinks = 0;
    links.forEach(function (a) {
      if (!a.href) return;
      var u = rules.unwrapUrl(rules.normalize(a.href));
      if (KNOWN_PUBLISHER_RE.test(u)) paperLinks++;
      if (/job|zhaopin|recruit|campus|career|wecruit|hotjob|51job/i.test(u)) jobLinks++;
    });
    if (paperLinks) {
      literatureBase += Math.min(paperLinks, 5) * 12;
      evidence.push('正文含 ' + paperLinks + ' 条学术出版域名链接（+ ' + Math.min(paperLinks, 5) * 12 + '）');
    }
    if (jobLinks) {
      recruitBase += Math.min(jobLinks, 5) * 12;
      evidence.push('正文含 ' + jobLinks + ' 条招聘系统链接（+ ' + Math.min(jobLinks, 5) * 12 + '）');
    }

    // 「阅读原文」指向学术域名 → 强文献信号（但仍属结构证据，计基础分）
    if (raw.readOriginal && raw.readOriginal.url && KNOWN_PUBLISHER_RE.test(raw.readOriginal.url)) {
      literatureBase += 40;
      evidence.push('「阅读原文」指向学术出版站点（+ 40）');
    }

    // 结构化著录格式（年, 卷(期): 页码）
    if (/\b\d{4}\s*[,，]\s*\d{1,3}\s*\(\d{1,3}\)\s*[:：]\s*\d+/.test(body)) {
      literatureBase += 20;
      evidence.push('出现「年, 卷(期): 页码」著录格式（+ 20）');
    }

    var recruit = {
      base: round1(recruitBase),
      hard: 0,
      total: round1(recruitBase),
      hits: rules.uniq(R_S.hits.concat(R_W.hits)),
      strong: R_S.hits
    };
    var literature = {
      base: round1(literatureBase),
      hard: round1(literatureHard),
      total: round1(literatureBase + literatureHard),
      hits: rules.uniq(L_S.hits.concat(L_W.hits)),
      strong: L_S.hits
    };

    var FLOOR = 6;           // 总分低于此 → 通用
    var HYBRID_FLOOR = 10;   // 两类基础分都要达到这个量级
    var HYBRID_RATIO = 0.35; // 且弱的一方不低于强方的 35%

    var maxTotal = Math.max(recruit.total, literature.total);
    var minBase = Math.min(recruit.base, literature.base);
    var maxBase = Math.max(recruit.base, literature.base);
    var type, confidence;

    if (maxTotal < FLOOR) {
      type = TYPE_GENERAL;
      confidence = 'low';
    } else if (minBase >= HYBRID_FLOOR && maxBase > 0 && minBase / maxBase >= HYBRID_RATIO) {
      type = TYPE_HYBRID;
      confidence = 'medium';
    } else if (recruit.total >= literature.total) {
      type = TYPE_RECRUIT;
      confidence = recruit.total >= 25 ? 'high' : 'medium';
    } else {
      type = TYPE_LITERATURE;
      confidence = literature.total >= 25 ? 'high' : 'medium';
    }

    var scoreText = '招聘 ' + recruit.total + '（基础 ' + recruit.base + '） / 文献 ' +
      literature.total + '（基础 ' + literature.base + ' + 硬凭据 ' + literature.hard + '）';
    if (type === TYPE_HYBRID) evidence.unshift('两类信号都较强（' + scoreText + '），两套提取器并行');
    else if (type === TYPE_GENERAL) evidence.unshift('两类信号都很弱（' + scoreText + '），按通用模式处理');
    else evidence.unshift(scoreText + ' → ' + label(type));

    return {
      type: type,
      confidence: confidence,
      scores: {
        recruit: recruit.total, literature: literature.total,
        recruitBase: recruit.base, literatureBase: literature.base, literatureHard: literature.hard
      },
      evidence: evidence,
      hints: {
        recruit: recruit.hits.slice(0, 12),
        literature: literature.hits.slice(0, 12)
      },
      labels: {
        recruit: '招聘求职',
        literature: '文献阅读',
        general: '通用信息',
        hybrid: '招聘 + 文献'
      }
    };
  }

  function round1(n) { return Math.round(n * 10) / 10; }

  function label(type) {
    return {
      recruit: '招聘求职',
      literature: '文献阅读',
      general: '通用信息',
      hybrid: '招聘 + 文献'
    }[type] || type;
  }

  return {
    detect: detect,
    label: label,
    TYPE_RECRUIT: TYPE_RECRUIT,
    TYPE_LITERATURE: TYPE_LITERATURE,
    TYPE_GENERAL: TYPE_GENERAL,
    TYPE_HYBRID: TYPE_HYBRID,
    RECRUIT_STRONG: RECRUIT_STRONG,
    RECRUIT_WEAK: RECRUIT_WEAK,
    LITERATURE_STRONG: LITERATURE_STRONG,
    LITERATURE_WEAK: LITERATURE_WEAK,
    KNOWN_PUBLISHER_RE: KNOWN_PUBLISHER_RE
  };
});

/* ==================== src/core/profiles/literature.js ==================== */
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

/* ==================== src/core/parse.js ==================== */
/*!
 * 微信求职信息提取器 — 文章解析层 (parse.js)
 *
 * 两个入口：
 *   1) parseDocument(document)   —— 内容脚本注入真实页面时使用（选择器精确）
 *   2) parseHtml(htmlString)     —— 批量抓取/离线场景使用（纯字符串，无需 DOM）
 * 两者返回同一种「原始素材」结构，后续字段抽取完全共用 fields.js。
 */
(function (root, factory) {
  var api = factory(
    (typeof module !== 'undefined' && module.exports) ? require('./rules.js') : (root && root.WJE && root.WJE.rules)
  );
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) { root.WJE = root.WJE || {}; root.WJE.parse = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (rules) {
  'use strict';

  /* ------------------------------------------------------------------ *
   * 通用工具
   * ------------------------------------------------------------------ */

  var ENTITIES = {
    amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ensp: ' ', emsp: ' ',
    ldquo: '“', rdquo: '”', lsquo: '‘', rsquo: '’', hellip: '…', mdash: '—', ndash: '–',
    middot: '·', times: '×', divide: '÷', copy: '©', reg: '®', trade: '™', deg: '°',
    laquo: '«', raquo: '»', bull: '•', dagger: '†', permil: '‰', euro: '€', pound: '£', yen: '¥'
  };

  function decodeEntities(s) {
    if (!s) return '';
    return String(s).replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]*);/g, function (m, body) {
      if (body[0] === '#') {
        var code = body[1] === 'x' || body[1] === 'X'
          ? parseInt(body.slice(2), 16)
          : parseInt(body.slice(1), 10);
        if (!isFinite(code) || code < 0 || code > 0x10ffff) return m;
        try { return String.fromCodePoint(code); } catch (e) { return m; }
      }
      var v = ENTITIES[body.toLowerCase()];
      return v !== undefined ? v : m;
    });
  }

  /** 去掉 script/style/注释 */
  function stripNonContent(html) {
    return String(html)
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, '');
  }

  var BLOCK_TAGS = /<\/?(?:p|div|section|article|header|footer|li|tr|h[1-6]|blockquote|figure|figcaption|table|ul|ol|dl|dd|dt|pre|aside|main|nav|form|fieldset)\b[^>]*>/gi;

  /** HTML → 纯文本（保留段落换行） */
  function htmlToText(html) {
    if (!html) return '';
    var s = stripNonContent(html);
    s = s.replace(/<br\s*\/?>/gi, '\n');
    s = s.replace(BLOCK_TAGS, '\n');
    s = s.replace(/<[^>]+>/g, '');
    s = decodeEntities(s);
    return rules.normalize(s);
  }

  /** 属性值解析，兼容单/双引号与无引号 */
  function getAttr(tagHtml, name) {
    var re = new RegExp('\\b' + name + '\\s*=\\s*(?:"([^"]*)"|\'([^\']*)\'|([^\\s"\'>]+))', 'i');
    var m = tagHtml.match(re);
    if (!m) return null;
    return decodeEntities(m[1] !== undefined ? m[1] : (m[2] !== undefined ? m[2] : m[3]));
  }

  function absolutize(url, base) {
    if (!url) return null;
    var u = String(url).trim();
    if (!u || u === '#' || /^javascript:/i.test(u) || /^data:/i.test(u)) return null;
    if (/^https?:\/\//i.test(u)) return u;
    if (u.indexOf('//') === 0) return 'https:' + u;
    var b = base || 'https://mp.weixin.qq.com/';
    try { return new URL(u, b).href; } catch (e) { return u; }
  }

  /* ------------------------------------------------------------------ *
   * 从原始 HTML 字符串提取素材（无 DOM 依赖）
   * ------------------------------------------------------------------ */

  /** 按 </div> 配平截取 id="js_content" 的容器。 */
  function sliceBalancedDiv(html, startIdx) {
    var re = /<div\b[^>]*>|<\/div>/gi;
    re.lastIndex = startIdx;
    var depth = 0, m, started = false;
    while ((m = re.exec(html)) !== null) {
      if (m[0][1] === '/') {
        depth--;
        if (started && depth <= 0) return html.slice(startIdx, m.index + m[0].length);
      } else {
        depth++;
        started = true;
      }
    }
    return html.slice(startIdx);
  }

  function extractContentHtml(html) {
    // 现代图文页：<div class="rich_media_content ..." id="js_content">
    var m = html.match(/<div[^>]*\bid\s*=\s*["']js_content["'][^>]*>/i);
    if (m) return sliceBalancedDiv(html, m.index);
    // 旧版：<div class="rich_media_content" id="js_content">
    m = html.match(/<div[^>]*\bclass\s*=\s*["'][^"']*rich_media_content[^"']*["'][^>]*>/i);
    if (m) return sliceBalancedDiv(html, m.index);
    return '';
  }

  function extractMetaTags(html) {
    var out = {};
    var re = /<meta\b[^>]*>/gi, m;
    while ((m = re.exec(html)) !== null) {
      var tag = m[0];
      var key = getAttr(tag, 'property') || getAttr(tag, 'name') || getAttr(tag, 'itemprop');
      var content = getAttr(tag, 'content');
      if (key && content != null && out[key] === undefined) out[key] = content;
    }
    return out;
  }

  function extractScriptVars(html) {
    var out = {};
    var keys = ['msg_source_url', 'msg_title', 'nickname', 'appuin', 'biz', 'mid', 'idx', 'sn', 'ct', 'msg_desc', 'user_name', 'ori_head_img_url'];
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i];
      var re = new RegExp('(?:var\\s+)?' + k + '\\s*=\\s*(?:"((?:[^"\\\\]|\\\\.)*)"|\'((?:[^\'\\\\]|\\\\.)*)\')', 'i');
      var m = html.match(re);
      if (m) out[k] = decodeEntities(unescapeJs(m[1] !== undefined ? m[1] : m[2]));
    }
    // og / twitter 兜底
    return out;
  }

  function unescapeJs(s) {
    if (s == null) return s;
    return String(s)
      .replace(/\\x([0-9a-fA-F]{2})/g, function (_, h) { return String.fromCharCode(parseInt(h, 16)); })
      .replace(/\\u([0-9a-fA-F]{4})/g, function (_, h) { return String.fromCharCode(parseInt(h, 16)); })
      .replace(/\\\//g, '/')
      .replace(/\\'/g, "'")
      .replace(/\\"/g, '"')
      .replace(/\\\\/g, '\\');
  }

  /** 提取所有 <a> 的 href + 锚文本 */
  function extractAnchors(html) {
    var out = [];
    var re = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi, m;
    while ((m = re.exec(html)) !== null) {
      var attrs = m[1];
      var href = getAttr(attrs, 'href') || getAttr(attrs, 'data-link') || getAttr(attrs, 'data-href');
      var text = htmlToText(m[2]).replace(/\s+/g, ' ').trim();
      if (!href && !text) continue;
      out.push({
        href: href || null,
        text: text,
        raw: m[0],
        index: m.index,
        near: htmlToText(html.slice(Math.max(0, m.index - 160), m.index)).slice(-160)
      });
    }
    return out;
  }

  /** 提取所有 <img> 的 src（含懒加载 data-src） */
  function extractImages(html) {
    var out = [];
    var re = /<img\b([^>]*)\/?>/gi, m;
    while ((m = re.exec(html)) !== null) {
      var src = getAttr(m[1], 'data-src') || getAttr(m[1], 'src') || getAttr(m[1], 'data-original');
      if (!src) continue;
      out.push({ src: src, alt: getAttr(m[1], 'alt') || '', width: getAttr(m[1], 'data-w') || null });
    }
    return out;
  }

  function extractTitle(html, metas) {
    if (metas['og:title']) return rules.normalize(metas['og:title']);
    var m = html.match(/<h1[^>]*\bid\s*=\s*["']activity-name["'][^>]*>([\s\S]*?)<\/h1>/i);
    if (m) return htmlToText(m[1]);
    m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    if (m) return htmlToText(m[1]).replace(/\s*[-|_]\s*微信.*$/, '');
    return '';
  }

  function extractAccount(html, metas, scriptVars) {
    var m = html.match(/<[^>]*\bid\s*=\s*["']js_name["'][^>]*>([\s\S]*?)<\/[^>]+>/i);
    if (m) { var t = htmlToText(m[1]); if (t) return t; }
    m = html.match(/<strong[^>]*class\s*=\s*["'][^"']*profile_nickname[^"']*["'][^>]*>([\s\S]*?)<\/strong>/i);
    if (m) { var t2 = htmlToText(m[1]); if (t2) return t2; }
    if (metas['og:article:author']) return rules.normalize(metas['og:article:author']);
    if (scriptVars.nickname) return unescapeJs(scriptVars.nickname);
    return '';
  }

  function extractPublishTime(html, metas, scriptVars) {
    var m = html.match(/<em[^>]*\bid\s*=\s*["']publish_time["'][^>]*>([\s\S]*?)<\/em>/i);
    if (m) { var t = htmlToText(m[1]); if (t) return t; }
    m = html.match(/<[^>]*\bid\s*=\s*["']publish_time["'][^>]*>([\s\S]*?)<\/[^>]+>/i);
    if (m) { var t2 = htmlToText(m[1]); if (t2) return t2; }
    if (scriptVars.ct) {
      var ts = parseInt(scriptVars.ct, 10);
      if (isFinite(ts) && ts > 1000000000) {
        var d = new Date(ts * 1000);
        return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()) + ' ' + pad2(d.getHours()) + ':' + pad2(d.getMinutes());
      }
    }
    return '';
  }

  function pad2(n) { return (n < 10 ? '0' : '') + n; }

  /** 「阅读原文」目标：优先 msg_source_url，其次底部栏 <a>。 */
  function extractReadOriginal(html, scriptVars, anchors) {
    var candidates = [];
    if (scriptVars.msg_source_url) {
      var u = absolutize(unescapeJs(scriptVars.msg_source_url));
      if (u) candidates.push({ url: u, from: 'msg_source_url' });
    }
    // 底部栏
    var m = html.match(/<div[^>]*\bid\s*=\s*["']js_article_bottom_bar["'][^>]*>([\s\S]{0,4000}?)<\/div>\s*<\/div>/i);
    if (m) {
      var inner = extractAnchors(m[1]);
      for (var i = 0; i < inner.length; i++) {
        if (inner[i].href) candidates.push({ url: absolutize(inner[i].href), from: 'bottom_bar', text: inner[i].text });
      }
    }
    for (var j = 0; j < anchors.length; j++) {
      var a = anchors[j];
      if (!a.href) continue;
      if (/(阅读原文|阅读全文|点击阅读|阅读全文请点击)/.test(a.text)) {
        candidates.push({ url: absolutize(a.href), from: 'anchor_text', text: a.text });
      }
      if (/\bid\s*=\s*["']js_view_source["']/.test(a.raw)) {
        candidates.push({ url: absolutize(a.href), from: 'js_view_source', text: a.text });
      }
    }
    for (var k = 0; k < candidates.length; k++) {
      var c = candidates[k];
      if (!c.url) continue;
      if (rules.isWechatHost(rules.safeHost(c.url)) && /\/s\?|__biz=/.test(c.url)) continue;
      return { url: rules.unwrapUrl(c.url), from: c.from, text: c.text || '阅读原文' };
    }
    // msg_source_url 可能就是微信站内链接，兜底返回
    if (candidates.length && candidates[0].url) {
      return { url: rules.unwrapUrl(candidates[0].url), from: candidates[0].from, text: candidates[0].text || '阅读原文' };
    }
    return null;
  }

  /** 正文中以纯文本形式出现的 URL（很多银行公告就是这么写的） */
  function extractBareUrls(text) {
    if (!text) return [];
    var out = [];
    var re = /(?:https?:\/\/|\/\/)[A-Za-z0-9\-._~:/?#\[\]@!$&'()*+,;=%]{4,}/g;
    var m;
    while ((m = re.exec(text)) !== null) {
      var u = m[0].replace(/[),.;，。）】"'<>]+$/, '');
      if (/^\/\//.test(u)) u = 'https:' + u;
      out.push({ url: u, index: m.index, near: text.slice(Math.max(0, m.index - 40), m.index) });
    }
    return out;
  }

  function parseHtml(html, baseUrl) {
    var h = String(html || '');
    var metas = extractMetaTags(h);
    var scriptVars = extractScriptVars(h);
    var contentHtml = extractContentHtml(h);
    var bodyHtml = contentHtml || h;
    var anchors = extractAnchors(bodyHtml);
    var images = extractImages(bodyHtml);
    var contentText = htmlToText(bodyHtml);
    return {
      origin: 'html',
      baseUrl: baseUrl || 'https://mp.weixin.qq.com/',
      title: extractTitle(h, metas),
      account: extractAccount(h, metas, scriptVars),
      author: metas['og:article:author'] || '',
      publishTime: extractPublishTime(h, metas, scriptVars),
      description: metas['og:description'] || metas.description || '',
      contentHtml: contentHtml,
      contentText: contentText,
      anchors: anchors,
      images: images,
      readOriginal: extractReadOriginal(h, scriptVars, anchors),
      bareUrls: extractBareUrls(contentText),
      scriptVars: scriptVars,
      canonicalUrl: metas['og:url'] || (scriptVars.biz && scriptVars.mid
        ? 'https://mp.weixin.qq.com/s?__biz=' + scriptVars.biz + '&mid=' + scriptVars.mid + '&idx=' + (scriptVars.idx || 1) + '&sn=' + (scriptVars.sn || '')
        : null),
      structuredData: null,
      warnings: contentHtml ? [] : ['未定位到正文容器 #js_content，可能不是微信图文页或页面结构已变更']
    };
  }

  /* ------------------------------------------------------------------ *
   * 从真实 DOM 提取素材（内容脚本使用）
   * ------------------------------------------------------------------ */

  function pick(sel, root) { try { return (root || document).querySelector(sel); } catch (e) { return null; } }
  function pickAll(sel, root) { try { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); } catch (e) { return []; } }
  function textOf(el) { return el ? rules.normalize(el.textContent || '') : ''; }

  function parseDocument(doc, baseUrl) {
    doc = doc || document;
    var contentEl = pick('#js_content', doc)
      || pick('.rich_media_content', doc)
      || pick('#js_article', doc)
      || pick('article', doc);
    var contentHtml = contentEl ? contentEl.innerHTML : '';
    var contentText = contentEl ? rules.normalize(contentEl.innerText || contentEl.textContent || '') : '';

    // 锚点：保留 DOM 顺序与邻近文本
    var anchors = [];
    var aEls = contentEl ? pickAll('a[href], a[data-link], a[data-href]', contentEl) : pickAll('#js_article a[href]', doc);
    aEls.forEach(function (a) {
      var href = a.getAttribute('href') || a.getAttribute('data-link') || a.getAttribute('data-href');
      var near = '';
      var prev = a.previousSibling;
      var guard = 0;
      while (prev && guard++ < 5 && near.length < 120) {
        near = (prev.textContent || '') + near;
        prev = prev.previousSibling;
      }
      anchors.push({
        href: href,
        text: rules.normalize(a.textContent || ''),
        raw: a.outerHTML ? a.outerHTML.slice(0, 500) : '',
        index: -1,
        near: rules.normalize(near).slice(-160)
      });
    });

    var images = pickAll('img', contentEl || doc).map(function (img) {
      return {
        src: img.getAttribute('data-src') || img.getAttribute('src') || '',
        alt: img.getAttribute('alt') || '',
        width: img.getAttribute('data-w') || null
      };
    }).filter(function (i) { return i.src; });

    // 「阅读原文」
    var readOriginal = null;
    var msgSource = null;
    var scripts = pickAll('script', doc);
    for (var i = 0; i < scripts.length; i++) {
      var t = scripts[i].textContent || '';
      var m = t.match(/msg_source_url\s*=\s*(?:"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)')/);
      if (m) { msgSource = unescapeJs(m[1] !== undefined ? m[1] : m[2]); break; }
    }
    if (msgSource) readOriginal = { url: rules.unwrapUrl(absolutize(msgSource)), from: 'msg_source_url', text: '阅读原文' };

    if (!readOriginal) {
      var bottomLinks = pickAll('#js_article_bottom_bar a[href], .rich_media_tool a[href], #js_view_source', doc);
      for (var b = 0; b < bottomLinks.length; b++) {
        var href = bottomLinks[b].getAttribute('href');
        if (!href) continue;
        var abs = absolutize(href, baseUrl || location.href);
        if (abs && !(rules.isWechatHost(rules.safeHost(abs)) && /\/s\?|__biz=/.test(abs))) {
          readOriginal = { url: rules.unwrapUrl(abs), from: 'bottom_bar', text: rules.normalize(bottomLinks[b].textContent || '阅读原文') };
          break;
        }
      }
    }
    if (!readOriginal) {
      for (var a2 = 0; a2 < anchors.length; a2++) {
        if (anchors[a2].href && /(阅读原文|阅读全文)/.test(anchors[a2].text)) {
          readOriginal = { url: rules.unwrapUrl(absolutize(anchors[a2].href, baseUrl || location.href)), from: 'anchor_text', text: anchors[a2].text };
          break;
        }
      }
    }

    var canonical = pick('meta[property="og:url"]', doc);
    var biz = '';
    try {
      var qp = new URL(baseUrl || location.href).searchParams;
      biz = qp.get('__biz') || '';
    } catch (e) { /* ignore */ }

    return {
      origin: 'dom',
      baseUrl: baseUrl || (typeof location !== 'undefined' ? location.href : ''),
      title: textOf(pick('#activity-name', doc)) || textOf(pick('h1', doc)) || textOf(pick('meta[property="og:title"]', doc)) || (typeof document !== 'undefined' ? document.title.replace(/\s*[-|_]\s*微信.*$/, '') : ''),
      account: textOf(pick('#js_name', doc)) || textOf(pick('.profile_nickname', doc)) || '',
      author: textOf(pick('#js_author_name', doc)) || '',
      publishTime: textOf(pick('#publish_time', doc)) || textOf(pick('em#publish_time', doc)) || '',
      description: (pick('meta[name="description"]', doc) || { getAttribute: function () { return ''; } }).getAttribute('content') || '',
      contentHtml: contentHtml,
      contentText: contentText,
      anchors: anchors,
      images: images,
      readOriginal: readOriginal,
      bareUrls: extractBareUrls(contentText),
      scriptVars: { biz: biz, msg_source_url: msgSource || '' },
      canonicalUrl: canonical ? canonical.getAttribute('content') : (baseUrl || (typeof location !== 'undefined' ? location.href : null)),
      structuredData: readStructuredData(doc),
      warnings: contentEl ? [] : ['未找到正文容器 #js_content']
    };
  }

  /** 读取页面里的 JSON-LD / 微信 JS 变量（部分页面存在） */
  function readStructuredData(doc) {
    try {
      var el = pick('script[type="application/ld+json"]', doc);
      if (!el) return null;
      return JSON.parse(el.textContent || 'null');
    } catch (e) { return null; }
  }

  /** 统一入口：接受 HTML 字符串、Document 或 {html}/{document} */
  function parseSource(source, options) {
    options = options || {};
    if (!source) return parseHtml('', options.baseUrl);
    if (typeof source === 'string') {
      if (options.useDom !== false && typeof DOMParser !== 'undefined') {
        try {
          var doc = new DOMParser().parseFromString(source, 'text/html');
          var r = parseDocument(doc, options.baseUrl);
          // DOMParser 路径若拿不到正文，回落到字符串路径
          if (r.contentText && r.contentText.length > 0) return r;
        } catch (e) { /* 回落到字符串解析 */ }
      }
      return parseHtml(source, options.baseUrl);
    }
    if (typeof source.querySelector === 'function') return parseDocument(source, options.baseUrl);
    if (source.document) return parseDocument(source.document, options.baseUrl);
    if (source.html) return parseSource(source.html, options);
    // 已经是本模块产出的「原始素材」结构（编程接口/测试里手写的输入）→ 直接透传，
    // 否则会被当成空 HTML 静默丢掉，是很难排查的坑。
    if (typeof source.contentText === 'string' && Array.isArray(source.anchors)) {
      return Object.assign({
        origin: 'raw', baseUrl: options.baseUrl || '', title: '', account: '', author: '',
        publishTime: '', description: '', contentHtml: '', images: [], readOriginal: null,
        bareUrls: [], scriptVars: {}, canonicalUrl: null, structuredData: null, warnings: []
      }, source);
    }
    return parseHtml('', options.baseUrl);
  }

  return {
    parseHtml: parseHtml,
    parseDocument: parseDocument,
    parseSource: parseSource,
    htmlToText: htmlToText,
    decodeEntities: decodeEntities,
    extractContentHtml: extractContentHtml,
    extractAnchors: extractAnchors,
    extractImages: extractImages,
    extractScriptVars: extractScriptVars,
    extractBareUrls: extractBareUrls,
    absolutize: absolutize,
    getAttr: getAttr,
    unescapeJs: unescapeJs
  };
});

/* ==================== src/core/links.js ==================== */
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

/* ==================== src/core/insights.js ==================== */
/*!
 * 微信求职信息提取器 — 关键句与摘要 (insights.js)
 * 关键句关键词随画像变化：招聘看「投递/截止」，文献看「DOI/作者/期刊」。
 */
(function (root, factory) {
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) { root.WJE = root.WJE || {}; root.WJE.insights = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var PATTERNS = {
    recruit: /(投递|网申|报名|申请|截止|官网|阅读原文|简历投递|校招|校园招聘|招聘系统|扫码|网申地址|投递地址|投递方式|联系方式|笔试|面试)/,
    literature: /(DOI|doi|arXiv|PMID|作者|期刊|发表|影响因子|分区|摘要|关键词|引用|原文|全文|PDF|通讯作者|第一作者|参考文献|课题组|单位|接受|投稿|Accepted|Published)/i,
    general: /(来源|原文|阅读原文|链接|作者|时间|地点|联系|电话|邮箱|详情|报名|截止)/
  };

  var SENTENCE_SPLIT = /(?<=[。！？；!?;\n])/;

  function splitSentences(text) {
    if (!text) return [];
    var parts;
    try {
      parts = text.split(SENTENCE_SPLIT);
    } catch (e) {
      // 极老环境不支持 lookbehind，退化为按标点切分
      parts = text.replace(/([。！？；!?;\n])/g, '$1\u0001').split('\u0001');
    }
    return parts.map(function (s) { return s.trim(); }).filter(function (s) { return s.length >= 6 && s.length <= 240; });
  }

  /**
   * 抽取关键句。
   * @param {string} text
   * @param {number} limit
   * @param {string} profile
   */
  function findKeySentences(text, limit, profile) {
    limit = limit || 12;
    var re = PATTERNS[profile] || PATTERNS.general;
    var sentences = splitSentences(text);
    var hits = sentences.filter(function (s) { return re.test(s); });

    // 去重（按前 30 字）
    var seen = Object.create(null), out = [];
    hits.forEach(function (s) {
      var k = s.slice(0, 30);
      if (seen[k]) return;
      seen[k] = 1;
      out.push(s);
    });

    // 若关键词命中太少，补几条长句（往往是摘要/正文要点）
    if (out.length < 3) {
      var extra = sentences
        .filter(function (s) { return s.length >= 30 && out.indexOf(s) === -1; })
        .sort(function (a, b) { return b.length - a.length; })
        .slice(0, 3);
      extra.forEach(function (s) {
        var k = s.slice(0, 30);
        if (!seen[k]) { seen[k] = 1; out.push(s); }
      });
    }
    return out.slice(0, limit);
  }

  /** 一行速览。 */
  function buildSummary(profile, fields, links) {
    var parts = [];
    if (profile === 'literature' || profile === 'hybrid') {
      var p = fields.paper;
      if (p) {
        if (p.title) parts.push(p.title.length > 60 ? p.title.slice(0, 60) + '…' : p.title);
        if (p.authors && p.authors.length) {
          parts.push(p.authors.slice(0, 3).join(', ') + (p.authors.length > 3 ? ' 等' : ''));
        }
        if (p.journal) parts.push(p.journal);
        if (p.year) parts.push(String(p.year));
        if (p.doi) parts.push('DOI ' + p.doi);
      }
    }
    if (profile === 'recruit' || profile === 'hybrid') {
      var r = [];
      if (fields.org) r.push(fields.org.value);
      if (fields.batch) r.push(fields.batch.value);
      if (fields.recruitType) r.push(fields.recruitType.value);
      if (r.length) parts = parts.concat(r);
      if (fields.deadline) parts.push('截止 ' + fields.deadline.value);
    }
    if (links && links.best) parts.push('主链接 ' + links.best.host);
    return parts.join(' · ');
  }

  return {
    findKeySentences: findKeySentences,
    buildSummary: buildSummary,
    splitSentences: splitSentences,
    PATTERNS: PATTERNS
  };
});

/* ==================== src/core/profiles/recruit.js ==================== */
/*!
 * 微信求职信息提取器 — 招聘画像 (profiles/recruit.js)
 * 从 fields.js 拆出：机构名识别 + 批次/类型/截止/学历/专业/岗位/地点/人数/联系方式。
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
    root.WJE.profiles.recruit = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (deps) {
  'use strict';

  var rules = deps.rules;

  /* ------------------------------------------------------------------ *
   * 机构名（三阶段）
   * ------------------------------------------------------------------ */

  function pickOrg(raw) {
    var title = raw.title || '';
    var account = raw.account || '';
    var body = raw.contentText || '';

    // ── 阶段 1：标题模板直取（公众号招聘推文标题高度模板化，最可靠）──
    var fromTitle = rules.extractOrgFromTitle(title);
    if (fromTitle) {
      return {
        value: fromTitle.name,
        aliases: rules.uniq(rules.findFullOrgNames(body, fromTitle.name)).slice(0, 5),
        evidence: '标题模板匹配：“' + title.slice(0, 40) + '”',
        from: 'title_pattern',
        confidence: 'high'
      };
    }

    // ── 阶段 2：公众号名（“中信银行招聘” → 中信银行）──
    var fromAccount = rules.extractOrgFromAccount(account);

    // ── 阶段 3：加权候选打分 ──
    var titleCands = rules.findOrgCandidates(title);
    var acctCands = rules.findOrgCandidates(account);
    var bodyCands = rules.findOrgCandidates(body);
    var freq = Object.create(null), firstIdx = Object.create(null), inTitle = Object.create(null);
    titleCands.forEach(function (c) { inTitle[c.name] = true; });
    bodyCands.forEach(function (c) {
      freq[c.name] = (freq[c.name] || 0) + 1;
      if (firstIdx[c.name] === undefined) firstIdx[c.name] = c.index;
    });

    var scored = [];
    function push(name, weight, base, from) {
      var s = base + weight;
      if (freq[name]) s += Math.min(freq[name], 8) * 3;
      if (inTitle[name] && from !== 'title') s += 25;
      if (firstIdx[name] !== undefined) s += Math.max(0, 20 - firstIdx[name] / 200);
      scored.push({ name: name, score: s, from: from });
    }
    titleCands.slice(0, 6).forEach(function (c) { push(c.name, c.weight, 70, 'title'); });
    if (fromAccount) push(fromAccount.name, 8, 85, 'account');
    acctCands.slice(0, 3).forEach(function (c) { push(c.name, c.weight, 60, 'account'); });
    bodyCands.slice(0, 60).forEach(function (c) { push(c.name, c.weight, 20, 'body'); });

    if (!scored.length) return null;
    scored.sort(function (a, b) { return b.score - a.score; });

    var top = scored[0];
    var aliasPool = scored.filter(function (s) {
      return s !== top && (top.name.indexOf(s.name) !== -1 || s.name.indexOf(top.name) !== -1);
    }).map(function (s) { return s.name; });
    aliasPool = aliasPool.concat(rules.findFullOrgNames(body, top.name));
    var confidence = top.from === 'title' ? 'high' : (top.from === 'account' ? 'medium' : (freq[top.name] >= 3 ? 'medium' : 'low'));
    return {
      value: top.name,
      aliases: rules.uniq(aliasPool).slice(0, 5),
      evidence: top.from === 'title' ? ('标题：“' + title.slice(0, 40) + '”')
        : top.from === 'account' ? ('公众号名：“' + account + '”')
          : ('正文出现 ' + (freq[top.name] || 1) + ' 次'),
      from: top.from,
      confidence: confidence
    };
  }

  /* ------------------------------------------------------------------ *
   * 主入口
   * ------------------------------------------------------------------ */

  function extract(raw, options) {
    options = options || {};
    var text = raw.contentText || '';
    var title = raw.title || '';
    var haystack = [title, raw.account, raw.description, text].filter(Boolean).join('\n');
    var head = [title, raw.description, text.slice(0, 600)].filter(Boolean).join('\n');

    var batch = rules.extractBatch(haystack);
    var recruitType = rules.extractRecruitType([title, raw.account, text.slice(0, 400)].filter(Boolean).join('\n'));

    // 截止年份推断顺序：发布时间 > 当年 > （届别年份 − 1）。
    // 「2027届」是毕业年份，校招截止通常落在前一年，故届别年份只能兜底。
    var publishYear = guessYear(raw.publishTime);
    var nowYear = options.nowYear || new Date().getFullYear();
    var yearGuess = publishYear || nowYear || (batch && batch.year ? batch.year - 1 : null);

    var deadline = rules.extractDeadline(text, yearGuess, nowYear)
      || rules.extractDeadline(head, yearGuess, nowYear);

    var fields = {
      org: pickOrg(raw),
      batch: batch ? { value: batch.label, year: batch.year, raw: batch.raw, evidence: '匹配“' + batch.raw + '”', confidence: 'high' } : null,
      recruitType: recruitType ? {
        value: recruitType.value, raw: recruitType.raw,
        evidence: '匹配“' + recruitType.raw + '”',
        confidence: /校园招聘|校招/.test(recruitType.raw) ? 'high' : 'medium'
      } : null,
      deadline: deadline ? {
        value: deadline.value, raw: deadline.raw, evidence: deadline.evidence,
        confidence: deadline.yearAssumed ? 'medium' : 'high'
      } : null,
      education: rules.extractEducation(text),
      majors: rules.extractMajors(text),
      positions: rules.extractPositions(text),
      locations: rules.extractLocations(text),
      headcount: rules.extractHeadcount(text),
      contacts: rules.extractContacts(text),
      paper: null
    };

    var warnings = [];
    if (fields.org && fields.org.confidence === 'low') warnings.push('招聘主体为推测结果，请人工确认。');

    return { fields: fields, warnings: warnings };
  }

  function guessYear(publishTime) {
    var m = String(publishTime || '').match(/(20\d{2})/);
    return m ? +m[1] : null;
  }

  return {
    extract: extract,
    pickOrg: pickOrg,
    guessYear: guessYear
  };
});

/* ==================== src/core/profiles/general.js ==================== */
/*!
 * 微信求职信息提取器 — 通用画像 (profiles/general.js)
 * 两类信号都不强时使用：尽量把「时间 / 机构 / 联系方式 / 事件」这些通用要素捞出来，
 * 不强行套招聘或文献的字段。
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
    root.WJE.profiles.general = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (deps) {
  'use strict';

  var rules = deps.rules;

  var EVENT_KEYWORDS = [
    '会议', '论坛', '峰会', '讲座', '报告会', '研讨会', '沙龙', '培训', 'workshop', 'Workshop',
    '征稿', '通知', '公告', '公示', '评选', '申报', '报名', '启动', '发布', '上线', '开放',
    '政策', '解读', '指南', '清单', '汇总', '盘点', '数据', '报告'
  ];

  var ORG_LABELS = ['主办单位', '承办单位', '协办单位', '主办', '承办', '发布单位', '来源', '机构', '单位'];

  function extractEvents(text, title) {
    var hay = (title || '') + '\n' + (text || '').slice(0, 1500);
    var hits = [];
    for (var i = 0; i < EVENT_KEYWORDS.length; i++) {
      var kw = EVENT_KEYWORDS[i];
      if (hay.indexOf(kw) !== -1) hits.push(kw);
    }
    if (!hits.length) return null;
    // 取标题里命中的优先
    var inTitle = hits.filter(function (k) { return (title || '').indexOf(k) !== -1; });
    return {
      list: rules.uniq(inTitle.concat(hits)).slice(0, 8),
      fromTitle: inTitle.length > 0
    };
  }

  function extractOrganizer(text) {
    for (var i = 0; i < ORG_LABELS.length; i++) {
      var re = new RegExp('(?:^|[\\n。；;])\\s*' + ORG_LABELS[i] + '\\s*[:：]\\s*([^\\n]{2,60})');
      var m = text.match(re);
      if (m) {
        var v = m[1].trim().replace(/[。；;，,]\s*$/, '');
        if (v.length >= 2) return { value: v, from: ORG_LABELS[i] };
      }
    }
    return null;
  }

  function extract(raw, options) {
    options = options || {};
    var text = raw.contentText || '';
    var title = raw.title || '';

    var dates = rules.findAllDates(text);
    var contacts = rules.extractContacts(text);
    var events = extractEvents(text, title);
    var organizer = extractOrganizer(text);

    // 通用画像下也给出一个"疑似主体"，便于归档命名
    var cands = rules.findOrgCandidates([title, text.slice(0, 1200)].filter(Boolean).join('\n'));
    var org = cands.length
      ? { value: cands[0].name, confidence: 'low', evidence: '正文候选（未做招聘模板校验）', from: 'body' }
      : null;

    var fields = {
      org: org,
      batch: null, recruitType: null, deadline: null, education: null, majors: null,
      positions: null, locations: null, headcount: null,
      contacts: contacts,
      paper: null,
      timeline: dates.slice(0, 12).map(function (d) { return { value: d.value, raw: d.raw }; }),
      events: events,
      organizer: organizer
    };

    var warnings = [];
    if (!events && !dates.length && !contacts) {
      warnings.push('这是一篇通用推送：未识别到招聘或文献特征，也没抓到明确的时间/联系方式，建议人工阅读。');
    }

    return { fields: fields, warnings: warnings };
  }

  return { extract: extract, extractEvents: extractEvents, extractOrganizer: extractOrganizer };
});

/* ==================== src/core/fields.js ==================== */
/*!
 * 微信求职信息提取器 — 编排层 (fields.js)
 *
 * 流程：
 *   原始素材 → 内容类型判别(classify) → 按画像跑提取器(profiles/*) → 链接归集打分(links) → 汇总
 *
 * 支持的画像：recruit（招聘）/ literature（文献）/ general（通用）/ hybrid（两者都跑）
 * 自动判断，也允许调用方用 options.forceProfile 手动指定（面板上的切换开关）。
 */
(function (root, factory) {
  var api = factory(
    (typeof module !== 'undefined' && module.exports)
      ? {
        rules: require('./rules.js'),
        classify: require('./classify.js'),
        links: require('./links.js'),
        insights: require('./insights.js'),
        recruit: require('./profiles/recruit.js'),
        literature: require('./profiles/literature.js'),
        general: require('./profiles/general.js')
      }
      : {
        rules: root && root.WJE && root.WJE.rules,
        classify: root && root.WJE && root.WJE.classify,
        links: root && root.WJE && root.WJE.links,
        insights: root && root.WJE && root.WJE.insights,
        recruit: root && root.WJE && root.WJE.profiles && root.WJE.profiles.recruit,
        literature: root && root.WJE && root.WJE.profiles && root.WJE.profiles.literature,
        general: root && root.WJE && root.WJE.profiles && root.WJE.profiles.general
      }
  );
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) { root.WJE = root.WJE || {}; root.WJE.fields = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (deps) {
  'use strict';

  var rules = deps.rules;
  var classify = deps.classify;
  var links = deps.links;
  var insights = deps.insights;

  var ARTICLE_KIND_IMAGE = 'image';
  var ARTICLE_KIND_TEXT = 'text';
  var ARTICLE_KIND_MIXED = 'mixed';

  var VALID_PROFILES = { recruit: 1, literature: 1, general: 1, hybrid: 1 };

  /* ---------------------- 链接：多画像合并 ---------------------- */

  function urlKey(u) { return String(u || '').replace(/[#?].*$/, '').replace(/\/$/, '').toLowerCase(); }

  function mergeLinkSets(a, b) {
    var byKey = Object.create(null);
    [a, b].forEach(function (set) {
      if (!set) return;
      set.all.forEach(function (item) {
        var k = urlKey(item.url);
        var ex = byKey[k];
        if (!ex) {
          byKey[k] = {
            url: item.url, originalUrl: item.originalUrl, host: item.host, text: item.text,
            near: item.near, kind: item.kind, score: item.score,
            reasons: item.reasons.slice(), sources: item.sources.slice()
          };
          return;
        }
        ex.reasons = rules.uniq(ex.reasons.concat(item.reasons));
        ex.sources = rules.uniq(ex.sources.concat(item.sources));
        if (item.score > ex.score) { ex.score = item.score; ex.kind = item.kind; }
      });
    });
    var all = Object.keys(byKey).map(function (k) { return byKey[k]; })
      .sort(function (x, y) { return y.score - x.score; });

    var primKeys = Object.create(null);
    [a, b].forEach(function (set) {
      if (!set) return;
      set.primary.forEach(function (i) { primKeys[urlKey(i.url)] = 1; });
    });
    var primary = all.filter(function (i) { return primKeys[urlKey(i.url)]; });

    var groups = { doi: [], preprint: [], publisher: [], database: [], pdf: [] };
    all.forEach(function (i) { if (groups[i.kind]) groups[i.kind].push(i); });

    return { all: all, primary: primary, apply: primary, best: primary[0] || null, groups: groups, profile: 'hybrid' };
  }

  function rankLinks(raw, profile) {
    var result;
    if (profile === 'hybrid') {
      result = mergeLinkSets(links.classifyAndRank(raw, 'recruit'), links.classifyAndRank(raw, 'literature'));
    } else {
      var p = (profile === 'literature' || profile === 'recruit') ? profile : 'general';
      result = links.classifyAndRank(raw, p);
    }
    // 「阅读原文」是最关键的一条跳转，显式保留在结果里（合并路径也要带上）
    result.readOriginal = (raw.readOriginal && raw.readOriginal.url)
      ? {
        url: rules.unwrapUrl(raw.readOriginal.url),
        from: raw.readOriginal.from,
        text: raw.readOriginal.text || '阅读原文'
      }
      : null;
    return result;
  }

  /* ---------------------- 文章形态 ---------------------- */

  function detectArticleKind(text, imageCount) {
    var textLength = (text || '').replace(/\s/g, '').length;
    if (textLength < 120 && imageCount >= 3) return ARTICLE_KIND_IMAGE;
    if (textLength < 500 && imageCount >= 6) return ARTICLE_KIND_MIXED;
    return ARTICLE_KIND_TEXT;
  }

  function emptyFields() {
    return {
      org: null, batch: null, recruitType: null, deadline: null, education: null,
      majors: null, positions: null, locations: null, headcount: null, contacts: null,
      paper: null, timeline: null, events: null, organizer: null
    };
  }

  /* ---------------------- 主入口 ---------------------- */

  function extractFields(raw, options) {
    options = options || {};
    var text = raw.contentText || '';
    var title = raw.title || '';
    var imageCount = (raw.images || []).length;
    var textLength = text.replace(/\s/g, '').length;
    var kind = detectArticleKind(text, imageCount);

    // 1) 判别内容类型
    var detection = classify.detect(raw);
    var profile = detection.type;
    var overridden = false;
    if (options.forceProfile && VALID_PROFILES[options.forceProfile]) {
      overridden = options.forceProfile !== profile;
      profile = options.forceProfile;
    }

    // 2) 跑对应画像
    var runners = [];
    if (profile === 'recruit' || profile === 'hybrid') runners.push(deps.recruit);
    if (profile === 'literature' || profile === 'hybrid') runners.push(deps.literature);
    if (profile === 'general') runners.push(deps.general);

    var fields = emptyFields();
    var warnings = (raw.warnings || []).slice();

    runners.forEach(function (mod) {
      var r = mod.extract(raw, options);
      Object.keys(r.fields || {}).forEach(function (k) {
        if (r.fields[k] !== null && r.fields[k] !== undefined) fields[k] = r.fields[k];
      });
      if (r.warnings) warnings = warnings.concat(r.warnings);
    });

    // 3) 链接归集（文献画像下的期刊/DOI 加成需要它在前面完成）
    var ranked = rankLinks(raw, profile);

    if (fields.paper) {
      var urls = ranked.all.map(function (i) { return i.url; });
      fields.paper.openAccess = deps.literature.detectOpenAccess(urls, fields.paper.journal);
    }

    // 4) 通用告警
    if (kind === ARTICLE_KIND_IMAGE) {
      warnings.push('正文以图片为主（文字仅 ' + textLength + ' 字，图片 ' + imageCount +
        ' 张）：关键信息很可能只印在长图里，插件无法读取图片文字，请打开原图人工确认。');
    } else if (kind === ARTICLE_KIND_MIXED) {
      warnings.push('正文文字偏少而图片较多（文字 ' + textLength + ' 字 / 图片 ' + imageCount + ' 张），部分关键信息可能只在图片中。');
    }
    if (!ranked.best) {
      warnings.push(profile === 'literature'
        ? '未识别出明确的原文链接，可能是图片型推文或只给了 DOI 文本。'
        : '未识别出明确的关键链接，可能是图片型推文或使用了二维码。');
    }
    if (overridden) {
      warnings.push('内容类型由你手动指定为「' + classify.label(profile) + '」，自动判别结果是「' + classify.label(detection.type) + '」。');
    }

    return {
      version: '2.0.0',
      extractedAt: new Date().toISOString(),
      detection: {
        type: detection.type,
        activeProfile: profile,
        label: classify.label(profile),
        autoLabel: classify.label(detection.type),
        confidence: detection.confidence,
        scores: detection.scores,
        evidence: detection.evidence,
        hints: detection.hints,
        overridden: overridden
      },
      meta: {
        title: title,
        account: raw.account || '',
        author: raw.author || '',
        publishTime: raw.publishTime || '',
        url: options.pageUrl || raw.baseUrl || '',
        canonicalUrl: raw.canonicalUrl || '',
        articleKind: kind,
        textLength: textLength,
        imageCount: imageCount,
        anchorsCount: (raw.anchors || []).length
      },
      summary: insights.buildSummary(profile, fields, ranked),
      fields: fields,
      links: ranked,
      keySentences: insights.findKeySentences(text, options.keySentenceLimit || 12, profile),
      images: (raw.images || []).slice(0, 40),
      warnings: rules.uniq(warnings)
    };
  }

  return {
    extractFields: extractFields,
    emptyFields: emptyFields,
    detectArticleKind: detectArticleKind,
    rankLinks: rankLinks,
    mergeLinkSets: mergeLinkSets,

    // 向后兼容的薄封装
    pickOrg: function (raw) { return deps.recruit.pickOrg(raw); },
    classifyAndRank: function (raw, profile) { return links.classifyAndRank(raw, profile || 'recruit'); },
    findKeySentences: function (text, limit, profile) { return insights.findKeySentences(text, limit, profile || 'recruit'); },

    ARTICLE_KIND_IMAGE: ARTICLE_KIND_IMAGE,
    ARTICLE_KIND_TEXT: ARTICLE_KIND_TEXT,
    ARTICLE_KIND_MIXED: ARTICLE_KIND_MIXED
  };
});

/* ==================== src/core/format.js ==================== */
/*!
 * 微信求职信息提取器 — 输出格式化 (format.js)
 * 支持 Markdown / JSON / CSV / 纯链接列表 / 一键引用格式。
 * 输出按画像分流：招聘 → 投递入口表；文献 → 论文信息表 + 原文链接 + 引用格式。
 */
(function (root, factory) {
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) { root.WJE = root.WJE || {}; root.WJE.format = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function fieldValue(res, key) {
    var f = res.fields && res.fields[key];
    if (!f) return '';
    if (typeof f === 'string') return f;
    if (f.value !== undefined) return String(f.value);
    if (f.list) return f.list.join('、');
    return '';
  }

  function confidenceTag(f) {
    if (!f || !f.confidence) return '';
    return { high: '', medium: '（待确认）', low: '（推测）' }[f.confidence] || '';
  }

  function profileOf(res) {
    return (res.detection && res.detection.activeProfile) || 'recruit';
  }

  function isLiterature(res) {
    var p = profileOf(res);
    return p === 'literature' || (p === 'hybrid' && res.fields && res.fields.paper && res.fields.paper.title);
  }
  function isRecruit(res) {
    var p = profileOf(res);
    return p === 'recruit' || p === 'hybrid';
  }

  function mdCell(v) {
    return String(v === undefined || v === null ? '' : v).replace(/\|/g, '\\|').replace(/\n/g, ' ');
  }

  function pushRow(lines, k, v) {
    if (v === undefined || v === null || v === '') return;
    lines.push('| ' + k + ' | ' + mdCell(v) + ' |');
  }

  /* ---------------------------- Markdown ---------------------------- */

  function toMarkdown(res, opts) {
    opts = opts || {};
    var lines = [];
    var lit = isLiterature(res);

    lines.push('# ' + (res.meta.title || '(无标题)'));
    lines.push('');

    // 类型徽标
    if (res.detection) {
      var conf = { high: '高', medium: '中', low: '低' }[res.detection.confidence] || res.detection.confidence;
      lines.push('> 识别类型：**' + res.detection.label + '**（置信度 ' + conf +
        '；招聘信号 ' + res.detection.scores.recruit + ' / 文献信号 ' + res.detection.scores.literature + '）');
      lines.push('');
    }

    lines.push('| 字段 | 内容 |');
    lines.push('| --- | --- |');
    pushRow(lines, '公众号', res.meta.account);
    pushRow(lines, '发布时间', res.meta.publishTime);
    pushRow(lines, '原文链接', res.meta.url);

    if (lit) renderLiteratureRows(lines, res);
    if (isRecruit(res)) renderRecruitRows(lines, res);
    if (profileOf(res) === 'general') renderGeneralRows(lines, res);

    lines.push('');

    // ---- 链接 ----
    if (lit) {
      lines.push('## 原文链接');
      renderLinkList(lines, res, opts);
      lines.push('');
      var g = res.links.groups || {};
      var extras = []
        .concat(g.doi || [], g.preprint || [], g.publisher || [], g.database || [], g.pdf || [])
        .filter(function (l) { return (res.links.primary || []).indexOf(l) === -1; });
      if (extras.length) {
        lines.push('### 其他学术链接');
        dedupeLinks(extras).slice(0, 10).forEach(function (l) {
          lines.push('- [' + (l.text || l.host) + '](' + l.url + ')　`' + l.host + '`');
        });
        lines.push('');
      }
    } else {
      lines.push('## ' + (profileOf(res) === 'general' ? '主要链接' : '投递入口'));
      renderLinkList(lines, res, opts);
      lines.push('');
    }

    if (res.links && res.links.readOriginal) {
      lines.push('## 阅读原文跳转');
      lines.push('- ' + res.links.readOriginal.url + '　（来源：' + res.links.readOriginal.from + '）');
      lines.push('');
    }

    // ---- 文献专属：摘要 / 引用格式 ----
    if (lit && res.fields.paper) renderLiteratureExtras(lines, res.fields.paper);

    // ---- 通用画像：时间线 ----
    if (profileOf(res) === 'general' && res.fields.timeline && res.fields.timeline.length) {
      lines.push('## 文中日期');
      res.fields.timeline.forEach(function (d) { lines.push('- ' + d.value + '（' + d.raw + '）'); });
      lines.push('');
    }

    // ---- 其他链接 ----
    var others = (res.links.all || []).filter(function (l) {
      return (res.links.primary || []).indexOf(l) === -1 && !/read_original/.test((l.sources || []).join(',')) && l.kind !== 'wechat';
    }).slice(0, 10);
    if (others.length) {
      lines.push('## 其他链接');
      others.forEach(function (l) { lines.push('- [' + (l.text || l.host) + '](' + l.url + ')'); });
      lines.push('');
    }

    if (res.keySentences && res.keySentences.length && opts.verbose !== false) {
      lines.push('## 关键句摘录');
      res.keySentences.forEach(function (s) { lines.push('> ' + s); });
      lines.push('');
    }

    if (res.warnings && res.warnings.length) {
      lines.push('## 提示');
      res.warnings.forEach(function (w) { lines.push('- ⚠️ ' + w); });
      lines.push('');
    }

    lines.push('---');
    lines.push('_由「微信求职信息提取器」v' + (res.version || '2.0.0') + ' 于 ' + res.extractedAt +
      ' 生成，字段为机器抽取结果，请以原文为准。_');
    return lines.join('\n');
  }

  function renderLinkList(lines, res, opts) {
    var primary = res.links.primary || res.links.apply || [];
    if (!primary.length) {
      lines.push('> 未识别到明确链接。' + (res.meta.articleKind === 'image' ? '本篇为图片型推文，链接可能印在长图中。' : ''));
      return;
    }
    primary.forEach(function (l, i) {
      lines.push((i + 1) + '. [' + (l.text || l.host) + '](' + l.url + ')');
      lines.push('   - 域名：`' + l.host + '`　类型：' + kindLabel(l.kind) + '　评分：' + l.score);
      if (opts.verbose !== false && l.reasons && l.reasons.length) lines.push('   - 判定依据：' + l.reasons.join('；'));
    });
  }

  function dedupeLinks(list) {
    var seen = Object.create(null), out = [];
    list.forEach(function (l) {
      var k = String(l.url).replace(/[#?].*$/, '').toLowerCase();
      if (!seen[k]) { seen[k] = 1; out.push(l); }
    });
    return out;
  }

  function renderLiteratureRows(lines, res) {
    var p = res.fields.paper || {};
    pushRow(lines, '论文标题', p.title);
    if (p.titleZh && p.titleEn && p.titleZh !== p.titleEn) pushRow(lines, '英文标题', p.titleEn);
    if (p.authors && p.authors.length) pushRow(lines, '作者', p.authors.join(', '));
    if (p.firstAuthor && p.firstAuthor.length) pushRow(lines, '第一作者', p.firstAuthor.join(', '));
    if (p.correspondingAuthor && p.correspondingAuthor.length) pushRow(lines, '通讯作者', p.correspondingAuthor.join(', '));
    pushRow(lines, '期刊', p.journal);
    var num = [];
    if (p.year) num.push(p.year + ' 年');
    if (p.volume) num.push('第 ' + p.volume + ' 卷');
    if (p.issue) num.push('第 ' + p.issue + ' 期');
    if (p.pages) num.push('页 ' + p.pages);
    if (p.articleNumber) num.push('文章号 ' + p.articleNumber);
    if (num.length) pushRow(lines, '卷期页', num.join('，'));
    pushRow(lines, 'DOI', p.doi);
    pushRow(lines, 'arXiv', p.arxiv);
    pushRow(lines, 'PMID', p.pmid);
    pushRow(lines, '影响因子', p.impactFactor);
    pushRow(lines, '分区', [p.jcr, p.cas].filter(Boolean).join(' / '));
    pushRow(lines, '被引', p.citations);
    pushRow(lines, '文献类型', p.paperType);
    pushRow(lines, '开放获取', p.openAccess ? '是' : '');
    if (p.keywordsZh && p.keywordsZh.length) pushRow(lines, '关键词', p.keywordsZh.join('、'));
    if (p.keywordsEn && p.keywordsEn.length) pushRow(lines, 'Keywords', p.keywordsEn.join(', '));
  }

  function renderRecruitRows(lines, res) {
    var f = res.fields;
    pushRow(lines, '招聘主体', fieldValue(res, 'org') + confidenceTag(f.org));
    if (f.org && f.org.aliases && f.org.aliases.length) pushRow(lines, '全称', f.org.aliases.join('、'));
    pushRow(lines, '招聘批次', fieldValue(res, 'batch'));
    pushRow(lines, '招聘类型', fieldValue(res, 'recruitType'));
    pushRow(lines, '投递截止', fieldValue(res, 'deadline') +
      (f.deadline && f.deadline.raw ? '（原文：' + f.deadline.raw + '）' : ''));
    pushRow(lines, '学历要求', fieldValue(res, 'education'));
    pushRow(lines, '工作地点', f.locations ? (f.locations.list.join('、') + (f.locations.nationwide ? '（含全国）' : '')) : '');
    pushRow(lines, '招聘岗位', fieldValue(res, 'positions'));
    pushRow(lines, '需求专业', fieldValue(res, 'majors'));
    pushRow(lines, '招聘人数', f.headcount ? String(f.headcount.value) : '');
    pushRow(lines, '联系方式', f.contacts ? [].concat(f.contacts.emails || [], f.contacts.phones || []).join(' / ') : '');
  }

  function renderGeneralRows(lines, res) {
    var f = res.fields;
    pushRow(lines, '疑似主体', fieldValue(res, 'org'));
    pushRow(lines, '主办/来源', f.organizer ? f.organizer.value : '');
    pushRow(lines, '事件类型', f.events ? f.events.list.join('、') : '');
    pushRow(lines, '联系方式', f.contacts ? [].concat(f.contacts.emails || [], f.contacts.phones || []).join(' / ') : '');
  }

  function renderLiteratureExtras(lines, p) {
    if (p.abstractZh) {
      lines.push('## 中文摘要');
      lines.push('> ' + p.abstractZh.replace(/\n+/g, '\n> '));
      lines.push('');
    }
    if (p.abstractEn) {
      lines.push('## Abstract');
      lines.push('> ' + p.abstractEn.replace(/\n+/g, '\n> '));
      lines.push('');
    }
    if (p.citations) {
      lines.push('## 引用格式');
      lines.push('');
      lines.push('**GB/T 7714**');
      lines.push('```');
      lines.push(p.citations.gbt7714 || '');
      lines.push('```');
      lines.push('**APA 7th**');
      lines.push('```');
      lines.push(p.citations.apa || '');
      lines.push('```');
      if (p.citations.bibtex) {
        lines.push('**BibTeX**');
        lines.push('```bibtex');
        lines.push(p.citations.bibtex);
        lines.push('```');
      }
      lines.push('');
    }
  }

  function kindLabel(kind) {
    return {
      official: '官网/官方域名',
      ats: '招聘系统',
      redirect: '跳转中间页',
      wechat: '微信站内',
      other: '其他',
      invalid: '无效',
      doi: 'DOI 解析页',
      preprint: '预印本',
      publisher: '出版社官网',
      database: '文献数据库',
      pdf: 'PDF 全文'
    }[kind] || kind;
  }

  /* ------------------------------ JSON ------------------------------ */

  function toJSON(res, pretty) {
    return JSON.stringify(res, null, pretty === false ? 0 : 2);
  }

  /* ------------------------------ CSV ------------------------------- */

  var CSV_COLUMNS = [
    ['type', function (r) { return r.detection ? r.detection.label : ''; }],
    ['title', function (r) { return r.meta.title; }],
    ['account', function (r) { return r.meta.account; }],
    ['publishTime', function (r) { return r.meta.publishTime; }],
    ['url', function (r) { return r.meta.url; }],
    // 招聘
    ['org', function (r) { return fieldValue(r, 'org'); }],
    ['batch', function (r) { return fieldValue(r, 'batch'); }],
    ['recruitType', function (r) { return fieldValue(r, 'recruitType'); }],
    ['deadline', function (r) { return fieldValue(r, 'deadline'); }],
    ['education', function (r) { return fieldValue(r, 'education'); }],
    ['locations', function (r) { return r.fields.locations ? r.fields.locations.list.join('、') : ''; }],
    ['positions', function (r) { return fieldValue(r, 'positions'); }],
    ['majors', function (r) { return fieldValue(r, 'majors'); }],
    ['headcount', function (r) { return r.fields.headcount ? String(r.fields.headcount.value) : ''; }],
    ['contacts', function (r) { return r.fields.contacts ? [].concat(r.fields.contacts.emails || [], r.fields.contacts.phones || []).join(' / ') : ''; }],
    // 文献
    ['paperTitle', function (r) { return r.fields.paper ? r.fields.paper.title : ''; }],
    ['paperTitleEn', function (r) { return r.fields.paper ? r.fields.paper.titleEn : ''; }],
    ['authors', function (r) { return r.fields.paper && r.fields.paper.authors ? r.fields.paper.authors.join('; ') : ''; }],
    ['firstAuthor', function (r) { return r.fields.paper && r.fields.paper.firstAuthor ? r.fields.paper.firstAuthor.join('; ') : ''; }],
    ['correspondingAuthor', function (r) { return r.fields.paper && r.fields.paper.correspondingAuthor ? r.fields.paper.correspondingAuthor.join('; ') : ''; }],
    ['journal', function (r) { return r.fields.paper ? r.fields.paper.journal : ''; }],
    ['year', function (r) { return r.fields.paper && r.fields.paper.year ? String(r.fields.paper.year) : ''; }],
    ['volume', function (r) { return r.fields.paper ? r.fields.paper.volume : ''; }],
    ['issue', function (r) { return r.fields.paper ? r.fields.paper.issue : ''; }],
    ['pages', function (r) { return r.fields.paper ? r.fields.paper.pages : ''; }],
    ['doi', function (r) { return r.fields.paper ? r.fields.paper.doi : ''; }],
    ['arxiv', function (r) { return r.fields.paper ? r.fields.paper.arxiv : ''; }],
    ['pmid', function (r) { return r.fields.paper ? r.fields.paper.pmid : ''; }],
    ['impactFactor', function (r) { return r.fields.paper ? r.fields.paper.impactFactor : ''; }],
    ['quartile', function (r) {
      var p = r.fields.paper;
      return p ? [p.jcr, p.cas].filter(Boolean).join(' / ') : '';
    }],
    ['keywords', function (r) {
      var p = r.fields.paper;
      return p ? [].concat(p.keywordsZh || [], p.keywordsEn || []).join('; ') : '';
    }],
    // 链接
    ['primaryLink', function (r) { return r.links.best ? r.links.best.url : ''; }],
    ['allPrimaryLinks', function (r) { return (r.links.primary || []).map(function (l) { return l.url; }).join(' | '); }],
    ['readOriginal', function (r) { return r.links.readOriginal ? r.links.readOriginal.url : ''; }],
    ['citationGBT', function (r) { return r.fields.paper && r.fields.paper.citations ? r.fields.paper.citations.gbt7714 : ''; }],
    ['citationAPA', function (r) { return r.fields.paper && r.fields.paper.citations ? r.fields.paper.citations.apa : ''; }],
    ['articleKind', function (r) { return r.meta.articleKind; }],
    ['warnings', function (r) { return r.warnings.join(' | '); }]
  ];

  function csvCell(v) {
    var s = v === undefined || v === null ? '' : String(v);
    if (/[",\n\r]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
    return s;
  }

  function toCSV(results) {
    var arr = Array.isArray(results) ? results : [results];
    var out = [CSV_COLUMNS.map(function (c) { return c[0]; }).join(',')];
    arr.forEach(function (r) {
      out.push(CSV_COLUMNS.map(function (c) { return csvCell(c[1](r)); }).join(','));
    });
    return out.join('\r\n');
  }

  /* ---------------------------- 纯链接 ------------------------------ */

  function toLinkList(res, mode) {
    if (!Array.isArray(res)) res = [res];
    var urls = [];
    res.forEach(function (r) {
      var primary = r.links.primary || r.links.apply || [];
      var pool = mode === 'all'
        ? primary.concat(r.links.readOriginal ? [{ url: r.links.readOriginal.url }] : [])
        : primary;
      pool.forEach(function (l) { if (l && l.url && urls.indexOf(l.url) === -1) urls.push(l.url); });
    });
    return urls.join('\n');
  }

  /* --------------------------- 引用格式 ----------------------------- */

  /** 只复制引用格式，供文献笔记场景使用。 */
  function toCitation(res, style) {
    var p = res.fields && res.fields.paper;
    if (!p || !p.citations) return '';
    style = (style || 'gbt7714').toLowerCase();
    if (style === 'apa') return p.citations.apa || '';
    if (style === 'bibtex') return p.citations.bibtex || '';
    if (style === 'oneline') return p.citations.oneline || '';
    return p.citations.gbt7714 || '';
  }

  /** 复制论文题录（标题/作者/期刊/DOI 一行一条）。 */
  function toPaperCard(res) {
    var p = res.fields && res.fields.paper;
    if (!p) return '';
    var lines = [];
    if (p.title) lines.push('标题：' + p.title);
    if (p.titleEn && p.titleEn !== p.title) lines.push('英文标题：' + p.titleEn);
    if (p.authors && p.authors.length) lines.push('作者：' + p.authors.join(', '));
    if (p.correspondingAuthor && p.correspondingAuthor.length) lines.push('通讯作者：' + p.correspondingAuthor.join(', '));
    if (p.journal) lines.push('期刊：' + p.journal);
    var loc = [];
    if (p.year) loc.push(p.year);
    if (p.volume) loc.push('vol. ' + p.volume);
    if (p.issue) loc.push('no. ' + p.issue);
    if (p.pages) loc.push('pp. ' + p.pages);
    if (loc.length) lines.push('出处：' + loc.join(', '));
    if (p.doi) lines.push('DOI：' + p.doi);
    if (p.arxiv) lines.push('arXiv：' + p.arxiv);
    if (p.pmid) lines.push('PMID：' + p.pmid);
    if (p.impactFactor) lines.push('影响因子：' + p.impactFactor);
    if (p.jcr || p.cas) lines.push('分区：' + [p.jcr, p.cas].filter(Boolean).join(' / '));
    if (res.links.best) lines.push('原文链接：' + res.links.best.url);
    return lines.join('\n');
  }

  /* --------------------------- 一行速览 ----------------------------- */

  function toOneLiner(res) {
    var bits = [];
    var p = res.fields && res.fields.paper;
    if (isLiterature(res) && p) {
      if (p.title) bits.push(p.title);
      if (p.authors && p.authors.length) bits.push(p.authors.slice(0, 2).join(', '));
      if (p.journal) bits.push(p.journal);
      if (p.year) bits.push(String(p.year));
      if (p.doi) bits.push(p.doi);
    } else {
      if (res.fields.org) bits.push(res.fields.org.value);
      if (res.fields.batch) bits.push(res.fields.batch.value);
      if (res.fields.deadline) bits.push('截止' + res.fields.deadline.value);
    }
    if (res.links.best) bits.push(res.links.best.url);
    return bits.join(' | ');
  }

  return {
    toMarkdown: toMarkdown,
    toJSON: toJSON,
    toCSV: toCSV,
    toLinkList: toLinkList,
    toCitation: toCitation,
    toPaperCard: toPaperCard,
    toOneLiner: toOneLiner,
    fieldValue: fieldValue,
    kindLabel: kindLabel,
    profileOf: profileOf,
    isLiterature: isLiterature,
    isRecruit: isRecruit,
    CSV_COLUMNS: CSV_COLUMNS
  };
});

/* ==================== src/core/extract.js ==================== */
/*!
 * 微信求职信息提取器 — 统一入口 (extract.js)
 *
 *   WJE.extract.fromDocument(document)              → 结构化结果（内容脚本）
 *   WJE.extract.fromHtml(htmlString)                → 结构化结果（批量抓取 / 离线）
 *   WJE.extract.pipeline(source, opts)              → 通用入口
 *   WJE.extract.pipeline(src, {forceProfile:'literature'})  → 手动指定画像
 */
(function (root, factory) {
  var api = factory(
    (typeof module !== 'undefined' && module.exports)
      ? {
        parse: require('./parse.js'),
        fields: require('./fields.js'),
        format: require('./format.js'),
        rules: require('./rules.js'),
        classify: require('./classify.js'),
        links: require('./links.js'),
        insights: require('./insights.js')
      }
      : {
        parse: root && root.WJE && root.WJE.parse,
        fields: root && root.WJE && root.WJE.fields,
        format: root && root.WJE && root.WJE.format,
        rules: root && root.WJE && root.WJE.rules,
        classify: root && root.WJE && root.WJE.classify,
        links: root && root.WJE && root.WJE.links,
        insights: root && root.WJE && root.WJE.insights
      }
  );
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) { root.WJE = root.WJE || {}; root.WJE.extract = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (deps) {
  'use strict';

  var VERSION = '2.0.0';

  function pipeline(source, options) {
    options = options || {};
    var raw = deps.parse.parseSource(source, options);
    var result = deps.fields.extractFields(raw, options);
    result.version = VERSION;
    result.raw = options.keepRaw ? raw : undefined;
    return result;
  }

  return {
    VERSION: VERSION,
    fromDocument: function (doc, options) { return pipeline(doc || (typeof document !== 'undefined' ? document : null), options); },
    fromHtml: function (html, options) {
      options = options || {};
      return pipeline(html, Object.assign({ useDom: false }, options));
    },
    pipeline: pipeline,
    format: deps.format,
    rules: deps.rules,
    parse: deps.parse,
    fields: deps.fields,
    classify: deps.classify,
    links: deps.links,
    insights: deps.insights
  };
});

/* ==================== src/content/panel.js ==================== */
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

/* ---------------------------- 启动逻辑 ---------------------------- */
(function () {
  'use strict';
  if (window.__WJE_CONTENT_LOADED__) return;
  window.__WJE_CONTENT_LOADED__ = true;

  var WJE = window.WJE;
  if (!WJE || !WJE.extract || !WJE.panel) return;

  function isArticlePage() {
    return /^\/s(\/|\?|$)/.test(location.pathname) || /__biz=/.test(location.search);
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
