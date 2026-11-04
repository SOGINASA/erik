import { useRef, useState } from 'react';
import { api } from '../lib/api';
import { useLang } from '../i18n';
import Button from './ui/Button';
import './Community.css';

export default function ImageUpload({ onUploaded, multiple = false, maxFiles = 12, value, disabled = false, onBusyChange }) {
  const isRu = useLang() === 'ru';
  const pending = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const upload = async (e) => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    if (!files.length || pending.current || disabled) return;
    setError('');
    if (files.length > maxFiles) { setError(isRu ? `Можно добавить ещё ${maxFiles} фото` : `Тағы ${maxFiles} фото қосуға болады`); return; }
    if (files.some((file) => !['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || !file.size || file.size > 5 * 1024 * 1024)) {
      setError(isRu ? 'Выберите PNG, JPEG или WebP до 5 МБ' : '5 МБ дейін PNG, JPEG немесе WebP таңдаңыз'); return;
    }
    pending.current = true; setBusy(true); onBusyChange?.(true);
    try {
      for (const file of files) {
        const data = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result);
          reader.onerror = () => reject(new Error(isRu ? 'Не удалось прочитать фото' : 'Фото оқылмады'));
          reader.readAsDataURL(file);
        });
        const result = await api.uploadImage(data);
        onUploaded(result.url);
      }
    } catch (err) { setError(err.message); }
    finally { pending.current = false; setBusy(false); onBusyChange?.(false); }
  };
  return <div className="community-upload" aria-busy={busy}><label>
    {busy ? (isRu ? 'Загружаем…' : 'Жүктелуде…') : (isRu ? 'Загрузить фото с компьютера' : 'Компьютерден фото жүктеу')}
    <input aria-label={isRu ? 'Загрузить фото' : 'Фото жүктеу'} type="file" accept="image/jpeg,image/png,image/webp" multiple={multiple} disabled={busy || disabled} onChange={upload} />
  </label><p>{isRu ? 'PNG, JPEG или WebP · до 5 МБ на фотографию' : 'PNG, JPEG немесе WebP · әр фото 5 МБ дейін'}</p>
    {value && <div className="community-upload-preview"><img src={value} alt={isRu ? 'Обложка события' : 'Іс-шара мұқабасы'} /><Button variant="ghost" disabled={busy || disabled} onClick={() => onUploaded('')}>{isRu ? 'Убрать фото' : 'Фотоны алып тастау'}</Button></div>}
    {busy && <p role="status">{isRu ? 'Дождитесь загрузки перед сохранением.' : 'Сақтамас бұрын жүктеудің аяқталуын күтіңіз.'}</p>}
    {error && <div role="alert" className="community-error">{error}</div>}</div>;
}
