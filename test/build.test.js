import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildShops } from '../scripts/build.js';
import { areaFromAddress, normalizeName } from '../scripts/lib.js';
import { buildQuery, searchTerms } from '../scripts/collect-x.js';

const seed = [
  { id: 'seed:a', name: '中華そば 伊吹', area: '板橋区', lat: 35.77, lng: 139.69, style: 'セメント', verified: false },
  { id: 'seed:b', name: '淡い店', area: '杉並区', lat: 35.7, lng: 139.62, style: '淡麗', verified: false },
];
const google = [
  {
    id: 'g:1', name: '中華そば 伊吹', address: '日本、東京都板橋区…', area: '板橋区', lat: 35.7761, lng: 139.6951,
    rating: 4.2, ratingCount: 900, mapsUrl: 'https://maps.google.com/?cid=1',
    signal: { docs: 2, sum: 8, hits: { セメント: 2 } },
  },
];

test('seed と Google の同名店舗を統合し、Google の座標を使う', () => {
  const shops = buildShops({ seed, google, xSignals: { 'seed:a': { docs: 1, sum: 3, hits: { 濃厚: 1 } } } });
  assert.equal(shops.length, 2);
  const ibuki = shops.find((s) => s.name === '中華そば 伊吹');
  assert.equal(ibuki.id, 'g:1');
  assert.equal(ibuki.style, 'セメント');
  assert.equal(ibuki.lat, 35.7761);
  assert.equal(ibuki.verified, true);
  // seed ID で取った X シグナルも引き継ぐ
  assert.deepEqual(ibuki.sourceDocs, { google: 2, x: 1 });
  assert.ok(ibuki.score >= 80);
});

test('濃い順に並ぶ', () => {
  const shops = buildShops({ seed, google });
  assert.equal(shops[0].name, '中華そば 伊吹');
});

test('メモのテキストもスコアに反映される', () => {
  const [shop] = buildShops({ seed: [seed[1]], google: [], notes: { 'seed:b': ['セメント級にドロドロの煮干し'] } });
  assert.equal(shop.sourceDocs.notes, 1);
  assert.ok(shop.score > 25);
});

test('住所からエリアを取り出す', () => {
  assert.equal(areaFromAddress('日本、〒160-0021 東京都新宿区歌舞伎町1丁目1−10'), '新宿区');
  assert.equal(areaFromAddress('東京都町田市原町田6丁目'), '町田市');
  assert.equal(areaFromAddress('東京都東村山市本町'), '東村山市');
  assert.equal(areaFromAddress('神奈川県川崎市'), '');
});

test('店名の正規化', () => {
  assert.equal(normalizeName('中華そば　伊吹'), normalizeName('中華そば 伊吹'));
});

test('X 検索語は一般名詞と支店名を除く', () => {
  assert.deepEqual(searchTerms('中華そば 伊吹'), ['伊吹']);
  assert.deepEqual(searchTerms('すごい煮干ラーメン凪 新宿ゴールデン街店本館'), ['すごい煮干ラーメン凪']);
  assert.match(buildQuery('中華そば 伊吹'), /^"伊吹" \(/);
});
