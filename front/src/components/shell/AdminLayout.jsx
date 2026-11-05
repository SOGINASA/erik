import { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { ADMIN_SECTIONS } from '../admin/nav';
import { useSessionStore } from '../../store/useSessionStore';
import { useUiStore } from '../../store/useUiStore';
import { useLang } from '../../i18n';
import { Logo, LangToggle } from './Brand';
import Avatar from '../ui/Avatar';
import Icon from '../Icon';
import './AdminLayout.css';

// One admin workspace on every route, including public profiles opened for review.
export default function AdminLayout({ desktop, children }) {
  const navigate = useNavigate();
  const ru = useLang() === 'ru';
  const name = useSessionStore((s) => s.name);
  const logout = useSessionStore((s) => s.logout);
  const showToast = useUiStore((s) => s.showToast);
  const [busy, setBusy] = useState(false);
  const signOut = async () => {
    if (busy) return;
    setBusy(true);
    try { await logout(); navigate('/login', { replace: true }); }
    catch (err) { showToast(err.message || (ru ? 'Не удалось выйти. Повторите попытку.' : 'Шығу мүмкін болмады. Қайталап көріңіз.')); }
    finally { setBusy(false); }
  };
  const brand = <div className="erik-admin-brand"><Logo size={24} onClick={() => navigate('/admin')} /><span>{ru ? 'АДМИН' : 'ӘКІМШІ'}</span></div>;
  const exit = <button type="button" className="erik-admin-logout erik-row-hover" disabled={busy} onClick={signOut} aria-label={ru ? 'Выйти из аккаунта' : 'Аккаунттан шығу'}><Icon name="external" size={18} /><span>{busy ? (ru ? 'Выходим…' : 'Шығуда…') : (ru ? 'Выйти' : 'Шығу')}</span></button>;
  const navigation = <nav className="erik-admin-nav erik-scroll" aria-label={ru ? 'Разделы администрирования' : 'Әкімшілік бөлімдер'}>
    {ADMIN_SECTIONS.map((section) => <NavLink key={section.id} to={section.path} end={section.id === 'overview'} className={({ isActive }) => `erik-admin-link${isActive ? ' is-active' : ''}`}><Icon name={section.icon} size={20} /><span>{section.label}</span></NavLink>)}
  </nav>;
  return <div className={`erik-admin-layout ${desktop ? 'is-desktop' : 'is-mobile'}`}>
    {desktop ? <aside className="erik-admin-sidebar erik-scroll">
      {brand}{navigation}
      <div className="erik-admin-account">
        <div className="erik-admin-identity"><Avatar name={name || ''} size={38} /><div><strong>{name || (ru ? 'Администратор' : 'Әкімші')}</strong><small>{ru ? 'Администратор' : 'Әкімші'}</small></div></div>
        {exit}<LangToggle surface="var(--paper)" />
      </div>
    </aside> : <header className="erik-admin-mobile-header">
      <div className="erik-admin-mobile-top">{brand}<div className="erik-admin-actions"><LangToggle />{exit}</div></div>
      {navigation}
    </header>}
    <main className="erik-admin-content">{children}</main>
  </div>;
}
