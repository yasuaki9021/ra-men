import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyzeText, blendWithVotes, buildSignal, computeConcentration, levelOf } from '../public/js/scoring.js';

test('濃い表現は正、淡い表現は負のスコアになる', () => {
  assert.ok(analyzeText('セメント系でドロドロ、煮干しのえぐみが強烈').score > 0);
  assert.ok(analyzeText('淡麗で上品、煮干しがほんのり香る').score < 0);
});

test('長い語を優先し、部分一致を二重に数えない', () => {
  const r = analyzeText('超濃厚な煮干し');
  assert.deepEqual(r.hits, { 超濃厚: 1 });
});

test('否定表現は反転して弱める', () => {
  const r = analyzeText('見た目ほど濃厚じゃない煮干しスープ');
  assert.ok(r.score < 0);
  assert.equal(r.hits['濃厚'], undefined);
});

test('煮干しにも濃度にも触れないテキストは捨てる', () => {
  const s = buildSignal(['駅から近い', '店員さんが親切', '煮干しが濃厚']);
  assert.equal(s.docs, 1);
  assert.equal(s.hits['濃厚'], 1);
});

test('テキストが無ければスタイルの事前スコアになる', () => {
  assert.equal(computeConcentration({ style: 'セメント' }).score, 92);
  assert.equal(computeConcentration({ style: '淡麗' }).level, 2);
  assert.equal(computeConcentration({}).score, 50);
});

test('テキストが増えるほど事前スコアから離れる', () => {
  const texts = Array(20).fill('淡麗であっさり、煮干しがほんのり');
  const few = computeConcentration({ style: '濃厚', signal: buildSignal(texts.slice(0, 1)) });
  const many = computeConcentration({ style: '濃厚', signal: buildSignal(texts) });
  assert.ok(many.score < few.score);
  assert.ok(many.confidence > few.confidence);
  assert.ok(many.score < 30);
});

test('ユーザー投票でスコアが動く', () => {
  assert.ok(blendWithVotes(50, 0, [5]) > 50);
  assert.ok(blendWithVotes(50, 0, [1]) < 50);
  assert.equal(blendWithVotes(50, 0, []), 50);
});

test('レベル境界', () => {
  assert.equal(levelOf(0).level, 1);
  assert.equal(levelOf(79).level, 4);
  assert.equal(levelOf(80).label, 'セメント級');
});
