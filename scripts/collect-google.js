// Google Places API (New) で都内の煮干しラーメン店を検索し、口コミから濃度シグナルを作る。
//
//   GOOGLE_PLACES_API_KEY=xxx npm run collect:google
//
// 口コミ本文は保存せず、キーワード集計 (signal) のみを data/sources/google.json に書き出す。
import { buildSignal } from '../public/js/scoring.js';
import {
  TOKYO_BOUNDS, TOKYO_23_WARDS, TOKYO_TAMA, areaFromAddress, isTokyoAddress, path, sleep, writeJson,
} from './lib.js';

const API_KEY = process.env.GOOGLE_PLACES_API_KEY;
const ENDPOINT = 'https://places.googleapis.com/v1/places:searchText';
const FIELD_MASK = [
  'places.id',
  'places.displayName',
  'places.formattedAddress',
  'places.location',
  'places.rating',
  'places.userRatingCount',
  'places.googleMapsUri',
  'places.websiteUri',
  'places.businessStatus',
  'places.reviews',
  'nextPageToken',
].join(',');

// 1 クエリあたり最大 60 件しか返らないので、エリアごとに分けて検索する
const AREAS = process.env.GOOGLE_AREAS
  ? process.env.GOOGLE_AREAS.split(',')
  : [...TOKYO_23_WARDS, ...TOKYO_TAMA];
const KEYWORDS = ['煮干しラーメン', '煮干しそば'];
const MAX_PAGES = Number(process.env.GOOGLE_MAX_PAGES ?? 1);

async function searchText(textQuery, pageToken) {
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': API_KEY,
      'X-Goog-FieldMask': FIELD_MASK,
    },
    body: JSON.stringify({
      textQuery,
      languageCode: 'ja',
      regionCode: 'JP',
      pageSize: 20,
      locationRestriction: { rectangle: TOKYO_BOUNDS },
      ...(pageToken ? { pageToken } : {}),
    }),
  });
  if (!res.ok) throw new Error(`Places API ${res.status}: ${await res.text()}`);
  return res.json();
}

function toShop(place) {
  const reviewTexts = (place.reviews ?? []).map((r) => r.text?.text ?? r.originalText?.text ?? '');
  // 店名に「煮干」が入っていれば、それ自体も煮干し店である根拠として扱う
  const nameIsNiboshi = /煮干|にぼし|ニボ/.test(place.displayName?.text ?? '');
  return {
    id: `g:${place.id}`,
    placeId: place.id,
    name: place.displayName?.text ?? '',
    address: place.formattedAddress ?? '',
    area: areaFromAddress(place.formattedAddress),
    lat: place.location?.latitude,
    lng: place.location?.longitude,
    rating: place.rating ?? null,
    ratingCount: place.userRatingCount ?? 0,
    mapsUrl: place.googleMapsUri ?? '',
    website: place.websiteUri ?? '',
    nameIsNiboshi,
    signal: buildSignal(reviewTexts),
  };
}

async function main() {
  if (!API_KEY) {
    console.error('GOOGLE_PLACES_API_KEY が未設定のためスキップします');
    return;
  }
  const shops = new Map();
  for (const area of AREAS) {
    for (const kw of KEYWORDS) {
      let pageToken;
      for (let page = 0; page < MAX_PAGES; page++) {
        const data = await searchText(`${kw} 東京都${area}`, pageToken);
        for (const place of data.places ?? []) {
          if (place.businessStatus === 'CLOSED_PERMANENTLY') continue;
          if (!isTokyoAddress(place.formattedAddress)) continue;
          const shop = toShop(place);
          // 口コミにも店名にも煮干しの気配が無い店は除外
          if (!shop.nameIsNiboshi && shop.signal.docs === 0) continue;
          shops.set(shop.id, shop);
        }
        pageToken = data.nextPageToken;
        if (!pageToken) break;
        await sleep(300);
      }
    }
    console.log(`${area}: 累計 ${shops.size} 店`);
  }
  const out = {
    source: 'google_places',
    fetchedAt: new Date().toISOString(),
    shops: [...shops.values()],
  };
  await writeJson(path('data/sources/google.json'), out);
  console.log(`data/sources/google.json に ${out.shops.length} 店を書き出しました`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
