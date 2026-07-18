import { useNavigate } from 'react-router-dom';
import { useT, useLang } from '../i18n';
import { usePlatformStore } from '../store/usePlatformStore';
import { Container } from '../components/Container';
import Avatar from '../components/ui/Avatar';
import { EmptyState } from '../components/ui/feedback';

// Список диалогов: аватар, имя + роль, последнее сообщение и время.
export default function Messages() {
  const t = useT();
  const isRu = useLang() === 'ru';
  const navigate = useNavigate();
  const convos = usePlatformStore((s) => s.convos);

  return (
    <Container style={{ maxWidth: 720, paddingTop: 24, paddingBottom: 48 }}>
      <h1 style={{ fontFamily: 'var(--fd)', fontWeight: 600, fontSize: 28, letterSpacing: '-.02em', margin: '0 0 18px' }}>{t.messagesTitle}</h1>

      {convos.length === 0 ? (
        <EmptyState
          icon="message"
          title={isRu ? 'Пока нет сообщений' : 'Әзірге хабар жоқ'}
          sub={isRu ? 'Здесь появятся ваши диалоги с организациями и координаторами.' : 'Мұнда ұйымдармен және координаторлармен сұхбаттарыңыз пайда болады.'}
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
