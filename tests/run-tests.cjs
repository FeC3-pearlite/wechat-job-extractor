/*!
 * 微信求职信息提取器 — 单元测试 / 夹具回归测试
 * 运行： node tests/run-tests.cjs
 * 说明：不依赖任何第三方库，直接 require src/core 下的 UMD 模块。
 */
'use strict';

const fs = require('fs');
const path = require('path');

const rules = require('../src/core/rules.js');
const parse = require('../src/core/parse.js');
const fields = require('../src/core/fields.js');
const format = require('../src/core/format.js');
const WJE = require('../src/core/extract.js');

const FIXTURES = path.join(__dirname, 'fixtures');
const NOW_YEAR = 2026;

let passed = 0;
let failed = 0;
const failures = [];

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log('  \u2713 ' + name);
  } catch (err) {
    failed++;
    failures.push({ name, err });
    console.log('  \u2717 ' + name + '\n      ' + String(err && err.message || err).split('\n').join('\n      '));
  }
}

function group(title) {
  console.log('\n' + title);
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'assertion failed');
}

function eq(actual, expected, msg) {
  if (actual !== expected) {
    throw new Error((msg || 'not equal') + '\n      expected: ' + JSON.stringify(expected) + '\n      actual:   ' + JSON.stringify(actual));
  }
}

function includes(haystack, needle, msg) {
  const ok = Array.isArray(haystack) ? haystack.some((h) => String(h).indexOf(needle) !== -1) : String(haystack).indexOf(needle) !== -1;
  if (!ok) throw new Error((msg || 'missing') + ': ' + JSON.stringify(needle) + '\n      in: ' + JSON.stringify(haystack).slice(0, 400));
}

function loadFixture(name) {
  return fs.readFileSync(path.join(FIXTURES, name), 'utf8');
}

function analyze(name, opts) {
  return WJE.fromHtml(loadFixture(name), Object.assign({ nowYear: NOW_YEAR }, opts || {}));
}

/* ================================================================== *
 * 1. 规则层
 * ================================================================== */

group('1. 规则层 rules.js');

test('normalize：全角转半角、压缩空白', () => {
  eq(rules.normalize('ａｂｃ　１２３  x'), 'abc 123 x');
});

test('extractBatch：识别“2027届”与“2027年校园招聘”', () => {
  eq(rules.extractBatch('华夏银行2027届校园招聘').year, 2027);
  eq(rules.extractBatch('中信银行2027年校园招聘公告').year, 2027);
  eq(rules.extractBatch('普通文章没有批次'), null);
});

test('extractRecruitType：区分秋招 / 校园招聘 / 实习', () => {
  eq(rules.extractRecruitType('2027届秋季校园招聘正式启动').value, '秋季校园招聘');
  eq(rules.extractRecruitType('某某公司校园招聘').value, '校园招聘');
  eq(rules.extractRecruitType('暑期实习生招聘').value, '暑期实习');
});

test('extractDeadline：完整日期', () => {
  const d = rules.extractDeadline('简历接收截止时间暂定2026年10月9日；', 2026, NOW_YEAR);
  eq(d.value, '2026-10-09');
  eq(d.yearAssumed, false);
});

test('extractDeadline：仅“X月X日”时用发布时间年份补全', () => {
  const d = rules.extractDeadline('五、网申通道（简历投递截止时间：10月25日）', 2026, NOW_YEAR);
  eq(d.value, '2026-10-25');
  eq(d.yearAssumed, true);
});

test('extractDeadline：无投递语义的日期不应误判', () => {
  eq(rules.extractDeadline('公司成立于1987年4月，2007年4月上市。', 2026, NOW_YEAR), null);
});

test('extractEducation：本科及以上', () => {
  const e = rules.extractEducation('具有国家认可的本科及以上学历');
  includes(e.list, '本科');
  eq(e.minRequirement, '本科');
});

test('extractLocations：抓到工作地点段落', () => {
  const loc = rules.extractLocations('工作地点：北京、上海、广州、深圳。');
  includes(loc.list, '北京');
  includes(loc.list, '深圳');
  eq(loc.fromDedicatedSection, true);
});

test('extractContacts：邮箱与电话', () => {
  const c = rules.extractContacts('咨询邮箱：job@citicbank.com，电话：010-66638888。');
  includes(c.emails, 'job@citicbank.com');
  includes(c.phones, '010-66638888');
});

test('unwrapUrl：解微信跳转中间页（含二次编码）', () => {
  eq(
    rules.unwrapUrl('https://mp.weixin.qq.com/mp/redirect?url=https%3A%2F%2Fjob.citicbank.com'),
    'https://job.citicbank.com'
  );
  eq(
    rules.unwrapUrl('https://career.gdufs.edu.cn/link?target=https://wecruit.hotjob.cn/SU645/pb/school.html'),
    'https://wecruit.hotjob.cn/SU645/pb/school.html'
  );
});

test('scoreLink：招聘官网得分高，微信站内文章得分低', () => {
  const good = rules.scoreLink('https://job.citicbank.com', '投递简历', '');
  assert(good.score >= 60, '官网应高分，实际 ' + good.score);
  const bad = rules.scoreLink('https://mp.weixin.qq.com/s?__biz=abc&mid=1', '阅读', '');
  assert(bad.score < 0, '微信文章链接应低分，实际 ' + bad.score);
});

group('2. 机构名抽取');

test('标题模板直取：中信银行（含“｜”分隔）', () => {
  const r = rules.extractOrgFromTitle('奔赴“信”征程｜中信银行2027年校园招聘正式启动');
  eq(r && r.name, '中信银行');
});

test('标题模板直取：华夏银行 / 中国光大银行（去尾噪）', () => {
  eq(rules.extractOrgFromTitle('华夏银行2027届校园招聘正式启动').name, '华夏银行');
  eq(rules.extractOrgFromTitle('2027中国光大银行秋季校园招聘公告').name, '中国光大银行');
  eq(rules.extractOrgFromTitle('中国光大银行2027届秋季校园招聘正式启动！').name, '中国光大银行');
});

test('候选枚举：不吞掉前文（“应聘者登录中信银行” → 中信银行）', () => {
  const names = rules.findOrgCandidates('应聘者登录中信银行招聘官网并注册用户').map((c) => c.name);
  includes(names, '中信银行');
  assert(names.every((n) => n.indexOf('应聘者') === -1), '不应出现带句子残渣的候选：' + names.join(','));
});

test('候选枚举：丢掉“征程中信银行”这类前缀残渣', () => {
  const names = rules.findOrgCandidates('奔赴“信”征程｜中信银行2027年校园招聘').map((c) => c.name);
  includes(names, '中信银行');
  assert(names.every((n) => n.indexOf('征程') === -1), '不应出现残渣候选：' + names.join(','));
});

test('候选枚举：保留合法限定前缀（中国光大银行）', () => {
  const names = rules.findOrgCandidates('中国光大银行成立于1992年8月').map((c) => c.name);
  includes(names, '中国光大银行');
});

/* ================================================================== *
 * 3. 夹具回归
 * ================================================================== */

group('3. 夹具回归：中信银行（文字型推文 + 跳转外链）');

const citic = analyze('citic-2027.html');

test('标题 / 公众号 / 发布时间', () => {
  includes(citic.meta.title, '中信银行2027年校园招聘');
  eq(citic.meta.account, '中信银行招聘');
  includes(citic.meta.publishTime, '2026-08-31');
});

test('招聘主体 = 中信银行，高置信度', () => {
  eq(citic.fields.org.value, '中信银行');
  eq(citic.fields.org.confidence, 'high');
});

test('批次 / 类型 / 截止日期', () => {
  eq(citic.fields.batch.value, '2027届');
  eq(citic.fields.recruitType.value, '校园招聘');
  eq(citic.fields.deadline.value, '2026-10-09');
});

test('投递入口：解出重定向后的中信银行招聘官网', () => {
  assert(citic.links.best, '应识别出投递入口');
  eq(citic.links.best.host, 'job.citicbank.com');
  assert(citic.links.best.url.indexOf('https://job.citicbank.com') === 0, '实际 ' + citic.links.best.url);
});

test('阅读原文 = https://job.citicbank.com/', () => {
  assert(citic.links.readOriginal, '应有阅读原文');
  eq(citic.links.readOriginal.url, 'https://job.citicbank.com/');
  eq(citic.links.readOriginal.from, 'msg_source_url');
});

test('学历 / 专业 / 岗位 / 联系方式', () => {
  includes(citic.fields.education.list, '本科');
  includes(citic.fields.majors.list, '经济学类');
  includes(citic.fields.majors.list, '工学类');
  includes(citic.fields.positions.list, '管培生');
  includes(citic.fields.positions.list, '客户经理');
  includes(citic.fields.contacts.emails, 'job@citicbank.com');
});

test('文章类型判定为文字型', () => {
  eq(citic.meta.articleKind, 'text');
});

group('4. 夹具回归：光大银行（图片型推文 + 阅读原文投递）');

const cebImg = analyze('cebbank-2027-image.html');

test('判定为图片型推文并给出告警', () => {
  eq(cebImg.meta.articleKind, 'image');
  assert(cebImg.warnings.some((w) => w.indexOf('图片') !== -1), '应有图片型告警');
});

test('阅读原文解出光大银行招贤馆公告页', () => {
  eq(
    cebImg.links.readOriginal.url,
    'https://eoap.cebbank.com/uiap/wt/CEB/zpzhm/dynamic/detail?columnId=102302'
  );
});

test('投递入口落在 eoap.cebbank.com', () => {
  assert(cebImg.links.best, '应识别出投递入口');
  eq(cebImg.links.best.host, 'eoap.cebbank.com');
});

group('5. 夹具回归：华夏银行（文字型推文 + 招聘系统链接）');

const hxb = analyze('hxb-2027.html');

test('主体 / 批次 / 类型', () => {
  eq(hxb.fields.org.value, '华夏银行');
  eq(hxb.fields.batch.value, '2027届');
  eq(hxb.fields.recruitType.value, '校园招聘');
});

test('截止日期用发布时间年份补全（10月25日 → 2026-10-25）', () => {
  eq(hxb.fields.deadline.value, '2026-10-25');
  eq(hxb.fields.deadline.confidence, 'medium');
});

test('投递入口 = 北森招聘系统链接', () => {
  eq(hxb.links.best.kind, 'ats');
  includes(hxb.links.best.url, 'wecruit.hotjob.cn');
});

test('岗位与专业', () => {
  includes(hxb.fields.positions.list, '管培生');
  includes(hxb.fields.positions.list, '经办岗');
  includes(hxb.fields.majors.list, '信息科技');
  includes(hxb.fields.majors.list, '经济金融');
  includes(hxb.fields.majors.list, '法律');
});

group('6. 夹具回归：光大银行（文字型公告，多字段齐全）');

const cebTxt = analyze('cebbank-2027-text.html');

test('主体 = 中国光大银行', () => {
  eq(cebTxt.fields.org.value, '中国光大银行');
});

test('截止日期 2026-11-08', () => {
  eq(cebTxt.fields.deadline.value, '2026-11-08');
});

test('投递入口与阅读原文都指向招贤馆', () => {
  includes(cebTxt.links.best.url, 'eoap.cebbank.com/uiap/wt/CEB/zpzhm');
  includes(cebTxt.links.readOriginal.url, 'eoap.cebbank.com');
});

test('工作地点 / 联系方式', () => {
  includes(cebTxt.fields.locations.list, '北京');
  includes(cebTxt.fields.locations.list, '乌鲁木齐');
  includes(cebTxt.fields.contacts.emails, 'zhaopin@cebbank.com');
});

group('7. 输出格式化 format.js');

test('Markdown 含表格、投递入口与免责声明', () => {
  const md = format.toMarkdown(citic);
  includes(md, '| 招聘主体 | 中信银行 |');
  includes(md, '## 投递入口');
  includes(md, 'https://job.citicbank.com');
  includes(md, '请以原文为准');
});

test('JSON 可往返解析', () => {
  const j = JSON.parse(format.toJSON(citic));
  eq(j.fields.org.value, '中信银行');
});

test('CSV 表头与行数正确', () => {
  const csv = format.toCSV([citic, hxb]);
  const lines = csv.split('\r\n');
  eq(lines.length, 3);
  includes(lines[0], 'primaryLink');
  includes(lines[0], 'doi');
  includes(lines[1], '中信银行');
  includes(lines[2], '华夏银行');
});

test('纯链接输出只含投递链接', () => {
  const links = format.toLinkList(hxb).split('\n').filter(Boolean);
  assert(links.length >= 1, '应有链接');
  assert(links.every((u) => /^https?:\/\//.test(u)), '应都是 URL');
});

group('8. 健壮性');

test('空输入不抛异常', () => {
  const r = WJE.fromHtml('');
  eq(r.meta.title, '');
  assert(Array.isArray(r.warnings));
});

test('非微信 HTML 不崩溃且能抽到通用信息', () => {
  const r = WJE.fromHtml('<html><head><title>某某集团有限公司2027届校园招聘公告</title></head><body><div id="js_content"><p>投递截止时间：2026年11月30日</p><p>网申地址：https://job.example.com/apply</p></div></body></html>', { nowYear: NOW_YEAR });
  eq(r.fields.deadline.value, '2026-11-30');
  assert(r.links.best && r.links.best.host === 'job.example.com', '应识别网申地址，实际 ' + JSON.stringify(r.links.best && r.links.best.url));
});

test('恶意/畸形 href 不产生无效链接', () => {
  const r = WJE.fromHtml('<div id="js_content"><a href="javascript:void(0)">点击</a><a href="#">x</a><p>正文足够长足够长足够长足够长足够长足够长足够长足够长</p></div>', { nowYear: NOW_YEAR });
  assert(r.links.all.every((l) => /^https?:\/\//.test(l.url)), '所有链接都应是 http(s)');
});

test('HTML 实体与零宽字符被正确解码', () => {
  const t = parse.htmlToText('<p>中信银行&amp;光大银行&#x3001;招聘&nbsp;公告\u200b</p>');
  includes(t, '中信银行&光大银行、招聘 公告');
});

test('中文标点不被折成半角（显示保真）', () => {
  const t = rules.normalize('本文提出了 AlphaFold，一个基于深度学习的模型（2021）。');
  includes(t, 'AlphaFold，一个');
  includes(t, '（2021）。');
});

/* ================================================================== *
 * 9. 内容类型自动判别
 * ================================================================== */

group('9. 内容类型自动判别 classify.js');

const classify = require('../src/core/classify.js');

test('四篇招聘夹具全部判为「招聘求职」', () => {
  ['citic-2027.html', 'hxb-2027.html', 'cebbank-2027-text.html', 'cebbank-2027-image.html'].forEach((f) => {
    const r = analyze(f);
    eq(r.detection.type, 'recruit', f + ' 误判为 ' + r.detection.label);
  });
});

test('两篇文献夹具全部判为「文献阅读」', () => {
  ['literature-nature.html', 'literature-cn.html'].forEach((f) => {
    const r = analyze(f);
    eq(r.detection.type, 'literature', f + ' 误判为 ' + r.detection.label);
  });
});

test('DOI 是强凭据：一句话里含 DOI 就足以判为文献', () => {
  const d = classify.detect({
    title: '本周推荐',
    account: '某公众号',
    contentText: '推荐一篇文章，DOI：10.1038/s41586-021-03819-2，感兴趣可以看看。'
  });
  eq(d.type, 'literature');
});

test('中性内容判为「通用信息」', () => {
  const d = classify.detect({
    title: '关于调整办公时间的通知',
    account: '行政部',
    contentText: '各位同事，自下周一起办公时间调整为 9:00-18:00，请大家知悉。'
  });
  eq(d.type, 'general');
});

test('两类信号接近时判为 hybrid 并同时跑两套提取器', () => {
  const raw = {
    title: '2027届校园招聘正式启动｜课题组最新Nature论文分享',
    account: '招聘与科研',
    contentText: '一、校园招聘：本次招聘岗位包括管培生、客户经理、信息科技岗，网申截止时间2026年11月1日，' +
      '简历投递至 job@example.com，应届毕业生均可报名，笔试面试安排另行通知，招聘流程详见招聘官网，' +
      '五险一金，工作地点北京。\n' +
      '二、文献分享：本期论文 DOI：10.1038/s41586-021-03819-2，发表于 Nature，影响因子 64.8，' +
      '作者 Jumper, J.，摘要如下：本文提出了一个基于深度学习的结构预测方法。',
    anchors: [], bareUrls: [], images: [], warnings: []
  };
  const d = classify.detect(raw);
  eq(d.type, 'hybrid', '招聘 ' + d.scores.recruit + ' / 文献 ' + d.scores.literature);
  const res = WJE.pipeline(raw, { nowYear: NOW_YEAR, useDom: false });
  assert(res.fields.org, 'hybrid 应同时产出招聘主体');
  assert(res.fields.paper && res.fields.paper.doi, 'hybrid 应同时产出文献 DOI');
});

test('手动指定画像可覆盖自动判别，并给出提示', () => {
  const r = analyze('literature-nature.html', { forceProfile: 'recruit' });
  eq(r.detection.activeProfile, 'recruit');
  eq(r.detection.autoLabel, '文献阅读');
  eq(r.detection.overridden, true);
  assert(r.warnings.some((w) => w.indexOf('手动指定') !== -1), '应提示已手动覆盖');
});

/* ================================================================== *
 * 10. 文献提取单元测试
 * ================================================================== */

group('10. 文献提取 profiles/literature.js');

const literature = require('../src/core/profiles/literature.js');

test('DOI 提取：多种写法与尾部标点清理', () => {
  eq(literature.extractIdentifiers('DOI：10.1038/s41586-021-03819-2').doi, '10.1038/s41586-021-03819-2');
  eq(literature.extractIdentifiers('见 https://doi.org/10.1126/science.abe1234。').doi, '10.1126/science.abe1234');
  eq(literature.extractIdentifiers('（doi:10.1016/j.cell.2020.02.001）').doi, '10.1016/j.cell.2020.02.001');
  // 尾部右括号多余时应剪掉
  eq(literature.normalizeDoi('10.1038/s41586-021-03819-2)'), '10.1038/s41586-021-03819-2');
  // 括号配平时应保留
  eq(literature.normalizeDoi('10.1016/S0140-6736(20)30185-5'), '10.1016/S0140-6736(20)30185-5');
});

test('arXiv / PMID 提取', () => {
  eq(literature.extractIdentifiers('arXiv:2301.12345v2').arxiv, '2301.12345v2');
  eq(literature.extractIdentifiers('见 arXiv:2301.12345').arxiv, '2301.12345');
  eq(literature.extractIdentifiers('PMID: 33731999').pmid, '33731999');
  eq(literature.extractIdentifiers('没有任何标识符的普通文字').doi, null);
});

test('作者拆分：英文不能用逗号硬切', () => {
  const a = literature.extractAuthors('作者：Jumper, J., Evans, R., Pritzel, A.');
  eq(a.list.length, 3);
  includes(a.list, 'Jumper, J.');
  includes(a.list, 'Pritzel, A.');
});

test('作者拆分：中文顿号 / 逗号', () => {
  const a = literature.extractAuthors('作者：张三、李四、王五');
  eq(a.list.length, 3);
  includes(a.list, '李四');
});

test('期刊识别：标签优先，其次已知刊名表', () => {
  eq(literature.extractJournal('期刊：Nature', '').value, 'Nature');
  eq(literature.extractJournal('本文发表于《经济研究》，很值得一读。', '').value, '经济研究');
  eq(literature.extractJournal('这篇发在 Science Advances 上', '').value, 'Science Advances');
});

test('卷期页解析：GB/T / APA / Nature 三种著录格式', () => {
  let n = literature.extractNumbering('经济研究, 2024, 59(4): 112-129.');
  eq(n.year, 2024); eq(n.volume, '59'); eq(n.issue, '4'); eq(n.pages, '112-129');

  n = literature.extractNumbering('Nature, 596(7873), 583-589.');
  eq(n.volume, '596'); eq(n.issue, '7873'); eq(n.pages, '583-589');

  n = literature.extractNumbering('Nature 596, 583–589 (2021)');
  eq(n.volume, '596'); eq(n.pages, '583–589'); eq(n.year, 2021);

  n = literature.extractNumbering('卷期页：596(7873): 583-589');
  eq(n.volume, '596'); eq(n.issue, '7873'); eq(n.pages, '583-589');
});

test('影响因子与分区', () => {
  const m = literature.extractMetrics('影响因子：64.8（JCR Q1，中科院一区）');
  eq(m.impactFactor, '64.8');
  eq(m.jcr, 'Q1');
  eq(m.cas, '一区');
});

test('关键词按分隔符切分并去重', () => {
  const k = literature.extractKeywords('关键词：深度学习；蛋白质结构；AlphaFold；深度学习');
  includes(k.zh, '深度学习');
  includes(k.zh, 'AlphaFold');
  eq(k.zh.filter((x) => x === '深度学习').length, 1, '应去重');
});

test('摘要截取到下一节为止', () => {
  const t = '摘要：\n这是摘要正文，长度需要超过三十个字符才被认为是有效摘要内容。\n关键词：甲；乙';
  const a = literature.extractAbstract(t);
  assert(a.zh, '应抽到中文摘要');
  assert(a.zh.indexOf('关键词') === -1, '摘要不应吞掉关键词段');
});

test('引用格式：英文文献用英文原题，GB/T 不加首字母点号', () => {
  const c = literature.buildCitations({
    titleZh: '中译标题', titleEn: 'Highly accurate protein structure prediction with AlphaFold',
    authors: ['Jumper, J.', 'Evans, R.', 'Pritzel, A.', 'Green, T.'],
    journal: 'Nature', year: 2021, volume: '596', issue: '7873', pages: '583-589',
    doi: '10.1038/s41586-021-03819-2'
  });
  includes(c.gbt7714, 'Highly accurate protein structure prediction with AlphaFold');
  assert(c.gbt7714.indexOf('中译标题') === -1, 'GB/T 不应使用中译标题');
  includes(c.gbt7714, 'Jumper J, Evans R, Pritzel A, et al.');
  assert(!/\bJumper J\./.test(c.gbt7714), 'GB/T 首字母后不应带点号');
  includes(c.apa, 'Highly accurate');
  includes(c.apa, ', & Green, T. (2021).');
  includes(c.bibtex, '@article{');
  includes(c.bibtex, 'doi     = {10.1038/s41586-021-03819-2}');
});

test('引用格式：中文文献用中文题名且不出现 & 以外的英文残留', () => {
  const c = literature.buildCitations({
    titleZh: '数字化转型与企业全要素生产率', titleEn: null,
    authors: ['张三', '李四', '王五'],
    journal: '经济研究', year: 2024, volume: '59', issue: '4', pages: '112-129'
  });
  includes(c.gbt7714, '张三, 李四, 王五. 数字化转型与企业全要素生产率[J]. 经济研究, 2024, 59(4): 112-129.');
  assert(c.gbt7714.indexOf('等') === -1, '三位作者以内不应出现「等」');
});

test('开放获取判断', () => {
  assert(literature.detectOpenAccess(['https://arxiv.org/abs/2301.12345'], 'Nature'), 'arXiv 应判为 OA');
  assert(literature.detectOpenAccess(['https://www.mdpi.com/x'], 'MDPI'), 'MDPI 应判为 OA');
  assert(!literature.detectOpenAccess(['https://www.nature.com/articles/x'], 'Nature'), '订阅制不应判为 OA');
});

test('论文类型识别', () => {
  eq(literature.extractPaperType('这是一篇综述，总结了近年进展').value, '综述');
  eq(literature.extractPaperType('本文为 arXiv 预印本').value, '预印本');
  eq(literature.extractPaperType('博士学位论文').value, '学位论文');
  eq(literature.extractPaperType('一篇普通的实验研究报告').value, '研究论文');
});

/* ================================================================== *
 * 11. 文献夹具回归
 * ================================================================== */

group('11. 夹具回归：Nature / AlphaFold（英文文献）');

const litNat = analyze('literature-nature.html');

test('类型与标题', () => {
  eq(litNat.detection.type, 'literature');
  eq(litNat.detection.confidence, 'high');
  eq(litNat.fields.paper.titleEn, 'Highly accurate protein structure prediction with AlphaFold');
  includes(litNat.fields.paper.titleZh, 'AlphaFold');
});

test('作者 / 第一作者 / 通讯作者', () => {
  eq(litNat.fields.paper.authors.length, 6);
  includes(litNat.fields.paper.authors, 'Jumper, J.');
  includes(litNat.fields.paper.firstAuthor, 'Jumper, J.');
  includes(litNat.fields.paper.correspondingAuthor, 'Jumper, J.');
});

test('期刊 / 年份 / 卷期页 / DOI', () => {
  eq(litNat.fields.paper.journal, 'Nature');
  eq(litNat.fields.paper.year, 2021);
  eq(litNat.fields.paper.volume, '596');
  eq(litNat.fields.paper.issue, '7873');
  eq(litNat.fields.paper.pages, '583-589');
  eq(litNat.fields.paper.doi, '10.1038/s41586-021-03819-2');
});

test('影响因子 / 分区 / 关键词 / 摘要', () => {
  eq(litNat.fields.paper.impactFactor, '64.8');
  eq(litNat.fields.paper.jcr, 'Q1');
  eq(litNat.fields.paper.cas, '一区');
  includes(litNat.fields.paper.keywordsZh, '深度学习');
  assert(litNat.fields.paper.abstractZh && litNat.fields.paper.abstractZh.length > 50, '应有中文摘要');
  assert(litNat.fields.paper.abstractEn && litNat.fields.paper.abstractEn.length > 50, '应有英文摘要');
});

test('原文链接优先取 DOI 解析页，其次出版社页', () => {
  eq(litNat.links.best.host, 'doi.org');
  eq(litNat.links.best.kind, 'doi');
  const hosts = litNat.links.primary.map((l) => l.host);
  includes(hosts, 'www.nature.com');
});

test('阅读原文 = doi.org 跳转', () => {
  eq(litNat.links.readOriginal.url, 'https://doi.org/10.1038/s41586-021-03819-2');
});

test('Markdown 输出含原文链接与引用格式', () => {
  const md = format.toMarkdown(litNat);
  includes(md, '## 原文链接');
  includes(md, '## 引用格式');
  includes(md, 'GB/T 7714');
  includes(md, 'doi.org/10.1038/s41586-021-03819-2');
  includes(md, '| DOI | 10.1038/s41586-021-03819-2 |');
});

test('toCitation / toPaperCard 一键复制', () => {
  includes(format.toCitation(litNat, 'gbt7714'), 'Highly accurate protein structure prediction with AlphaFold');
  includes(format.toCitation(litNat, 'apa'), 'https://doi.org/10.1038/s41586-021-03819-2');
  includes(format.toCitation(litNat, 'bibtex'), '@article{');
  includes(format.toPaperCard(litNat), '标题：Highly accurate');
  includes(format.toPaperCard(litNat), '原文链接：https://doi.org/');
});

group('12. 夹具回归：中文期刊（知网，无 DOI）');

const litCn = analyze('literature-cn.html');

test('类型 / 标题 / 作者', () => {
  eq(litCn.detection.type, 'literature');
  includes(litCn.fields.paper.titleZh, '数字化转型与企业全要素生产率');
  eq(litCn.fields.paper.authors.length, 3);
  includes(litCn.fields.paper.authors, '王五');
});

test('期刊 / 卷期页 / 分区', () => {
  eq(litCn.fields.paper.journal, '经济研究');
  eq(litCn.fields.paper.year, 2024);
  eq(litCn.fields.paper.volume, '59');
  eq(litCn.fields.paper.issue, '4');
  eq(litCn.fields.paper.pages, '112-129');
  eq(litCn.fields.paper.cas, '一区');
  eq(litCn.fields.paper.doi, null);
});

test('原文链接落在知网，并识别为文献数据库', () => {
  eq(litCn.links.best.kind, 'database');
  includes(litCn.links.best.url, 'kns.cnki.net');
});

test('无 DOI 时给出提示', () => {
  assert(litCn.warnings.some((w) => w.indexOf('DOI') !== -1), '应提示缺少 DOI');
});

test('CSV 导出包含文献列且内容正确', () => {
  const csv = format.toCSV([litNat, litCn]);
  const lines = csv.split('\r\n');
  eq(lines.length, 3);
  includes(lines[0], 'paperTitle');
  includes(lines[0], 'doi');
  includes(lines[1], '10.1038/s41586-021-03819-2');
  includes(lines[2], '经济研究');
});

test('文献画像下招聘域名不再抢占主链接', () => {
  const raw = {
    title: '文献分享：某研究',
    account: '科研速递',
    contentText: '本期论文 DOI：10.1038/s41586-021-03819-2，发表于 Nature。另附某公司校园招聘网申链接。',
    anchors: [
      { href: 'https://job.example.com/campus', text: '网申入口', near: '' },
      { href: 'https://doi.org/10.1038/s41586-021-03819-2', text: '原文', near: '' }
    ],
    bareUrls: [], images: [], warnings: []
  };
  const lit = WJE.pipeline(raw, { nowYear: NOW_YEAR, useDom: false, forceProfile: 'literature' });
  eq(lit.links.best.host, 'doi.org', '文献画像下 DOI 应排第一');
  const job = lit.links.all.filter((l) => l.host === 'job.example.com')[0];
  assert(job && job.reasons.some((r) => r.indexOf('招聘类域名') !== -1), '招聘域名应被降权并说明原因');
});

/* ================================================================== */

console.log('\n' + '─'.repeat(60));
console.log('通过 ' + passed + ' / ' + (passed + failed) + '，失败 ' + failed);
if (failed) {
  console.log('\n失败详情：');
  failures.forEach((f) => console.log('  · ' + f.name + '\n    ' + String(f.err.message).split('\n').join('\n    ')));
  process.exit(1);
}
console.log('全部通过 ✅');
