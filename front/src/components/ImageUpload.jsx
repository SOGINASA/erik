import { useState } from 'react';
import { api } from '../lib/api';
import { useLang } from '../i18n';

export default function ImageUpload({ onUploaded, multiple = false }) {
  const isRu = useLang() === 'ru';
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const upload = async (e) => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    setError(''); setBusy(true);
    try {
      for (const file of files) {
        if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024) throw new Error(isRu ? 'Выберите PNG, JPEG или WebP до 5 МБ' : '5 МБ дейін PNG, JPEG немесе WebP таңдаңыз');
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
    finally { setBusy(false); }
  };
  return <div><label style={{ display: 'block', margin: '10px 0' }}>
    {busy ? (isRu ? 'Загружаем…' : 'Жүктелуде…') : (isRu ? 'Загрузить фото с компьютера' : 'Компьютерден фото жүктеу')}
    <input aria-label={isRu ? 'Загрузить фото' : 'Фото жүктеу'} type="file" accept="image/jpeg,image/png,image/webp" multiple={multiple} disabled={busy} onChange={upload} style={{ display: 'block', marginTop: 8, maxWidth: '100%' }} />
  </label>{error && <p role="alert" style={{ color: 'var(--out)' }}>{error}</p>}</div>;
}
