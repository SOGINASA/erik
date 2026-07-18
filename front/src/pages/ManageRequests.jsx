import { useT, useLang } from '../i18n';
import { useOrganizerStore } from '../store/useOrganizerStore';
import { useUiStore } from '../store/useUiStore';
import { Container } from '../components/Container';
import Icon from '../components/Icon';
import Avatar from '../components/ui/Avatar';
import { SegTabs } from '../components/ui/controls';
import ManageHeader from '../components/manage/ManageHeader';
import { SkillTags, RelChip } from '../components/manage/parts';
import { EmptyState } from '../components/ui/feedback';

// Входящие заявки волонтёров: организатор принимает или отклоняет.
export default function ManageRequests() {
  const t = useT();
  const isRu = useLang() === 'ru';
  const apps = useOrganizerStore((s) => s.applications);
  const events = useOrganizerStore((s) => s.events);
  const filter = useOrganizerStore((s) => s.reqFilter);
  const setFilter = useOrganizerStore((s) => s.setReqFilter);
  const accept = useOrganizerStore((s) => s.acceptApplication);
  const decline = useOrganizerStore((s) => s.declineApplication);
  const openSheet = useUiStore((s) => s.openSheet);

  const eventTitle = (id) => {
    const e = events.find((x) => x.id === id);
    return e ? (isRu ? e.titleRu : e.titleKz) : '';
  };

  const list = apps.filter((a) => (filter === 'pending' ? a.status === 'pending' : filter === 'done' ? a.status !== 'pending' : true));

  const hist = (a) =>
    a.history && a.history.total > 0
      ? isRu ? `был ${a.history.came} из ${a.history.total} раз` : `${a.history.total} реттен ${a.history.came} рет келген`
      : t.mgNewVol;

  const statusChip = (status) => {
    const map = {
      accepted: [t.mgStatusAccepted, 'var(--yard-soft)', 'var(--yard)'],
      declined: [t.mgStatusDeclined, '#EEF0EC', 'var(--ink-2)'],
    };
    const [label, bg, color] = map[status] || [];
    if (!label) return null;
    return <span style={{ height: 26, padding: '0 12px', display: 'inline-flex', alignItems: 'center', borderRadius: 999, background: bg, color, fontSize: 13, fontWeight: 500 }}>{label}</span>;
  };

  return (
    <div style={{ minHeight: '100dvh', animation: 'erik-fade var(--t-base) var(--ease-out)' }}>
      <Container style={{ paddingTop: 16, paddingBottom: 56 }}>
        <ManageHeader active="requests" />

        <div>
          <SegTabs
            value={filter}
            onChange={setFilter}
            options={[{ value: 'pending', label: t.mgFilterPending }, { value: 'all', label: t.mgFilterAll }, { value: 'done', label: t.mgFilterDone }]}
            style={{ marginBottom: 18, maxWidth: 360 }}
          />

          {list.length === 0 ? (
            <EmptyState icon="users" title={t.mgReqEmpty} sub={t.mgReqEmptySub} />
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 400px), 1fr))', gap: 12, alignItems: 'start' }}>
              {list.map((a) => {
                const pending = a.status === 'pending';
                const msg = isRu ? a.messageRu : a.messageKz;
                return (
                  <div
                    key={a.id}
                    className="erik-lift"
                    role="button"
                    tabIndex={0}
                    onClick={() => openSheet('applicant', a)}
                    onKeyDown={(e) => { if (e.key === 'Enter') openSheet('applicant', a); }}
                    style={{ padding: 18, borderRadius: 'var(--r-m)', border: '1px solid var(--line)', background: 'var(--surface)', cursor: 'pointer', opacity: pending ? 1 : 0.72 }}
                  >
                    {/* Волонтёр */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                      <Avatar name={a.name} size={44} />
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                          <span style={{ fontFamily: 'var(--fd)', fontWeight: 600, fontSize: 16, color: 'var(--ink)' }}>{a.name}</span>
                          <RelChip value={a.reliability} label={t.mgReliability} />
                        </div>
                        <div style={{ fontSize: 13, color: 'var(--ink-3)' }}>{a.city} · {hist(a)}</div>
                      </div>
                      <span style={{ flex: 'none', fontSize: 12, color: 'var(--ink-3)' }}>{isRu ? a.agoRu : a.agoKz}</span>
                    </div>

                    {/* На какой сбор */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, color: 'var(--ink-2)', marginBottom: 12 }}>
                      <Icon name="calendar" size={16} stroke={1.7} />
                      <span>{t.mgAppliedTo} <span style={{ color: 'var(--ink)', fontWeight: 500 }}>«{eventTitle(a.eventId)}»</span></span>
                    </div>

                    {/* Навыки */}
                    {a.skills && a.skills.length > 0 && <div style={{ marginBottom: 12 }}><SkillTags ids={a.skills} /></div>}

                    {/* Сообщение */}
                    {msg && (
                      <div style={{ padding: '12px 14px', borderRadius: 'var(--r-s)', background: 'var(--paper)', fontSize: 14, lineHeight: 1.5, color: 'var(--ink-2)', marginBottom: pending ? 14 : 0 }}>{msg}</div>
                    )}

                    {/* Действия / статус */}
                    {pending ? (
                      <div style={{ display: 'flex', gap: 8 }} onClick={(e) => e.stopPropagation()}>
                        <button type="button" className="erik-btn erik-btn-primary" onClick={() => accept(a.id)} style={{ flex: 1, height: 44, border: 'none', borderRadius: 'var(--r-m)', background: 'var(--yard)', color: '#fff', fontWeight: 500, fontSize: 15, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                          <Icon name="check" size={18} stroke={2} />{t.mgAccept}
                        </button>
                        <button type="button" className="erik-btn erik-btn-secondary" onClick={() => decline(a.id)} style={{ flex: 'none', height: 44, padding: '0 18px', border: '1px solid var(--line)', borderRadius: 'var(--r-m)', background: 'var(--surface)', color: 'var(--ink-2)', fontWeight: 500, fontSize: 15, cursor: 'pointer' }}>
                          {t.mgDecline}
                        </button>
                      </div>
                    ) : (
                      <div style={{ marginTop: 12 }}>{statusChip(a.status)}</div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </Container>
    </div>
  );
}
