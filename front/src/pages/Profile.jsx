import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { useT, useLang } from '../i18n';
import { usePlatformStore } from '../store/usePlatformStore';
import { useUiStore } from '../store/useUiStore';
import { api } from '../lib/api';
import { Container } from '../components/Container';
import Avatar from '../components/ui/Avatar';
import Button from '../components/ui/Button';
import { EmptyState } from '../components/ui/feedback';

// Профиль волонтёра: шапка, статы, навыки, достижения, история участия.
export default function Profile() {
  const t = useT();
  const isRu = useLang() === 'ru';
  const { id } = useParams();
  const me = usePlatformStore((s) => s.me);
  const badges = usePlatformStore((s) => s.badges);
  const openSheet = useUiStore((s) => s.openSheet);
  const [other, setOther] = useState(null);

  const isSelf = !id || id === 'me' || String(id) === String(me.id);

  // Чужой профиль (:id — серверный id пользователя из /u/:id) грузим из API; свой берём
  // из стора (loadMe). id уходит ВЕРБАТИМ: снятие префикса открыло бы ЧУЖОЙ профиль №1.
  useEffect(() => {
    if (isSelf) { setOther(null); return; }
    let alive = true;
    api.userPublic(id)
      .then((r) => { if (alive) setOther({ ...r.user, historyRu: r.user.history || [] }); })
      .catch(() => { if (alive) setOther(null); });
    return () => { alive = false; };
  }, [id, isSelf]);

  const person = isSelf ? me : (other || me);

  // Заголовок секции (капс, приглушённый).
  const secTitle = { fontSize: 12, letterSpacing: '.03em', textTransform: 'uppercase', color: 'var(--ink-3)' };
  // Плашка стата.
  const stat = { padding: 16, border: '1px solid var(--line)', borderRadius: 'var(--r-m)', background: 'var(--surface)' };
  const statNum = { fontFamily: 'var(--fd)', fontWeight: 700, fontSize: 26 };
  const statLbl = { fontSize: 12, color: 'var(--ink-3)' };

  const history = person.historyRu || person.history || [];

  return (
    <Container style={{ paddingTop: 24, paddingBottom: 48 }}>
      <div style={{ maxWidth: 720, margin: '0 auto' }}>
        {/* Шапка */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24 }}>
          <Avatar name={person.name} size={72} />
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <h1 style={{ fontFamily: 'var(--fd)', fontWeight: 600, fontSize: 24, letterSpacing: '-.02em', margin: 0 }}>{person.name}</h1>
              {isSelf && (
                <span style={{ height: 20, padding: '0 8px', display: 'flex', alignItems: 'center', borderRadius: 999, background: 'var(--yard-soft)', color: 'var(--yard)', fontSize: 11, fontWeight: 500 }}>{t.thisIsYou}</span>
              )}
            </div>
            <div style={{ fontSize: 14, color: 'var(--ink-2)', marginTop: 2 }}>{person.city}</div>
          </div>
        </div>

        {/* Статы: часы · события · надёжность */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 28 }}>
          <div style={stat}><div style={{ ...statNum, color: 'var(--ink)' }}>{person.hours}</div><div style={statLbl}>{t.profileHours}</div></div>
          <div style={stat}><div style={{ ...statNum, color: 'var(--ink)' }}>{person.events}</div><div style={statLbl}>{t.profileEvents}</div></div>
          <div style={stat}><div style={{ ...statNum, color: 'var(--yard)' }}>{person.reliability}%</div><div style={statLbl}>{t.profileRel}</div></div>
        </div>

        {/* Навыки */}
        <div style={{ ...secTitle, marginBottom: 10 }}>{t.skillsTitle}</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 28 }}>
          {(person.skills || []).map((sk, i) => (
            <span key={i} style={{ height: 32, padding: '0 14px', display: 'inline-flex', alignItems: 'center', borderRadius: 999, background: 'var(--surface)', border: '1px solid var(--line)', fontSize: 13, color: 'var(--ink-2)' }}>{sk}</span>
          ))}
        </div>

        {/* Достижения */}
        <div style={{ ...secTitle, marginBottom: 12 }}>{t.badgesTitle}</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(96px, 1fr))', gap: 10, marginBottom: 28 }}>
          {badges.map((b) => {
            const earned = (person.badges || []).includes(b.id);
            return (
              <div key={b.id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, padding: '16px 8px', borderRadius: 'var(--r-m)', border: '1px solid var(--line)', background: earned ? 'var(--surface)' : 'transparent', opacity: earned ? 1 : 0.42 }}>
                <span style={{ width: 46, height: 46, borderRadius: 999, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--fd)', fontWeight: 700, fontSize: 18, background: earned ? 'var(--yard-soft)' : 'var(--paper)', color: earned ? 'var(--yard)' : 'var(--ink-3)' }}>{b.glyph}</span>
                <span style={{ fontSize: 12, color: 'var(--ink-2)', textAlign: 'center', lineHeight: 1.2 }}>{isRu ? b.ru : b.kz}</span>
              </div>
            );
          })}
        </div>

        {/* История участия */}
        <div style={{ ...secTitle, marginBottom: 10 }}>{t.historyTitle}</div>
        {history.length === 0 ? (
          <EmptyState icon="calendar" title={isRu ? 'Пока нет участий' : 'Әзірге қатысу жоқ'} sub={isRu ? 'Запишитесь на сбор — он появится здесь.' : 'Жиынға тіркеліңіз — ол осында пайда болады.'} />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {history.map((h, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 4px', borderBottom: '1px solid var(--line)' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 15, fontWeight: 500, color: 'var(--ink)' }}>{h.t}</div>
                  <div style={{ fontSize: 13, color: 'var(--ink-3)' }}>{h.d}</div>
                </div>
                <span style={{ flex: 'none', height: 22, padding: '0 9px', display: 'flex', alignItems: 'center', borderRadius: 999, fontSize: 11, background: h.came ? 'var(--yard-soft)' : '#EEF0EC', color: h.came ? 'var(--yard)' : 'var(--ink-2)' }}>{h.came ? (isRu ? 'пришёл' : 'келді') : (isRu ? 'пропустил' : 'келмеді')}</span>
              </div>
            ))}
          </div>
        )}

        {/* Редактировать профиль — только свой */}
        {isSelf && (
          <div style={{ marginTop: 24 }}>
            <Button variant="secondary" icon="edit" onClick={() => openSheet('editprofile')}>{t.editProfile}</Button>
          </div>
        )}
      </div>
    </Container>
  );
}
