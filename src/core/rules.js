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
