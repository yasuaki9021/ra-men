import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const path = (...p) => resolve(ROOT, ...p);

/** 東京都のおおよその範囲 (島しょ部を除く) */
export const TOKYO_BOUNDS = {
  low: { latitude: 35.5, longitude: 138.94 },
  high: { latitude: 35.9, longitude: 139.93 },
};

export const TOKYO_23_WARDS = [
  '千代田区', '中央区', '港区', '新宿区', '文京区', '台東区', '墨田区', '江東区',
  '品川区', '目黒区', '大田区', '世田谷区', '渋谷区', '中野区', '杉並区', '豊島区',
  '北区', '荒川区', '板橋区', '練馬区', '足立区', '葛飾区', '江戸川区',
];

export const TOKYO_TAMA = [
  '八王子市', '立川市', '武蔵野市', '三鷹市', '府中市', '調布市', '町田市', '小金井市',
  '国分寺市', '国立市', '西東京市', '日野市', '多摩市', '稲城市', '小平市', '東村山市',
];

export function isTokyoAddress(address) {
  return /東京都/.test(address ?? '');
}

/** 「日本、〒160-0021 東京都新宿区歌舞伎町1丁目…」→「新宿区」 */
export function areaFromAddress(address) {
  const rest = /東京都\s*(.*)/.exec(address ?? '')?.[1] ?? '';
  // 「町田市」「東村山市」のように途中に町・村を含む名前があるので、既知の一覧を先に当てる
  const known = [...TOKYO_23_WARDS, ...TOKYO_TAMA].find((a) => rest.startsWith(a));
  if (known) return known;
  return /^(.+?(?:区|市|郡.+?[町村]|町|村))/.exec(rest)?.[1] ?? '';
}

/** 店名の表記ゆれを吸収して比較用のキーを作る */
export function normalizeName(name) {
  return String(name ?? '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\s・･\-_'"「」『』()（）【】]/g, '')
    .replace(/(本店|本館|支店|店)$/, '');
}

export async function readJson(file, fallback) {
  try {
    return JSON.parse(await readFile(file, 'utf8'));
  } catch (err) {
    if (err.code === 'ENOENT' && fallback !== undefined) return fallback;
    throw err;
  }
}

export async function writeJson(file, data) {
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify(data, null, 2) + '\n');
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
