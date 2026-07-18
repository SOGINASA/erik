"""Генератор коротких кодов сбора вида PARK18 (буквы + 2 цифры).

Код — это join-токен для ссылки erik.kz/g/<code>, поэтому: без легко путаемых
символов (0/O, 1/I), проверка коллизий по БД.
"""
import random

from models import db, Gathering

# Алфавит без путаемых символов.
LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ'   # без I, O
DIGITS = '23456789'                     # без 0, 1

# Лёгкая транслитерация, чтобы код перекликался с названием (не обязателен).
_TRANSLIT = {
    'а': 'A', 'б': 'B', 'в': 'V', 'г': 'G', 'д': 'D', 'е': 'E', 'ё': 'E', 'ж': 'ZH',
    'з': 'Z', 'и': 'I', 'й': 'Y', 'к': 'K', 'л': 'L', 'м': 'M', 'н': 'N', 'о': 'O',
    'п': 'P', 'р': 'R', 'с': 'S', 'т': 'T', 'у': 'U', 'ф': 'F', 'х': 'H', 'ц': 'C',
    'ч': 'CH', 'ш': 'SH', 'щ': 'SH', 'ъ': '', 'ы': 'Y', 'ь': '', 'э': 'E', 'ю': 'U',
    'я': 'YA', 'ә': 'A', 'ғ': 'G', 'қ': 'K', 'ң': 'N', 'ө': 'O', 'ұ': 'U', 'ү': 'U',
    'һ': 'H', 'і': 'I',
}


def _prefix_from_title(title):
    """3–4 латинские буквы из названия; иначе пусто."""
    if not title:
        return ''
    out = []
    for ch in title.lower():
        if ch.isascii() and ch.isalpha():
            out.append(ch.upper())
        elif ch in _TRANSLIT:
            out.extend(list(_TRANSLIT[ch]))
        else:
            if out:
                break   # закончилось первое слово
            continue
        if len(out) >= 4:
            break
    letters = ''.join(c for c in out if c in LETTERS)[:4]
    return letters if len(letters) >= 3 else ''


def _random_letters(n):
    return ''.join(random.choice(LETTERS) for _ in range(n))


def generate_code(title=None, when=None):
    """Уникальный код. `when` (datetime) даёт цифры = день месяца, иначе случайные."""
    for _ in range(50):
        prefix = _prefix_from_title(title) or _random_letters(4)
        if when is not None:
            suffix = f'{when.day:02d}'
        else:
            suffix = ''.join(random.choice(DIGITS) for _ in range(2))
        code = f'{prefix}{suffix}'
        if not db.session.query(Gathering.id).filter_by(code=code).first():
            return code
    # крайний случай — почти невозможен
    return _random_letters(4) + ''.join(random.choice(DIGITS) for _ in range(2))
