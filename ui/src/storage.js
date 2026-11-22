// Small per-browser preferences (language, chosen demo user). Storage can be
// blocked, for example in a private window, so every access is guarded.
export function readSetting(key, fallback) {
  try {
    return localStorage.getItem(`jiwar.${key}`) ?? fallback;
  } catch {
    return fallback;
  }
}

export function saveSetting(key, value) {
  try {
    if (value === null) localStorage.removeItem(`jiwar.${key}`);
    else localStorage.setItem(`jiwar.${key}`, value);
  } catch {
    // Not saved; the app still works for this visit.
  }
}
