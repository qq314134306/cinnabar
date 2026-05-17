# 紫微知道

[![Stars](https://img.shields.io/github/stars/ruijayfeng/ziwei?style=social)](https://github.com/ruijayfeng/ziwei)
[![Forks](https://img.shields.io/github/forks/ruijayfeng/ziwei?style=social)](https://github.com/ruijayfeng/ziwei)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](https://github.com/ruijayfeng/ziwei/blob/main/LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-18-61DAFB)](https://react.dev/)
[![Vite](https://img.shields.io/badge/Vite-5-646CFF)](https://vitejs.dev/)

## 🌐 English

**ZiweiKnows** is an open-source Zi Wei Dou Shu (紫微斗数) astrology chart calculator with AI-powered reading and interpretation.

- **Precise Chart Calculation** - Based on iztro library, Zhongzhou school method, complete 12-palace configuration
- **AI Interpretation** - Traditional fortune-teller style, structured output
- **Annual Fortune Analysis** - Monthly trend analysis with Liurui叠宫 technique
- **Dual Chart Matching** - Sihua interaction analysis for relationship compatibility
- **Life K-Line** - AI-powered 100-year forecast visualization
- **Share Card** - Destiny quotes card, one-click export & share

**Tech Stack:** React 18 + TypeScript + Vite + Tailwind CSS + Glassmorphism + Recharts + ECharts + iztro + Multi-LLM Support

## 功能特性

- **精准排盘** - 基于 iztro 库，中州派安星法，完整十二宫配置
- **AI 命盘解读** - 传统命理师风格，结构化输出
- **年度运势** - 限流叠宫技法，月度趋势分析
- **双人合盘** - 四化互飞，姻缘匹配分析
- **人生 K 线** - AI 决策 100 年运势走向，大运周期可视化
- **分享卡片** - 命格金句卡，一键导出分享

## 技术栈

- **前端**: React 18 + TypeScript + Vite
- **样式**: Tailwind CSS + Glassmorphism
- **图表**: Recharts (K线) + ECharts (雷达图)
- **排盘**: [iztro](https://github.com/SylarLong/iztro)
- **LLM**: 多模型适配 (Kimi / Gemini / Claude / DeepSeek / etc)

## 快速开始

```bash
# 克隆仓库
git clone https://github.com/ruijayfeng/ziwei.git
cd ziwei/app

# 安装依赖
npm install

# 启动开发服务器
npm run dev

# 构建生产版本
npm run build
```

## 部署到 Vercel

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/ruijayfeng/ziwei&project-name=ziwei&root-directory=app)

或手动部署：

1. Fork 本仓库
2. 在 Vercel 导入项目
3. 设置 Root Directory 为 `app`
4. 部署完成

## 部署到 Cloudflare Pages

[![Deploy to Cloudflare Pages](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/ruijayfeng/ziwei)

或手动部署：

1. Fork 本仓库
2. 登录 [Cloudflare Dashboard](https://dash.cloudflare.com/) → Pages → Create a project
3. 连接 GitHub 并选择仓库
4. 配置构建设置：
   - **Framework preset**: Vite
   - **Root directory**: `app`
   - **Build command**: `npm run build`
   - **Build output directory**: `dist`
5. 部署完成

## 配置说明

在应用内点击设置图标，配置 LLM API：

推荐 Kimi ，虽然不是最好用的，但是我最喜欢的
杨植麟："游戏尚未结束，Kimi不下牌桌，Kimi不打算认输。"

| 模型 | API Key 获取 |
|------|-------------|
| Kimi | [moonshot.cn](https://platform.moonshot.cn/) |
| Gemini | [ai.google.dev](https://ai.google.dev/) |
| Claude | [anthropic.com](https://console.anthropic.com/) |
| DeepSeek | [deepseek.com](https://platform.deepseek.com/) |

也可配置任意 OpenAI 兼容 API。

## 项目结构

```
app/
├── src/
│   ├── components/     # UI 组件
│   │   ├── chart/      # 命盘展示
│   │   ├── kline/      # 人生 K 线
│   │   ├── fortune/    # 年度运势
│   │   ├── match/      # 双人合盘
│   │   └── share/      # 分享卡片
│   ├── lib/
│   │   ├── astro.ts    # 排盘封装
│   │   ├── llm.ts      # LLM 适配层
│   │   └── fortune-score.ts  # K线算法
│   ├── knowledge/      # 紫微知识库
│   └── stores/         # 状态管理
└── package.json
```

## 截图预览

1. 信息填写页面
<img width="1920" height="911" alt="image" src="https://github.com/user-attachments/assets/7e7cce4f-11bd-4cbd-beee-7e6fc0c1280a" />

2. 命盘展示
<img width="1920" height="911" alt="image" src="https://github.com/user-attachments/assets/756c0de6-e31c-4166-913e-c2d0afd1cf15" />

3. 解读展示
<img width="1920" height="911" alt="image" src="https://github.com/user-attachments/assets/3f151263-587d-4fdc-8017-e9eabdf6b47f" />

4. 年度运势
<img width="1646" height="1990" alt="image" src="https://github.com/user-attachments/assets/a79ba231-2e8f-4b08-a510-7eb456e40cbc" />

5. 人生 K 线
<img width="1920" height="911" alt="image" src="https://github.com/user-attachments/assets/09b64812-d247-4189-912b-0abea6051881" />

6. 双人合盘
<img width="1920" height="911" alt="image" src="https://github.com/user-attachments/assets/88407e8a-7a7b-4be4-ba5d-20eaaddcd996" />

7. 黑金箔卡
<img width="1920" height="911" alt="image" src="https://github.com/user-attachments/assets/921faecb-a35f-4386-85bf-89abf03f69d9" />



## 开源协议

MIT License

## 致谢
- [ClaudeCode](https://www.aicodemirror.com/register?invitecode=R2A5HD) - ClaudeCode 镜像站 国内加速 注册即送额度
- [iztro](https://github.com/SylarLong/iztro) - 紫微斗数排盘库
- [lifekline](https://github.com/AICryptoHK/lifekline) - K线设计参考


[![Star History Chart](https://api.star-history.com/svg?repos=ruijayfeng/ziwei&type=Date)](https://star-history.com/#ruijayfeng/ziwei&Date)

