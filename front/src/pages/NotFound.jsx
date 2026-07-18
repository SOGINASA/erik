import { useNavigate } from 'react-router-dom';
import { useT } from '../i18n';
import { Container } from '../components/Container';
import Button from '../components/ui/Button';

export default function NotFound() {
  const t = useT();
  const navigate = useNavigate();
  return (
    <Container style={{ minHeight: '60dvh', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'flex-start', paddingTop: 48, paddingBottom: 48 }}>
      <h1 style={{ fontFamily: 'var(--fd)', fontWeight: 600, fontSize: 30, letterSpacing: '-.02em', margin: '0 0 8px' }}>{t.nf}</h1>
      <p style={{ fontSize: 14, color: 'var(--ink-2)', margin: '0 0 20px' }}>{t.nfSub}</p>
      <Button onClick={() => navigate('/feed')}>{t.home}</Button>
    </Container>
  );
}
