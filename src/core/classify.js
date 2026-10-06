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
