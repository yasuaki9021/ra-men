// X (旧 Twitter) API v2 の recent search で店ごとの投稿を集め、濃度シグナルを作る。
//
//   X_BEARER_TOKEN=xxx npm run collect:x
//
// 事前に npm run build で public/data/shops.json を作っておくこと (店舗一覧として使う)。
// 投稿本文は保存せず、キーワード集計のみを data/sources/x.json に書き出す。
import { buildSignal } from '../public/js/scoring.js';
import { path, readJson, sleep, writeJson } from './lib.js';

const TOKEN = process.env.X_BEARER_TOKEN;
const ENDPOINT = 'https://api.x.com/2/tweets/search/recent';
// API の従量課金・レート制限に合わせて調整する
const MAX_SHOPS = Number(process.env.X_MAX_SHOPS ?? 30);
const MAX_RESULTS = Number(process.env.X_MAX_RESULTS ?? 50);

const GENERIC = new Set(['中華そば', '中華蕎麦', 'ラーメン', 'らーめん', '拉麺', '麺屋', 'つけ麺', 'そば', '煮干しラーメン']);

/** 「中華そば 伊吹」→ ['伊吹']、「すごい煮干ラーメン凪 新宿ゴールデン街店本館」→ ['すごい煮干ラーメン凪'] */
export function searchTerms(name) {
  const tokens = String(name).normalize('NFKC').split(/\s+/).filter(Boolean);
  const kept = tokens.filter((t) => !GENERIC.has(t) && !/(店|本館|号店)$/.test(t));
  return kept.length ? kept : tokens.slice(0, 1);
}

export function buildQuery(name) {
  const terms = searchTerms(name).map((t) => `"${t.replace(/"/g, '')}"`).join(' ');
  return `${terms} (煮干 OR にぼし OR ニボ OR ラーメン) -is:retweet lang:ja`;
}

async function search(query) {
  const url = new URL(ENDPOINT);
  url.searchParams.set('query', query);
  url.searchParams.set('max_results', String(Math.min(100, Math.max(10, MAX_RESULTS))));
  const res = await fetch(url, { headers: { Authorization: `Bearer ${TOKEN}` } });
  if (res.status === 429) {
    const reset = Number(res.headers.get('x-rate-limit-reset') ?? 0) * 1000;
    const wait = Math.max(15_000, reset - Date.now());
    console.warn(`レート制限: ${Math.round(wait / 1000)} 秒待機`);
    await sleep(wait);
    return search(query);
  }
  if (!res.ok) throw new Error(`X API ${res.status}: ${await res.text()}`);
  return res.json();
}

async function main() {
  if (!TOKEN) {
    console.error('X_BEARER_TOKEN が未設定のためスキップします');
    return;
  }
  const built = await readJson(path('public/data/shops.json'), { shops: [] });
  const prev = await readJson(path('data/sources/x.json'), { signals: {} });
  // 前回取得が古い店から順に回す (件数上限があるため)
  const shops = [...built.shops].sort(
    (a, b) => (prev.signals[a.id]?.fetchedAt ?? '').localeCompare(prev.signals[b.id]?.fetchedAt ?? ''),
  );
  const signals = { ...prev.signals };
  for (const shop of shops.slice(0, MAX_SHOPS)) {
    const data = await search(buildQuery(shop.name));
    const texts = (data.data ?? []).map((t) => t.text);
    signals[shop.id] = { ...buildSignal(texts), fetchedAt: new Date().toISOString() };
    console.log(`${shop.name}: ${texts.length} 件中 ${signals[shop.id].docs} 件を採用`);
    await sleep(1000);
  }
  await writeJson(path('data/sources/x.json'), {
    source: 'x_recent_search',
    fetchedAt: new Date().toISOString(),
    signals,
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
