// ==UserScript==
// @name         微信求职信息提取器
// @namespace    https://github.com/FeC3-pearlite/wechat-job-extractor
// @version      1.0.0
// @description  从微信公众号招聘推文里一键提取招聘单位、届别、岗位、投递截止时间与官方投递链接，可复制/下载 Markdown、JSON。
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
    '：': ':', '；': ';', '，': ',', '（': '(', '）': ')', '％': '%', '＃': '#', '＆': '&', '／': '/', '－': '-',
    '　': ' ', '～': '~', '！': '!', '？': '?', '＠': '@', '．': '.', '、': '、'
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

/* ==================== src/core/fields.js ==================== */
/*!
 * 微信求职信息提取器 — 字段抽取层 (fields.js)
 * 输入 parse.js 的「原始素材」，输出结构化求职信息（含证据与置信度）。
 */
(function (root, factory) {
  var api = factory(
    (typeof module !== 'undefined' && module.exports)
      ? { rules: require('./rules.js'), parse: require('./parse.js') }
      : { rules: root && root.WJE && root.WJE.rules, parse: root && root.WJE && root.WJE.parse }
  );
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) { root.WJE = root.WJE || {}; root.WJE.fields = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (deps) {
  'use strict';

  var rules = deps.rules;
  var parse = deps.parse;

  var ARTICLE_KIND_IMAGE = 'image';
  var ARTICLE_KIND_TEXT = 'text';
  var ARTICLE_KIND_MIXED = 'mixed';

  /* ------------------------------------------------------------------ *
   * 机构名
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
      if (inTitle[name] && from !== 'title') s += 25;      // 标题与正文互相印证
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
   * 链接
   * ------------------------------------------------------------------ */

  function classifyAndRank(raw) {
    var seen = Object.create(null);
    var list = [];

    function add(url, text, near, source) {
      if (!url) return;
      var abs = parse.absolutize(url, raw.baseUrl);
      if (!abs) return;
      var unwrapped = rules.unwrapUrl(abs);
      var key = unwrapped.replace(/[#?].*$/, '').replace(/\/$/, '').toLowerCase();
      if (seen[key]) {
        // 合并锚文本
        var ex = seen[key];
        if (text && ex.text.indexOf(text) === -1) ex.text = (ex.text ? ex.text + ' / ' : '') + text;
        if (source && ex.sources.indexOf(source) === -1) ex.sources.push(source);
        return;
      }
      var sc = rules.scoreLink(unwrapped, text, near);
      var item = {
        url: unwrapped,
        originalUrl: abs,
        host: rules.safeHost(unwrapped),
        text: text || '',
        near: near || '',
        kind: sc.kind,
        score: sc.score,
        reasons: sc.reasons,
        sources: source ? [source] : []
      };
      seen[key] = item;
      list.push(item);
    }

    // 阅读原文优先
    if (raw.readOriginal && raw.readOriginal.url) {
      add(raw.readOriginal.url, raw.readOriginal.text || '阅读原文', '阅读原文', 'read_original:' + raw.readOriginal.from);
    }
    // 正文锚点
    (raw.anchors || []).forEach(function (a) {
      if (!a.href) return;
      var host = rules.safeHost(parse.absolutize(a.href, raw.baseUrl) || '');
      if (/mmbiz\.qpic\.cn|mmbiz\.qlogo\.cn|res\.wx\.qq\.com/.test(host)) return;  // 图片/表情链接
      add(a.href, a.text, a.near, 'content_anchor');
    });
    // 正文纯文本 URL
    (raw.bareUrls || []).forEach(function (b) { add(b.url, '(正文文本)', b.near, 'content_text'); });

    // 从「阅读原文」推导投递标记
    list.forEach(function (it) {
      if (/read_original/.test(it.sources.join(','))) {
        it.score += 18;
        it.reasons.push('来自「阅读原文」');
      }
    });

    list.sort(function (a, b) { return b.score - a.score; });
    var apply = list.filter(function (i) { return i.score >= 25 && i.kind !== 'wechat' && !/\.(png|jpe?g|gif|webp|svg)$/i.test(i.url); });
    return { all: list, apply: apply, best: apply[0] || null };
  }

  /* ------------------------------------------------------------------ *
   * 关键句
   * ------------------------------------------------------------------ */

  var KEY_SENTENCE_RE = /(投递|网申|报名|申请|截止|官网|阅读原文|简历投递|校招|校园招聘|招聘系统|扫码|网申地址|投递地址|投递方式)/;

  function findKeySentences(text, limit) {
    limit = limit || 12;
    if (!text) return [];
    var sentences = text
      .split(/(?<=[。！？；\n])/)
      .map(function (s) { return s.trim(); })
      .filter(function (s) { return s.length >= 6 && s.length <= 220; });
    var hits = sentences.filter(function (s) { return KEY_SENTENCE_RE.test(s); });
    // 去重（按前 30 字）
    var seen = Object.create(null), out = [];
    hits.forEach(function (s) {
      var k = s.slice(0, 30);
      if (seen[k]) return;
      seen[k] = 1;
      out.push(s);
    });
    return out.slice(0, limit);
  }

  /* ------------------------------------------------------------------ *
   * 主入口
   * ------------------------------------------------------------------ */

  function extractFields(raw, options) {
    options = options || {};
    var text = raw.contentText || '';
    var title = raw.title || '';
    var haystack = [title, raw.account, raw.description, text].filter(Boolean).join('\n');
    var head = [title, raw.description, text.slice(0, 600)].filter(Boolean).join('\n');

    var textLength = text.replace(/\s/g, '').length;
    var imageCount = (raw.images || []).length;
    var kind = ARTICLE_KIND_TEXT;
    if (textLength < 120 && imageCount >= 3) kind = ARTICLE_KIND_IMAGE;
    else if (textLength < 500 && imageCount >= 6) kind = ARTICLE_KIND_MIXED;

    var batch = rules.extractBatch(haystack);
    var recruitType = rules.extractRecruitType([title, raw.account, text.slice(0, 400)].filter(Boolean).join('\n'));

    // 截止年份的推断顺序：发布时间 > 当年 > （届别年份 - 1）。
    // 注意：「2027届」是毕业年份，其校招截止日期通常落在前一年（2026），
    // 因此届别年份只能作为最后兜底，绝不能优先于发布时间。
    var publishYear = guessYear(raw.publishTime);
    var nowYear = options.nowYear || new Date().getFullYear();
    var yearGuess = publishYear || nowYear || (batch && batch.year ? batch.year - 1 : null);

    var deadline = rules.extractDeadline(text, yearGuess, nowYear)
      || rules.extractDeadline(head, yearGuess, nowYear);

    var fields = {
      org: pickOrg(raw),
      batch: batch ? { value: batch.label, year: batch.year, raw: batch.raw, evidence: '匹配“' + batch.raw + '”', confidence: 'high' } : null,
      recruitType: recruitType ? { value: recruitType.value, raw: recruitType.raw, evidence: '匹配“' + recruitType.raw + '”', confidence: /校园招聘|校招/.test(recruitType.raw) ? 'high' : 'medium' } : null,
      deadline: deadline ? {
        value: deadline.value,
        raw: deadline.raw,
        evidence: deadline.evidence,
        confidence: (deadline.yearAssumed ? 'medium' : 'high')
      } : null,
      education: rules.extractEducation(text),
      majors: rules.extractMajors(text),
      positions: rules.extractPositions(text),
      locations: rules.extractLocations(text),
      headcount: rules.extractHeadcount(text),
      contacts: rules.extractContacts(text)
    };

    var links = classifyAndRank(raw);
    // 「阅读原文」是微信推文最关键的投递入口来源，显式保留在结果里
    links.readOriginal = raw.readOriginal && raw.readOriginal.url
      ? { url: rules.unwrapUrl(raw.readOriginal.url), from: raw.readOriginal.from, text: raw.readOriginal.text || '阅读原文' }
      : null;
    var warnings = (raw.warnings || []).slice();

    if (kind === ARTICLE_KIND_IMAGE) {
      warnings.push('正文以图片为主（文字仅 ' + textLength + ' 字，图片 ' + imageCount + ' 张）：投递链接与截止时间很可能只印在长图里，插件无法读取图片文字，请打开原图人工确认或使用带 OCR 的流程。');
    } else if (kind === ARTICLE_KIND_MIXED) {
      warnings.push('正文文字偏少而图片较多（文字 ' + textLength + ' 字 / 图片 ' + imageCount + ' 张），部分关键信息可能只在图片中。');
    }
    if (!links.best) warnings.push('未识别出明确的投递入口链接，可能是图片型推文或使用了二维码投递。');
    if (fields.org && fields.org.confidence === 'low') warnings.push('招聘主体为推测结果，请人工确认。');

    var result = {
      version: '1.0.0',
      extractedAt: new Date().toISOString(),
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
      summary: buildSummary(fields, links),
      fields: fields,
      links: links,
      keySentences: findKeySentences(text, options.keySentenceLimit || 12),
      images: (raw.images || []).slice(0, 40),
      warnings: rules.uniq(warnings)
    };
    return result;
  }

  function guessYear(publishTime) {
    var m = String(publishTime || '').match(/(20\d{2})/);
    return m ? +m[1] : null;
  }

  function buildSummary(fields, links) {
    var parts = [];
    if (fields.org) parts.push(fields.org.value);
    if (fields.batch) parts.push(fields.batch.value);
    if (fields.recruitType) parts.push(fields.recruitType.value);
    var line = parts.join(' · ');
    if (fields.deadline) line += ' ｜ 截止 ' + fields.deadline.value;
    if (links.best) line += ' ｜ 投递入口 ' + links.best.host;
    return line;
  }

  return {
    extractFields: extractFields,
    pickOrg: pickOrg,
    classifyAndRank: classifyAndRank,
    findKeySentences: findKeySentences,
    ARTICLE_KIND_IMAGE: ARTICLE_KIND_IMAGE,
    ARTICLE_KIND_TEXT: ARTICLE_KIND_TEXT,
    ARTICLE_KIND_MIXED: ARTICLE_KIND_MIXED
  };
});

/* ==================== src/core/format.js ==================== */
/*!
 * 微信求职信息提取器 — 输出格式化 (format.js)
 * 支持 Markdown / JSON / CSV / 纯链接列表 / 剪贴板文本。
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

  /* ---------------------------- Markdown ---------------------------- */

  function toMarkdown(res, opts) {
    opts = opts || {};
    var lines = [];
    lines.push('# ' + (res.meta.title || '(无标题)'));
    lines.push('');
    lines.push('| 字段 | 内容 |');
    lines.push('| --- | --- |');
    var rows = [
      ['公众号', res.meta.account],
      ['发布时间', res.meta.publishTime],
      ['原文链接', res.meta.url],
      ['招聘主体', fieldValue(res, 'org') + confidenceTag(res.fields.org)],
      ['招聘批次', fieldValue(res, 'batch')],
      ['招聘类型', fieldValue(res, 'recruitType')],
      ['投递截止', fieldValue(res, 'deadline') + (res.fields.deadline && res.fields.deadline.raw ? '（原文：' + res.fields.deadline.raw + '）' : '')],
      ['学历要求', fieldValue(res, 'education')],
      ['工作地点', res.fields.locations ? (res.fields.locations.list.join('、') + (res.fields.locations.nationwide ? '（含全国）' : '')) : ''],
      ['招聘岗位', fieldValue(res, 'positions')],
      ['需求专业', fieldValue(res, 'majors')],
      ['招聘人数', res.fields.headcount ? String(res.fields.headcount.value) : ''],
      ['联系方式', res.fields.contacts ? [].concat(res.fields.contacts.emails || [], res.fields.contacts.phones || []).join(' / ') : '']
    ];
    rows.forEach(function (r) {
      if (r[1] === undefined || r[1] === null || r[1] === '') return;
      lines.push('| ' + r[0] + ' | ' + String(r[1]).replace(/\|/g, '\\|').replace(/\n/g, ' ') + ' |');
    });
    lines.push('');

    lines.push('## 投递入口');
    if (res.links.apply.length) {
      res.links.apply.forEach(function (l, i) {
        lines.push((i + 1) + '. [' + (l.text || l.host) + '](' + l.url + ')');
        lines.push('   - 域名：`' + l.host + '`　类型：' + kindLabel(l.kind) + '　评分：' + l.score);
        if (l.reasons && l.reasons.length && opts.verbose !== false) {
          lines.push('   - 判定依据：' + l.reasons.join('；'));
        }
      });
    } else {
      lines.push('> 未识别到明确的投递入口。' + (res.meta.articleKind === 'image' ? '本篇为图片型推文，链接可能印在长图中。' : ''));
    }
    lines.push('');

    if (res.links.readOriginal) {
      lines.push('## 阅读原文跳转');
      lines.push('- ' + res.links.readOriginal.url + '　（来源：' + res.links.readOriginal.from + '）');
      lines.push('');
    }

    var others = res.links.all.filter(function (l) {
      return res.links.apply.indexOf(l) === -1 && !/read_original/.test(l.sources.join(',')) && l.kind !== 'wechat';
    }).slice(0, 10);
    if (others.length) {
      lines.push('## 其他链接');
      others.forEach(function (l) { lines.push('- [' + (l.text || l.host) + '](' + l.url + ')'); });
      lines.push('');
    }

    if (res.keySentences.length && opts.verbose !== false) {
      lines.push('## 关键句摘录');
      res.keySentences.forEach(function (s) { lines.push('> ' + s); });
      lines.push('');
    }

    if (res.warnings.length) {
      lines.push('## 提示');
      res.warnings.forEach(function (w) { lines.push('- ⚠️ ' + w); });
      lines.push('');
    }

    lines.push('---');
    lines.push('_由「微信求职信息提取器」于 ' + res.extractedAt + ' 生成，字段为机器抽取结果，投递前请以官方原文为准。_');
    return lines.join('\n');
  }

  function kindLabel(kind) {
    return {
      official: '官网/官方域名',
      ats: '招聘系统',
      redirect: '跳转中间页',
      wechat: '微信站内',
      other: '其他',
      invalid: '无效'
    }[kind] || kind;
  }

  /* ------------------------------ JSON ------------------------------ */

  function toJSON(res, pretty) {
    return JSON.stringify(res, null, pretty === false ? 0 : 2);
  }

  /* ------------------------------ CSV ------------------------------- */

  var CSV_COLUMNS = [
    ['title', function (r) { return r.meta.title; }],
    ['account', function (r) { return r.meta.account; }],
    ['publishTime', function (r) { return r.meta.publishTime; }],
    ['url', function (r) { return r.meta.url; }],
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
    ['applyLink', function (r) { return r.links.best ? r.links.best.url : ''; }],
    ['allApplyLinks', function (r) { return r.links.apply.map(function (l) { return l.url; }).join(' | '); }],
    ['readOriginal', function (r) { return r.links.readOriginal ? r.links.readOriginal.url : ''; }],
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
      var pool = mode === 'all' ? r.links.apply.concat(r.links.readOriginal ? [{ url: r.links.readOriginal.url }] : []) : r.links.apply;
      pool.forEach(function (l) { if (l && l.url && urls.indexOf(l.url) === -1) urls.push(l.url); });
    });
    return urls.join('\n');
  }

  /* --------------------------- 一行速览 ----------------------------- */

  function toOneLiner(res) {
    var bits = [];
    if (res.fields.org) bits.push(res.fields.org.value);
    if (res.fields.batch) bits.push(res.fields.batch.value);
    if (res.fields.deadline) bits.push('截止' + res.fields.deadline.value);
    if (res.links.best) bits.push(res.links.best.url);
    return bits.join(' | ');
  }

  return {
    toMarkdown: toMarkdown,
    toJSON: toJSON,
    toCSV: toCSV,
    toLinkList: toLinkList,
    toOneLiner: toOneLiner,
    fieldValue: fieldValue,
    kindLabel: kindLabel,
    CSV_COLUMNS: CSV_COLUMNS
  };
});

/* ==================== src/core/extract.js ==================== */
/*!
 * 微信求职信息提取器 — 统一入口 (extract.js)
 *
 *   WJE.extract.fromDocument(document)   → 结构化结果（内容脚本）
 *   WJE.extract.fromHtml(htmlString)     → 结构化结果（批量抓取 / 离线）
 *   WJE.extract.pipeline(source, opts)   → 通用入口
 */
(function (root, factory) {
  var api = factory(
    (typeof module !== 'undefined' && module.exports)
      ? {
        parse: require('./parse.js'),
        fields: require('./fields.js'),
        format: require('./format.js'),
        rules: require('./rules.js')
      }
      : {
        parse: root && root.WJE && root.WJE.parse,
        fields: root && root.WJE && root.WJE.fields,
        format: root && root.WJE && root.WJE.format,
        rules: root && root.WJE && root.WJE.rules
      }
  );
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) { root.WJE = root.WJE || {}; root.WJE.extract = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (deps) {
  'use strict';

  var VERSION = '1.0.0';

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
    fields: deps.fields
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
