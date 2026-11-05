import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useLang } from '../i18n';
import { api } from '../lib/api';
import { contactHref } from '../lib/contacts';
import { useSessionStore } from '../store/useSessionStore';
import Icon from './Icon';
import Button from './ui/Button';
import { Textarea } from './ui/controls';
import './Community.css';

const externalProps = (href) => href?.startsWith('http') ? { target: '_blank', rel: 'noopener noreferrer' } : {};

export function OrgContacts({ org = {} }) {
  const ru = useLang() === 'ru';
  const contacts = org.contacts || {};
  const labels = { general: ru ? 'Контакт организации' : 'Ұйым байланысы', telegram: 'Telegram', instagram: 'Instagram', whatsapp: 'WhatsApp', phone: ru ? 'Телефон' : 'Телефон' };
  const entries = Object.entries(contacts).filter(([key, value]) => labels[key] && value).flatMap(([key, value]) =>
    (key === 'phone' ? value.split(/[,;\n]/).map((v) => v.trim()).filter(Boolean) : [value]).map((v) => [key, v]));
  return <section className="community-section">
    <div className="community-heading"><h3>{ru ? 'Контакты организации' : 'Ұйымның байланыстары'}</h3><Icon name="message" size={20} /></div>
    {entries.length ? <div className="community-contact-grid">{entries.map(([key, value], i) => {
      const href = contactHref(key, value);
      const content = <><div><small>{labels[key]}</small><span>{value}</span></div>{href && <Icon name="external" size={16} />}</>;
      return href ? <a className="community-contact" key={key + i} href={href} {...externalProps(href)}>{content}</a> : <div className="community-contact" key={key + i}>{content}</div>;
    })}</div> : <p className="community-muted">{ru ? 'Организация пока не добавила публичные контакты.' : 'Ұйым ашық байланыстарын әлі қоспады.'}</p>}
    {(org.officeAddress || contactHref('map', org.mapUrl)) && <div className="community-address"><Icon name="pin" size={20} /><div>{org.officeAddress && <p>{org.officeAddress}</p>}{contactHref('map', org.mapUrl) && <a className="community-link" href={contactHref('map', org.mapUrl)} {...externalProps(org.mapUrl)}>{ru ? 'Открыть на карте / 2ГИС' : 'Картадан / 2GIS ашу'}</a>}</div></div>}
    {!!org.coordinators?.length && <div style={{ marginTop: 26 }}><h3>{ru ? 'Наши координаторы' : 'Біздің үйлестірушілер'}</h3><div className="community-team">{org.coordinators.map((person, i) => {
      const href = contactHref('coordinator', person.contact);
      return <div className="community-person" key={i}><span className="community-initial" aria-hidden="true">{person.name.slice(0, 1)}</span><div><strong>{person.name}</strong>{href ? <a className="community-link" href={href} {...externalProps(href)}>{person.contact}</a> : <p>{person.contact}</p>}</div></div>;
    })}</div></div>}
  </section>;
}

export default function OrgPublicDetails({ org, mine, eventPhotos = [] }) {
  const ru = useLang() === 'ru';
  const loggedIn = useSessionStore((s) => s.loggedIn);
  const token = useSessionStore((s) => s.token);
  const id = org.sid;
  const [data, setData] = useState(null);
  const [text, setText] = useState('');
  const [rating, setRating] = useState(5);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [busy, setBusy] = useState(false);
  const [retry, setRetry] = useState(0);
  const [loading, setLoading] = useState(false);
  const applyData = useCallback((result) => {
    setData(result);
    setText(result.ownReview?.text || '');
    setRating(result.ownReview?.rating || 5);
  }, []);
  useEffect(() => {
    let alive = true;
    setData(null); setError(''); setSuccess(''); setText(''); setRating(5);
    if (!id) return undefined;
    setLoading(true);
    api.getOrgReviews(id).then((result) => { if (alive) applyData(result); })
      .catch((err) => { if (alive) setError(err.message); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [id, token, retry, applyData]);
  const submit = async (e) => {
    e.preventDefault();
    if (busy || !text.trim()) return;
    setBusy(true); setError(''); setSuccess('');
    try {
      await api.postOrgReview(id, { text: text.trim(), rating });
      setSuccess(ru ? 'Ваш отзыв сохранён.' : 'Пікіріңіз сақталды.');
      applyData(await api.getOrgReviews(id));
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  };
  const photos = [...new Set([...(org.photos || []), ...eventPhotos.filter(Boolean)])].slice(0, 12);
  return <>
    <OrgContacts org={org} />
    <section className="community-section"><div className="community-heading"><h3>{ru ? 'Организация в деле' : 'Ұйымның қызметі'}</h3><span className="community-muted">{ru ? 'Команда и события' : 'Команда және іс-шаралар'}</span></div>
      {photos.length ? <div className="community-gallery">{photos.map((url, i) => <a key={url} href={url} target="_blank" rel="noopener noreferrer" aria-label={ru ? `Открыть фото ${i + 1}` : `${i + 1}-фотоны ашу`}><img src={url} alt={ru ? `${org.name}: фото ${i + 1}` : `${org.name}: ${i + 1}-фото`} loading="lazy" /></a>)}</div>
        : <div className="community-empty"><p>{ru ? 'Здесь появятся фотографии команды и проведённых событий.' : 'Мұнда команда мен өткен іс-шаралардың фотолары пайда болады.'}</p>{mine && <Link className="community-link" to="/manage/org">{ru ? 'Добавить фотографии' : 'Фотолар қосу'}</Link>}</div>}
    </section>
    <section className="community-section" aria-busy={loading}>
      <div className="community-heading"><h3>{ru ? 'Отзывы' : 'Пікірлер'}</h3>{data?.count > 0 && <span className="community-rating"><span aria-hidden="true">★</span>{data.averageRating}/5 · {data.count}</span>}</div>
      {loading && <p role="status">{ru ? 'Загружаем отзывы…' : 'Пікірлер жүктелуде…'}</p>}
      {data && !data.reviews.length && <div className="community-empty"><p>{ru ? 'Пока нет отзывов. Расскажите о своём опыте сотрудничества.' : 'Әзірге пікір жоқ. Ынтымақтастық тәжірибеңізбен бөлісіңіз.'}</p></div>}
      {data?.reviews.map((review) => <article className="community-review" key={review.id}><header><strong>{review.name}</strong><span className="community-rating">{review.rating}/5</span></header><p>{review.text}</p></article>)}
      {loggedIn && !mine && id && <form className="community-review-form" onSubmit={submit}>
        <h3>{data?.ownReview ? (ru ? 'Ваш отзыв' : 'Сіздің пікіріңіз') : (ru ? 'Поделитесь впечатлениями' : 'Әсеріңізбен бөлісіңіз')}</h3>
        <label>{ru ? 'Оценка' : 'Баға'}<select disabled={busy || loading} value={rating} onChange={(e) => setRating(Number(e.target.value))}>{[5, 4, 3, 2, 1].map((n) => <option key={n} value={n}>{n}/5</option>)}</select></label>
        <Textarea label={ru ? 'Ваш опыт сотрудничества' : 'Ынтымақтастық тәжірибеңіз'} required maxLength={2000} disabled={busy || loading} value={text} onChange={(e) => setText(e.target.value)} rows={4} placeholder={ru ? 'Что понравилось? Что можно улучшить?' : 'Не ұнады? Нені жақсартуға болады?'} />
        <Button type="submit" loading={busy} disabled={loading || !text.trim()}>{data?.ownReview ? (ru ? 'Обновить отзыв' : 'Пікірді жаңарту') : (ru ? 'Опубликовать отзыв' : 'Пікір жариялау')}</Button>
      </form>}
      {!loggedIn && id && <p><Link className="community-link" to="/login">{ru ? 'Войдите, чтобы оставить отзыв' : 'Пікір қалдыру үшін кіріңіз'}</Link></p>}
      {!id && <p className="community-muted">{ru ? 'Отзывы появятся, когда страница организации будет доступна на сервере.' : 'Ұйымның беті серверде қолжетімді болғанда пікірлер пайда болады.'}</p>}
      {success && <p role="status" className="community-success">{success}</p>}
      {error && <div role="alert" className="community-error">{error}{!data && <Button variant="ghost" onClick={() => setRetry((v) => v + 1)}>{ru ? 'Повторить' : 'Қайталау'}</Button>}</div>}
    </section>
  </>;
}
