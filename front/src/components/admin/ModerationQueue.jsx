import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { usePlatformStore } from '../../store/usePlatformStore';
import { api } from '../../lib/api';
import { StatCard, SectionCard, StatusPill } from './kit';
import Button from '../ui/Button';
import ReviewDialog from '../ReviewDialog';

export default function ModerationQueue() {
  const [events, setEvents] = useState([]);
  const [roles, setRoles] = useState([]);
  const [reports, setReports] = useState([]);
  const [stats, setStats] = useState(null);
  const [state, setState] = useState('loading');
  const [error, setError] = useState('');
  const [selected, setSelected] = useState(null);
  const load = async () => {
    try {
      const [e, r, p, s] = await Promise.all([api.adminEvents('?status=pending'), api.adminRoleRequests('pending'), api.adminReports(), api.adminStats()]);
      setEvents(e.events); setRoles(r.requests); setReports(p.reports); setStats(s); setState('ready'); setError('');
    } catch (e) { setState('error'); setError(e.message); }
  };
  useEffect(() => { load(); }, []);
  const decide = async (outcome, metadata) => {
    const { kind, id } = selected;
    if (kind === 'gathering') await (outcome === 'approved' ? api.approveEvent(id, metadata) : api.rejectEvent(id, metadata.reason, metadata));
    if (kind === 'organizer_role') await (outcome === 'approved' ? api.approveRoleRequest(id, metadata) : api.rejectRoleRequest(id, metadata.reason, metadata));
    if (kind === 'report') await api.resolveReport(id, { review: { ...metadata.review, reportOutcome: outcome } });
    await load(); usePlatformStore.getState().loadEvents();
  };
  const row = { padding: '16px 8px', borderBottom: '1px solid var(--line)', display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center' };
  return <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 12 }}>
      <StatCard label="Сборы на модерации" value={events.length} icon="calendar" /><StatCard label="Заявки на роль" value={roles.length} icon="users" /><StatCard label="Заявки НКО" value={stats?.pendingOrgs ?? '—'} icon="shield" /><StatCard label="Открытые жалобы" value={reports.filter((r) => r.status !== 'resolved').length} icon="bell" />
    </div>
    {state === 'loading' && <p role="status">Загружаем очередь…</p>}{error && <div role="alert">{error} <Button onClick={load}>Повторить</Button></div>}
    <SectionCard title="Заявки на роль организатора">
      {roles.map((r) => <article key={r.id} style={row}><div style={{ flex: 1, minWidth: 200 }}><strong>{r.name}</strong> · {r.role === 'org' ? 'НКО' : 'Координатор'}<p>{r.city} · {r.events} сборов · надёжность {r.reliability}%</p>{r.message && <p style={{ whiteSpace: 'pre-wrap' }}>{r.message}</p>}</div><Button onClick={() => setSelected({ kind: 'organizer_role', id: r.id })}>Рассмотреть заявку</Button></article>)}
      {state === 'ready' && !roles.length && <p>Нет заявок на роль организатора.</p>}
    </SectionCard>
    <SectionCard title="Сборы на модерации">
      {events.map((e) => <article key={e.id} style={row}><div style={{ flex: 1, minWidth: 200 }}><strong>{e.titleRu}</strong><p>{e.dateRu} · {e.time} · {e.placeRu}</p><Link to={`/e/${e.id}`}>Открыть мероприятие →</Link></div><Button onClick={() => setSelected({ kind: 'gathering', id: e.id })}>Рассмотреть заявку</Button></article>)}
      {state === 'ready' && !events.length && <p>Нет сборов на модерации.</p>}
    </SectionCard>
    <SectionCard title="Заявки НКО"><Link to="/admin/orgs">Проверить реквизиты и полномочия представителя →</Link></SectionCard>
    <SectionCard title="Жалобы">
      {reports.map((r) => <article key={r.id} style={row}><div style={{ flex: 1, minWidth: 200 }}><p>{r.ru}</p><StatusPill tone={r.status === 'resolved' ? 'yard' : 'maybe'}>{r.status === 'resolved' ? 'Рассмотрена' : r.status === 'reviewing' ? 'На проверке' : 'Открыта'}</StatusPill> · {r.count} обращений</div>{r.status !== 'resolved' && <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>{r.status === 'open' && <Button variant="secondary" onClick={async () => { try { await api.reviewReport(r.id); await load(); } catch (e) { setError(e.message); } }}>На проверку</Button>}<Button onClick={() => setSelected({ kind: 'report', id: r.id })}>Рассмотреть жалобу</Button></div>}</article>)}
      {state === 'ready' && !reports.length && <p>Жалоб нет.</p>}
    </SectionCard>
    {selected && <ReviewDialog key={`${selected.kind}-${selected.id}`} kind={selected.kind} sourceId={selected.id} onDecision={decide} onClose={() => setSelected(null)} />}
  </div>;
}
