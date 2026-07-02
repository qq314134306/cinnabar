<p align="center">
  <img width="820" alt="紫微知道" src="./docs/assets/logo.svg" />
</p>

<p align="center">
  简体中文 ·
  <a href="./docs/README.zh-TW.md">繁體中文</a> ·
  <a href="./docs/README.ja.md">日本語</a> ·
  <a href="./docs/README.en.md">English</a>
</p>

<p align="center">
  <strong>现代化的紫微斗数命盘分析工具</strong>
</p>

<p align="center">
  精准排盘 · AI 深度解读 · 年度运势 · 双人合盘 · 人生 K 线
</p>

<p align="center">
  <a href="https://github.com/ruijayfeng/ziwei"><img alt="Stars" src="https://img.shields.io/github/stars/ruijayfeng/ziwei?style=social" /></a>
  <a href="https://github.com/ruijayfeng/ziwei"><img alt="Forks" src="https://img.shields.io/github/forks/ruijayfeng/ziwei?style=social" /></a>
  <a href="https://github.com/ruijayfeng/ziwei/blob/main/LICENSE"><img alt="GPLv3 License" src="https://img.shields.io/badge/License-GPLv3-blue.svg" /></a>
  <a href="https://www.typescriptlang.org/"><img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-5.9-blue" /></a>
  <a href="https://react.dev/"><img alt="React" src="https://img.shields.io/badge/React-19-61DAFB" /></a>
  <a href="https://vite.dev/"><img alt="Vite" src="https://img.shields.io/badge/Vite-7-646CFF" /></a>
</p>

<p align="center">
  <img width="1920" height="911" alt="紫微知道界面预览" src="https://github.com/user-attachments/assets/756c0de6-e31c-4166-913e-c2d0afd1cf15" />
</p>

## 概览

紫微知道把传统紫微斗数知识、现代前端交互和多模型 AI 能力整合到一个可自部署的 Web 应用中。

它不只是展示命盘，而是围绕“看得懂、用得上、方便分享”这三件事，提供更完整的分析体验。

## 功能特性

- **精准排盘** - 基于 `iztro`，支持完整十二宫配置与传统安星逻辑
- **AI 命盘解读** - 提供结构化的命盘分析，支持多模型接入
- **年度运势** - 结合限流叠宫与月度趋势，呈现阶段性变化
- **双人合盘** - 支持四化互飞、关系匹配与互动分析
- **人生 K 线** - 以可视化方式展示长期运势走势
- **分享卡片** - 一键生成适合传播的命格金句卡

## 技术栈

- React 19
- TypeScript
- Vite
- Tailwind CSS
- Zustand
- ECharts / Recharts
- `iztro`
- OpenAI-compatible LLM API

## 快速开始

```bash
git clone https://github.com/ruijayfeng/ziwei.git
cd ziwei/app
npm install
npm run dev
```

开发服务器启动后，在浏览器打开终端输出的本地地址即可。

## 部署

### Vercel

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/ruijayfeng/ziwei&project-name=ziwei&root-directory=app)

点击仓库部署按钮或手动导入项目时，将 **Root Directory** 设置为 `app`。

### Cloudflare Pages

[![Deploy to Cloudflare Pages](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/ruijayfeng/ziwei)

- Framework preset: `Vite`
- Root directory: `app`
- Build command: `npm run build`
- Build output directory: `dist`

## 配置

在应用内打开设置，即可配置 LLM API。

支持接入 OpenAI-compatible 接口，也可配置以下服务：

| 服务商 | 地址 |
| --- | --- |
| Kimi | https://platform.moonshot.cn/ |
| Gemini | https://ai.google.dev/ |
| Claude | https://console.anthropic.com/ |
| DeepSeek | https://platform.deepseek.com/ |

## 项目结构

```text
app/
├── src/
│   ├── components/     # 业务组件
│   │   ├── chart/      # 命盘展示
│   │   ├── kline/      # 人生 K 线
│   │   ├── fortune/    # 年度运势
│   │   ├── match/      # 双人合盘
│   │   └── share/      # 分享卡片
│   ├── lib/            # 领域工具与适配层
│   ├── knowledge/      # 紫微知识库
│   └── stores/         # 状态管理
└── package.json
```

## 截图

### 信息填写
<img width="1920" height="911" alt="信息填写页面" src="https://github.com/user-attachments/assets/7e7cce4f-11bd-4cbd-beee-7e6fc0c1280a" />

### 命盘展示
<img width="1920" height="911" alt="命盘展示" src="https://github.com/user-attachments/assets/756c0de6-e31c-4166-913e-c2d0afd1cf15" />

### 解读结果
<img width="1920" height="911" alt="解读结果" src="https://github.com/user-attachments/assets/3f151263-587d-4fdc-8017-e9eabdf6b47f" />

### 年度运势
<img width="1646" height="1990" alt="年度运势" src="https://github.com/user-attachments/assets/a79ba231-2e8f-4b08-a510-7eb456e40cbc" />

### 人生 K 线
<img width="1920" height="911" alt="人生 K 线" src="https://github.com/user-attachments/assets/09b64812-d247-4189-912b-0abea6051881" />

### 双人合盘
<img width="1920" height="911" alt="双人合盘" src="https://github.com/user-attachments/assets/88407e8a-7a7b-4be4-ba5d-20eaaddcd996" />

### 分享卡片
<img width="1920" height="911" alt="分享卡片" src="https://github.com/user-attachments/assets/921faecb-a35f-4386-85bf-89abf03f69d9" />

## 开源协议

GPLv3 License

## 致谢

- [iztro](https://github.com/SylarLong/iztro)
- [lifekline](https://github.com/AICryptoHK/lifekline)
- [ClaudeCode 镜像站](https://www.aicodemirror.com/register?invitecode=R2A5HD)

## Star History

[![Star History Chart](https://api.star-history.com/svg?repos=ruijayfeng/ziwei&type=Date)](https://star-history.com/#ruijayfeng/ziwei&Date)
