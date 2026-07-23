# Cinnabar

<p align="center">
  <img width="820" alt="Cinnabar" src="./assets/logo.svg" />
</p>

<p align="center">
  <a href="../README.md">简体中文</a> ·
  <a href="./README.zh-TW.md">繁體中文</a> ·
  <a href="./README.ja.md">日本語</a> ·
  <a href="./README.en.md">English</a>
</p>

<p align="center">
  <strong>以英文呈現東方占星的開源 Web 應用</strong>
</p>

## 概覽

Cinnabar 是以 React、TypeScript 與 Vite 建構的紫微斗數應用。目前公開介面為英文，聚焦於命盤、AI 解讀、雙人相容性與分享卡片。

## 目前可見功能

- **Your Chart**：輸入出生資料與地點，依需要套用真太陽時校正，再由 `iztro` 產生命盤。
- **AI Reading**：瀏覽器只向伺服器端 `/api/interpret` 提交版本化
  `reading.v1` 出生資料／persona 請求。命盤、提示詞、18+ 檢查與每日配額由
  伺服器重建及執行；瀏覽器不提交 messages、prompt、命盤 facts、校正時間、
  座標或時區。DeepSeek 金鑰不會傳到瀏覽器。
- **Compatibility**：比較兩人的命盤與互動關係。
- **Share Card**：從已產生的命盤建立可分享卡片。

## 本機開發

```bash
git clone https://github.com/qq314134306/cinnabar.git
cd ziwei/app
npm ci
npm run dev
```

`npm run dev` 啟動的是 Vite 前端開發伺服器，不會提供 `app/api/` 下的伺服器 API。若要測試 AI 解讀、登入或其他完整 API 流程，請使用相容 Vercel Functions 的執行環境，例如在已安裝並設定 Vercel CLI 後執行：

```bash
cd app
vercel dev
```

AI 解讀需要在伺服器環境設定 `DEEPSEEK_API_KEY`。應用內沒有 API 金鑰設定，也不支援由瀏覽器切換多家模型。

公開 AI 預設關閉。啟用前須套用 Supabase 配額 migration，並設定精確的
`ENABLE_PUBLIC_AI_READINGS=true`、`VITE_ENABLE_PUBLIC_AI_READINGS=true`、
`APP_ORIGIN`、`DEEPSEEK_API_KEY`、
`SUPABASE_SECRET_KEY`、`PUBLIC_AI_QUOTA_HMAC_KEY`、
`PUBLIC_AI_DAILY_IP_LIMIT` 與 `PUBLIC_AI_DAILY_GLOBAL_LIMIT`。本機測試不代表
真實 DeepSeek 串流、外部配額或成本警示已驗證。

## 驗證

```bash
cd app
npm ci
npm run lint
npm run test
npm run build
```

## 部署

部署時請將專案 Root Directory 設為 `app`，並使用支援 `app/api/` Vercel Functions 相容路由的執行環境。單純部署 Vite 靜態輸出只會提供前端，無法提供完整功能。

Future Report 付款功能預設關閉：`ENABLE_FUTURE_REPORT_PAYMENTS=false`、`VITE_ENABLE_FUTURE_REPORT_PAYMENTS=false`。目前沒有 PayPal 即時環境或完整上線流程的驗證證據；請勿僅因本機測試或工作流程已設定就啟用付款旗標。

## 使用提醒

Cinnabar 僅供娛樂與自我探索，不構成醫療、法律、財務或其他專業建議。

## 授權

本專案依 [GPLv3（GNU General Public License v3.0）](../LICENSE) 授權。
