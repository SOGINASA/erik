import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { api } from '../lib/api';
import { useLang } from '../i18n';
import Button from './ui/Button';

export default function AttendanceQr({ gatheringId, online }) {
  const ru = useLang() === 'ru';
  const [open, setOpen] = useState(false);
  const [qr, setQr] = useState(null);
  const [error, setError] = useState(false);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    setQr(null);
    setError(false);
    if (!open || !online) return undefined;
    let cancelled = false;
    let inFlight = false;
    let nextRefresh = 0;
    const tick = async () => {
      const time = Date.now();
      setNow(time);
      if (inFlight || time < nextRefresh) return;
      inFlight = true;
      try {
        const result = await api.attendanceQr(gatheringId);
        // A duration avoids relying on the organizer's clock matching the server.
        // Include the round-trip in the budget so a slow response cannot extend validity.
        const expires = time + result.expiresIn * 1000;
        const url = `${window.location.origin}/attendance/${gatheringId}#${result.token}`;
        const image = await QRCode.toDataURL(url, { width: 360, margin: 4, errorCorrectionLevel: 'M' });
        if (cancelled) return;
        nextRefresh = expires;
        setQr({ image, expires });
        setError(false);
      } catch (err) {
        if (cancelled) return;
        setQr(null);
        setError(true);
        // Reconnect automatically; permission/closed-event errors require reopening.
        nextRefresh = [403, 404, 409].includes(err.status) ? Infinity : Date.now() + 15000;
      } finally {
        inFlight = false;
      }
    };
    tick();
    const timer = setInterval(tick, 1000);
    document.addEventListener('visibilitychange', tick);
    return () => { cancelled = true; clearInterval(timer); document.removeEventListener('visibilitychange', tick); };
  }, [open, online, gatheringId]);

  const seconds = qr ? Math.max(0, Math.ceil((qr.expires - now) / 1000)) : 0;
  return (
    <section aria-label={ru ? 'QR для отметки явки' : 'Келуді белгілеу QR-коды'} style={{ marginTop: 20, padding: 20, border: '1px solid var(--line)', borderRadius: 'var(--r-m)', background: 'var(--surface)' }}>
      <h2 style={{ margin: '0 0 8px', fontSize: 20, fontFamily: 'var(--fd)' }}>{ru ? 'Отметка по QR-коду' : 'QR-код арқылы белгілеу'}</h2>
      <p style={{ margin: '0 0 16px', color: 'var(--ink-2)', lineHeight: 1.5 }}>{ru ? 'Покажите код участникам на месте. Они сканируют его камерой телефона и подтверждают свой приход.' : 'Кодты қатысушыларға іс-шарада көрсетіңіз. Олар телефон камерасымен сканерлеп, келгенін растайды.'}</p>
      <Button variant="secondary" full aria-expanded={open} onClick={() => setOpen(!open)}>{open ? (ru ? 'Скрыть QR-код' : 'QR-кодты жасыру') : (ru ? 'Показать QR-код' : 'QR-кодты көрсету')}</Button>
      {open && <div style={{ textAlign: 'center', marginTop: 16 }}>
        {!online ? <p role="status">{ru ? 'Для показа QR-кода подключитесь к интернету.' : 'QR-кодты көрсету үшін интернетке қосылыңыз.'}</p>
          : error ? <p role="alert">{ru ? 'Не удалось получить QR-код. Проверьте соединение и убедитесь, что сбор открыт.' : 'QR-код алынбады. Байланысты және жиынның ашық екенін тексеріңіз.'}</p>
            : qr && seconds > 0 ? <>
              <img src={qr.image} width="360" height="360" alt={ru ? 'QR-код для подтверждения прихода' : 'Келуді растауға арналған QR-код'} style={{ display: 'block', width: '100%', maxWidth: 360, height: 'auto', margin: '0 auto' }} />
              <p style={{ margin: '8px 0', fontVariantNumeric: 'tabular-nums', color: 'var(--ink-2)' }}>{ru ? 'Новый код через' : 'Жаңа кодқа дейін'} {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, '0')}</p>
            </> : <p role="status">{ru ? 'Обновляем QR-код…' : 'QR-код жаңартылуда…'}</p>}
        <p style={{ fontSize: 13, color: 'var(--ink-3)', lineHeight: 1.5 }}>{ru ? 'Обновляется автоматически каждые 5 минут. Старый код перестаёт действовать.' : 'Әр 5 минут сайын автоматты жаңарады. Ескі код жарамсыз болады.'}</p>
      </div>}
    </section>
  );
}
