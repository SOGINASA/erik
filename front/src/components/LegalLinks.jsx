import { Link } from 'react-router-dom';
import { useLang } from '../i18n';

export default function LegalLinks({ compact = false }) {
  const isRu = useLang() === 'ru';
  return (
    <nav className={`legal-links${compact ? ' legal-links-compact' : ''}`} aria-label={isRu ? 'Правовые документы' : 'Құқықтық құжаттар'}>
      <Link to="/terms">{isRu ? 'Условия использования' : 'Пайдалану шарттары'}</Link>
      <Link to="/privacy">{isRu ? 'Конфиденциальность' : 'Құпиялылық'}</Link>
      <Link to="/consent">{isRu ? 'Согласие на обработку данных' : 'Деректерді өңдеуге келісім'}</Link>
    </nav>
  );
}
