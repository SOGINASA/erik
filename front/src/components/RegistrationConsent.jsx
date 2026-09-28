import { Link } from 'react-router-dom';
import Button from './ui/Button';

export const EMPTY_CONSENTS = {
  termsAccepted: false,
  privacyAccepted: false,
  consentAccepted: false,
  adultConfirmed: false,
};

export default function RegistrationConsent({ legal, loading, error, values, onChange, onRetry }) {
  const available = !loading && !error && legal?.registrationAvailable && !!legal.version;
  const documentLink = (path, text) => (
    <Link to={path} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--yard)', textDecoration: 'underline', textUnderlineOffset: 3 }}>{text}</Link>
  );
  const row = (key, children) => (
    <label key={key} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, cursor: available ? 'pointer' : 'default', minHeight: 44, fontSize: 14, lineHeight: 1.5, color: 'var(--ink-2)' }}>
      <input type="checkbox" checked={values[key]} onChange={(event) => onChange(key, event.target.checked)} disabled={!available} required
        style={{ width: 20, height: 20, margin: '1px 0 0', flexShrink: 0, accentColor: 'var(--yard)' }} />
      <span>{children}</span>
    </label>
  );

  return (
    <fieldset style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }} aria-describedby="registration-legal-note">
      <legend style={{ padding: 0, marginBottom: 10, fontFamily: 'var(--fd)', fontWeight: 600, fontSize: 18 }}>Перед регистрацией</legend>
      <p id="registration-legal-note" style={{ margin: '0 0 14px', fontSize: 13, lineHeight: 1.5, color: 'var(--ink-2)' }}>
        Прочитайте документы: ссылки откроются в новой вкладке, введённые данные сохранятся в этой форме.
      </p>
      <p style={{ margin: '0 0 14px', fontSize: 13, lineHeight: 1.5, color: 'var(--ink-2)' }}>
        Имя из профиля, город, показатели активности и история участия могут быть видны всем в профиле и рейтинге, в том числе без входа. Ограничить публичное распространение можно по обращению к оператору.
      </p>
      {loading && <p role="status" style={{ fontSize: 14, color: 'var(--ink-2)' }}>Загружаем условия регистрации…</p>}
      {!loading && !available && (
        <div role="alert" style={{ padding: 14, marginBottom: 14, border: '1px solid var(--line)', borderRadius: 'var(--r-m)', background: 'var(--paper)', fontSize: 14, lineHeight: 1.5 }}>
          <p style={{ margin: '0 0 10px' }}>{error ? 'Не удалось загрузить условия регистрации. Проверьте соединение и попробуйте ещё раз.' : 'Регистрация временно недоступна. Пожалуйста, попробуйте позже.'}</p>
          <Button type="button" variant="secondary" size="sm" onClick={onRetry}>Попробовать снова</Button>
        </div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {row('termsAccepted', <>Принимаю {documentLink('/terms', 'Пользовательское соглашение')}.</>)}
        {row('privacyAccepted', <>Ознакомился(ась) с {documentLink('/privacy', 'Политикой конфиденциальности')}.</>)}
        {row('consentAccepted', <>Даю {documentLink('/consent', 'согласие на сбор и обработку персональных данных')} для регистрации, работы сервиса и публичных функций профиля и рейтинга.</>)}
        {row('adultConfirmed', <>Подтверждаю, что мне исполнилось 18 лет, и указываю свои данные.</>)}
      </div>
      {available && (
        <p style={{ margin: '12px 0 0', color: 'var(--ink-3)', fontSize: 12, lineHeight: 1.5 }}>Оператор: {legal.operator?.name}. Согласие можно отозвать по адресу {legal.operator?.email}; порядок и последствия описаны в документах.</p>
      )}
    </fieldset>
  );
}
