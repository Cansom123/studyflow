export function normalizeLinkUrl(raw) {
  const trimmed = (raw || '').trim();
  if (!trimmed) return '';
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

export function faviconFor(url) {
  try {
    const host = new URL(url).hostname;
    return `https://www.google.com/s2/favicons?sz=32&domain=${host}`;
  } catch (_) {
    return '';
  }
}

export function linkIconHTML(url) {
  const fav = faviconFor(url);
  return fav ? `<img src="${fav}" alt="" width="16" height="16">` : '↗';
}
