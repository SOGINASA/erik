import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useT, useLang } from '../i18n';
import { usePlatformStore } from '../store/usePlatformStore';
import { useGatheringStore } from '../store/useGatheringStore';
import { useUiStore } from '../store/useUiStore';
import { api } from '../lib/api';
import { THEMES, avatarOf, initialOf } from '../lib/data';
import { Container, BackButton } from '../components/Container';
import Icon from '../components/Icon';

// Страница события: обложка темы, детали, участники, запись/ответ.
export default function Event() {
  const t = useT();
  const isRu = useLang() === 'ru';
  const navigate = useNavigate();
  const { id } = useParams();
  const events = usePlatformStore((s) => s.events);
  const orgs = usePlatformStore((s) => s.orgs);
  const cities = usePlatformStore((s) => s.cities);
  const regs = useGatheringStore((s) => s.regs);
  const unregisterEvent = useGatheringStore((s) => s.unregisterEvent);
  const openSheet = useUiStore((s) => s.openSheet);
  const showToast = useUiStore((s) => s.showToast);
  const [participants, setParticipants] = useState([]);

  const ev = events.find((e) => e.id === id) || events[0];
  const theme = THEMES[ev.theme] || { ru: '', kz: '', tint: '#eee', ink: '#333' };
  const org = orgs.find((o) => o.id === ev.orgId) || {};
  const city = cities.find((c) => c.id === ev.cityId) || { ru: '', kz: '' };

  // Реальные участники события (стопка аватаров) — по id события, а не из демо-сбора.
  useEffect(() => {
    let alive = true;
    api.eventParticipants(String(ev.id).replace(/^\D+/, ''))
      .then((r) => { if (alive) setParticipants(r.participants || []); })
      .catch(() => { if (alive) setParticipants([]); });
    return () => { alive = false; };
  }, [ev.id]);

  // Пожаловаться на событие: причина → реальная запись в очередь модерации.
  const report = () => {
    const asked = (typeof window !== 'undefined' && window.prompt)
      ? window.prompt(isRu ? 'Причина жалобы:' : 'Шағым себебі:')
      : '';
    if (asked === null) return; // отмена
    const reason = (asked || '').trim() || (isRu ? 'Жалоба на событие' : 'Іс-шараға шағым');
    api.submitReport({ targetType: 'event', targetId: String(ev.id).replace(/^\D+/, ''), reason })
      .then(() => showToast(isRu ? 'Жалоба отправлена' : 'Шағым жіберілді'))
      .catch(() => showToast(isRu ? 'Не удалось отправить' : 'Жіберілмеді'));
  };

  const title = isRu ? ev.titleRu : ev.titleKz;
  const when = `${isRu ? ev.dateRu : ev.dateKz} · ${ev.time}`;
  const place = isRu ? ev.placeRu : ev.placeKz;
  const cityName = isRu ? city.ru : city.kz;
  const themeLabel = isRu ? theme.ru : theme.kz;
  const formatLabel = ev.format === 'reg' ? (isRu ? 'Регулярное' : 'Тұрақты') : (isRu ? 'Разовое' : 'Бір реттік');
  const goingText = isRu ? `идут ${ev.going}` : `${ev.going} келеді`;

  const reg = regs[ev.id];
  const regLabel = reg ? (reg === 'yes' ? t.ansYes : reg === 'maybe' ? t.ansMaybe : t.ansNo) : null;

  const openRegister = () => openSheet('register', ev.id);

  // Иконка строки-детали (line-стиль, цвет var(--ink-3)) — как в дизайне.
  const rowIcon = (children) => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--ink-3)" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">{children}</svg>
  );
  const infoRowStyle = { display: 'flex', alignItems: 'center', gap: 10, fontSize: 15, color: 'var(--ink)' };

  return (
    <Container style={{ paddingTop: 20, paddingBottom: 48 }}>
      <div className="erik-anim-fade" style={{ maxWidth: 720, margin: '0 auto' }}>
        <div style={{ marginBottom: 8 }}>
          <BackButton onClick={() => navigate('/feed')} label={isRu ? 'Назад' : 'Артқа'} />
        </div>

        {/* Обложка с чипом темы */}
        <div style={{ height: 190, background: theme.tint, borderRadius: 'var(--r-l)', display: 'flex', alignItems: 'flex-end', padding: 20, position: 'relative', overflow: 'hidden' }}>
          <span style={{ height: 28, padding: '0 12px', display: 'inline-flex', alignItems: 'center', borderRadius: 999, background: theme.ink, color: '#fff', fontSize: 12, fontWeight: 600 }}>{themeLabel}</span>
        </div>

        <h1 style={{ fontFamily: 'var(--fd)', fontWeight: 600, fontSize: 28, lineHeight: 1.15, letterSpacing: '-.02em', margin: '20px 0 8px', textWrap: 'balance' }}>{title}</h1>
        {org.id && (
          <button onClick={() => navigate(`/o/${org.id}`)} style={{ border: 'none', background: 'transparent', cursor: 'pointer', padding: 0, fontSize: 15, color: 'var(--yard)', fontWeight: 500 }}>{org.name}</button>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, margin: '18px 0 22px' }}>
          <div style={infoRowStyle}>
            {rowIcon(<><rect x="4" y="5" width="16" height="16" rx="2" /><path d="M4 9h16M8 3v4M16 3v4" /></>)}
            {when}
          </div>
          <div style={infoRowStyle}>
            {rowIcon(<><path d="M12 21s-7-6-7-11a7 7 0 0 1 14 0c0 5-7 11-7 11z" /><circle cx="12" cy="10" r="2.5" /></>)}
            {place}, {cityName}
          </div>
          <div style={infoRowStyle}>
            {rowIcon(<><circle cx="12" cy="8" r="3.2" /><path d="M5 20a7 7 0 0 1 14 0" /></>)}
            {formatLabel} · {goingText}
          </div>
        </div>

        {/* Стопка аватаров участников */}
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 24 }}>
          {participants.map((p) => {
            const a = avatarOf(p.name);
            return (
              <span key={p.id} style={{ width: 34, height: 34, borderRadius: 999, marginLeft: -8, border: '2px solid var(--surface)', background: a[0], color: a[1], display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 600, fontSize: 13, fontFamily: 'var(--fd)' }}>{initialOf(p.name)}</span>
            );
          })}
          <span style={{ marginLeft: 14, fontSize: 13, color: 'var(--ink-2)' }}>{goingText}</span>
        </div>

        {/* Своё событие: вход в дашборд координатора */}
        {ev.mine && (
          <button
            className="erik-btn"
            onClick={() => navigate(`/c/${ev.id}`)}
            style={{ width: '100%', height: 52, border: 'none', borderRadius: 'var(--r-m)', background: 'var(--ink)', color: '#fff', fontWeight: 500, fontSize: 16, cursor: 'pointer', marginBottom: 12 }}
          >
            {t.openCoordDash}
          </button>
        )}

        {/* Ответ на событие */}
        {reg ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 18px', borderRadius: 'var(--r-m)', background: 'var(--yard-soft)', border: '1px solid var(--yard)' }}>
            <div>
              <div style={{ fontSize: 13, color: 'var(--ink-2)' }}>{t.youRegistered}</div>
              <div style={{ fontWeight: 600, fontSize: 17, color: 'var(--yard)' }}>{regLabel}</div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
              <button onClick={openRegister} style={{ border: 'none', background: 'transparent', color: 'var(--ink-2)', fontWeight: 500, fontSize: 14, cursor: 'pointer', textDecoration: 'underline', textUnderlineOffset: 3 }}>{t.changeAnswer}</button>
              <button onClick={() => unregisterEvent(ev.id)} style={{ border: 'none', background: 'transparent', color: 'var(--ink-3)', fontSize: 13, cursor: 'pointer' }}>{isRu ? 'Отменить запись' : 'Жазылуды тоқтату'}</button>
            </div>
          </div>
        ) : (
          <button
            className="erik-btn"
            onClick={openRegister}
            style={{ width: '100%', height: 52, border: 'none', borderRadius: 'var(--r-m)', background: 'var(--yard)', color: '#fff', fontWeight: 500, fontSize: 16, cursor: 'pointer' }}
          >
            {t.register}
          </button>
        )}

        {/* Заявка организатору: навыки + сообщение (для чужих событий) */}
        {!ev.mine && (
          <button
            className="erik-btn erik-btn-secondary"
            onClick={() => openSheet('apply', ev.id)}
            style={{ width: '100%', height: 48, marginTop: 12, border: '1px solid var(--line)', borderRadius: 'var(--r-m)', background: 'var(--surface)', color: 'var(--ink)', fontWeight: 500, fontSize: 15, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
          >
            <Icon name="send" size={17} stroke={1.7} />{t.mgApplyCta}
          </button>
        )}

        {/* Пожаловаться на событие (пользовательская модерация) */}
        {!ev.mine && (
          <button
            className="erik-btn"
            onClick={() => report()}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, margin: '14px auto 0', border: 'none', background: 'transparent', color: 'var(--ink-3)', fontSize: 13, cursor: 'pointer' }}
          >
            <Icon name="shield" size={14} stroke={1.6} />{isRu ? 'Пожаловаться' : 'Шағымдану'}
          </button>
        )}
      </div>
    </Container>
  );
}
