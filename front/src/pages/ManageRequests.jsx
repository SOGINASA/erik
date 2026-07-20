import { useEffect, useState } from 'react';
import { useT, useLang } from '../i18n';
import { useOrganizerStore, orgNotice } from '../store/useOrganizerStore';
import { useSessionStore } from '../store/useSessionStore';
import { useUiStore } from '../store/useUiStore';
import { Container } from '../components/Container';
import Icon from '../components/Icon';
import Avatar from '../components/ui/Avatar';
import { SegTabs } from '../components/ui/controls';
import ManageHeader from '../components/manage/ManageHeader';
import { SkillTags, RelChip } from '../components/manage/parts';
import { EmptyState, Skeleton } from '../components/ui/feedback';

// Входящие заявки волонтёров: организатор принимает или отклоняет.
export default function ManageRequests() {
  const t = useT();
  const isRu = useLang() === 'ru';
  const apps = useOrganizerStore((s) => s.applications);
  const events = useOrganizerStore((s) => s.events);
  const load = useOrganizerStore((s) => s.load);
  const filter = useOrganizerStore((s) => s.reqFilter);
  const setFilter = useOrganizerStore((s) => s.setReqFilter);
  const accept = useOrganizerStore((s) => s.acceptApplication);
  const decline = useOrganizerStore((s) => s.declineApplication);
  const bulkDecide = useOrganizerStore((s) => s.bulkDecide);
  const source = useOrganizerStore((s) => s.source);
  const status = useOrganizerStore((s) => s.status);
  const loggedIn = useSessionStore((s) => s.loggedIn);
  const openSheet = useUiStore((s) => s.openSheet);

  // Грузим заявки/сборы при прямом заходе на /manage/requests (иначе — моки).
  useEffect(() => { load(); }, [load]);

  // Пока идёт первая загрузка — скелетон: выдавать демо-заявки за настоящие нельзя.
  const booting = status === 'loading' && source === 'demo';
  const notice = orgNotice(source, status, isRu, loggedIn);

  const eventTitle = (id) => {
    const e = events.find((x) => x.id === id);
    return e ? (isRu ? e.titleRu : e.titleKz) : '';
  };

  const list = apps.filter((a) => (filter === 'pending' ? a.status === 'pending' : filter === 'done' ? a.status !== 'pending' : true));

  // Режим массового решения: чекбоксы вешаем только на ожидающие заявки текущего
  // фильтра — принять/отклонить имеет смысл лишь для pending. Смена фильтра выходит
  // из режима (одиночные accept/decline при этом работают как раньше).
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState(() => new Set());
  const [busy, setBusy] = useState(false);
  const pendingIds = list.filter((a) => a.status === 'pending').map((a) => a.id);
  const allSelected = pendingIds.length > 0 && pendingIds.every((id) => selected.has(id));

  const toggleSelect = (id) => setSelected((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(pendingIds));
  const exitSelect = () => { setSelecting(false); setSelected(new Set()); };
  const onFilter = (v) => { setFilter(v); exitSelect(); };
  const runBulk = async (action) => {
    const ids = [...selected];
    if (ids.length === 0 || busy) return;
    setBusy(true);
    await bulkDecide(ids, action); // частичный failed стор тостит сам — статусы обновятся в списке
    setBusy(false);
    exitSelect();
  };

  const hist = (a) =>
    a.history && a.history.total > 0
      ? isRu ? `был ${a.history.came} из ${a.history.total} раз` : `${a.history.total} реттен ${a.history.came} рет келген`
      : t.mgNewVol;

  const statusChip = (kind) => {
    const map = {
      accepted: [t.mgStatusAccepted, 'var(--yard-soft)', 'var(--yard)'],
      declined: [t.mgStatusDeclined, '#EEF0EC', 'var(--ink-2)'],
    };
    const [label, bg, color] = map[kind] || [];
    if (!label) return null;
    return <span style={{ height: 26, padding: '0 12px', display: 'inline-flex', alignItems: 'center', borderRadius: 999, background: bg, color, fontSize: 13, fontWeight: 500 }}>{label}</span>;
  };

  return (
    <div style={{ minHeight: '100dvh', animation: 'erik-fade var(--t-base) var(--ease-out)' }}>
      <Container style={{ paddingTop: 16, paddingBottom: 56 }}>
        <ManageHeader active="requests" />

        {/* Честная пометка источника: демо-данные и ошибка загрузки видны, а не молчат */}
        {notice && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '10px 14px', marginBottom: 14, borderRadius: 'var(--r-s)', border: '1px solid var(--line)', background: notice.tone === 'error' ? 'var(--maybe-soft)' : 'var(--paper)', fontSize: 13, lineHeight: 1.4, color: 'var(--ink-2)' }}>
            <span>{notice.text}</span>
            {notice.retry && (
              <button type="button" className="erik-btn" onClick={load} style={{ flex: 'none', height: 32, padding: '0 12px', border: '1px solid var(--line)', borderRadius: 'var(--r-s)', background: 'var(--surface)', color: 'var(--ink)', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>{isRu ? 'Повторить' : 'Қайталау'}</button>
            )}
          </div>
        )}

        <div>
          <SegTabs
            value={filter}
            onChange={onFilter}
            options={[{ value: 'pending', label: t.mgFilterPending }, { value: 'all', label: t.mgFilterAll }, { value: 'done', label: t.mgFilterDone }]}
            style={{ marginBottom: 18, maxWidth: 360 }}
          />

          {/* Панель массового выбора: вход в режим + «выбрать все видимые ожидающие» */}
          {!booting && (pendingIds.length > 0 || selecting) && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 14 }}>
              <span style={{ fontSize: 13, color: 'var(--ink-3)' }}>
                {selecting ? `${t.mgSelected}: ${selected.size}` : ''}
              </span>
              <div style={{ display: 'flex', gap: 8 }}>
                {selecting && (
                  <button type="button" className="erik-btn" onClick={toggleAll} style={{ height: 32, padding: '0 12px', border: '1px solid var(--line)', borderRadius: 'var(--r-s)', background: 'var(--surface)', color: 'var(--ink)', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>
                    {allSelected ? t.mgSelectNone : t.mgSelectAll}
                  </button>
                )}
                <button type="button" className="erik-btn" onClick={() => (selecting ? exitSelect() : setSelecting(true))} style={{ height: 32, padding: '0 12px', border: '1px solid var(--line)', borderRadius: 'var(--r-s)', background: 'var(--surface)', color: 'var(--ink)', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>
                  {selecting ? t.mgSelectCancel : t.mgSelect}
                </button>
              </div>
            </div>
          )}

          {booting ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 400px), 1fr))', gap: 12, alignItems: 'start' }}>
              {[0, 1, 2].map((i) => (
                <div key={i} style={{ padding: 18, borderRadius: 'var(--r-m)', border: '1px solid var(--line)', background: 'var(--surface)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                    <Skeleton width={44} height={44} radius={999} />
                    <div style={{ flex: 1 }}>
                      <Skeleton width="55%" height={16} />
                      <Skeleton width="70%" height={13} style={{ marginTop: 8 }} />
                    </div>
                  </div>
                  <Skeleton height={44} radius={12} />
                </div>
              ))}
            </div>
          ) : list.length === 0 ? (
            <EmptyState icon="users" title={t.mgReqEmpty} sub={t.mgReqEmptySub} />
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 400px), 1fr))', gap: 12, alignItems: 'start' }}>
              {list.map((a) => {
                const pending = a.status === 'pending';
                const msg = isRu ? a.messageRu : a.messageKz;
                // В режиме выбора ожидающая карточка переключает отметку вместо шторки.
                const selectable = selecting && pending;
                const checked = selected.has(a.id);
                return (
                  <div
                    key={a.id}
                    className="erik-lift"
                    role="button"
                    tabIndex={0}
                    aria-pressed={selectable ? checked : undefined}
                    onClick={() => (selectable ? toggleSelect(a.id) : openSheet('applicant', a))}
                    onKeyDown={(e) => { if (e.key === 'Enter') { if (selectable) toggleSelect(a.id); else openSheet('applicant', a); } }}
                    style={{ padding: 18, borderRadius: 'var(--r-m)', border: `1px solid ${checked ? 'var(--yard)' : 'var(--line)'}`, background: checked ? 'var(--yard-soft)' : 'var(--surface)', cursor: 'pointer', opacity: pending ? 1 : 0.72 }}
                  >
                    {/* Волонтёр */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                      {selectable && (
                        <span aria-hidden="true" style={{ flex: 'none', width: 22, height: 22, borderRadius: 6, border: `2px solid ${checked ? 'var(--yard)' : 'var(--line)'}`, background: checked ? 'var(--yard)' : 'transparent', color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                          {checked && <Icon name="check" size={14} stroke={2.6} />}
                        </span>
                      )}
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

                    {/* Действия / статус (в режиме выбора одиночные кнопки прячем — решает нижняя панель) */}
                    {pending ? (selecting ? null : (
                      <div style={{ display: 'flex', gap: 8 }} onClick={(e) => e.stopPropagation()}>
                        <button type="button" className="erik-btn erik-btn-primary" onClick={() => accept(a.id)} style={{ flex: 1, height: 44, border: 'none', borderRadius: 'var(--r-m)', background: 'var(--yard)', color: '#fff', fontWeight: 500, fontSize: 15, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                          <Icon name="check" size={18} stroke={2} />{t.mgAccept}
                        </button>
                        <button type="button" className="erik-btn erik-btn-secondary" onClick={() => decline(a.id)} style={{ flex: 'none', height: 44, padding: '0 18px', border: '1px solid var(--line)', borderRadius: 'var(--r-m)', background: 'var(--surface)', color: 'var(--ink-2)', fontWeight: 500, fontSize: 15, cursor: 'pointer' }}>
                          {t.mgDecline}
                        </button>
                      </div>
                    )) : (
                      <div style={{ marginTop: 12 }}>{statusChip(a.status)}</div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Нижняя панель массового решения: кнопки активны, только когда что-то выбрано */}
          {selecting && (
            <div style={{ position: 'sticky', bottom: 0, display: 'flex', gap: 8, marginTop: 16, padding: '12px 14px', borderRadius: 'var(--r-m)', border: '1px solid var(--line)', background: 'var(--surface)', boxShadow: '0 -6px 20px rgba(0,0,0,0.06)' }}>
              <button type="button" className="erik-btn erik-btn-primary" disabled={selected.size === 0 || busy} onClick={() => runBulk('accept')} style={{ flex: 1, height: 44, border: 'none', borderRadius: 'var(--r-m)', background: 'var(--yard)', color: '#fff', fontWeight: 500, fontSize: 15, cursor: selected.size === 0 || busy ? 'default' : 'pointer', opacity: selected.size === 0 || busy ? 0.5 : 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                <Icon name="check" size={18} stroke={2} />{t.mgBulkAccept}
              </button>
              <button type="button" className="erik-btn erik-btn-secondary" disabled={selected.size === 0 || busy} onClick={() => runBulk('decline')} style={{ flex: 'none', height: 44, padding: '0 18px', border: '1px solid var(--line)', borderRadius: 'var(--r-m)', background: 'var(--surface)', color: 'var(--ink-2)', fontWeight: 500, fontSize: 15, cursor: selected.size === 0 || busy ? 'default' : 'pointer', opacity: selected.size === 0 || busy ? 0.5 : 1 }}>
                {t.mgBulkDecline}
              </button>
            </div>
          )}
        </div>
      </Container>
    </div>
  );
}
