# ニボ濃度マップ 東京

都内の煮干しラーメン店を、**口コミと SNS の言葉から濃度スコア (0〜100)** にして Google マップ上で探せるサイトです。

- 🐟 **濃度スコア** … 淡麗 (Lv1) 〜 セメント級 (Lv5) の 5 段階
- 🔎 **自動収集** … Google Places API の口コミ + X (旧 Twitter) の投稿を解析
- 🗺️ **Google マップ** … 濃度レベルで色分けしたピンを表示
- 🗳️ **ユーザー投票** … 自分の感じた濃さ (1〜5) をスコアに反映 (ブラウザ内に保存)
- 🤖 **GitHub 連携** … Actions で毎日データを更新し、GitHub Pages に自動デプロイ

## 構成

```
public/               静的サイト (GitHub Pages で公開)
  index.html
  js/app.js           一覧・絞り込み・地図・投票
  js/scoring.js       濃度スコアのロジック (ブラウザと Node で共用)
  data/shops.json     生成された店舗データ
data/
  seed.json           手動登録の店舗 (スタイル付き)
  sources/google.json Google Places から集めたシグナル
  sources/x.json      X から集めたシグナル
  sources/notes.json  自分で書いた食レポ (スコアの材料になる)
scripts/
  collect-google.js   都内の煮干しラーメン店を検索し口コミを解析
  collect-x.js        店ごとに X を検索し投稿を解析
  build.js            全ソースを統合してスコアを計算
  build-config.js     Maps API キーを public/config.js に書き出す
.github/workflows/
  update-data.yml     毎日 04:17 JST にデータ収集 → コミット
  deploy.yml          テスト → GitHub Pages へデプロイ
```

依存パッケージはありません (Node.js 20 以上)。

## 濃度スコアの仕組み

1. **事前スコア**: 店のスタイルから置く (淡麗 25 / 中間 50 / 濃厚 75 / セメント 92。不明は 50)
2. **テキスト解析**: 口コミ・投稿の中の語を数える
   - 濃い方向: セメント, 超濃厚, ドロドロ, 鬼煮干, 濃厚, ガツン, えぐみ, ザラザラ, 苦味 …
   - 淡い方向: 淡麗, 清湯, あっさり, ほんのり, 透き通, 上品, さっぱり …
   - 「濃厚じゃない」のような否定は反転して半分の重みに
   - 煮干しにも濃度にも触れていない文は無関係として除外
3. **統合**: `(事前スコア × 3 + テキストスコア × 件数) / (3 + 件数)`。件数が増えるほどテキストの比重が上がり、信頼度も上がる
4. **ユーザー投票**: 投票 1 件をテキスト 2 件ぶんとして加味

辞書や重みは `public/js/scoring.js` の `LEXICON` で調整できます。

## ローカルで動かす

```bash
npm test          # ロジックのテスト
npm run dev       # データ生成 → http://localhost:8080
```

API キーが無くても `data/seed.json` の店舗で動きます (地図はキー不要の埋め込み表示)。

## API キーの設定

| 変数 | 用途 | 取得先 |
| --- | --- | --- |
| `GOOGLE_PLACES_API_KEY` | 店舗検索・口コミ取得 (サーバー側のみ) | Google Cloud → Places API (New) |
| `X_BEARER_TOKEN` | X の投稿検索 | X Developer Portal (recent search が使えるプラン) |
| `GOOGLE_MAPS_API_KEY` | 地図表示 (ブラウザに公開される) | Google Cloud → Maps JavaScript API。**HTTP リファラ制限を必ず設定** |
| `GOOGLE_MAPS_MAP_ID` | 任意。マーカー用 Map ID | Google Cloud → Map Management (省略時 `DEMO_MAP_ID`) |

ローカルでは `.env.example` を参考に環境変数を設定して実行:

```bash
GOOGLE_PLACES_API_KEY=... X_BEARER_TOKEN=... npm run update
```

GitHub では **Settings → Secrets and variables → Actions** に同じ名前で登録してください。

## GitHub Pages で公開する

1. リポジトリの **Settings → Pages → Source** を「GitHub Actions」にする
2. `main` に push すると `Test & Deploy` が走り公開される
3. `Update data` は毎日自動実行 (Actions タブから手動実行も可)。更新があればコミットされ、再デプロイされる

## 収集データの扱いについて

- 口コミ・投稿の**本文は保存せず**、語の出現数などの集計値だけをリポジトリに残しています
- 食べログ等のスクレイピングは規約で禁止されているため対象外です。公式 API のあるソースのみ使います
- Google Maps Platform・X API の利用規約 (キャッシュ期間・表示義務など) は各自で確認してください
- `seed.json` の座標は駅付近の概算です (画面上で「位置要確認」と表示)。Google 収集を実行すると同名店は正確な位置に置き換わります

## 今後の拡張アイデア

- 投票をサーバー (Supabase / Firebase 等) に保存して全ユーザーで集計
- 都外への拡大 (`scripts/lib.js` の範囲とエリア一覧を変更)
- 写真からスープの色・粘度を推定して濃度の材料にする
