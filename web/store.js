// Progress and settings in localStorage (inside the app's WebView data, survives updates).

const KEY = 'govorilka.v1';

export const DEFAULT_SETTINGS = {
  rate: 0.85,
  strictness: 'normal',
  attempts: 3,
  autoNext: true,
  showStress: false,
  voice: '',
};

/** 3 stars on the first try, 2 on the second, 1 later. */
export const starsFor = (attempt) => (attempt <= 1 ? 3 : attempt === 2 ? 2 : 1);

export function load(storage) {
  try {
    const raw = JSON.parse(storage.getItem(KEY) ?? '{}');
    return {
      progress: raw.progress && typeof raw.progress === 'object' ? raw.progress : {},
      settings: { ...DEFAULT_SETTINGS, ...(raw.settings ?? {}) },
    };
  } catch {
    return { progress: {}, settings: { ...DEFAULT_SETTINGS } };
  }
}

export function save(storage, state) {
  try {
    storage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* storage full or blocked: progress is a nice-to-have */
  }
}
