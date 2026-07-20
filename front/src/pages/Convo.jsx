import { useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useT } from '../i18n';
import { usePlatformStore } from '../store/usePlatformStore';
import { api } from '../lib/api';
import { useIsDesktop } from '../lib/nav';
import Icon from '../components/Icon';

// Тред диалога: шапка с «назад», лента пузырей и строка ввода снизу.
export default function Convo() {
  const t = useT();
  const { id } = useParams();
  const navigate = useNavigate();
  const convos = usePlatformStore((s) => s.convos);
  const msgDraft = usePlatformStore((s) => s.msgDraft);
  const setMsgDraft = usePlatformStore((s) => s.setMsgDraft);
  const sendMsg = usePlatformStore((s) => s.sendMsg);
  const desktop = useIsDesktop();

  const convo = convos.find((c) => c.id === id) || convos[0] || null;
  const convoSid = convo && convo.sid; // серверный id диалога ВЕРБАТИМ (mapConvo); у демо его нет
  const send = () => { if (convo) sendMsg(convo.id); };

  // Помечаем диалог прочитанным на сервере при открытии — по серверному id как есть.
  useEffect(() => {
    if (convoSid != null) api.readConversation(convoSid).catch(() => {});
  }, [convoSid]);

  // Диалогов ещё нет (не загрузились/пусто) — не падаем.
  if (!convo) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100dvh', color: 'var(--ink-3)' }}>
        <button type="button" onClick={() => navigate('/messages')} style={{ border: 'none', background: 'transparent', color: 'var(--yard)', fontSize: 15, cursor: 'pointer' }}>{t.back || '← Сообщения'}</button>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100dvh', animation: 'erik-fade var(--t-base) var(--ease-out)' }}>
      {/* Шапка: назад + имя/роль */}
      <div style={{ position: 'sticky', top: 0, zIndex: 10, display: 'flex', alignItems: 'center', gap: 12, padding: '12px 20px', background: 'rgba(244,245,241,.92)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', borderBottom: '1px solid var(--line)' }}>
        <button
          type="button"
          onClick={() => navigate('/messages')}
          aria-label="Назад"
          style={{ width: 40, height: 40, marginLeft: -8, display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none', background: 'transparent', color: 'var(--ink)', cursor: 'pointer', borderRadius: 'var(--r-s)' }}
        >
          <Icon name="back" size={20} />
        </button>
        <div>
          <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--ink)' }}>{convo.name}</div>
          <div style={{ fontSize: 12, color: 'var(--ink-3)' }}>{convo.role}</div>
        </div>
      </div>

      {/* Тред сообщений (скроллится) */}
      <div className="erik-scroll" style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8, padding: 20, maxWidth: 720, margin: '0 auto', width: '100%' }}>
        {convo.msgs.map((m, i) => (
          <div key={i} style={{ display: 'flex', flexDirection: 'column', width: '100%' }}>
            <div
              style={{
                maxWidth: '78%',
                padding: '10px 14px',
                borderRadius: 16,
                borderBottomRightRadius: m.me ? 5 : 16,
                borderBottomLeftRadius: m.me ? 16 : 5,
                fontSize: 15,
                lineHeight: 1.4,
                alignSelf: m.me ? 'flex-end' : 'flex-start',
                background: m.me ? 'var(--yard)' : 'var(--surface)',
                color: m.me ? '#fff' : 'var(--ink)',
                border: m.me ? 'none' : '1px solid var(--line)',
              }}
            >
              {m.txt}
            </div>
            <span style={{ fontSize: 10, color: m.me ? 'rgba(255,255,255,.7)' : 'var(--ink-3)', marginTop: 3, textAlign: m.me ? 'right' : 'left' }}>{m.t}</span>
          </div>
        ))}
      </div>

      {/* Строка ввода снизу (sticky, над таббаром на мобиле) */}
      <div
        style={{
          position: 'sticky',
          bottom: desktop ? 0 : 'calc(66px + env(safe-area-inset-bottom))',
          left: 0,
          right: 0,
          padding: desktop ? '14px 20px calc(14px + env(safe-area-inset-bottom))' : '14px 20px 14px',
          background: 'rgba(255,255,255,.82)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          borderTop: '1px solid var(--line)',
          zIndex: 20,
        }}
      >
        <div style={{ display: 'flex', gap: 10, maxWidth: 720, margin: '0 auto', width: '100%' }}>
          <input
            value={msgDraft}
            onChange={(e) => setMsgDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') send(); }}
            placeholder={t.typeMessage}
            style={{ flex: 1, height: 48, padding: '0 16px', border: '1px solid var(--line)', borderRadius: 999, background: 'var(--surface)', fontSize: 15 }}
          />
          <button
            type="button"
            onClick={send}
            aria-label="Отправить"
            style={{ width: 48, height: 48, flex: 'none', border: 'none', borderRadius: 999, background: 'var(--yard)', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >
            <Icon name="send" size={20} stroke={1.8} />
          </button>
        </div>
      </div>
    </div>
  );
}
