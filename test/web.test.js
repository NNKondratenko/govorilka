import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Trainer } from '../web/cycle.js';
import { allowedSlips, evaluate, levenshtein, normalize } from '../web/match.js';
import { accented, GROUPS, PHRASES, plain, words } from '../web/phrases.js';
import { DEFAULT_SETTINGS, load, save, starsFor } from '../web/store.js';

test('30 phrases of exactly three words, every group has six, stress marks are sane', () => {
  assert.equal(PHRASES.length, 30);
  for (const g of GROUPS) assert.equal(PHRASES.filter((p) => p.group === g.id).length, 6, g.id);
  for (const p of PHRASES) {
    assert.equal(plain(p.text).split(' ').length, 3, p.text);
    assert.doesNotMatch(p.text, /\+[^аеёиоуыэюяАЕЁИОУЫЭЮЯ]/, `stress mark before a consonant: ${p.text}`);
    for (const w of p.text.split(' ')) {
      const vowels = (w.match(/[аеёиоуыэюя]/gi) ?? []).length;
      const marks = (w.match(/\+/g) ?? []).length + (w.match(/ё/gi) ?? []).length;
      assert.ok(marks <= 1, `two stresses in «${w}»`);
      if (vowels > 1) assert.equal(marks, 1, `no stress in «${w}» (${p.text})`);
    }
  }
  assert.equal(new Set(PHRASES.map((p) => p.id)).size, 30);
});

test('stress helpers', () => {
  assert.equal(plain('М+ама м+ыла р+аму'), 'Мама мыла раму');
  assert.equal(accented('М+ама'), 'Ма́ма');
  assert.deepEqual(words('Кот л+овит м+ышку'), [
    { text: 'Кот', stress: -1 },
    { text: 'ловит', stress: 1 },
    { text: 'мышку', stress: 1 },
  ]);
  assert.equal(words('пьёт')[0].stress, 2);
});

test('normalization and distance', () => {
  assert.deepEqual(normalize('Ёжик, ёлка — Мама!'), ['ежик', 'елка', 'мама']);
  assert.equal(levenshtein('мышку', 'мышка'), 1);
  assert.equal(levenshtein('рыба', 'лыба'), 1);
  assert.equal(allowedSlips('кот', 'soft'), 0);
  assert.equal(allowedSlips('машина', 'normal'), 1);
  assert.equal(allowedSlips('мама', 'normal'), 0);
  assert.equal(allowedSlips('медленно', 'soft'), 2);
});

test('evaluate: exact, any alternative, order-free, slips by strictness', () => {
  assert.equal(evaluate('Мама мыла раму', ['мама мыла раму']).ok, true);
  assert.equal(evaluate('Мама мыла раму', ['мама мила лаву', 'Мама мыла раму.']).ok, true, 'second alternative counts');
  assert.equal(evaluate('Кот ловит мышку', ['мышку ловит кот']).ok, true);
  // a child says «лыба» for «рыба»: soft mode forgives, strict does not
  assert.equal(evaluate('Рыба плавает быстро', ['лыба плавает быстро'], 'soft').ok, true);
  assert.equal(evaluate('Рыба плавает быстро', ['лыба плавает быстро'], 'strict').ok, false);
  assert.equal(evaluate('Машина шумит громко', ['масына шумит громко'], 'normal').ok, false);
  assert.equal(evaluate('Машина шумит громко', ['машына шумит громко'], 'normal').ok, true);
});

test('evaluate: near misses and per-word hits', () => {
  const r = evaluate('Сова сидит высоко', ['сова сидит']);
  assert.equal(r.ok, false);
  assert.equal(r.near, true);
  assert.deepEqual(r.words.map((w) => w.hit), [true, true, false]);
  const nothing = evaluate('Сова сидит высоко', []);
  assert.equal(nothing.ok, false);
  assert.equal(nothing.near, false);
  assert.equal(evaluate('Вот наш дом', ['вот наш вот']).ok, false, 'a word is used once');
});

function harness(heardSeq, settings = {}) {
  const log = [];
  const said = [];
  const heard = [...heardSeq];
  const t = new Trainer({
    say: async (text) => void said.push(text),
    listen: async () => heard.shift() ?? [],
    celebrate: async () => void log.push('celebrate'),
    sleep: async () => {},
    settings: () => ({ ...DEFAULT_SETTINGS, ...settings }),
    onState: (s, d) => log.push(d.attempt ? `${s}:${d.attempt}` : s),
    pick: (l) => l[0],
  });
  return { t, log, said };
}

test('cycle: say → listen → success with praise and celebration', async () => {
  const { t, log, said } = harness([['мама мыла раму']]);
  assert.equal(await t.train(PHRASES[0]), 'success');
  assert.deepEqual(log, ['speaking:1', 'listening:1', 'success:1', 'celebrate']);
  assert.deepEqual(said, ['М+ама м+ыла р+аму', 'Молод+ец!']);
});

test('cycle: retry until right, then success on attempt 2', async () => {
  const { t, log, said } = harness([['мама мыла'], ['мама мыла раму']]);
  assert.equal(await t.train(PHRASES[0]), 'success');
  assert.deepEqual(log, ['speaking:1', 'listening:1', 'retry:1', 'speaking:2', 'listening:2', 'success:2', 'celebrate']);
  assert.equal(said[1], 'П+очти! Д+авай ещё раз.');
});

test('cycle: silence asks to speak louder; gives up gently after the last attempt', async () => {
  const { t, log, said } = harness([[], ['что-то'], ['не то']], { attempts: 3 });
  assert.equal(await t.train(PHRASES[0]), 'skipped');
  assert.equal(log.filter((l) => l.startsWith('retry')).length, 3);
  assert.match(said[1], /не усл\+ышала/);
  assert.match(said.at(-1), /Попр\+обуем сл\+едующую/);
});

test('cycle: stop() interrupts and engine errors become an error state', async () => {
  const states = [];
  const tr = new Trainer({
    say: async () => tr.stop(),
    listen: async () => ['мама мыла раму'],
    celebrate: async () => {},
    sleep: async () => {},
    settings: () => DEFAULT_SETTINGS,
    onState: (s) => states.push(s),
  });
  assert.equal(await tr.train(PHRASES[0]), 'stopped');
  assert.deepEqual(states, ['speaking', 'idle']);

  const errStates = [];
  const broken = new Trainer({
    say: async () => {},
    listen: async () => {
      throw new Error('Распознавание речи недоступно');
    },
    celebrate: async () => {},
    sleep: async () => {},
    settings: () => DEFAULT_SETTINGS,
    onState: (s, d) => errStates.push([s, d.message]),
  });
  assert.equal(await broken.train(PHRASES[0]), 'stopped');
  assert.deepEqual(errStates.at(-1), ['error', 'Распознавание речи недоступно']);
});

test('session: auto-advance through phrases, or pause after each with autoNext off', async () => {
  const ok = PHRASES.slice(0, 3).map((p) => [plain(p.text)]);
  const a = harness(ok);
  const done = [];
  await a.t.session(PHRASES.slice(0, 3), 0, (p, r) => done.push(`${p.id}:${r}`));
  assert.deepEqual(done, ['p01:success', 'p02:success', 'p03:success']);
  assert.equal(a.log.at(-1), 'finished');

  const b = harness(ok, { autoNext: false });
  await b.t.session(PHRASES.slice(0, 3), 0);
  assert.equal(b.log.at(-1), 'paused');
  assert.equal(b.log.filter((l) => l.startsWith('success')).length, 1);
});

test('store: stars and safe loading', () => {
  assert.deepEqual([1, 2, 3, 5].map(starsFor), [3, 2, 1, 1]);
  const mem = new Map();
  const storage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v) };
  const s = load(storage);
  assert.deepEqual(s.settings, DEFAULT_SETTINGS);
  s.progress.p01 = 3;
  s.settings.strictness = 'soft';
  save(storage, s);
  assert.equal(load(storage).progress.p01, 3);
  assert.equal(load(storage).settings.strictness, 'soft');
  mem.set('govorilka.v1', '{broken');
  assert.deepEqual(load(storage).progress, {});
});
