// ブラウザ用の public/config.js を環境変数から生成する (CI / ローカル共通)。
//   GOOGLE_MAPS_API_KEY  … Maps JavaScript API 用キー (HTTP リファラ制限を必ず掛けること)
//   GOOGLE_MAPS_MAP_ID   … Advanced Markers 用の Map ID (省略時 DEMO_MAP_ID)
import { writeFile } from 'node:fs/promises';
import { path } from './lib.js';

const config = {
  googleMapsApiKey: process.env.GOOGLE_MAPS_API_KEY ?? '',
  googleMapsMapId: process.env.GOOGLE_MAPS_MAP_ID || 'DEMO_MAP_ID',
};
await writeFile(
  path('public/config.js'),
  `// scripts/build-config.js が生成\nwindow.NIBOSHI_CONFIG = ${JSON.stringify(config, null, 2)};\n`,
);
console.log(`public/config.js を生成しました (Maps キー: ${config.googleMapsApiKey ? 'あり' : 'なし → 埋め込み地図で表示'})`);
