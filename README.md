# Cinnabar

<p align="center">
  <strong>Eastern Astrology, in English</strong>
</p>

<p align="center">
  简体中文 ·
  <a href="./docs/README.zh-TW.md">繁體中文</a> ·
  <a href="./docs/README.ja.md">日本語</a> ·
  <a href="./docs/README.en.md">English</a>
</p>

Cinnabar 是一款面向英语读者的紫微斗数 Web 应用。它基于 `iztro`
生成命盘，在展示层使用统一的英语术语，并提供 AI 解读、合盘和分享体验。

> 内容仅供娱乐与自我探索，不构成医疗、法律、财务或其他专业建议。

## 当前可见功能

- **Your Chart（你的命盘）**：输入出生日期、时间和地点，生成英语十二宫命盘；
  支持出生地匹配和真太阳时修正。若出生时间仅为大概范围，会在浏览器本地比较
  前后相邻的传统双时辰结构；还可主动展开 13 个民用时段的本地寻时流程，
  用可跳过的历史事件问题生成证据分与候选范围。所有候选都会先按出生地独立
  计算真太阳时，同盘候选会并列显示；用户可继续完成剩余问题、修改既有答案，
  并查看删除任一答案后的排序稳健性。完全不知道出生时间时也无需伪填时辰：
  选定候选前不会展示占位命盘或开放依赖时辰的衍生功能。功能不自动判断
  “正确时辰”。生成命盘后，选择任一宫位会在本地联动显示其本宫、对宫和
  两个三合宫，并汇总四宫主星，帮助用户按“三方四正”而非孤立单宫阅读。
  同一解读面板还会单独列出本宫左右相邻的两个邻宫，补充“夹宫”结构上下文；
  邻宫不会混入三方四正高亮，也不会被自动归类为助力或阻力。
  生年四化索引会集中列出禄、权、科、忌对应的星曜与宫位，点击即可打开该宫
  及其三方四正；它只整理命盘结构，不单独判定吉凶。
  大限与流年结构镜头可切换 1–100 岁模型中的年份，在本地叠加当前十年大限、
  流年命宫及两层四化，并可从任一落点返回本命宫位与三方四正。该范围只用于
  结构浏览，不预测结果或寿命。
- **Life Timeline（人生时间线）**：在本地按命盘权重生成相对周期趋势，默认聚焦
  当前年龄前 5 年至后 25 年，也可主动查看完整的 1–100 岁模型范围。这个范围用于
  覆盖十个十年周期，不预测寿命，也不依赖 AI、账号或付费。
- **Your Chart Snapshot（本地命盘摘要）**：生成命盘后立即在浏览器本地计算
  当前模型年的总分与事业、财富、关系、身心四个维度；无需 AI、账号、API 或付费。
- **AI Reading（AI 解读）**：作为可选叙事层，在启用公共 AI 后生成结构化解读，
  可选择 Scholar 或 Old Sage 表达风格；AI 关闭时不影响本地命盘摘要。
- **Compatibility（合盘）**：无需账号或 API 即可生成四维本地合盘摘要；公共 AI
  启用时可再添加可选的叙事解读。Person A 可沿用当前命盘的可见出生资料，
  两人都能输入出生地并在本地重新计算真太阳时，结果会明确显示是否修正及修正幅度。
- **Share Card（分享卡片）**：把命盘摘要生成为适合保存和分享的卡片。

部署 Supabase 后可启用免密码账号。已登录用户可以只读查看 credits
余额与近期活动；credits 写入仍然只允许在服务端完成。

## AI 与密钥边界

浏览器只向同源 `/api/interpret` 提交版本化的 `reading.v1` 产品请求和
允许的出生信息、解读风格等字段。浏览器不会提交聊天
messages、prompt、命盘 facts、真太阳时解析结果、坐标或时区。服务端重新生成
命盘与提示词、执行 18 岁门槛和每日配额，再调用 DeepSeek 并返回流式结果。
`DEEPSEEK_API_KEY` 不会发送到浏览器，也不能在应用界面中配置。

公开 AI 默认关闭。启用前必须应用 Supabase 配额迁移，并配置精确的
`ENABLE_PUBLIC_AI_READINGS=true`、`VITE_ENABLE_PUBLIC_AI_READINGS=true`、
`APP_ORIGIN`、`DEEPSEEK_API_KEY`、
`SUPABASE_SECRET_KEY`、`PUBLIC_AI_QUOTA_HMAC_KEY`、
`PUBLIC_AI_DAILY_IP_LIMIT` 和 `PUBLIC_AI_DAILY_GLOBAL_LIMIT`。仓库中的本地
测试不等于真实 DeepSeek 流、外部 Supabase 配额或成本告警已经验证。

## 快速开始

需要 Node.js 和 npm。使用锁文件安装依赖：

```bash
git clone https://github.com/qq314134306/cinnabar.git
cd ziwei/app
npm ci
npm run dev
```

`npm run dev` 启动 Vite 静态 UI 开发服务器，适合查看前端界面，但不会提供
`/api/*` Functions，因此 AI、账号等服务端流程不可用。

需要在本地联调 Vercel API runtime 时，在 `app/` 中配置所需的服务端环境变量并运行：

```bash
npx vercel dev
```

不要给 `DEEPSEEK_API_KEY` 添加 `VITE_` 前缀，也不要把任何服务端密钥提交到仓库。

## 部署

完整功能以 Vercel 部署为基准，因为项目的 AI、账号和其他受信任操作依赖
`app/api/` 中的 Vercel Functions。

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/qq314134306/cinnabar&project-name=cinnabar&root-directory=app)

导入项目时将 **Root Directory** 设置为 `app`。AI 解读所需的完整服务端
配置见上文，账号与 AI 配额还需要完成 Supabase 配置和数据库迁移。

普通 Vite 静态托管（包括只部署 `dist/` 的 Cloudflare Pages 配置）只能提供
静态 UI，不会运行 Vercel `/api/*` Functions。除非另行迁移这些 API，否则它
不是 Cinnabar 的全功能部署。

## 支付状态

支付功能尚未上线，并且默认关闭。候选构建与部署必须保持：

```text
ENABLE_FUTURE_REPORT_PAYMENTS=false
VITE_ENABLE_FUTURE_REPORT_PAYMENTS=false
```

在完整的数据库、PayPal webhook、对账和端到端验证完成前，不应启用这两个开关。

## 验证

从 `app/` 运行：

```bash
npm run lint
npm run test
npm run build
```

## 项目结构

```text
app/
├── src/        # React UI、命盘计算与浏览器客户端
├── api/        # Vercel server/edge Functions
└── tests/      # 跨模块与部署合同测试
supabase/
├── migrations/ # 数据库迁移
├── templates/  # 登录邮件模板
└── tests/      # 数据库 Release Proof
docs/           # 多语言 README 与开发文档
```

## 开源协议与致谢

本项目采用 [GNU GPLv3](./LICENSE) 开源协议。

- [`iztro`](https://github.com/SylarLong/iztro) - 紫微斗数命盘引擎
- [`city-geo`](https://github.com/88250/city-geo) - 中国城市坐标数据来源
- [`lifekline`](https://github.com/AICryptoHK/lifekline) - 早期研究参考
