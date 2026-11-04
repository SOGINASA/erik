import { Field } from './ui/controls';
import Button from './ui/Button';
import Icon from './Icon';
import ImageUpload from './ImageUpload';
import { useLang } from '../i18n';
import './Community.css';

export const orgProfileDefaults = (org = {}) => ({ contacts: org.contacts || {}, officeAddress: org.officeAddress || '', mapUrl: org.mapUrl || '', photos: org.photos || [], coordinators: org.coordinators || [] });

export default function OrgProfileFields({ value, onChange, disabled = false, onBusyChange }) {
  const ru = useLang() === 'ru';
  const set = (key, next) => onChange((s) => ({ ...s, [key]: next }));
  const people = value.coordinators || [];
  const photos = value.photos || [];
  return <div className="community-form">
    <fieldset disabled={disabled}><legend>{ru ? 'Контакты и офис' : 'Байланыс және кеңсе'}</legend>
      <p className="community-muted">{ru ? 'Укажите публичные контакты — волонтёры смогут связаться с вами напрямую.' : 'Ашық байланыстарды көрсетіңіз — волонтёрлер сізбен тікелей хабарласа алады.'}</p>
      <div className="community-form-grid">
        {[
          ['telegram', 'Telegram', '@your_organization'], ['instagram', 'Instagram', '@your_organization'],
          ['whatsapp', 'WhatsApp', '+7 700 000 00 00'], ['phone', ru ? 'Телефоны' : 'Телефондар', '+7 700 000 00 00'],
        ].map(([key, label, placeholder]) => <Field key={key} label={label} placeholder={placeholder} maxLength={300} value={(value.contacts || {})[key] || ''} onChange={(e) => set('contacts', { ...value.contacts, [key]: e.target.value })} />)}
        <div className="community-full"><Field label={ru ? 'Адрес офиса' : 'Кеңсе мекенжайы'} placeholder={ru ? 'Город, улица, дом, офис' : 'Қала, көше, үй, кеңсе'} maxLength={500} value={value.officeAddress || ''} onChange={(e) => set('officeAddress', e.target.value)} /></div>
        <div className="community-full"><Field label={ru ? 'Ссылка на 2ГИС / карту' : '2GIS / карта сілтемесі'} type="url" placeholder="https://2gis.kz/…" maxLength={500} value={value.mapUrl || ''} onChange={(e) => set('mapUrl', e.target.value)} /></div>
      </div>
    </fieldset>
    <fieldset disabled={disabled}><legend>{ru ? 'Наши координаторы' : 'Біздің үйлестірушілер'}</legend>
      <p className="community-muted">{ru ? 'Имя и контакт для личной связи появятся на странице организации.' : 'Аты мен жеке байланысы ұйым бетінде көрсетіледі.'}</p>
      {people.map((row, i) => <div className="community-coordinator-edit" key={i}>
        <Field label={ru ? `Имя координатора ${i + 1}` : `${i + 1}-үйлестірушінің аты`} maxLength={100} value={row.name} onChange={(e) => set('coordinators', people.map((c, j) => i === j ? { ...c, name: e.target.value } : c))} />
        <Field label={ru ? 'Telegram, телефон или ссылка' : 'Telegram, телефон немесе сілтеме'} maxLength={300} value={row.contact} onChange={(e) => set('coordinators', people.map((c, j) => i === j ? { ...c, contact: e.target.value } : c))} />
        <button className="community-icon-button" type="button" aria-label={ru ? `Удалить координатора ${i + 1}` : `${i + 1}-үйлестірушіні жою`} onClick={() => set('coordinators', people.filter((_, j) => i !== j))}><Icon name="close" size={18} /></button>
      </div>)}
      {people.length < 20 && <Button variant="secondary" onClick={() => set('coordinators', [...people, { name: '', contact: '' }])}><Icon name="plus" size={16} />{ru ? 'Добавить координатора' : 'Үйлестіруші қосу'}</Button>}
    </fieldset>
    <fieldset disabled={disabled}><legend>{ru ? 'Фотографии организации и событий' : 'Ұйым мен іс-шаралар фотолары'}</legend>
      <p className="community-muted">{ru ? 'Покажите команду, место встреч и то, чем вы занимаетесь. До 12 фотографий.' : 'Команданы, кездесу орнын және қызметіңізді көрсетіңіз. 12 фотоға дейін.'}</p>
      {photos.length < 12 && <ImageUpload multiple maxFiles={12 - photos.length} disabled={disabled} onBusyChange={onBusyChange} onUploaded={(url) => onChange((s) => ({ ...s, photos: [...(s.photos || []), url].slice(0, 12) }))} />}
      <div className="community-gallery" style={{ marginTop: 14 }}>{photos.map((url, i) => <div className="community-photo-edit" key={url + i}>
        <img src={url} alt={ru ? `Фото организации ${i + 1}` : `Ұйым фотосы ${i + 1}`} />
        <button className="community-icon-button" type="button" aria-label={ru ? `Удалить фото ${i + 1}` : `${i + 1}-фотоны жою`} onClick={() => set('photos', photos.filter((_, j) => i !== j))}><Icon name="close" size={18} /></button>
      </div>)}</div>
    </fieldset>
  </div>;
}
