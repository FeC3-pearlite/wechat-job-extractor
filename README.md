# 微信推文关键信息提取器 (WeChat Article Extractor)

打开任意公众号推文，**自动判断这是招聘帖还是文献帖**，然后按对应画像提取结构化信息：

| 推文类型 | 提取内容 |
| --- | --- |
| 🟢 **招聘求职** | 投递入口（官网/网申系统）、投递截止、招聘主体、批次、岗位、专业、地点、联系方式 |
| 🟣 **文献阅读** | **原文链接**（DOI / 出版社 / 预印本 / 知网）、标题（中英）、作者、通讯作者、期刊、年份卷期页、影响因子与分区、摘要、关键词、**GB/T 7714 / APA / BibTeX 引用格式** |
| ⚪ **通用信息** | 主要链接、疑似主体、主办方、事件类型、文中日期、联系方式 |
| 🟠 **招聘 + 文献** | 两类信号都强时两套提取器并行，结果合并 |

```
招聘帖                                   文献帖
┌─ 提取结果 ─────────────────┐          ┌─ 提取结果 ────────────────────────────┐
│ 招聘主体   中信银行          │          │ 论文标题  Highly accurate protein...   │
│ 招聘批次   2027届            │          │ 作者      Jumper, J., Evans, R., ...   │
│ 投递截止   2026-10-09        │          │ 期刊      Nature  2021  596(7873)      │
│ 投递入口   job.citicbank.com │          │ DOI       10.1038/s41586-021-03819-2   │
│ 阅读原文   job.citicbank.com │          │ 影响因子  64.8  JCR Q1  中科院一区      │
└─────────────────────────────┘          │ 原文链接  https://doi.org/10.1038/...  │
                                          │ 引用格式  GB/T / APA / BibTeX 一键复制  │
                                          └────────────────────────────────────────┘
```

判别是自动的，也可以在面板顶部**下拉手动切换**（自动 / 招聘 / 文献 / 通用 / 招聘+文献）。

---

## 一、安装

### 方式 A：Chrome / Edge 扩展（推荐，功能最全）

1. 打开 `chrome://extensions/`（Edge 是 `edge://extensions/`）
2. 打开 **开发人员模式**
3. 点 **加载解压缩的扩展**，选择本目录 `wechat-job-extractor/`
4. 打开任意 `https://mp.weixin.qq.com/s/...` 文章，右下角出现绿色按钮即成功

> 打包版：`dist/wechat-job-extractor-v2.0.0.zip`，解压后再按上面 3 步加载。
> **从 1.x 升级**：由于新增了核心模块，请到扩展页点一次「重新加载」，不要只刷新文章页。

### 方式 B：油猴脚本（零安装成本，Chrome/Edge/Firefox 通用）

1. 先装 [Tampermonkey](https://www.tampermonkey.net/) 或 Violentmonkey
2. 三种装法任选：
   - **一键安装（推荐）**：浏览器打开 [`dist/wechat-job-extractor.user.js`](https://raw.githubusercontent.com/FeC3-pearlite/wechat-job-extractor/main/dist/wechat-job-extractor.user.js)，Tampermonkey 会自动弹出安装页
   - **从仓库安装**：在 Tampermonkey 里新建脚本 → 粘贴该文件内容 → 保存
   - **本地安装**：直接用本目录 `dist/wechat-job-extractor.user.js`
3. 打开微信文章页，右下角同样会出现提取按钮

脚本已配置 `@updateURL`，仓库更新后 Tampermonkey 会自动提示升级。

两种方式共用同一套提取引擎（`src/core/`），结果完全一致。

> 项目地址：https://github.com/FeC3-pearlite/wechat-job-extractor

---

## 二、怎么用

| 入口 | 说明 |
| --- | --- |
| 页面右下角悬浮按钮 | 打开文章后点「🔍 提取关键信息」 |
| 工具栏图标 | 弹出精简结果，可复制 Markdown / JSON / 链接 |
| 快捷键 | <kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>E</kbd> 开关面板 |
| 右键菜单 | 「提取本页关键信息（招聘 / 文献）」/「批量提取公众号文章链接…」 |
| 批量页 | 粘贴多条链接一次性抓取，表格带**类型徽标**，可导出 CSV（带 BOM，Excel 直接打开不乱码） |

### 文献阅读专用操作

面板底部在文献画像下会换一组按钮：

- **复制 GB/T 引用** —— 直接粘进论文/报告的参考文献表
- **复制 APA** / **复制 BibTeX** —— 投英文期刊或写 Zotero/LaTeX 用
- **复制题录** —— 标题 / 作者 / 期刊 / 卷期页 / DOI 一行一条，适合记笔记
- **复制原文链接** —— 只要链接

正文里的「GB/T 7714」「APA 7th」「BibTeX」三块也可以单独点复制。

---

## 三、能提取什么

### 招聘画像

| 字段 | 抽取方式 | 典型输出 |
| --- | --- | --- |
| **投递入口** | 正文外链 + 纯文本 URL + 「阅读原文」三路汇总，按域名/锚文本打分排序 | `https://job.citicbank.com` |
| **阅读原文跳转** | `msg_source_url` → 底部栏 `<a>` → 锚文本含「阅读原文」 | `https://eoap.cebbank.com/...` |
| 招聘主体 | 标题模板直取 → 公众号名 → 全文候选加权 | `中信银行`、`中国光大银行` |
| 招聘批次 | `2027届` / `2027年校园招聘` / `面向2027年` | `2027届` |
| 招聘类型 | 秋招 / 春招 / 校招 / 社招 / 暑期实习 | `秋季校园招聘` |
| **投递截止** | 「截止/报名/网申」上下文词附近取日期；只有「10月25日」时按**发布时间**补全年份并标「待确认」 | `2026-10-09` |
| 学历 / 地点 / 岗位 / 专业 / 人数 / 联系方式 | 「招聘岗位」「工作地点」等段落 + 词表 | `本科及以上`、`管培生、经办岗` |

### 文献画像

| 字段 | 抽取方式 | 典型输出 |
| --- | --- | --- |
| **DOI** | 正则 + 尾部标点与括号配平清理 | `10.1038/s41586-021-03819-2` |
| **arXiv / PMID / ISBN** | 各自编号模式 | `2301.12345v2`、`33731999` |
| 标题（中 / 英） | 「原文标题：」标签 → 行扫描（≥4 个拉丁词且非字段行）→ 推文标题去栏目前缀 | `Highly accurate protein structure prediction with AlphaFold` |
| 作者 | 作者字段 + 中/英姓名模式；**英文「姓, 名首字母」不按逗号硬切** | `Jumper, J., Evans, R., Pritzel, A.` |
| 第一作者 / 通讯作者 | 独立标签 | `Jumper, J.` |
| 期刊 | 「期刊：」等标签 → 60+ 已知刊名表 | `Nature`、`经济研究` |
| 年份 / 卷 / 期 / 页 | 三种著录格式：GB/T `2024, 59(4): 112-129`、APA `596(7873), 583-589`、Nature `596, 583–589 (2021)` | `2021 / 596 / 7873 / 583-589` |
| 影响因子 / 分区 | 「影响因子」「JCR Q1」「中科院一区」 | `64.8`、`Q1`、`一区` |
| 摘要 | 「摘要：」到下一节（关键词/参考文献/…）为止；中英分开 | — |
| 关键词 | 「关键词：」/「Keywords:」按分隔符切分去重 | `深度学习、AlphaFold` |
| 文献类型 | 综述 / 预印本 / 学位论文 / 会议论文 / 评论社论 / 病例报告 / 勘误撤稿 | `研究论文` |
| 开放获取 | 按链接域名与期刊判断 | 是 / 否 |

### 引用格式怎么生成的

由抽取到的题录字段拼装，**题名与作者语种自动对齐**（英文文献用英文原题，不会出现"英文文献配中译标题"）：

```
GB/T 7714-2015
Jumper J, Evans R, Pritzel A, et al. Highly accurate protein structure prediction
with AlphaFold[J]. Nature, 2021, 596(7873): 583-589. DOI:10.1038/s41586-021-03819-2.

APA 7th
Jumper, J., Evans, R., Pritzel, A., Green, T., Figurnov, M., & Ronneberger, O. (2021).
Highly accurate protein structure prediction with AlphaFold. Nature, 596(7873), 583-589.
https://doi.org/10.1038/s41586-021-03819-2
```

> ⚠️ 引用格式是**机器拼装**的，投稿前请按目标期刊要求核对（尤其作者人数上限、et al. 规则、页码格式）。

### 链接打分（按画像分层）

| 情况 | 分值 |
| --- | --- |
| DOI 解析页 | +80（文献画像） |
| 预印本（arXiv/bioRxiv/medRxiv/SSRN） | +72 |
| 出版社官网（nature.com / sciencedirect / wiley / IEEE…） | +66 |
| 文献数据库（PubMed / 知网 / 万方 / x-mol…） | +56 |
| PDF 全文 | +52 |
| 已知招聘系统（hotjob.cn / 51job / mokahr / beisen…） | +45（招聘画像） |
| 域名含 `job\|career\|zhaopin\|recruit\|campus` | +40 |
| 锚文本含「投递 / 报名 / 网申 / 原文 / 全文 / PDF」 | +20 ~ +30 |
| 微信站内文章链接 | −60 |
| 锚文本是「分享/关注/二维码/广告」等噪声 | −35 |
| 文献画像下的招聘域名 / 招聘画像下的期刊域名 | −25（交叉降权） |

`/mp/redirect?url=` 中间页、`?target=` 包装、二次编码都会被自动解包成真实地址。

---

## 四、准确度与已知限制

**测试覆盖：123 项检查全部通过。**

| 测试套件 | 项数 | 覆盖内容 |
| --- | --- | --- |
| `tests/run-tests.cjs` | 76 | 规则层单测 + 6 份夹具回归 + 类型判别 + 文献解析 + 引用格式 + 格式化 + 健壮性 |
| `tests/verify-manifest.cjs` | 15 | 清单自检：引用文件是否存在、注入顺序、图标有效性、`default_locale` 陷阱、快捷键格式 |
| `tests/verify-panel.cjs` | 11 | 最小 DOM 桩**真实执行**面板挂载与渲染，覆盖招聘/文献/通用三种画像 + XSS 转义 |
| `tests/verify-userscript.cjs` | 8 | 在**无 `module`/`document` 的纯净上下文**里加载打包后的 Userscript，并用真实夹具跑通 |
| `tests/verify-dom-browser.cjs` | 13 | **无头 Edge 真实渲染夹具页**，执行内容脚本实际使用的 `parseDocument` 路径，并校验两条解析路径结果一致 |

必须说清楚的限制：

1. **图片型推文仍是最大盲区。** 银行校招推文经常整篇就是一张长图。插件无法读图，此时它会（a）判定为图片型并告警，（b）把正文图片列出来，（c）仍尽力从「阅读原文」拿到关键链接。
2. **引用格式需要人工核对。** 它是按抽取字段拼的，遇到缺卷期页、作者写法不规范的推文会不完整。投稿前请核对。
3. **作者名不做音译。** 中文作者保持中文；英文「张三」不会自动变成「Zhang S」。
4. **截止年份可能是推断的。** 原文只写「10月25日」时用发布时间年份补全，界面标「（年份据发布时间推断）」。
5. **类型判别可能出错。** 例如「招聘」二字出现在文献帖的"招收博士生"里。此时用面板顶部的下拉手动切换即可。
6. 结果是机器抽取，**投递/引用前请以原文为准**。

---

## 五、开发

```bash
# 全部测试（123 项）
npm test

# 分项跑
node tests/run-tests.cjs          # 核心逻辑 + 夹具回归
node tests/verify-manifest.cjs    # 扩展清单自检
node tests/verify-panel.cjs       # 面板 UI 渲染（最小 DOM 桩）
node tests/verify-userscript.cjs  # 打包后的 Userscript 制品
node tests/verify-dom-browser.cjs # 无头 Edge 真实 DOM 解析路径

# 单篇调试：打印结构化结果
node tools/inspect.cjs literature-nature
node tools/inspect.cjs tests/fixtures/citic-2027.html --json
node tools/inspect.cjs some.html --profile literature   # 强制指定画像

# 重新生成图标 / 打包 Userscript
python tools/make-icons.py
node tools/build-userscript.cjs
```

无构建步骤、无第三方依赖：`src/core/*.js` 用 UMD 包装，浏览器里当普通脚本加载，Node 里直接 `require`。
改完 `src/` 后扩展刷新即可；**Userscript 需要重新运行打包脚本**。

### 目录结构

```
wechat-job-extractor/
├── manifest.json                 # MV3 清单
├── src/
│   ├── core/
│   │   ├── rules.js              #   规则库：机构名/日期/学历/地点/链接基础打分
│   │   ├── classify.js           #   ★ 内容类型判别（招聘 / 文献 / 通用 / 混合）
│   │   ├── links.js              #   链接归集与画像化打分
│   │   ├── insights.js           #   关键句与一行摘要（关键词随画像变化）
│   │   ├── profiles/
│   │   │   ├── recruit.js        #   招聘画像：主体/批次/截止/岗位/专业…
│   │   │   ├── literature.js     #   ★ 文献画像：DOI/标题/作者/期刊/引用格式…
│   │   │   └── general.js        #   通用画像：时间/机构/事件/联系方式
│   │   ├── parse.js              #   解析层：DOM 精确解析 + 无依赖字符串解析
│   │   ├── fields.js             #   编排层：判别 → 跑画像 → 链接打分 → 汇总
│   │   ├── format.js             #   输出层：Markdown / JSON / CSV / 引用格式
│   │   └── extract.js            #   统一入口 WJE.extract
│   ├── content/                  # 页面注入：Shadow DOM 面板（含画像切换）
│   ├── popup/ batch/ options/    # 弹窗 / 批量页 / 设置页
│   └── background.js             # 右键菜单 / 快捷键
├── tests/
│   ├── fixtures/                 # 6 份夹具（3 家银行校招 + 2 篇文献 + 1 篇文字版）
│   ├── run-tests.cjs             # 76 项
│   ├── verify-*.cjs              # 清单 / 面板 / 制品 / 真实浏览器
├── tools/                        # 图标生成、Userscript 打包、单篇调试 inspect
└── dist/                         # 分发产物
```

### 加一个新画像要改哪里

1. 新建 `src/core/profiles/xxx.js`，导出 `extract(raw, options) -> { fields, warnings }`
2. 在 `classify.js` 里给该类加关键词表（强/弱）与硬凭据
3. 在 `fields.js` 的 `runners` 里挂上，并补 `emptyFields()` 的字段
4. 在 `format.js` 的 `toMarkdown` 分流与 `CSV_COLUMNS` 里加列
5. 五处模块顺序清单同步：`manifest.json` / `popup.js` / `batch.js` / `tools/build-userscript.cjs` / `tests/verify-*.cjs`

> `links.js` 已改为**调用时惰性解析依赖**，所以模块顺序不再影响正确性；但各处清单仍保持同一顺序，便于核对。

### 为什么 `parse.js` 有两套解析路径

- `parseDocument(document)`：内容脚本注入真实页面时用，选择器精确（`#js_content`、`#activity-name`、`#publish_time`、`msg_source_url`）。
- `parseHtml(html)`：批量抓取和**单元测试**用。批量模式在 Service Worker / 扩展页里没有可靠的 DOM 解析环境，测试环境也没有 jsdom —— 所以内置了一个轻量的 HTML 分词器（含 `<div id="js_content">` 的配平截取），零依赖。
- `parseSource()` 还接受**已经是原始素材结构**的对象（编程接口/测试手写输入），直接透传而不是静默当成空 HTML。

两条路径产出同一种结构，下游字段抽取完全共用，因此**测试覆盖的就是线上逻辑**。

---

## 六、隐私

- 解析 100% 在本地浏览器完成，**不向任何服务器发送数据**，扩展没有任何网络上报。
- 唯一的网络请求是你在批量模式里主动发起的、对你粘贴的微信文章地址的抓取。
- 不使用远程代码，全部逻辑随扩展打包。

---

## 七、更新日志

见 [CHANGELOG.md](CHANGELOG.md)。

- **v2.0.0** — 内容类型自动判别 + 文献阅读画像（DOI/作者/期刊/引用格式）
- **v1.0.0** — 招聘投递链接提取

---

## 八、License

MIT
