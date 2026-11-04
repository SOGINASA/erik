// Only supported public contact schemes become links; arbitrary text stays text.
export function contactHref(kind, value) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  if (/^https?:\/\//i.test(raw)) {
    try { const url = new URL(raw); return url.hostname ? url.href : null; } catch (_) { return null; }
  }
  if (/^(t\.me|(?:www\.)?instagram\.com|wa\.me)\//i.test(raw)) return 'https://' + raw;
  if (kind === 'telegram' || (kind === 'coordinator' && raw.startsWith('@'))) {
    const name = raw.replace(/^@/, '');
    return /^[a-z0-9_]+$/i.test(name) ? 'https://t.me/' + encodeURIComponent(name) : null;
  }
  if (kind === 'instagram') {
    const name = raw.replace(/^@/, '');
    return /^[a-z0-9_.]+$/i.test(name) ? 'https://www.instagram.com/' + encodeURIComponent(name) : null;
  }
  if (['phone', 'whatsapp', 'coordinator'].includes(kind) && /^\+?[\d\s()-]+$/.test(raw)) {
    const digits = raw.replace(/\D/g, '');
    if (digits.length < 6 || digits.length > 15) return null;
    return kind === 'whatsapp' ? 'https://wa.me/' + digits : 'tel:' + (raw.startsWith('+') ? '+' : '') + digits;
  }
  return null;
}
