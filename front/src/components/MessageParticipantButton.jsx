import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { useLang } from '../i18n';
import { usePlatformStore } from '../store/usePlatformStore';

export default function MessageParticipantButton({ userId }) {
  const ru = useLang() === 'ru';
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  if (!userId) return null;
  const open = async (e) => {
    e.stopPropagation(); setBusy(true); setError('');
    try { const r = await api.createConversation(Number(userId)); await usePlatformStore.getState().loadConversations(); navigate('/messages/c' + r.conversation.id); }
    catch (err) { setError(err.message); } finally { setBusy(false); }
  };
  return <span><button type="button" disabled={busy} onClick={open} style={{ padding: '10px 16px', border: '1px solid var(--line)', borderRadius: 10, cursor: 'pointer' }}>{ru ? 'Сообщение' : 'Хабарлама'}</button>{error && <span role="alert">{error}</span>}</span>;
}
