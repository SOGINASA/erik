import { useT, useLang } from '../i18n';
import { usePlatformStore } from '../store/usePlatformStore';
import { useUiStore } from '../store/useUiStore';
import { THEMES } from '../lib/data';
import { Container } from '../components/Container';
import Button from '../components/ui/Button';
import { EmptyState } from '../components/ui/feedback';

// Модерация: статистика за сегодня, заявки на верификацию НКО и жалобы.
// Экран рендерится внутри шелла (сайдбар/таббар уже есть) — только контент в Container.
export default function Admin() {
  const t = useT();
  const isRu = useLang() === 'ru';
  const orgs = usePlatformStore((s) => s.orgs);
  const showToast = useUiStore((s) => s.showToast);

  // Организации, ожидающие проверки
  const pending = orgs.filter((o) => !o.verified);

  // Демо-жалобы (двуязычные, как в platformVals прототипа)
  const reports = [
    { id: 'r1', txt: isRu ? 'Событие «Быстрый заработок» похоже на спам' : '«Тез табыс» іс-шарасы спам сияқты', meta: '3 ' + (isRu ? 'жалобы' : 'шағым') },
    { id: 'r2', txt: isRu ? 'Профиль с оскорблениями в чате' : 'Чатта дөрекілік көрсеткен профиль', meta: '1 ' + (isRu ? 'жалоба' : 'шағым') },
  ];

  const caption = { fontSize: 12, letterSpacing: '.03em', textTransform: 'uppercase', color: 'var(--ink-3)', marginBottom: 12 };
  const card = { display: 'flex', alignItems: 'center', gap: 14, padding: 14, border: '1px solid var(--line)', borderRadius: 'var(--r-m)', background: 'var(--surface)' };

  return (
    <Container style={{ paddingTop: 20, paddingBottom: 40 }}>
      <h1 style={{ fontFamily: 'var(--fd)', fontWeight: 600, fontSize: 28, letterSpacing: '-.02em', margin: '0 0 18px' }}>{t.adminTitle}</h1>

      {/* Статистика «За сегодня» — компактные плашки */}
      <div style={caption}>{t.adminStats}</div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 28 }}>
        <StatPlate n={pending.length} label={isRu ? 'заявок' : 'өтінім'} />
        <StatPlate n={reports.length} label={isRu ? 'жалоб' : 'шағым'} />
      </div>

      {/* Заявки на верификацию */}
      <div style={caption}>{t.adminVerify} · {pending.length}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 28 }}>
        {pending.length === 0 ? (
          <EmptyState
            icon="check"
            title={isRu ? 'Нет новых заявок' : 'Жаңа өтінім жоқ'}
            sub={isRu ? 'Все организации проверены.' : 'Барлық ұйым тексерілген.'}
          />
        ) : (
          pending.map((o) => {
            const T = THEMES[o.cat] || { tint: '#eee', ink: '#333', ru: '', kz: '' };
            const initial = (o.name.trim()[0] || '?').toUpperCase();
            return (
              <div key={o.id} style={card}>
                {/* Квадратный аватар: tint/ink темы категории */}
                <span style={{ width: 44, height: 44, flex: 'none', borderRadius: 'var(--r-s)', background: T.tint, color: T.ink, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 18, fontFamily: 'var(--fd)' }}>{initial}</span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: 'block', fontSize: 15, fontWeight: 600, color: 'var(--ink)' }}>{o.name}</span>
                  <span style={{ display: 'block', fontSize: 13, color: 'var(--ink-3)' }}>{isRu ? T.ru : T.kz} · {o.city}</span>
                </span>
                <div style={{ display: 'flex', gap: 8, flex: 'none' }}>
                  <Button variant="secondary" size="sm" onClick={() => showToast(isRu ? 'Отклонено' : 'Қабылданбады')}>{t.reject}</Button>
                  <Button variant="primary" size="sm" onClick={() => showToast(isRu ? `${o.name} одобрена` : `${o.name} мақұлданды`)}>{t.approve}</Button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Жалобы */}
      <div style={caption}>{t.adminReports}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {reports.length === 0 ? (
          <EmptyState icon="shield" title={isRu ? 'Жалоб нет' : 'Шағым жоқ'} />
        ) : (
          reports.map((r) => (
            <div key={r.id} style={card}>
              {/* Иконка-предупреждение в кружке */}
              <span style={{ width: 36, height: 36, flex: 'none', borderRadius: 999, background: 'var(--maybe-soft)', color: 'var(--maybe)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                  <path d="M12 8v5M12 16.5v.5" />
                  <path d="M10.3 3.9l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.7-3l-8-14a2 2 0 0 0-3.4 0z" />
                </svg>
              </span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: 'block', fontSize: 14, color: 'var(--ink)', lineHeight: 1.4 }}>{r.txt}</span>
                <span style={{ display: 'block', fontSize: 12, color: 'var(--ink-3)' }}>{r.meta}</span>
              </span>
              <button
                type="button"
                className="erik-btn"
                onClick={() => showToast(isRu ? 'Отправлено на проверку' : 'Тексеруге жіберілді')}
                style={{ flex: 'none', height: 36, padding: '0 14px', border: '1px solid var(--line)', borderRadius: 'var(--r-s)', background: 'var(--surface)', fontFamily: 'var(--fb)', fontSize: 13, fontWeight: 500, color: 'var(--ink)', cursor: 'pointer' }}
              >
                {isRu ? 'Проверить' : 'Тексеру'}
              </button>
            </div>
          ))
        )}
      </div>
    </Container>
  );
}

// Компактная плашка статистики: число + подпись
function StatPlate({ n, label }) {
  return (
    <div style={{ padding: '12px 16px', border: '1px solid var(--line)', borderRadius: 'var(--r-m)', background: 'var(--surface)', minWidth: 110 }}>
      <div style={{ fontFamily: 'var(--fd)', fontWeight: 700, fontSize: 22, letterSpacing: '-.01em', color: 'var(--ink)' }}>{n}</div>
      <div style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: 2 }}>{label}</div>
    </div>
  );
}
