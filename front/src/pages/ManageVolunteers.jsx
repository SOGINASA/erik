import { useNavigate } from 'react-router-dom';
import { useT, useLang } from '../i18n';
import { useOrganizerStore } from '../store/useOrganizerStore';
import { useUiStore } from '../store/useUiStore';
import { useIsDesktop } from '../lib/nav';
import { plural } from '../lib/data';
import { Container } from '../components/Container';
import Icon from '../components/Icon';
import Avatar from '../components/ui/Avatar';
import { SegTabs } from '../components/ui/controls';
import ManageHeader from '../components/manage/ManageHeader';
import { SkillTags, RelChip } from '../components/manage/parts';
import { EmptyState } from '../components/ui/feedback';

// База волонтёров организатора: сортировка, навыки, быстрый контакт.
export default function ManageVolunteers() {
  const t = useT();
  const isRu = useLang() === 'ru';
  const navigate = useNavigate();
  const desktop = useIsDesktop();
  const volunteers = useOrganizerStore((s) => s.volunteers);
  const sort = useOrganizerStore((s) => s.volSort);
  const setSort = useOrganizerStore((s) => s.setVolSort);
  const showToast = useUiStore((s) => s.showToast);

  const sorted = [...volunteers].sort((a, b) =>
    sort === 'hours' ? b.hours - a.hours : sort === 'events' ? b.events - a.events : b.reliability - a.reliability
  );

  const write = (v) => { showToast(isRu ? `Открыт чат с ${v.name}` : `${v.name} чаты ашылды`); navigate('/messages'); };

  return (
    <div style={{ minHeight: '100dvh', animation: 'erik-fade var(--t-base) var(--ease-out)' }}>
      <Container style={{ paddingTop: 16, paddingBottom: 56 }}>
        <ManageHeader active="volunteers" />

        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 18, flexWrap: 'wrap' }}>
            <div style={{ fontSize: 14, color: 'var(--ink-2)' }}>{volunteers.length} {isRu ? plural(volunteers.length, ['волонтёр', 'волонтёра', 'волонтёров']) : 'волонтёр'}</div>
            <SegTabs
              value={sort}
              onChange={setSort}
              options={[{ value: 'reliability', label: t.mgSortRel }, { value: 'hours', label: t.mgSortHours }, { value: 'events', label: t.mgSortEvents }]}
              style={{ maxWidth: 380, flex: 1, minWidth: 260 }}
            />
          </div>

          {sorted.length === 0 ? (
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
