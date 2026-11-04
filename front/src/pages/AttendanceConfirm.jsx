import { useEffect, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { api } from '../lib/api';
import { useLang } from '../i18n';
import { useSessionStore } from '../store/useSessionStore';
import { Container } from '../components/Container';
import { Logo, LangToggle } from '../components/shell/Brand';
import Button from '../components/ui/Button';

const errors = {
  expired_qr: ['QR-код истёк. Отсканируйте новый код у организатора.', 'QR-кодтың мерзімі өтті. Ұйымдастырушының жаңа кодын сканерлеңіз.'],
  invalid_qr: ['QR-код недействителен. Отсканируйте код у организатора ещё раз.', 'QR-код жарамсыз. Ұйымдастырушының кодын қайта сканерлеңіз.'],
  not_registered: ['Вы не записаны на этот сбор. Обратитесь к организатору.', 'Сіз бұл жиынға жазылмағансыз. Ұйымдастырушыға хабарласыңыз.'],
  closed: ['Сбор закрыт для отметки явки.', 'Жиынға келуді белгілеу жабық.'],
  not_found: ['Сбор не найден.', 'Жиын табылмады.'],
  login_required: ['Войдите в аккаунт, с которого записывались на сбор.', 'Жиынға жазылған аккаунтыңызға кіріңіз.'],
  network: ['Не удалось связаться с сервером. Проверьте интернет и попробуйте снова.', 'Сервермен байланыс жоқ. Интернетті тексеріп, қайталап көріңіз.'],
};

export default function AttendanceConfirm() {
  const { id } = useParams();
  const location = useLocation();
  const qrToken = location.hash.slice(1);
  const ru = useLang() === 'ru';
  const booted = useSessionStore((s) => s.booted);
  const sessionToken = useSessionStore((s) => s.token);
  const [details, setDetails] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [retry, setRetry] = useState(0);
  const returnTo = encodeURIComponent(location.pathname + location.hash);
  const login = `/login?returnTo=${returnTo}`;

  useEffect(() => {
    let alive = true;
    setDetails(null);
    setError(null);
    if (!qrToken) { setError('invalid_qr'); return undefined; }
    if (!booted) return undefined;
    if (!sessionToken) { setError('login_required'); return undefined; }
    api.previewAttendance(id, qrToken).then((data) => { if (alive) setDetails(data); })
      .catch((err) => { if (alive) setError(err.status === 401 ? 'login_required' : err.data?.code || 'network'); });
    return () => { alive = false; };
  }, [id, qrToken, booted, sessionToken, retry]);

  const confirm = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try { setDetails(await api.confirmAttendance(id, qrToken)); }
    catch (err) { setError(err.status === 401 ? 'login_required' : err.data?.code || 'network'); }
    finally { setBusy(false); }
  };
  const success = details?.presence === 'came';
  return (
    <main style={{ minHeight: '100dvh', background: 'var(--paper)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', padding: 20 }}><Logo size={24} /><LangToggle /></div>
      <Container narrow style={{ paddingTop: 32, paddingBottom: 48 }}>
        <section style={{ maxWidth: 480, margin: '0 auto', padding: 24, borderRadius: 'var(--r-m)', border: '1px solid var(--line)', background: 'var(--surface)' }}>
          <h1 style={{ margin: '0 0 16px', fontFamily: 'var(--fd)', fontSize: 28 }}>{success ? (ru ? 'Приход подтверждён' : 'Келу расталды') : (ru ? 'Подтвердить приход' : 'Келуді растау')}</h1>
          {details && <><h2 style={{ fontSize: 19 }}>{(!ru && details.titleKz) || details.title}</h2><p style={{ color: 'var(--ink-2)' }}>{details.participantName}</p></>}
          {success ? <p role="status" style={{ lineHeight: 1.6 }}>{ru ? 'Вы отмечены в списке организатора. Спасибо, что пришли!' : 'Сіз ұйымдастырушының тізімінде белгілендіңіз. Келгеніңізге рақмет!'}</p>
            : error ? <div>
              <p role="alert" style={{ lineHeight: 1.6 }}>{(errors[error] || errors.network)[ru ? 0 : 1]}</p>
              {(error === 'login_required' || error === 'not_registered') && <Link to={login}>{ru ? 'Войти в свой аккаунт' : 'Аккаунтқа кіру'}</Link>}
              {error === 'network' && <Button full onClick={() => setRetry(retry + 1)}>{ru ? 'Повторить' : 'Қайталау'}</Button>}
            </div> : details ? <>
              <p style={{ lineHeight: 1.6 }}>{ru ? 'Нажмите кнопку, если вы уже на месте проведения мероприятия.' : 'Іс-шара өтетін жерге келген болсаңыз, батырманы басыңыз.'}</p>
              <Button full size="lg" loading={busy} onClick={confirm}>{ru ? 'Я на месте' : 'Мен келдім'}</Button>
            </> : <p role="status">{ru ? 'Проверяем QR-код…' : 'QR-код тексерілуде…'}</p>}
          <p style={{ margin: '24px 0 0' }}><Link to={`/e/e${id}`}>{ru ? 'Открыть мероприятие' : 'Іс-шараны ашу'}</Link></p>
        </section>
      </Container>
    </main>
  );
}
