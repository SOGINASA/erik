import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { useLang } from '../i18n';
import { usePlatformStore } from '../store/usePlatformStore';
import { useSessionStore } from '../store/useSessionStore';
import Button from './ui/Button';
import './Community.css';

export default function MessageParticipantButton({ userId, onOpened, label, name }) {
  const ru = useLang() === 'ru';
  const navigate = useNavigate();
  const loggedIn = useSessionStore((s) => s.loggedIn);
  const me = usePlatformStore((s) => s.me?.id);
  const pending = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const id = Number(userId);
  if (!Number.isInteger(id) || id <= 0 || id === Number(me)) return null;
  const text = label || (ru ? 'Сообщение' : 'Хабарлама');
  const open = async (e) => {
    e.stopPropagation();
    if (!loggedIn) { onOpened?.(); navigate('/login'); return; }
    if (pending.current) return;
    pending.current = true; setBusy(true); setError('');
    try {
      const result = await api.createConversation(id);
      await usePlatformStore.getState().loadConversations();
      onOpened?.();
      navigate('/messages/c' + result.conversation.id);
    } catch (err) { setError(err.message); }
    finally { pending.current = false; setBusy(false); }
  };
  return <span className="community-message" onKeyDown={(e) => e.stopPropagation()}>
    <Button variant="secondary" icon="message" loading={busy} onClick={open} aria-label={name ? `${text}: ${name}` : text}>{text}</Button>
    {error && <span role="alert" className="community-error">{error}</span>}
  </span>;
}
