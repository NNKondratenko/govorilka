// 30 phrases of three words, grouped by the sound a speech therapist works on.
// Stress is marked with "+" before the vowel: "М+ама". «ё» is always stressed and needs no mark.

export const GROUPS = [
  { id: 'warm', title: 'Разминка', hint: 'Простые слова', color: '#ffb547' },
  { id: 's', title: 'Звук С', hint: 'Свистящий', color: '#59c3c3' },
  { id: 'sh', title: 'Звук Ш', hint: 'Шипящий', color: '#7f8cff' },
  { id: 'l', title: 'Звук Л', hint: 'Язычок вверх', color: '#ff7aa8' },
  { id: 'r', title: 'Звук Р', hint: 'Рычим', color: '#6ccf6c' },
];

const RAW = [
  ['warm', 'М+ама м+ыла р+аму', '🪟'],
  ['warm', 'П+апа пьёт чай', '☕'],
  ['warm', 'Кот л+овит м+ышку', '🐱'],
  ['warm', 'Вот наш дом', '🏠'],
  ['warm', 'Мы ед+им к+ашу', '🥣'],
  ['warm', '+Утка плывёт б+ыстро', '🦆'],
  ['s', 'Сов+а сид+ит высок+о', '🦉'],
  ['s', 'С+оня пьёт сок', '🧃'],
  ['s', 'Соб+ака несёт с+умку', '🐕'],
  ['s', 'Сыр на стол+е', '🧀'],
  ['s', 'С+олнце св+етит +ярко', '☀️'],
  ['s', 'Самолёт лет+ит высок+о', '✈️'],
  ['sh', 'М+ышка шурш+ит т+ихо', '🐭'],
  ['sh', 'Ш+апка у М+аши', '🧢'],
  ['sh', 'Маш+ина шум+ит гр+омко', '🚗'],
  ['sh', 'К+ошка пьёт молок+о', '🐈'],
  ['sh', 'Ш+арик л+опнул гр+омко', '🎈'],
  ['sh', 'М+иша +ищет м+ишку', '🧸'],
  ['l', 'Лис+а беж+ит л+есом', '🦊'],
  ['l', 'Л+ампа св+етит +ярко', '💡'],
  ['l', 'Л+ена ест мал+ину', '🍓'],
  ['l', 'Л+одка плывёт м+едленно', '⛵'],
  ['l', 'Лун+а св+етит н+очью', '🌙'],
  ['l', 'Б+елка л+юбит ор+ехи', '🐿️'],
  ['r', 'Р+ыба пл+авает б+ыстро', '🐟'],
  ['r', 'Р+ома рис+ует рак+ету', '🚀'],
  ['r', 'Вор+она гр+омко к+аркает', '🐦'],
  ['r', 'Тигр рыч+ит гр+омко', '🐯'],
  ['r', 'Рак ползёт наз+ад', '🦞'],
  ['r', 'Бараб+ан грем+ит р+адостно', '🥁'],
];

export const PHRASES = RAW.map(([group, text, emoji], i) => ({ id: `p${String(i + 1).padStart(2, '0')}`, group, text, emoji }));

export const PRAISE = ['Молод+ец!', 'Отл+ично!', 'Здор+ово!', 'Ум+ница!', 'Сл+авно получ+илось!', 'Т+очно!'];
export const RETRY = ['П+очти! Д+авай ещё раз.', 'Хорош+о! Попр+обуем ещё раз.', 'Ещё раз, вм+есте!'];

const COMBINING_ACUTE = '́';

/** Text without stress marks: what the recognizer is expected to hear. */
export const plain = (text) => text.replace(/\+/g, '');

/** Stress as a combining acute accent after the vowel: understood by TTS engines and shown to parents. */
export const accented = (text) => text.replace(/\+([аеёиоуыэюяАЕЁИОУЫЭЮЯ])/g, `$1${COMBINING_ACUTE}`);

/** Words of a phrase with the stressed letter index, for highlighting. */
export function words(text) {
  return text.split(/\s+/).map((w) => {
    const i = w.indexOf('+');
    const clean = w.replace(/\+/g, '');
    const yo = clean.search(/[ёЁ]/);
    return { text: clean, stress: i >= 0 ? i : yo };
  });
}
