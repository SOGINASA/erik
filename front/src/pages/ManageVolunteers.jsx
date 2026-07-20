import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useT, useLang } from '../i18n';
import { useOrganizerStore, orgNotice } from '../store/useOrganizerStore';
import { usePlatformStore } from '../store/usePlatformStore';
import { useSessionStore } from '../store/useSessionStore';
import { useIsDesktop } from '../lib/nav';
import { plural } from '../lib/data';
import { Container } from '../components/Container';
import Icon from '../components/Icon';
import Avatar from '../components/ui/Avatar';
import { SegTabs } from '../components/ui/controls';
import ManageHeader from '../components/manage/ManageHeader';
import { SkillTags, RelChip } from '../components/manage/parts';
import { EmptyState, Skeleton } from '../components/ui/feedback';

// База волонтёров организатора: сортировка, навыки, быстрый контакт.
export default function ManageVolunteers() {
  const t = useT();
  const isRu = useLang() === 'ru';
  const navigate = useNavigate();
  const desktop = useIsDesktop();
  const volunteers = useOrganizerStore((s) => s.volunteers);
  const load = useOrganizerStore((s) => s.load);
  const sort = useOrganizerStore((s) => s.volSort);
  const setSort = useOrganizerStore((s) => s.setVolSort);
  const openConversationWith = useOrganizerStore((s) => s.openConversationWith);
  const source = useOrganizerStore((s) => s.source);
  const status = useOrganizerStore((s) => s.status);
  const loadConversations = usePlatformStore((s) => s.loadConversations);
  const loggedIn = useSessionStore((s) => s.loggedIn);

  // Грузим базу волонтёров и при прямом заходе на /manage/volunteers (иначе — моки).
  useEffect(() => { load(); }, [load]);

  // Пока идёт первая загрузка — скелетон: выдуманные волонтёры не должны
  // выглядеть базой организатора.
  const booting = status === 'loading' && source === 'demo';
  const notice = orgNotice(source, status, isRu, loggedIn);

  const sorted = [...volunteers].sort((a, b) =>
    sort === 'hours' ? b.hours - a.hours : sort === 'events' ? b.events - a.events : b.reliability - a.reliability
  );

  // Найти/создать реальный диалог с волонтёром и открыть его. Диалог создаёт стор
  // (единый слой доступа к API); он же тостит причину провала. Раньше в catch
  // показывался тост «Открыт чат с …» и шла навигация — провал рисовался успехом.
  const write = async (v) => {
    const cid = await openConversationWith(v);
    if (cid == null) return;
    await loadConversations();
    navigate('/messages/c' + cid);
  };

  return (
    <div style={{ minHeight: '100dvh', animation: 'erik-fade var(--t-base) var(--ease-out)' }}>
      <Container style={{ paddingTop: 16, paddingBottom: 56 }}>
        <ManageHeader active="volunteers" />

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
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 18, flexWrap: 'wrap' }}>
            <div style={{ fontSize: 14, color: 'var(--ink-2)' }}>
              {booting ? <Skeleton width={110} height={14} /> : `${volunteers.length} ${isRu ? plural(volunteers.length, ['волонтёр', 'волонтёра', 'волонтёров']) : 'волонтёр'}`}
            </div>
            <SegTabs
              value={sort}
              onChange={setSort}
              options={[{ value: 'reliability', label: t.mgSortRel }, { value: 'hours', label: t.mgSortHours }, { value: 'events', label: t.mgSortEvents }]}
              style={{ maxWidth: 380, flex: 1, minWidth: 260 }}
            />
          </div>

          {booting ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 360px), 1fr))', gap: 10, alignItems: 'start' }}>
              {[0, 1, 2, 3].map((i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px', borderRadius: 'var(--r-m)', border: '1px solid var(--line)', background: 'var(--surface)' }}>
                  <Skeleton width={46} height={46} radius={999} />
                  <div style={{ flex: 1 }}>
                    <Skeleton width="60%" height={16} />
                    <Skeleton width="80%" height={13} style={{ marginTop: 8 }} />
                  </div>
                </div>
              ))}
            </div>
          ) : sorted.length === 0 ? (
            <EmptyState icon="users" title={t.mgVolEmpty} sub={t.mgVolEmptySub} />
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 360px), 1fr))', gap: 10, alignItems: 'start' }}>
              {sorted.map((v) => (
                <div key={v.id} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px', borderRadius: 'var(--r-m)', border: '1px solid var(--line)', background: 'var(--surface)' }}>
                  <Avatar name={v.name} size={46} />
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
                      <span style={{ fontFamily: 'var(--fd)', fontWeight: 600, fontSize: 16, color: 'var(--ink)' }}>{v.name}</span>
                      <RelChip value={v.reliability} label={t.mgReliability} />
                    </div>
                    <div style={{ fontFamily: 'var(--fm)', fontSize: 13, color: 'var(--ink-3)', marginBottom: 8 }}>
                      {v.hours} {isRu ? 'ч' : 'сағ'} · {v.events} {isRu ? plural(v.events, ['сбор', 'сбора', 'сборов']) : 'жиын'} · {v.city}
                    </div>
                    <SkillTags ids={v.skills} max={desktop ? 4 : 2} />
                  </div>
                  <button
                    type="button"
                    className="erik-btn erik-btn-secondary"
                    onClick={() => write(v)}
                    aria-label={t.mgWrite}
                    style={{ flex: 'none', height: 40, padding: desktop ? '0 16px' : 0, width: desktop ? undefined : 40, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, border: '1px solid var(--line)', borderRadius: 'var(--r-m)', background: 'var(--surface)', color: 'var(--ink)', fontWeight: 500, fontSize: 14, cursor: 'pointer' }}
                  >
                    <Icon name="message" size={18} stroke={1.7} />{desktop && t.mgWrite}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </Container>
    </div>
  );
}
