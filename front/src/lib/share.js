// Реальное копирование в буфер и системный «Поделиться» (Web Share API) с фолбэком.

export async function copyToClipboard(text) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch (_) {
    /* упадём в execCommand-фолбэк */
  }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch (_) {
    return false;
  }
}

// Системный «Поделиться», если поддерживается; иначе — копируем ссылку/текст в буфер.
// Возвращает 'shared' | 'copied' | 'cancelled' | 'failed'.
export async function shareOrCopy({ title, text, url }) {
  if (typeof navigator !== 'undefined' && navigator.share) {
    try {
      await navigator.share({ title, text, url });
      return 'shared';
    } catch (e) {
      if (e && e.name === 'AbortError') return 'cancelled';
    }
  }
  const ok = await copyToClipboard(url || text);
  return ok ? 'copied' : 'failed';
}

// Публичная ссылка сбора из текущего origin (dev — localhost, прод — домен).
export function shareUrlFor(code) {
  const origin = typeof window !== 'undefined' && window.location ? window.location.origin : 'https://erik.kz';
  return `${origin}/g/${code}`;
}
