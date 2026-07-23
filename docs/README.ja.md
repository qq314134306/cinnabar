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
  <strong>東洋占星術を英語で提供するオープンソース Web アプリ</strong>
</p>

## 概要

Cinnabar は React、TypeScript、Vite で構築された紫微斗数アプリです。現在の公開 UI は英語で、命盤、AI リーディング、二人の相性、共有カードに重点を置いています。

## 現在表示される機能

- **Your Chart**：出生情報と場所を入力し、必要に応じて真太陽時を補正してから、`iztro` で命盤を生成します。
- **AI Reading**：ブラウザーからサーバー側の `/api/interpret` へ送るのは、
  バージョン化された `reading.v1` の出生情報／persona リクエストだけです。
  命盤とプロンプトの再構築、18 歳以上の確認、日次クォータはサーバー側で
  実行します。messages、prompt、命盤 facts、補正済み時刻、座標、タイム
  ゾーンはブラウザーから送信しません。DeepSeek のキーもブラウザーには
  渡りません。
- **Compatibility**：二人の命盤と関係性を比較します。
- **Share Card**：生成済みの命盤から共有用カードを作成します。

## ローカル開発

```bash
git clone https://github.com/qq314134306/cinnabar.git
cd ziwei/app
npm ci
npm run dev
```

`npm run dev` が起動するのは Vite のフロントエンド開発サーバーだけで、`app/api/` のサーバー API は提供しません。AI リーディング、ログイン、その他の API を含むフローを確認するには、Vercel Functions と互換性のあるランタイムを使用してください。Vercel CLI をインストールして設定済みの場合は、次のように実行できます。

```bash
cd app
vercel dev
```

AI リーディングには、サーバー環境の `DEEPSEEK_API_KEY` が必要です。アプリ内に API キー設定はなく、ブラウザーから複数の AI モデルを切り替える機能もありません。

公開 AI はデフォルトで無効です。有効化する前に Supabase のクォータ
migration を適用し、`ENABLE_PUBLIC_AI_READINGS=true` と
`VITE_ENABLE_PUBLIC_AI_READINGS=true`（どちらも完全一致）、
`APP_ORIGIN`、`DEEPSEEK_API_KEY`、`SUPABASE_SECRET_KEY`、
`PUBLIC_AI_QUOTA_HMAC_KEY`、`PUBLIC_AI_DAILY_IP_LIMIT`、
`PUBLIC_AI_DAILY_GLOBAL_LIMIT` を設定してください。ローカルテストだけでは、
実際の DeepSeek ストリーム、外部クォータ、コストアラートを検証したことに
なりません。

## 検証

```bash
cd app
npm ci
npm run lint
npm run test
npm run build
```

## デプロイ

プロジェクトの Root Directory を `app` に設定し、`app/api/` の Vercel Functions 互換ルートを実行できる環境へデプロイしてください。Vite の静的出力だけを配信しても、完全な機能は利用できません。

Future Report の決済機能はデフォルトで無効です：`ENABLE_FUTURE_REPORT_PAYMENTS=false`、`VITE_ENABLE_FUTURE_REPORT_PAYMENTS=false`。PayPal のライブ環境や完全な本番フローを検証した証拠もまだありません。ローカルテストやワークフロー設定だけを根拠に、決済フラグを有効にしないでください。

## 注意

Cinnabar は娯楽と自己理解のためのものであり、医療、法律、金融、その他の専門的助言ではありません。

## ライセンス

本プロジェクトは [GPLv3（GNU General Public License v3.0）](../LICENSE) の下で公開されています。
