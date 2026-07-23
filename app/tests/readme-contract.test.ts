import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const repositoryRoot = path.resolve(process.cwd(), '..');

interface PublicReadme {
  locale: string;
  relativePath: string;
  text: string;
}

function readUtf8(relativePath: string): string {
  return readFileSync(path.join(repositoryRoot, relativePath), 'utf8');
}

const readmes: PublicReadme[] = [
  {
    locale: 'zh-CN',
    relativePath: 'README.md',
    text: readUtf8('README.md'),
  },
  {
    locale: 'zh-TW',
    relativePath: 'docs/README.zh-TW.md',
    text: readUtf8('docs/README.zh-TW.md'),
  },
  {
    locale: 'ja',
    relativePath: 'docs/README.ja.md',
    text: readUtf8('docs/README.ja.md'),
  },
  {
    locale: 'en',
    relativePath: 'docs/README.en.md',
    text: readUtf8('docs/README.en.md'),
  },
];

const visibleFeatureConcepts = [
  /Your Chart|birth chart|charting|命盘|命盤|命盤作成|排盘|排盤/i,
  /AI(?:[- ]powered)? (?:reading|interpretation)|AI.{0,16}(?:解读|解讀|解釈)/i,
  /Compatibility|compatibility reading|合盘|合盤|相性/i,
  /Share Card|share cards?|分享卡片|分享卡|共有カード/i,
];

const serverSideTerms =
  /server[- ]side|server environment|服务端|伺服器端|サーバー(?:側|環境)/i;
const staticUiTerms =
  /static UI|UI only|static Vite output|静态 UI|静态前端|Vite 靜態輸出|靜態 UI|靜態前端|Vite の静的出力|静的 UI|静的フロントエンド/i;
const paymentsDisabledTerms =
  /payments?[\s\S]{0,100}(?:disabled|not live|not available)|(?:支付|付款).{0,24}(?:关闭|關閉|未上线|未上線|停用)|(?:決済|支払い).{0,32}(?:無効|未公開|利用できません|提供していません)/i;

describe('public README contracts', () => {
  it.each(readmes)(
    '$locale describes the current Cinnabar surface',
    ({ text }) => {
      expect(text).toContain('Cinnabar');

      for (const concept of visibleFeatureConcepts) {
        expect(text).toMatch(concept);
      }
    },
  );

  it.each(readmes)(
    '$locale keeps AI credentials on the DeepSeek server boundary',
    ({ text }) => {
      expect(text).toMatch(/DeepSeek/i);
      expect(text).toContain('/api/interpret');
      expect(text).toContain('DEEPSEEK_API_KEY');
      expect(text).toMatch(serverSideTerms);

      expect(text).not.toMatch(/multi[- ]model|多模型|複数モデル/i);
      expect(text).not.toMatch(/OpenAI-compatible/i);
      expect(text).not.toMatch(
        /Open the in-app settings to configure|在应用内打开设置|在應用內開啟設定|アプリ内の設定画面から/i,
      );
    },
  );

  it.each(readmes)(
    '$locale distinguishes Vite static UI from the Vercel API runtime',
    ({ text }) => {
      expect(text).toContain('npm ci');
      expect(text).toContain('npm run dev');
      expect(text).toMatch(/vercel dev/i);
      expect(text).toMatch(/Vercel/i);
      expect(text).toContain('/api/');
      expect(text).toMatch(staticUiTerms);
      expect(text).not.toContain('deploy.workers.cloudflare.com');
      expect(text).not.toMatch(/deployment mirror|syncing the deployment/i);
    },
  );

  it.each(readmes)(
    '$locale states that payments are disabled',
    ({ text }) => {
      expect(text).toContain('ENABLE_FUTURE_REPORT_PAYMENTS=false');
      expect(text).toContain('VITE_ENABLE_FUTURE_REPORT_PAYMENTS=false');
      expect(text).toMatch(paymentsDisabledTerms);
    },
  );

  it.each(readmes)(
    '$locale does not advertise hidden fortune views as current features',
    ({ text }) => {
      expect(text).not.toMatch(
        /(?:^|\n)\s*(?:#{1,6}\s*|[-*]\s+(?:\*\*)?)(?:Yearly (?:Fortune|Trends)|年度运势|年度運勢|年運分析|Life K-?Line|人生 K ?线|人生 K ?線|ライフカーブ)/imu,
      );
      expect(text).not.toMatch(
        /(?:Precise charting|精准排盘|精準排盤|精密な命盤作成).{0,100}(?:yearly trends|年度运势|年度運勢|年運分析)/isu,
      );
    },
  );

  it.each(readmes)(
    '$locale retains language navigation, license, and attribution',
    ({ relativePath, text }) => {
      const expectedLanguageLinks =
        relativePath === 'README.md'
          ? [
              'docs/README.zh-TW.md',
              'docs/README.ja.md',
              'docs/README.en.md',
            ]
          : [
              '../README.md',
              ...[
                'README.zh-TW.md',
                'README.ja.md',
                'README.en.md',
              ].filter((target) => !relativePath.endsWith(target)),
            ];

      for (const target of expectedLanguageLinks) {
        expect(text).toContain(target);
      }

      expect(text).toMatch(/GPL(?:v3|-3\.0)|General Public License v3\.0/i);
      expect(text).toMatch(/iztro/i);
    },
  );
});
