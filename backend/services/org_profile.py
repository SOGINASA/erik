"""Validate public information explicitly supplied by an organization owner."""
from urllib.parse import urlparse


def web_url(value):
    return isinstance(value, str) and len(value) <= 500 and urlparse(value).scheme in ('http', 'https') and bool(urlparse(value).netloc)


def profile_fields(data):
    fields = {}
    for key, column in [('officeAddress', 'office_address'), ('mapUrl', 'map_url')]:
        if key in data:
            value = data[key]
            if not isinstance(value, str) or len(value) > 500:
                raise ValueError('Адрес или ссылка слишком длинные')
            if key == 'mapUrl' and value and not web_url(value):
                raise ValueError('Ссылка на карту должна начинаться с https:// или http://')
            fields[column] = value.strip()
    if 'contacts' in data:
        raw = data['contacts']
        if not isinstance(raw, dict) or set(raw) - {'telegram', 'instagram', 'whatsapp', 'phone'}:
            raise ValueError('Некорректные контакты')
        contacts = {}
        for key, value in raw.items():
            if not isinstance(value, str) or len(value) > 300:
                raise ValueError('Контакт слишком длинный')
            contacts[key] = value.strip()
        fields['contacts'] = contacts
    if 'photos' in data:
        raw = data['photos']
        if not isinstance(raw, list) or len(raw) > 12 or any(not web_url(x) for x in raw):
            raise ValueError('Можно добавить до 12 фотографий по http(s)-ссылкам')
        fields['photos'] = raw
    if 'coordinators' in data:
        raw = data['coordinators']
        if not isinstance(raw, list) or len(raw) > 20:
            raise ValueError('Можно добавить до 20 координаторов')
        rows = []
        for row in raw:
            if not isinstance(row, dict) or not isinstance(row.get('name'), str) or not row['name'].strip() or len(row['name']) > 100:
                raise ValueError('Укажите имя координатора')
            contact = row.get('contact', '')
            if not isinstance(contact, str) or len(contact) > 300:
                raise ValueError('Некорректный контакт координатора')
            rows.append({'name': row['name'].strip(), 'contact': contact.strip()})
        fields['coordinators_public'] = rows
    return fields
