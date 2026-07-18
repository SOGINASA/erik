import { useEffect, useRef } from 'react';
import { useIsDesktop } from '../../lib/nav';
import Icon from '../Icon';

// Лист/модалка (ТЗ §4.6). Мобильный — боттом-шит снизу с ручкой;
// десктоп — центральная модалка (fade + scale). Esc закрывает, фон не скроллится.
export function Sheet({ open, onClose, title, children, maxWidth = 460, footer }) {
  const desktop = useIsDesktop();
  const dialogRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialogRef.current?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(20,24,26,.4)',
        animation: 'erik-backdrop var(--t-base) var(--ease-out)',
        display: 'flex', alignItems: desktop ? 'center' : 'flex-end', justifyContent: 'center',
      }}
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === 'string' ? title : undefined}
        onClick={(e) => e.stopPropagation()}
        className="erik-scroll"
        style={
          desktop
            ? {
                width: '100%', maxWidth, margin: 20, maxHeight: 'calc(100vh - 40px)', overflowY: 'auto',
                background: 'var(--surface)', borderRadius: 'var(--r-l)', padding: 24, outline: 'none',
                boxShadow: 'var(--shadow-pop)', animation: 'erik-pop var(--t-base) var(--ease-out)',
              }
            : {
                width: '100%', maxWidth: 560, maxHeight: '90vh', overflowY: 'auto',
                background: 'var(--surface)', borderRadius: 'var(--r-l) var(--r-l) 0 0', outline: 'none',
                padding: '8px 20px calc(20px + env(safe-area-inset-bottom))',
                boxShadow: 'var(--shadow-sheet)', animation: 'erik-sheet-up var(--t-sheet) var(--ease-out)',
              }
        }
      >
        {!desktop && <div style={{ width: 36, height: 4, borderRadius: 999, background: 'var(--line)', margin: '8px auto 14px' }} />}
        {title && (
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 16 }}>
            <h2 style={{ fontFamily: 'var(--fd)', fontWeight: 600, fontSize: 21, letterSpacing: '-.01em', margin: 0 }}>{title}</h2>
            {desktop && (
              <button type="button" className="erik-btn" onClick={onClose} aria-label="Закрыть" style={{ border: 'none', background: 'transparent', color: 'var(--ink-3)', cursor: 'pointer', padding: 4, marginTop: -2 }}>
                <Icon name="close" size={20} />
              </button>
            )}
          </div>
        )}
        {children}
        {footer && <div style={{ marginTop: 20 }}>{footer}</div>}
      </div>
    </div>
  );
}
