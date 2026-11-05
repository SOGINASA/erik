import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../lib/api';
import Button from '../ui/Button';
import { Field, Textarea } from '../ui/controls';
import '../Organizations.css';

const labels = { legalName: 'Полное наименование', bin: 'БИН', legalForm: 'Правовая форма', legalAddress: 'Юридический адрес', cityId: 'Город', aboutRu: 'Деятельность', publicContact: 'Публичный контакт', representativeName: 'ФИО представителя', authority: 'Должность и полномочия', email: 'Email представителя', phone: 'Телефон представителя' };
const statuses = { pending: 'На проверке', approved: 'Одобрена', rejected: 'Отклонена' };

function Application({ row, onChanged }) {
  const [note, setNote] = useState('');
  const [registry, setRegistry] = useState(false);
  const [authority, setAuthority] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const decide = async (decision) => {
    setBusy(true); setError('');
    try { await api.decideOrgApplication(row.id, { decision, note, registryChecked: registry, authorityChecked: authority }); await onChanged(); }
    catch (e) { setError(e?.data?.error || e.message); }
    finally { setBusy(false); }
  };
  return <details className="nko-panel">
    <summary style={{ cursor: 'pointer', fontWeight: 600 }}>{row.data.legalName} · БИН {row.data.bin} · {statuses[row.status]}</summary>
    <p className="nko-help">Заявка №{row.id} · {new Date(row.createdAt).toLocaleDateString('ru-RU')} · заявитель #{row.userId}</p>
    <dl className="nko-review-data">{Object.entries(labels).map(([key, title]) => <div key={key}><dt>{title}</dt><dd>{row.data[key] || '—'}</dd></div>)}</dl>
    {row.status === 'pending' ? <>
      <p className="nko-help">Сверьте БИН, наименование, некоммерческую форму и действующий статус по сведениям о юрлице. Проверьте руководителя или документ о полномочиях представителя. При необходимости запросите уточнения по указанным контактам.</p>
      <p><a href="https://egov.kz/cms/ru/services/facts_on_legal_persons/e_032" target="_blank" rel="noreferrer">Сведения о юридическом лице на eGov ↗</a></p>
      <label className="nko-check"><input type="checkbox" disabled={busy} checked={registry} onChange={(e) => setRegistry(e.target.checked)} /><span>Регистрация, реквизиты и некоммерческий статус проверены</span></label>
      <label className="nko-check"><input type="checkbox" disabled={busy} checked={authority} onChange={(e) => setAuthority(e.target.checked)} /><span>Полномочия представителя подтверждены</span></label>
      <Textarea label="Результат проверки / причина отказа · 10–2000 символов" value={note} maxLength={2000} disabled={busy} onChange={(e) => setNote(e.target.value)} />
      <p className="nko-help">При отказе этот текст увидит заявитель. При одобрении заметка останется в административном журнале.</p>
      {error && <p role="alert" className="nko-error">{error}</p>}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}><Button disabled={!registry || !authority || note.trim().length < 10 || busy} onClick={() => decide('approved')}>Одобрить и создать НКО</Button><Button variant="secondary" disabled={note.trim().length < 10 || busy} onClick={() => decide('rejected')}>Отклонить с причиной</Button></div>
    </> : <><p><strong>Решение:</strong> {row.reviewNote}</p>{row.orgId && <Link to={`/o/o${row.orgId}`}>Открыть организацию →</Link>}</>}
  </details>;
}

export default function AdminOrgs() {
  const [orgs, setOrgs] = useState([]);
  const [applications, setApplications] = useState([]);
  const [state, setState] = useState('loading');
  const [error, setError] = useState('');
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState('pending');
  const [busyId, setBusyId] = useState(null);
  const load = useCallback(async () => {
    try {
      const [o, a] = await Promise.all([api.adminOrgs('all'), api.adminOrgApplications('all')]);
      setOrgs(o.orgs); setApplications(a.applications); setState('ready'); setError('');
    } catch (e) { setError(e.message); setState('error'); }
  }, []);
  useEffect(() => { load(); }, [load]);
  const legacyDecision = async (org, approve) => {
    setBusyId(org.id);
    try { await (approve ? api.approveOrg(org.id) : api.rejectOrg(org.id)); await load(); }
    catch (e) { setError(e.message); }
    finally { setBusyId(null); }
  };
  const matches = (name, bin) => `${name} ${bin || ''}`.toLowerCase().includes(q.trim().toLowerCase());
  return <div className="nko-flow">
    <section><h2>Заявки НКО</h2><p className="nko-help">Публичная организация создаётся только после одобрения. Контакты представителя и юридический адрес доступны только в заявке.</p></section>
    {state === 'loading' && <p role="status">Загружаем заявки…</p>}
    {error && <div role="alert" className="nko-error">{error} <Button onClick={load}>Обновить</Button></div>}
    {state === 'ready' && <>
      <Field label="Поиск по названию или БИН" type="search" value={q} onChange={(e) => setQ(e.target.value)} />
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>{Object.entries(statuses).map(([key, name]) => <Button key={key} variant={filter === key ? 'primary' : 'secondary'} aria-pressed={filter === key} onClick={() => setFilter(key)}>{name} · {applications.filter((a) => a.status === key).length}</Button>)}</div>
      {applications.filter((a) => a.status === filter && matches(a.data.legalName, a.data.bin)).map((row) => <Application key={row.id} row={row} onChanged={load} />)}
      {!applications.some((a) => a.status === filter && matches(a.data.legalName, a.data.bin)) && <p>В этой категории заявок нет.</p>}
      <h2>Организации на платформе</h2>
      {orgs.filter((o) => matches(o.name, o.bin)).map((o) => <article className="nko-panel" key={o.id}>
        <h3><Link to={`/o/o${o.id}`}>{o.name}</Link></h3><p>{o.city} · {o.verified ? 'Проверена' : 'Старая заявка · требует проверки'} · {o.events} событий</p>
        {!o.verified && <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}><Button disabled={busyId !== null} onClick={() => legacyDecision(o, true)}>Одобрить</Button><Button variant="secondary" disabled={busyId !== null} onClick={() => legacyDecision(o, false)}>Отклонить</Button></div>}
      </article>)}
      {!orgs.length && <p>После первого одобрения организация появится здесь.</p>}
    </>}
  </div>;
}
