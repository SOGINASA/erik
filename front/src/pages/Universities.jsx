import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { useLang } from '../i18n';
import { useSessionStore } from '../store/useSessionStore';
import { Container } from '../components/Container';
import { Field, Textarea } from '../components/ui/controls';
import Button from '../components/ui/Button';
import './Universities.css';

export function UniversityEditor({ university, onSaved, onCancel }) {
  const [form, setForm] = useState({ name: '', nameKz: '', city: '', about: '', website: '', managerId: '', microsoftTenantId: '', ...university,
    domains: (university?.emailDomains || []).join(', ') });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const update = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));
  const submit = async (e) => {
    e.preventDefault(); if (busy) return;
    setBusy(true); setError('');
    try {
      const { university: saved } = await api.saveUniversity(university?.id, { ...form,
        managerId: form.managerId ? Number(form.managerId) : null,
        microsoftTenantId: form.microsoftTenantId || '',
        emailDomains: form.domains.split(',').map((v) => v.trim().toLowerCase()).filter(Boolean) });
      onSaved(saved);
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  };
  return <form className="uni-panel uni-form" onSubmit={submit}>
    <h2>{university ? 'Настройки университета' : 'Добавить университет'}</h2>
    <Field label="Название" required maxLength={300} value={form.name} onChange={update('name')} />
    <Field label="Название на казахском" maxLength={300} value={form.nameKz} onChange={update('nameKz')} />
    <Field label="Город" required maxLength={100} value={form.city} onChange={update('city')} />
    <Textarea label="Об университете и волонтёрском сообществе" maxLength={2000} value={form.about} onChange={update('about')} />
    <Field label="Сайт университета" type="url" value={form.website} onChange={update('website')} />
    <Field label="ID назначенного координатора" type="number" min="1" value={form.managerId || ''} onChange={update('managerId')} />
    <p>Укажите ID пользователя с ролью координатора или НКО. Он сможет проверять заявки и создавать мероприятия этого вуза.</p>
    <Field label="Microsoft Entra: Tenant ID университета" value={form.microsoftTenantId || ''} onChange={update('microsoftTenantId')} placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" />
    <Field label="Разрешённые почтовые домены через запятую" value={form.domains} onChange={update('domains')} placeholder="students.university.kz" />
    <p>Указывайте домены студентов. Общий домен сотрудников также даст им доступ. Вход Microsoft появится после настройки приложения на сервере.</p>
    {error && <p role="alert" className="uni-error">{error}</p>}
    <div className="uni-actions"><Button loading={busy} type="submit">Сохранить</Button><Button type="button" variant="ghost" onClick={onCancel}>Отмена</Button></div>
  </form>;
}

export default function Universities() {
  const ru = useLang() === 'ru';
  const token = useSessionStore((s) => s.token);
  const isAdmin = useSessionStore((s) => s.isAdmin());
  const [rows, setRows] = useState([]);
  const [state, setState] = useState('loading');
  const [search, setSearch] = useState('');
  const [city, setCity] = useState('');
  const [mine, setMine] = useState(false);
  const [creating, setCreating] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let alive = true; setState('loading');
    api.universities().then((r) => { if (alive) { setRows(r.universities); setState('ready'); } }, () => { if (alive) setState('error'); });
    return () => { alive = false; };
  }, [token, retry]);
  const filtered = rows.filter((u) => (!city || u.city === city) && (!mine || u.membership || u.canManage) &&
    `${u.name} ${u.nameKz} ${u.city}`.toLowerCase().includes(search.trim().toLowerCase()));
  return <Container style={{ paddingTop: 28, paddingBottom: 56 }}><div className="uni-flow">
    <section className="uni-hero">
      <span className="uni-eyebrow">ERIK CAMPUS · {ru ? 'КАЗАХСТАН' : 'ҚАЗАҚСТАН'}</span>
      <h1>{ru ? 'Добрые дела начинаются в твоём университете' : 'Игі істер өз университетіңнен басталады'}</h1>
      <p>{ru ? 'Найди свой вуз, присоединись к сообществу и участвуй в волонтёрских мероприятиях вместе с другими студентами.' : 'Өз ЖОО-ңды тауып, қауымдастыққа қосыл және басқа студенттермен бірге еріктілер іс-шараларына қатыс.'}</p>
      <div className="uni-steps"><span>01 · {ru ? 'Выбери вуз' : 'ЖОО таңда'}</span><span>02 · {ru ? 'Подтверди обучение' : 'Оқуыңды раста'}</span><span>03 · {ru ? 'Присоединяйся к делам' : 'Іске қосыл'}</span></div>
    </section>
    {isAdmin && <Button onClick={() => setCreating(true)}>{ru ? 'Добавить университет' : 'Университет қосу'}</Button>}
    {creating && <UniversityEditor onCancel={() => setCreating(false)} onSaved={() => { setCreating(false); setRetry((n) => n + 1); }} />}
    <div className="uni-filters">
      <Field label={ru ? 'Поиск университета' : 'Университетті іздеу'} placeholder={ru ? 'Название или город' : 'Атауы немесе қала'} value={search} onChange={(e) => setSearch(e.target.value)} />
      <label>{ru ? 'Город' : 'Қала'}<select value={city} onChange={(e) => setCity(e.target.value)}><option value="">{ru ? 'Все города' : 'Барлық қалалар'}</option>{[...new Set(rows.map((u) => u.city))].sort().map((c) => <option key={c}>{c}</option>)}</select></label>
      {token && <label className="uni-check"><input type="checkbox" checked={mine} onChange={(e) => setMine(e.target.checked)} />{ru ? 'Мои университеты' : 'Менің университеттерім'}</label>}
    </div>
    {state === 'loading' && <p role="status">{ru ? 'Загружаем университеты…' : 'Университеттер жүктелуде…'}</p>}
    {state === 'error' && <div role="alert" className="uni-panel"><p>{ru ? 'Не удалось загрузить университеты.' : 'Университеттер жүктелмеді.'}</p><Button onClick={() => setRetry((n) => n + 1)}>{ru ? 'Повторить' : 'Қайталау'}</Button></div>}
    {state === 'ready' && <><p className="uni-muted">{ru ? `Найдено университетов: ${filtered.length}` : `Табылған университеттер: ${filtered.length}`}</p>
      {!filtered.length && <div className="uni-panel">{ru ? 'Университеты не найдены. Попробуйте изменить поиск или фильтры.' : 'Университеттер табылмады. Іздеуді немесе сүзгілерді өзгертіңіз.'}</div>}
      <div className="uni-grid">{filtered.map((u, index) => <Link className="uni-card" to={`/universities/${u.id}`} key={u.id}>
        <div className={`uni-card-top uni-color-${index % 3}`}><span className="uni-monogram" aria-hidden="true">{u.name.split(/\s+/).slice(0, 2).map((v) => v[0]).join('')}</span><span>{u.city}</span></div>
        <div className="uni-card-body"><h2>{ru ? u.name : u.nameKz}</h2><p>{ru ? 'Волонтёрское сообщество' : 'Еріктілер қауымдастығы'}</p>
          <div className="uni-card-footer"><span>{u.eventsCount} {ru ? 'мероприятий' : 'іс-шара'}</span><span>{u.canManage ? (ru ? 'Управление →' : 'Басқару →') : u.membership?.status === 'approved' ? (ru ? 'Вы участник ✓' : 'Сіз қатысушысыз ✓') : u.membership?.status === 'pending' ? (ru ? 'На проверке' : 'Тексерілуде') : (ru ? 'Открыть →' : 'Ашу →')}</span></div>
        </div>
      </Link>)}</div>
    </>}
  </div></Container>;
}
