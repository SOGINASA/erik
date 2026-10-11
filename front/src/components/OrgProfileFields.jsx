import { Field } from './ui/controls';
import ImageUpload from './ImageUpload';
import { useLang } from '../i18n';

export const orgProfileDefaults = (org = {}) => ({ contacts: org.contacts || {}, officeAddress: org.officeAddress || '', mapUrl: org.mapUrl || '', photos: org.photos || [], coordinators: org.coordinators || [] });

export default function OrgProfileFields({ value, onChange }) {
  const ru = useLang() === 'ru';
  const set = (key, next) => onChange((s) => ({ ...s, [key]: next }));
  return <div style={{ display: 'grid', gap: 14 }}>
    <h3>{ru ? 'Контакты организации' : 'Ұйымның байланыстары'}</h3>
    {['telegram', 'instagram', 'whatsapp', 'phone'].map((key) => <Field key={key} label={{ telegram: 'Telegram', instagram: 'Instagram', whatsapp: 'WhatsApp', phone: ru ? 'Телефоны' : 'Телефондар' }[key]} value={(value.contacts || {})[key] || ''} onChange={(e) => set('contacts', { ...value.contacts, [key]: e.target.value })} />)}
    <Field label={ru ? 'Адрес офиса' : 'Кеңсе мекенжайы'} value={value.officeAddress || ''} onChange={(e) => set('officeAddress', e.target.value)} />
    <Field label={ru ? 'Ссылка на 2ГИС / карту' : '2GIS / карта сілтемесі'} value={value.mapUrl || ''} onChange={(e) => set('mapUrl', e.target.value)} />
    <h3>{ru ? 'Наши координаторы' : 'Біздің үйлестірушілер'}</h3>
    <p>{ru ? 'Эти имена и контакты будут видны на странице организации.' : 'Бұл есімдер мен байланыстар ұйым бетінде көрсетіледі.'}</p>
    {(value.coordinators || []).map((row, i) => <div key={i} style={{ display: 'grid', gap: 8 }}>
      <Field label={ru ? 'Имя' : 'Аты'} value={row.name} onChange={(e) => set('coordinators', value.coordinators.map((c, j) => i === j ? { ...c, name: e.target.value } : c))} />
      <Field label={ru ? 'Контакт' : 'Байланыс'} value={row.contact} onChange={(e) => set('coordinators', value.coordinators.map((c, j) => i === j ? { ...c, contact: e.target.value } : c))} />
      <button type="button" onClick={() => set('coordinators', value.coordinators.filter((_, j) => i !== j))}>{ru ? 'Удалить координатора' : 'Үйлестірушіні жою'}</button>
    </div>)}
    {(value.coordinators || []).length < 20 && <button type="button" onClick={() => set('coordinators', [...(value.coordinators || []), { name: '', contact: '' }])}>{ru ? 'Добавить координатора' : 'Үйлестіруші қосу'}</button>}
    <h3>{ru ? 'Фотографии организации и событий' : 'Ұйым мен іс-шаралар фотолары'}</h3>
    {(value.photos || []).length < 12 && <ImageUpload onUploaded={(url) => onChange((s) => ({ ...s, photos: [...(s.photos || []), url].slice(0, 12) }))} />}
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>{(value.photos || []).map((url, i) => <div key={url + i}><img src={url} alt={ru ? 'Фото организации' : 'Ұйым фотосы'} style={{ width: 120, height: 90, objectFit: 'cover', borderRadius: 8 }} /><button type="button" onClick={() => set('photos', value.photos.filter((_, j) => i !== j))}>{ru ? 'Удалить' : 'Жою'}</button></div>)}</div>
  </div>;
}
