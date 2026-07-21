import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useT, useLang } from '../i18n';
import { usePlatformStore } from '../store/usePlatformStore';
import { useUiStore } from '../store/useUiStore';
import { api } from '../lib/api';
import { Container } from '../components/Container';
import Avatar from '../components/ui/Avatar';
import Icon from '../components/Icon';
import { EmptyState } from '../components/ui/feedback';

const roleLabel = (role, isRu) => {
  if (role === 'org') return isRu ? 'НКО' : 'Ұйым';
  if (role === 'coord') return isRu ? 'Координатор' : 'Үйлестіруші';
  return isRu ? 'Волонтёр' : 'Волонтёр';
};

// Список диалогов + поиск пользователя по номеру телефона (или имени), чтобы написать напрямую.
export default function Messages() {
  const t = useT();
  const isRu = useLang() === 'ru';
  const navigate = useNavigate();
  const convos = usePlatformStore((s) => s.convos);
  const startConversation = usePlatformStore((s) => s.startConversation);
  const showToast = useUiStore((s) => s.showToast);

  const [q, setQ] = useState('');
  const [results, setResults] = useState(null); // null = не искали; [] = искали, пусто
  const [busy, setBusy] = useState(false);
  const [errKind, setErrKind] = useState(null);  // 'profile' (нужен профиль) | 'net' | null

  // Поиск с дебаунсом: телефон (по цифрам, ≥3) или имя (≥2 симв.). Короткие запросы игнорируем.
  useEffect(() => {
    const raw = q.trim();
    const digits = raw.replace(/\D/g, '');
    if (digits.length < 3 && raw.length < 2) { setResults(null); setBusy(false); return; }
    setBusy(true);
    const id = setTimeout(async () => {
      try {
        const res = await api.searchUsers(raw);
        setResults(res.users || []); setErrKind(null);
      } catch (err) {
        setResults([]);
        setErrKind(err && err.status === 403 ? 'profile' : 'net');
      } finally {
        setBusy(false);
      }
    }, 300);
    return () => clearTimeout(id);
  }, [q]);

  const openChat = async (userId) => {
    const cid = await startConversation(userId);
    if (cid) { setQ(''); setResults(null); navigate('/messages/' + cid); }
    else showToast(isRu ? 'Не удалось открыть чат' : 'Чатты ашу мүмкін болмады');
  };

  const searching = results !== null;

  return (
    <Container style={{ maxWidth: 720, paddingTop: 24, paddingBottom: 48 }}>
      <h1 style={{ fontFamily: 'var(--fd)', fontWeight: 600, fontSize: 28, letterSpacing: '-.02em', margin: '0 0 18px' }}>{t.messagesTitle}</h1>

      {/* поиск пользователя по номеру телефона / имени */}
      <div style={{ position: 'relative', marginBottom: 18 }}>
        <span style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--ink-3)', pointerEvents: 'none' }}><Icon name="search" size={18} /></span>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          inputMode="search"
          placeholder={isRu ? 'Поиск по номеру телефона или имени' : 'Телефон нөмірі не есім бойынша іздеу'}
          className="erik-input"
          style={{ width: '100%', height: 48, padding: '0 40px 0 42px', border: '1px solid var(--line)', borderRadius: 'var(--r-m)', background: 'var(--surface)', color: 'var(--ink)', fontSize: 15, outline: 'none' }}
        />
        {q && (
          <button type="button" onClick={() => { setQ(''); setResults(null); }} aria-label={isRu ? 'Очистить' : 'Тазалау'} style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none', background: 'transparent', color: 'var(--ink-3)', cursor: 'pointer' }}>
            <Icon name="close" size={16} />
          </button>
        )}
      </div>

      {searching ? (
        results.length ? (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <div style={{ fontSize: 12, color: 'var(--ink-3)', margin: '0 4px 6px' }}>{isRu ? 'Найдены' : 'Табылды'}</div>
            {results.map((u) => (
              <button
                key={u.id}
                type="button"
                className="erik-row-hover"
                onClick={() => openChat(u.id)}
                style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 4px', border: 'none', borderBottom: '1px solid var(--line)', background: 'transparent', cursor: 'pointer', textAlign: 'left', width: '100%' }}
              >
                <Avatar name={u.name} size={44} />
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: 'block', fontSize: 15, fontWeight: 600, color: 'var(--ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{u.name}</span>
                  <span style={{ display: 'block', fontSize: 13, color: 'var(--ink-3)' }}>
                    {roleLabel(u.role, isRu)}{u.city ? ` · ${u.city}` : ''}{u.phoneTail ? ` · ···${u.phoneTail}` : ''}
                  </span>
                </span>
                <span style={{ color: 'var(--yard)', flex: 'none' }}><Icon name="message" size={18} /></span>
              </button>
            ))}
          </div>
        ) : (
          <div style={{ padding: '28px 8px', textAlign: 'center', color: 'var(--ink-3)', fontSize: 14 }}>
            {busy
              ? (isRu ? 'Поиск…' : 'Іздеу…')
              : errKind === 'profile'
              ? (isRu ? 'Заполните имя в профиле, чтобы искать и писать' : 'Іздеу үшін профильде атыңызды толтырыңыз')
              : errKind === 'net'
              ? (isRu ? 'Нет связи с сервером — попробуйте позже' : 'Сервермен байланыс жоқ — кейінірек көріңіз')
              : (isRu ? 'Никого не найдено' : 'Ешкім табылмады')}
          </div>
        )
      ) : convos.length === 0 ? (
        <EmptyState
          icon="message"
          title={isRu ? 'Пока нет сообщений' : 'Әзірге хабар жоқ'}
          sub={isRu ? 'Найдите человека по номеру телефона выше, чтобы начать диалог.' : 'Сұхбат бастау үшін жоғарыдан адамды телефон нөмірі бойынша табыңыз.'}
        />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {convos.map((c) => {
            const last = c.msgs[c.msgs.length - 1];
            return (
              <button
                key={c.id}
                type="button"
                className="erik-row-hover"
                onClick={() => navigate('/messages/' + c.id)}
                style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 4px', border: 'none', borderBottom: '1px solid var(--line)', background: 'transparent', cursor: 'pointer', textAlign: 'left', width: '100%' }}
              >
                <Avatar name={c.name} size={48} />
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                    <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--ink)' }}>{c.name}</span>
                    <span style={{ fontSize: 11, color: 'var(--ink-3)', whiteSpace: 'nowrap' }}>{c.role}</span>
                  </span>
                  <span style={{ display: 'block', fontSize: 13, color: 'var(--ink-3)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{last ? last.txt : ''}</span>
                </span>
                <span style={{ fontSize: 11, color: 'var(--ink-3)', whiteSpace: 'nowrap', flex: 'none' }}>{last ? last.t : ''}</span>
              </button>
            );
          })}
        </div>
      )}
    </Container>
  );
}
