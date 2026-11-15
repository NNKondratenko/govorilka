import { accented, plain } from './phrases.js';

/**
 * One interface, three backends:
 *  - android: native TextToSpeech, SpeechRecognizer and MediaRecorder through a JS bridge.
 *    In Android WebView the Web Speech API does not work, and getUserMedia would ask for the mic again.
 *  - browser: Web Speech API (Chrome on a computer, for development).
 *  - demo: simulated voice and a «child» who answers correctly on the second try (screenshots, no mic).
 *
 * Interface: { kind, say(text, {phraseId}), listen(), stop(), voices(), setVoice(id), setRate(r),
 *              permission(), requestPermission(), openSettings(), onLevel(cb),
 *              canRecord, hasRecording(id), record(id), stopRecord(), playRecording(id), deleteRecording(id) }
 */

// ───────────────────────── Android bridge ─────────────────────────

function androidBackend() {
  const native = window.GovorilkaNative;
  let seq = 0;
  const pending = new Map();
  const levelSubs = new Set();
  window.__govorilka = {
    done(id, ok, json) {
      const p = pending.get(id);
      if (!p) return;
      pending.delete(id);
      const value = json ? JSON.parse(json) : null;
      ok ? p.resolve(value) : p.reject(new Error(value?.message ?? 'native error'));
    },
    event(name, json) {
      if (name === 'level') levelSubs.forEach((cb) => cb(JSON.parse(json).level));
    },
    back: () => false, // replaced by the app
  };
  const call = (method, args = {}) =>
    new Promise((resolve, reject) => {
      const id = ++seq;
      pending.set(id, { resolve, reject });
      native.call(id, method, JSON.stringify(args));
    });
  const recorded = new Set();
  const ready = call('recordings').then((ids) => ids.forEach((i) => recorded.add(i)));

  return {
    kind: 'android',
    canRecord: true,
    ready,
    async say(text, o = {}) {
      if (o.phraseId && recorded.has(o.phraseId)) return call('play', { id: o.phraseId });
      return call('speak', { text: accented(text) });
    },
    listen: () => call('listen'),
    stop: () => call('stop'),
    voices: () => call('voices'),
    setVoice: (id) => call('setVoice', { id }),
    setRate: (rate) => call('setRate', { rate }),
    permission: () => call('permission'),
    requestPermission: () => call('requestPermission'),
    openSettings: () => call('openSettings'),
    onLevel: (cb) => (levelSubs.add(cb), () => levelSubs.delete(cb)),
    hasRecording: (id) => recorded.has(id),
    record: (id) => call('record', { id }),
    async stopRecord() {
      const r = await call('stopRecord');
      if (r?.id) recorded.add(r.id);
      return r;
    },
    playRecording: (id) => call('play', { id }),
    async deleteRecording(id) {
      await call('deleteRecording', { id });
      recorded.delete(id);
    },
  };
}

// ───────────────────────── Browser (development) ─────────────────────────

function browserBackend() {
  const synth = window.speechSynthesis;
  const Rec = window.SpeechRecognition || window.webkitSpeechRecognition;
  let voiceId = null;
  let rate = 0.85;
  const ruVoices = () => (synth?.getVoices() ?? []).filter((v) => v.lang.toLowerCase().startsWith('ru'));
  // Female Russian voices first: Windows «Irina/Svetlana/Dariya», macOS «Milena», Google.
  const preferred = () => {
    const vs = ruVoices();
    return vs.find((v) => v.voiceURI === voiceId) ?? vs.find((v) => /milena|irina|svetlana|dariya|katya|alena|female/i.test(v.name)) ?? vs[0];
  };
  let current = null;
  return {
    kind: 'browser',
    canRecord: false,
    ready: Promise.resolve(),
    say(text) {
      if (!synth) return Promise.resolve();
      return new Promise((resolve) => {
        synth.cancel();
        const u = new SpeechSynthesisUtterance(plain(text));
        u.lang = 'ru-RU';
        u.rate = rate;
        const v = preferred();
        if (v) u.voice = v;
        u.onend = u.onerror = () => resolve();
        synth.speak(u);
      });
    },
    listen() {
      if (!Rec) return Promise.reject(new Error('Этот браузер не умеет распознавать речь. Откройте в Chrome.'));
      return new Promise((resolve, reject) => {
        const r = new Rec();
        current = r;
        r.lang = 'ru-RU';
        r.maxAlternatives = 5;
        r.interimResults = false;
        let got = [];
        r.onresult = (e) => {
          got = [...e.results[0]].map((a) => a.transcript);
        };
        r.onerror = (e) => (e.error === 'no-speech' || e.error === 'aborted' ? resolve([]) : reject(new Error(`Микрофон: ${e.error}`)));
        r.onend = () => resolve(got);
        r.start();
      });
    },
    stop() {
      synth?.cancel();
      current?.abort();
      return Promise.resolve();
    },
    voices: async () => ruVoices().map((v) => ({ id: v.voiceURI, name: v.name, local: v.localService })),
    setVoice: async (id) => void (voiceId = id),
    setRate: async (r) => void (rate = r),
    permission: async () => 'granted',
    requestPermission: async () => 'granted',
    openSettings: async () => {},
    onLevel: () => () => {},
    hasRecording: () => false,
  };
}

// ───────────────────────── Demo (no mic) ─────────────────────────

function demoBackend() {
  const tries = new Map();
  const levelSubs = new Set();
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  let lastPhrase = '';
  return {
    kind: 'demo',
    canRecord: false,
    ready: Promise.resolve(),
    async say(text, o = {}) {
      if (o.phraseId) lastPhrase = text;
      await wait(o.phraseId ? 900 : 500);
    },
    async listen() {
      for (let i = 0; i < 12; i++) {
        levelSubs.forEach((cb) => cb(Math.abs(Math.sin(i / 2)) * 8));
        await wait(90);
      }
      const n = (tries.get(lastPhrase) ?? 0) + 1;
      tries.set(lastPhrase, n);
      const words = plain(lastPhrase).toLowerCase().split(' ');
      // First try: the «child» swallows the last word.
      return n === 1 ? [words.slice(0, -1).join(' ') + ' ' + words.at(-1).slice(0, 2)] : [words.join(' ')];
    },
    stop: async () => {},
    voices: async () => [{ id: 'demo', name: 'Демо-голос', local: true }],
    setVoice: async () => {},
    setRate: async () => {},
    permission: async () => 'granted',
    requestPermission: async () => 'granted',
    openSettings: async () => {},
    onLevel: (cb) => (levelSubs.add(cb), () => levelSubs.delete(cb)),
    hasRecording: () => false,
  };
}

export function createSpeech() {
  if (window.GovorilkaNative) return androidBackend();
  if (new URLSearchParams(location.search).has('demo')) return demoBackend();
  return browserBackend();
}
