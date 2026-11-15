import { confetti, fanfare, softTone } from './celebrate.js';
import { Trainer } from './cycle.js';
import { GROUPS, PHRASES, words } from './phrases.js';
import { createSpeech } from './speech.js';
import { load, save, starsFor } from './store.js';

const $ = (id) => document.getElementById(id);
// Text glyphs, not emoji: Android draws ⏸ as an orange emoji square on the orange button.
const PAUSE_ICON = '❚❚';
const PLAY_ICON = '▶︎';
const speech = createSpeech();
const state = load(localStorage);
const persist = () => save(localStorage, state);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let queue = [];
let index = 0;
let running = false;

// ───────────────────────── screens ─────────────────────────

function show(id) {
  for (const s of document.querySelectorAll('.screen')) s.classList.toggle('hidden', s.id !== id);
}

function renderHome() {
  $('groups').innerHTML = GROUPS.map((g) => {
    const list = PHRASES.filter((p) => p.group === g.id);
    const stars = list.reduce((s, p) => s + (state.progress[p.id] ?? 0), 0);
    const done = list.filter((p) => state.progress[p.id]).length;
    return `<button class="group" data-group="${g.id}" style="--c:${g.color}">
      <span class="em">${list[0].emoji}</span>
      <span class="t">${g.title}</span><span class="h">${g.hint}</span>
      <span class="stars">⭐ ${stars} · ${done} из ${list.length}</span>
      <span class="bar"><i style="width:${(done / list.length) * 100}%"></i></span>
    </button>`;
  }).join('');
  $('groups').querySelectorAll('.group').forEach((b) => (b.onclick = () => start(PHRASES.filter((p) => p.group === b.dataset.group))));
  const total = Object.values(state.progress).reduce((a, b) => a + b, 0);
  $('foot').textContent = total ? `Всего звёзд: ${total} из ${PHRASES.length * 3}` : 'Нажмите «Играть» — Говорилка скажет фразу, а ребёнок повторит.';
  show('home');
}

function renderPhrase(p, result) {
  $('emoji').textContent = p.emoji;
  $('phrase').innerHTML = words(p.text)
    .map((w, i) => {
      const cls = result ? (result.words[i]?.hit ? 'hit' : 'miss') : '';
      const letters = [...w.text].map((ch, j) => (state.settings.showStress && j === w.stress && w.text.length > 1 ? `<span class="s">${ch}</span>` : ch)).join('');
      return `<span class="word ${cls}">${letters}</span>`;
    })
    .join('');
  $('groupTitle').textContent = GROUPS.find((g) => g.id === p.group)?.title ?? '';
  $('dots').innerHTML =
    queue.length > 12
      ? `<span class="count">${index + 1} / ${queue.length}</span>`
      : queue.map((q, i) => `<i class="${i === index ? 'on' : state.progress[q.id] ? 'done' : ''}"></i>`).join('');
}

const say = (text) => ($('bubbleText').textContent = text.replace(/\+/g, ''));
function setMic(on) {
  $('mic').classList.toggle('on', on);
  if (!on) $('ring').style.setProperty('--lv', 1);
}
speech.onLevel((lv) => $('ring').style.setProperty('--lv', String(1 + Math.min(Math.max(lv, 0), 10) / 14)));

// ───────────────────────── the loop ─────────────────────────

const trainer = new Trainer({
  say: (text, o) => speech.say(text, o),
  listen: () => speech.listen(),
  celebrate: async () => {
    fanfare();
    $('card').classList.remove('win');
    void $('card').offsetWidth;
    $('card').classList.add('win');
    await confetti($('confetti'));
  },
  sleep,
  settings: () => state.settings,
  onState(s, d) {
    switch (s) {
      case 'speaking':
        setMic(false);
        renderPhrase(d.phrase);
        say(d.attempt === 1 ? 'Слушай!' : 'Слушай ещё раз!');
        break;
      case 'listening':
        setMic(true);
        say('Теперь ты! 🎤');
        break;
      case 'success':
        setMic(false);
        renderPhrase(d.phrase, d.result);
        say(d.praise);
        state.progress[d.phrase.id] = Math.max(state.progress[d.phrase.id] ?? 0, starsFor(d.attempt));
        persist();
        break;
      case 'retry':
        setMic(false);
        renderPhrase(d.phrase, d.result);
        say(d.message);
        softTone();
        break;
      case 'paused':
        running = false;
        $('toggle').textContent = PLAY_ICON;
        say(d.next == null ? 'Всё! Ты молодец! 🎉' : 'Дальше? Нажми «следующая»');
        break;
      case 'finished':
        running = false;
        $('toggle').textContent = PLAY_ICON;
        say('Все фразы пройдены! 🎉');
        break;
      case 'error':
        running = false;
        setMic(false);
        $('toggle').textContent = PLAY_ICON;
        say(d.message);
        break;
    }
  },
});

async function start(list, from = 0) {
  if ((await speech.permission()) !== 'granted') return askPermission(() => start(list, from));
  queue = list;
  index = from;
  show('play');
  renderPhrase(queue[index]);
  resume();
}

function resume() {
  running = true;
  $('toggle').textContent = PAUSE_ICON;
  trainer.session(queue, index, (p, res, i) => {
    index = res === 'success' || res === 'skipped' ? Math.min(i + 1, queue.length - 1) : i;
  });
}

function pause() {
  running = false;
  trainer.stop();
  speech.stop();
  setMic(false);
  $('toggle').textContent = PLAY_ICON;
  say('Пауза');
}

$('toggle').onclick = () => (running ? pause() : resume());
$('next').onclick = () => {
  pause();
  index = (index + 1) % queue.length;
  renderPhrase(queue[index]);
  resume();
};
$('again').onclick = async () => {
  const wasRunning = running;
  pause();
  say('Слушай!');
  await speech.say(queue[index].text, { phraseId: queue[index].id });
  if (wasRunning) resume();
  else say('Нажми ▶︎, когда будешь готов');
};
$('back').onclick = () => {
  pause();
  renderHome();
};
$('playAll').onclick = () => {
  const firstNew = PHRASES.findIndex((p) => !state.progress[p.id]);
  start(PHRASES, firstNew < 0 ? 0 : firstNew);
};

// ───────────────────────── permission (asked once) ─────────────────────────

let afterGrant = null;
async function askPermission(then) {
  afterGrant = then;
  $('permission').classList.remove('hidden');
}
$('grant').onclick = async () => {
  const r = await speech.requestPermission();
  if (r === 'granted') {
    $('permission').classList.add('hidden');
    afterGrant?.();
  } else if (r === 'blocked') {
    await speech.openSettings();
  }
};

// ───────────────────────── parents' settings ─────────────────────────

// A long press keeps little fingers out.
let holdTimer;
$('gear').addEventListener('pointerdown', () => (holdTimer = setTimeout(openSettings, 1200)));
for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) $('gear').addEventListener(ev, () => clearTimeout(holdTimer));
$('gear').addEventListener('click', () => {
  $('foot').textContent = 'Настройки для взрослых: нажмите и подержите ⚙️';
});

async function openSettings() {
  const s = state.settings;
  $('rate').value = s.rate;
  $('rateVal').textContent = `×${s.rate}`;
  $('strictness').value = s.strictness;
  $('attempts').value = String(s.attempts);
  $('autoNext').checked = s.autoNext;
  $('showStress').checked = s.showStress;
  const voices = await speech.voices().catch(() => []);
  $('voice').innerHTML = voices.length
    ? voices.map((v, i) => `<option value="${v.id}" ${v.id === s.voice ? 'selected' : ''}>${v.name || `Голос ${i + 1}`}${v.local === false ? ' (нужен интернет)' : ''}</option>`).join('')
    : '<option value="">Системный голос</option>';
  const perm = await speech.permission();
  $('micRow').classList.toggle('hidden', perm === 'granted');
  $('micText').textContent = perm === 'blocked' ? 'Микрофон запрещён в настройках телефона' : 'Микрофон ещё не разрешён';
  $('micBtn').textContent = perm === 'blocked' ? 'Открыть настройки' : 'Разрешить';
  $('recPanel').classList.toggle('hidden', !speech.canRecord);
  if (speech.canRecord) renderRecordings();
  $('about').textContent = `Говорилка · ${speech.kind === 'android' ? 'Android' : speech.kind === 'demo' ? 'демо' : 'браузер'} · ${PHRASES.length} фраз`;
  show('settings');
}

function renderRecordings() {
  $('recList').innerHTML = PHRASES.map(
    (p) => `<div class="rec-item" data-id="${p.id}">
      <span class="txt">${p.emoji} ${p.text.replace(/\+/g, '')} ${speech.hasRecording(p.id) ? '<b>●</b>' : ''}</span>
      <button class="small-btn" data-act="rec">⏺</button>
      ${speech.hasRecording(p.id) ? '<button class="small-btn" data-act="play">▶</button><button class="small-btn" data-act="del">🗑</button>' : ''}
    </div>`,
  ).join('');
}
let recording = null;
$('recList').onclick = async (e) => {
  const btn = e.target.closest('button');
  if (!btn) return;
  const id = btn.closest('.rec-item').dataset.id;
  if (btn.dataset.act === 'rec') {
    if (recording === id) {
      await speech.stopRecord();
      recording = null;
      renderRecordings();
    } else {
      if (recording) await speech.stopRecord();
      await speech.record(id);
      recording = id;
      renderRecordings();
      const b = $('recList').querySelector(`[data-id="${id}"] [data-act=rec]`);
      b.textContent = '⏹ Стоп';
      b.classList.add('rec');
    }
  } else if (btn.dataset.act === 'play') await speech.playRecording(id);
  else if (btn.dataset.act === 'del') {
    await speech.deleteRecording(id);
    renderRecordings();
  }
};

const setting = (key, value) => {
  state.settings[key] = value;
  persist();
};
$('rate').oninput = (e) => {
  const r = Number(e.target.value);
  $('rateVal').textContent = `×${r}`;
  setting('rate', r);
  speech.setRate(r);
};
$('strictness').onchange = (e) => setting('strictness', e.target.value);
$('attempts').onchange = (e) => setting('attempts', Number(e.target.value));
$('autoNext').onchange = (e) => setting('autoNext', e.target.checked);
$('showStress').onchange = (e) => setting('showStress', e.target.checked);
$('voice').onchange = (e) => {
  setting('voice', e.target.value);
  speech.setVoice(e.target.value);
};
$('voiceTest').onclick = () => speech.say('Прив+ет! Д+авай игр+ать в Говор+илку!');
$('micBtn').onclick = async () => {
  const perm = await speech.permission();
  if (perm === 'blocked') await speech.openSettings();
  else await speech.requestPermission();
  openSettings();
};
$('reset').onclick = () => {
  if (!confirm('Сбросить все звёзды?')) return;
  state.progress = {};
  persist();
  renderHome();
};
$('settingsBack').onclick = async () => {
  if (recording) {
    await speech.stopRecord();
    recording = null;
  }
  renderHome();
};

// Android back button: go up a level instead of closing the app.
if (window.__govorilka) {
  // The app went to the background: stop the loop so it doesn't talk to an empty room.
  window.__govorilka.pause = () => {
    if (running) pause();
  };
  window.__govorilka.back = () => {
    if (!$('permission').classList.contains('hidden')) {
      $('permission').classList.add('hidden');
      return true;
    }
    if (!$('home').classList.contains('hidden')) return false;
    if (!$('play').classList.contains('hidden')) pause();
    $('settingsBack').onclick();
    return true;
  };
}

// ───────────────────────── start ─────────────────────────

await speech.ready.catch(() => {});
if (state.settings.voice) speech.setVoice(state.settings.voice).catch(() => {});
speech.setRate(state.settings.rate).catch(() => {});
renderHome();
if ((await speech.permission()) !== 'granted') askPermission(() => {});
