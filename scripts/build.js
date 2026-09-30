// 手動登録 (seed) + Google Places + X + 手入力メモ を統合し、濃度スコアを付けて
// public/data/shops.json を生成する。API キーは不要。
import { buildSignal, computeConcentration, mergeSignals } from '../public/js/scoring.js';
import { normalizeName, path, readJson, writeJson } from './lib.js';

/**
 * @param {{ seed: any[], google: any[], xSignals: Record<string, any>, notes: Record<string, string[]> }} input
 */
export function buildShops({ seed, google, xSignals = {}, notes = {} }) {
  const byKey = new Map();

  for (const g of google) {
    byKey.set(normalizeName(g.name), {
      ...g,
      style: null,
      sources: { google: g.signal },
      verified: true,
    });
  }

  for (const s of seed) {
    const key = normalizeName(s.name);
    const hit = byKey.get(key) ?? [...byKey.entries()].find(([k]) => k.startsWith(key) || key.startsWith(k))?.[1];
    if (hit) {
      // Google 側の正確な座標・住所を使い、スタイルと別名 ID だけ seed から引き継ぐ
      hit.style = s.style ?? hit.style;
      hit.aliases = [...(hit.aliases ?? []), s.id];
    } else {
      byKey.set(key, { ...s, sources: {}, verified: s.verified ?? false });
    }
  }

  const shops = [...byKey.values()].map((shop) => {
    const ids = [shop.id, ...(shop.aliases ?? [])];
    const x = ids.map((id) => xSignals[id]).find(Boolean);
    const noteTexts = ids.flatMap((id) => notes[id] ?? []);
    const sources = {
      ...shop.sources,
      ...(x ? { x: { docs: x.docs, sum: x.sum, hits: x.hits } } : {}),
      ...(noteTexts.length ? { notes: buildSignal(noteTexts) } : {}),
    };
    const signal = mergeSignals(...Object.values(sources));
    const concentration = computeConcentration({ style: shop.style, signal });
    return {
      id: shop.id,
      name: shop.name,
      area: shop.area ?? '',
      address: shop.address ?? '',
      lat: shop.lat,
      lng: shop.lng,
      style: shop.style ?? null,
      rating: shop.rating ?? null,
      ratingCount: shop.ratingCount ?? 0,
      mapsUrl:
        shop.mapsUrl ||
        `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${shop.name} ${shop.area ?? ''}`)}`,
      website: shop.website ?? '',
      verified: shop.verified,
      docs: signal.docs,
      sourceDocs: Object.fromEntries(Object.entries(sources).map(([k, v]) => [k, v.docs])),
      ...concentration,
    };
  });

  return shops
    .filter((s) => Number.isFinite(s.lat) && Number.isFinite(s.lng))
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name, 'ja'));
}

async function main() {
  const seed = (await readJson(path('data/seed.json'))).shops;
  const google = (await readJson(path('data/sources/google.json'), { shops: [] })).shops;
  const x = await readJson(path('data/sources/x.json'), { signals: {} });
  const notes = (await readJson(path('data/sources/notes.json'), { notes: {} })).notes;
  const shops = buildShops({ seed, google, xSignals: x.signals, notes });
  await writeJson(path('public/data/shops.json'), {
    generatedAt: new Date().toISOString(),
    count: shops.length,
    shops,
  });
  console.log(`public/data/shops.json に ${shops.length} 店を書き出しました`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
