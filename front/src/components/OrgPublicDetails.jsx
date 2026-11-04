import { useEffect, useState } from 'react';
import { useLang } from '../i18n';
import { api } from '../lib/api';
import { useSessionStore } from '../store/useSessionStore';

export function OrgContacts({ org }) {
  const ru = useLang() === 'ru';
  const contacts = org.contacts || {};
  const href = (key, raw) => {
    if (/^https?:\/\//i.test(raw)) return raw;
    if (key === 'telegram') return 'https://t.me/' + encodeURIComponent(raw.replace(/^@/, ''));
    if (key === 'instagram') return 'https://www.instagram.com/' + encodeURIComponent(raw.replace(/^@/, ''));
    if (key === 'whatsapp') return 'https://wa.me/' + raw.replace(/\D/g, '');
    return null;
  };
  return <section style={{ margin: '24px 0', display: 'grid', gap: 10 }}>
    <h3>{ru ? 'Контакты организации' : 'Ұйымның байланыстары'}</h3>
    {Object.entries(contacts).filter(([, v]) => v).map(([key, value]) => <div key={key}><strong>{{ telegram: 'Telegram', instagram: 'Instagram', whatsapp: 'WhatsApp', phone: ru ? 'Телефоны' : 'Телефондар' }[key]}: </strong>{href(key, value) ? <a href={href(key, value)} target="_blank" rel="noopener noreferrer">{value}</a> : value}</div>)}
    {!Object.values(contacts).some(Boolean) && <p>{ru ? 'Организация пока не добавила контакты.' : 'Ұйым байланыстарын әлі қоспады.'}</p>}
    {org.officeAddress && <div>{ru ? 'Адрес офиса: ' : 'Кеңсе мекенжайы: '}{org.officeAddress}</div>}
    {/^https?:\/\//i.test(org.mapUrl || '') && <a href={org.mapUrl} target="_blank" rel="noopener noreferrer">{ru ? 'Открыть адрес на карте / 2ГИС' : 'Мекенжайды картада / 2GIS ашу'}</a>}
    {(org.coordinators || []).length > 0 && <><h3>{ru ? 'Наши координаторы' : 'Біздің үйлестірушілер'}</h3>{org.coordinators.map((c, i) => <div key={i}><strong>{c.name}</strong> · {/^https?:\/\//i.test(c.contact) ? <a href={c.contact} target="_blank" rel="noopener noreferrer">{c.contact}</a> : c.contact}</div>)}</>}
  </section>;
}

export default function OrgPublicDetails({ org, mine }) {
  const ru = useLang() === 'ru';
  const loggedIn = useSessionStore((s) => s.loggedIn);
  const id = org.sid;
  const [reviews, setReviews] = useState([]);
  const [text, setText] = useState('');
  const [rating, setRating] = useState(5);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let alive = true;
    setReviews([]); setError('');
    if (id) api.getOrgReviews(id).then((r) => { if (alive) setReviews(r.reviews); }).catch((e) => { if (alive) setError(e.message); });
    return () => { alive = false; };
  }, [id]);
  const submit = async (e) => {
    e.preventDefault(); setBusy(true); setError('');
    try { await api.postOrgReview(id, { text, rating }); const r = await api.getOrgReviews(id); setReviews(r.reviews); setText(''); }
    catch (err) { setError(err.message); } finally { setBusy(false); }
  };
  return <><OrgContacts org={org} />
    {(org.photos || []).length > 0 && <section><h3>{ru ? 'Фотографии организации и событий' : 'Ұйым мен іс-шаралар фотолары'}</h3><div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>{org.photos.map((url, i) => <a key={i} href={url} target="_blank" rel="noopener noreferrer"><img src={url} alt={ru ? 'Деятельность организации' : 'Ұйым қызметі'} loading="lazy" style={{ width: '100%', height: 170, objectFit: 'cover', borderRadius: 12 }} /></a>)}</div></section>}
    <section style={{ marginTop: 24 }}><h3>{ru ? 'Отзывы' : 'Пікірлер'}</h3>
      {reviews.length === 0 && <p>{ru ? 'Пока нет отзывов.' : 'Әзірге пікір жоқ.'}</p>}
      {reviews.map((r) => <article key={r.id} style={{ padding: '12px 0', borderBottom: '1px solid var(--line)' }}><strong>{r.name}</strong> · {r.rating}/5<p style={{ whiteSpace: 'pre-wrap' }}>{r.text}</p></article>)}
      {loggedIn && !mine && id && <form onSubmit={submit} style={{ display: 'grid', gap: 10, marginTop: 16 }}><label>{ru ? 'Оценка' : 'Баға'} <select value={rating} onChange={(e) => setRating(Number(e.target.value))}>{[5, 4, 3, 2, 1].map((n) => <option key={n} value={n}>{n}/5</option>)}</select></label><textarea aria-label={ru ? 'Ваш отзыв' : 'Пікіріңіз'} required maxLength={2000} value={text} onChange={(e) => setText(e.target.value)} rows={3} /><button type="submit" disabled={busy}>{ru ? 'Опубликовать отзыв' : 'Пікір жариялау'}</button></form>}
      {error && <p role="alert">{error}</p>}
    </section></>;
}
