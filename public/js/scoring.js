// 煮干し濃度スコアリング。ブラウザと Node (収集スクリプト) の両方から読み込む純粋な ES モジュール。
//
// スコアは 0〜100。0 に近いほど淡麗、100 に近いほどセメント系。
// 1) 店のスタイル (淡麗/中間/濃厚/セメント) から事前スコアを決め
// 2) 口コミ・SNS テキストのキーワード解析で得たスコアでベイズ的に補正し
// 3) ブラウザではさらにユーザー投票を加味する。

/** 濃度を強める表現 (正の重み) と弱める表現 (負の重み) */
export const LEXICON = [
  // 濃い
  { term: 'セメント', weight: 3 },
  { term: '超濃厚', weight: 3 },
  { term: 'ドロドロ', weight: 2.5 },
  { term: 'どろどろ', weight: 2.5 },
  { term: 'ドロ系', weight: 2.5 },
  { term: '鬼煮干', weight: 2.5 },
  { term: '濃厚', weight: 2 },
  { term: '強烈', weight: 2 },
  { term: 'ガツン', weight: 2 },
  { term: 'えぐみ', weight: 2 },
  { term: 'エグみ', weight: 2 },
  { term: 'エグい', weight: 2 },
  { term: 'ザラザラ', weight: 2 },
  { term: 'ざらざら', weight: 2 },
  { term: '粉っぽ', weight: 1.5 },
  { term: '苦味', weight: 1.5 },
  { term: '苦み', weight: 1.5 },
  { term: 'ビター', weight: 1.5 },
  { term: '凝縮', weight: 1.5 },
  { term: 'パンチ', weight: 1.5 },
  { term: 'こってり', weight: 1.5 },
  { term: '煮干し感', weight: 1 },
  { term: '煮干感', weight: 1 },
  { term: 'ニボニボ', weight: 1.5 },
  { term: '濃い', weight: 1 },
  // 淡い
  { term: '淡麗', weight: -2.5 },
  { term: '端麗', weight: -2.5 },
  { term: '清湯', weight: -2 },
  { term: 'あっさり', weight: -2 },
  { term: 'ほんのり', weight: -2 },
  { term: '透き通', weight: -1.5 },
  { term: '澄んだ', weight: -1.5 },
  { term: '上品', weight: -1.5 },
  { term: 'さっぱり', weight: -1.5 },
  { term: '優しい', weight: -1.5 },
  { term: 'やさしい', weight: -1.5 },
  { term: '軽め', weight: -1 },
  { term: '薄い', weight: -1 },
  { term: '物足りな', weight: -1 },
];

/** 煮干しの話題かどうかを判定する語 */
export const NIBOSHI_TERMS = ['煮干', 'にぼし', 'ニボシ', 'ニボ', 'niboshi', 'いりこ', 'イリコ'];

/** スタイル別の事前スコア */
export const STYLE_PRIORS = {
  淡麗: 25,
  中間: 50,
  濃厚: 75,
  セメント: 92,
};
const DEFAULT_PRIOR = 50;

/** 事前スコアの強さ (テキスト何件ぶんとみなすか) */
export const PRIOR_WEIGHT = 3;
/** 1 文書あたりの生スコアの上下限 */
const DOC_CLAMP = 5;

export const LEVELS = [
  { level: 1, min: 0, label: '淡麗', color: '#e8c872' },
  { level: 2, min: 20, label: 'あっさり', color: '#d9a441' },
  { level: 3, min: 40, label: 'バランス', color: '#c07a2c' },
  { level: 4, min: 60, label: '濃厚', color: '#8e4f1f' },
  { level: 5, min: 80, label: 'セメント級', color: '#5a4636' },
];

const NEGATION = /^.{0,3}(じゃな|ではな|でもな|くな|ない|なかっ|無い|無く|ず[、。\s]|ほどでは)/;

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/**
 * テキスト 1 件を解析する。
 * @returns {{ score: number, hits: Record<string, number>, mentionsNiboshi: boolean }}
 *   score は -5〜5 に丸めた生スコア
 */
export function analyzeText(text) {
  const src = String(text ?? '');
  const hits = {};
  let raw = 0;
  // 長い語から当てて、「超濃厚」の中の「濃厚」を二重に数えないようにする
  const masked = { value: src };
  for (const { term, weight } of [...LEXICON].sort((a, b) => b.term.length - a.term.length)) {
    let idx = masked.value.indexOf(term);
    while (idx !== -1) {
      const after = masked.value.slice(idx + term.length, idx + term.length + 8);
      const negated = NEGATION.test(after);
      // 否定されていたら符号を反転し、強さは半分にする (「濃厚ではない」≒ やや淡い)
      raw += negated ? -weight / 2 : weight;
      if (!negated) hits[term] = (hits[term] ?? 0) + 1;
      masked.value =
        masked.value.slice(0, idx) + '　'.repeat(term.length) + masked.value.slice(idx + term.length);
      idx = masked.value.indexOf(term, idx + term.length);
    }
  }
  const mentionsNiboshi = NIBOSHI_TERMS.some((t) => src.toLowerCase().includes(t.toLowerCase()));
  return { score: clamp(raw, -DOC_CLAMP, DOC_CLAMP), hits, mentionsNiboshi };
}

/** 空のシグナル。収集元 (Google / X など) ごとにこれを積み上げる */
export function emptySignal() {
  return { docs: 0, sum: 0, hits: {} };
}

/**
 * 複数テキストを 1 つのシグナルに集約する。
 * 煮干しに触れていない、かつ濃度語も無いテキストは無関係として捨てる。
 * 生テキストは保存せず、この集計値だけを保存する (各サービス規約への配慮)。
 */
export function buildSignal(texts) {
  const signal = emptySignal();
  for (const text of texts) {
    const r = analyzeText(text);
    if (!r.mentionsNiboshi && Object.keys(r.hits).length === 0) continue;
    signal.docs += 1;
    signal.sum += r.score;
    for (const [k, v] of Object.entries(r.hits)) signal.hits[k] = (signal.hits[k] ?? 0) + v;
  }
  signal.sum = Math.round(signal.sum * 100) / 100;
  return signal;
}

export function mergeSignals(...signals) {
  const out = emptySignal();
  for (const s of signals) {
    if (!s) continue;
    out.docs += s.docs;
    out.sum += s.sum;
    for (const [k, v] of Object.entries(s.hits ?? {})) out.hits[k] = (out.hits[k] ?? 0) + v;
  }
  out.sum = Math.round(out.sum * 100) / 100;
  return out;
}

export function priorFor(style) {
  return STYLE_PRIORS[style] ?? DEFAULT_PRIOR;
}

/**
 * 店の濃度スコアを計算する。
 * @param {{ style?: string, signal?: {docs:number,sum:number,hits:Record<string,number>} }} shop
 * @returns {{ score: number, level: number, label: string, confidence: number, keywords: string[] }}
 */
export function computeConcentration({ style, signal } = {}) {
  const prior = priorFor(style);
  const n = signal?.docs ?? 0;
  const textScore = n > 0 ? clamp(50 + (signal.sum / n) * 10, 0, 100) : prior;
  const score = (prior * PRIOR_WEIGHT + textScore * n) / (PRIOR_WEIGHT + n);
  const rounded = Math.round(score);
  const lv = levelOf(rounded);
  const keywords = Object.entries(signal?.hits ?? {})
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([k]) => k);
  return {
    score: rounded,
    level: lv.level,
    label: lv.label,
    // テキストが 20 件あれば信頼度ほぼ最大
    confidence: Math.round((n / (n + 5)) * 100) / 100,
    keywords,
  };
}

/**
 * ユーザー投票 (1〜5) を加味した表示用スコア。
 * 投票 1 件はテキスト 2 件ぶんの重みとして扱う。
 */
export function blendWithVotes(baseScore, baseDocs, votes) {
  if (!votes?.length) return baseScore;
  const voteScore = votes.reduce((a, v) => a + (clamp(v, 1, 5) - 1) * 25, 0) / votes.length;
  const w = votes.length * 2;
  const base = PRIOR_WEIGHT + baseDocs;
  return Math.round((baseScore * base + voteScore * w) / (base + w));
}

export function levelOf(score) {
  let found = LEVELS[0];
  for (const lv of LEVELS) if (score >= lv.min) found = lv;
  return found;
}
