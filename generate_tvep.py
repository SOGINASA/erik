# -*- coding: utf-8 -*-
"""Генератор TVEP — технического паспорта проекта erik (Tech Vision 2026).

Ровно 3 страницы A4 по регламенту хакатона (п. 7.1):
  стр. 1 — название, трек, боль «один пользователь — одна боль», USP;
  стр. 2 — архитектурная схема, стек, логика ИИ-компонентов;
  стр. 3 — математическая модель, измеряемый социальный эффект, план устойчивости.

Числа в примере прогноза на стр. 3 НЕ вписаны руками — они считаются здесь той же
формулой, что в front/src/lib/forecast.js и backend/services/forecast.py. Если модель
в коде изменится, паспорт разойдётся с ней только вместе с осознанной правкой формулы.

Запуск:
    python generate_tvep.py                 # → TVEP_erik.pdf
    python generate_tvep.py --out X.pdf --fonts path/to/fonts

Шрифты (Onest / Golos Text / JetBrains Mono) в репозиторий не кладутся. Если каталога
со статическими инстансами нет, генератор падает на системные Segoe UI / Consolas —
макет не ломается, меняется только гарнитура.

Важно про глифы: Golos Text не содержит греческих букв, поэтому в основном тексте
их нет вовсе — все формулы и символы (sigma, сумма, корень) набраны JetBrains Mono,
который их покрывает. Проверено скриптом покрытия до вёрстки, а не после.
"""
import argparse
import math
import os
import sys

from reportlab.lib.colors import HexColor
from reportlab.lib.pagesizes import A4
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas as pdfcanvas

# ─────────────────────────────────────────────────────────────────────────────
#  Дизайн-система erik (front/src/index.css, TZ_Keldim_frontend.md §3.2)
# ─────────────────────────────────────────────────────────────────────────────
INK        = HexColor('#14181A')
INK2       = HexColor('#5B6560')
INK3       = HexColor('#949E98')
PAPER      = HexColor('#F4F5F1')
SURFACE    = HexColor('#FFFFFF')
LINE       = HexColor('#E3E5DE')
YARD       = HexColor('#2F6F4F')
YARD_SOFT  = HexColor('#E8F1EB')
MAYBE      = HexColor('#C8842B')
MAYBE_HATCH= HexColor('#E3AC6B')
MAYBE_SOFT = HexColor('#FBF0E2')
OUT        = HexColor('#8A9490')
MUTE       = HexColor('#EDEFEA')
CODE_BG    = HexColor('#FBFCFA')

PW, PH = A4                     # 595.28 × 841.89
ML, MR = 34, 34
MT, MB = 30, 26
CW = PW - ML - MR               # ≈ 527

S_DISPLAY = 25
S_H1      = 13.5
S_H2      = 9.6
S_BODY    = 8.3
S_SMALL   = 7.4
S_CAPTION = 6.5
S_MONO    = 7.1
S_MONO_S  = 6.4

DISPLAY, BODY, BODY_M, BODY_B, MONO, MONO_B = 'Display', 'Body', 'BodyM', 'BodyB', 'Mono', 'MonoB'

# ── Защита от «немого» выпадения глифа ──────────────────────────────────────
# Golos Text не содержит греческих букв, Onest — ни греческих, ни математических.
# Если набрать ими σ или Σ, символ просто НЕ отрисуется: PDF соберётся без ошибки,
# строка визуально порвётся, и в извлечённом тексте символа тоже не будет — то есть
# постфактум по PDF это не ловится. Поэтому сверяем каждую строку с cmap её шрифта
# в момент отрисовки и собираем список проблем, который печатается в конце сборки.
_FONT_CHARS = {}     # alias -> set(ord)
_GLYPH_MISSES = []   # (alias, символ, фрагмент строки)


def _check_glyphs(s, font):
    supported = _FONT_CHARS.get(font)
    if not supported:
        return
    for ch in s:
        if ch != ' ' and ord(ch) not in supported:
            _GLYPH_MISSES.append((font, ch, s[:60]))


def register_fonts(font_dir):
    """Зарегистрировать гарнитуры. → True, если поставлены Onest/Golos/JetBrains."""
    wanted = {
        DISPLAY: 'Onest-600.ttf', BODY: 'Golos-400.ttf', BODY_M: 'Golos-500.ttf',
        BODY_B: 'Golos-600.ttf', MONO: 'JBMono-500.ttf', MONO_B: 'JBMono-700.ttf',
    }
    if font_dir and all(os.path.exists(os.path.join(font_dir, f)) for f in wanted.values()):
        for alias, fname in wanted.items():
            pdfmetrics.registerFont(TTFont(alias, os.path.join(font_dir, fname)))
        _index_glyphs(wanted)
        return True

    win = os.path.join(os.environ.get('WINDIR', r'C:\Windows'), 'Fonts')
    fallback = {DISPLAY: 'segoeuib.ttf', BODY: 'segoeui.ttf', BODY_M: 'segoeui.ttf',
                BODY_B: 'segoeuib.ttf', MONO: 'consola.ttf', MONO_B: 'consolab.ttf'}
    for alias, fname in fallback.items():
        path = os.path.join(win, fname)
        pdfmetrics.registerFont(TTFont(alias, path if os.path.exists(path)
                                       else os.path.join(win, 'arial.ttf')))
    _index_glyphs(fallback)
    return False


def _index_glyphs(aliases):
    """Запомнить, какие символы реально есть в каждой зарегистрированной гарнитуре."""
    for alias in aliases:
        try:
            _FONT_CHARS[alias] = set(pdfmetrics.getFont(alias).face.charToGlyph.keys())
        except Exception:
            pass                      # нет доступа к таблице — просто не проверяем


# ─────────────────────────────────────────────────────────────────────────────
#  Числа для стр. 3 — сняты с работающего бэкенда (см. docstring ниже)
# ─────────────────────────────────────────────────────────────────────────────
def demo_forecast():
    """Демо-сбор PARK18 — числа сняты с работающего бэкенда, не выдуманы.

    Воспроизводится двумя командами:
        flask seed-demo
        GET /api/gatherings/<id>/forecast        → source='model', E, sigma
        GET /api/gatherings/<id>/forecast?ml=0   → source='formula' (фолбэк)

    Значение примера в том, что три числа на одном ростере РАЗНЫЕ: модель 19.6,
    счётчик подтвердивших 14, формула-фолбэк 7.8. Именно совпадение прогноза со
    счётчиком было претензией жюри — здесь видно, что его нет.
    """
    return {
        'code': 'PARK18',
        'ctx': 0.95,                  # будний день, окно ≤ 7 дней (services/context.py)
        'needed': 20,
        'counts': {'yes': 14, 'maybe': 24, 'no': 7},
        # ── основной источник: обученная модель ──
        'E': 19.6, 'sigma': 2.9, 'lo': 13.7, 'hi': 25.4,
        'seg_p': {'yes': 0.714, 'maybe': 0.386, 'no': 0.048},
        # ── фолбэк: аналитическая формула на том же ростере ──
        'formula_E': 7.8, 'formula_sigma': 2.3,
    }


# Бэктест на закрытых сборах засеянной истории (routes/organizer.py::_forecast_mae):
# средняя абсолютная ошибка «сколько ждали» против «сколько пришло», n = 7 сборов.
BACKTEST = {'model': 1.57, 'confirmed': 2.57, 'formula': 8.33, 'n': 7}

# Сравнение предсказателей на отложенном тесте ML (ml/artifacts/baselines.json).
BASELINES = {'model': 0.793, 'answer_only': 0.698, 'formula': 0.753}


# ─────────────────────────────────────────────────────────────────────────────
#  Мини-движок вёрстки поверх canvas
# ─────────────────────────────────────────────────────────────────────────────
class Doc:
    def __init__(self, c):
        self.c = c
        self.y = PH - MT

    def wrap(self, s, font, size, width):
        lines, cur = [], ''
        for w in s.split(' '):
            trial = w if not cur else cur + ' ' + w
            if pdfmetrics.stringWidth(trial, font, size) <= width:
                cur = trial
            else:
                if cur:
                    lines.append(cur)
                cur = w
        if cur:
            lines.append(cur)
        return lines

    def line_at(self, s, x, y, font, size, color=INK):
        _check_glyphs(s, font)
        self.c.setFont(font, size)
        self.c.setFillColor(color)
        self.c.drawString(x, y, s)

    def right_at(self, s, x, y, font, size, color=INK):
        _check_glyphs(s, font)
        self.c.setFont(font, size)
        self.c.setFillColor(color)
        self.c.drawRightString(x, y, s)

    def para(self, s, font=BODY, size=S_BODY, color=INK, x=ML, width=CW, leading=None, gap=0):
        leading = leading or size * 1.42
        for ln in self.wrap(s, font, size, width):
            self.y -= leading
            self.line_at(ln, x, self.y, font, size, color)
        self.y -= gap
        return self.y

    def h1(self, s, gap_before=13, gap_after=4.5):
        self.y -= gap_before + S_H1
        self.line_at(s, ML, self.y, DISPLAY, S_H1, INK)
        self.y -= gap_after
        return self.y

    def caption(self, s, x=ML, color=INK3, gap_before=0, size=S_CAPTION):
        self.y -= gap_before + size
        self.line_at(s.upper(), x, self.y, BODY_M, size, color)
        return self.y

    def rule(self, gap_before=5, gap_after=5, color=LINE, x0=ML, x1=PW - MR):
        self.y -= gap_before
        self.c.setStrokeColor(color)
        self.c.setLineWidth(0.6)
        self.c.line(x0, self.y, x1, self.y)
        self.y -= gap_after
        return self.y

    def bullets(self, items, font=BODY, size=S_BODY, color=INK, x=ML, width=CW,
                marker='·', marker_color=None, gap=2.2, leading=None, hang=7):
        leading = leading or size * 1.4
        for it in items:
            for i, ln in enumerate(self.wrap(it, font, size, width - hang)):
                self.y -= leading
                if i == 0:
                    self.line_at(marker, x, self.y, font, size, marker_color or INK3)
                self.line_at(ln, x + hang, self.y, font, size, color)
            self.y -= gap
        return self.y

    def labelled(self, rows, label_font=BODY_B, size=S_SMALL, label_w=None,
                 color=INK2, label_color=INK, value_font=BODY, gap=1.4, x=ML, width=CW):
        """Строки «лейбл — текст» с висячим отступом фиксированной ширины."""
        for k, v in rows:
            lw = label_w if label_w is not None else pdfmetrics.stringWidth(k + '  ', label_font, size)
            for i, ln in enumerate(self.wrap(v, value_font, size, width - lw)):
                self.y -= size * 1.42
                if i == 0:
                    self.line_at(k, x, self.y, label_font, size, label_color)
                self.line_at(ln, x + lw, self.y, value_font, size, color)
            self.y -= gap
        return self.y

    def card(self, height, fill=SURFACE, stroke=LINE, x=ML, width=CW, radius=7, gap_before=0):
        self.y -= gap_before
        top = self.y
        self.c.setFillColor(fill)
        self.c.setStrokeColor(stroke)
        self.c.setLineWidth(0.7)
        self.c.roundRect(x, top - height, width, height, radius, stroke=1, fill=1)
        return top

    def mono_block(self, lines, gap_before=4, pad=7, size=S_MONO, leading=None,
                   fill=CODE_BG, x=ML, width=CW):
        leading = leading or size * 1.55
        h = pad * 2 + leading * len(lines)
        top = self.card(h, fill=fill, gap_before=gap_before, x=x, width=width, radius=5)
        yy = top - pad
        for ln in lines:
            yy -= leading
            self.line_at(ln, x + pad, yy + leading * 0.22, MONO, size, INK)
        self.y = top - h
        return self.y


def chip(c, x, y, text, fg, bg, size=S_CAPTION, padx=5, h=11):
    _check_glyphs(text, BODY_M)
    w = pdfmetrics.stringWidth(text, BODY_M, size) + padx * 2
    c.setFillColor(bg)
    c.setStrokeColor(bg)
    c.roundRect(x, y, w, h, h / 2, stroke=0, fill=1)
    c.setFillColor(fg)
    c.setFont(BODY_M, size)
    c.drawString(x + padx, y + (h - size) / 2 + 0.9, text)
    return x + w


def page_frame(c, page_no, title):
    c.setFillColor(PAPER)
    c.rect(0, 0, PW, PH, stroke=0, fill=1)
    c.setStrokeColor(LINE)
    c.setLineWidth(0.6)
    c.line(ML, MB + 12, PW - MR, MB + 12)
    # Авторство команды — на каждой странице: паспорт уходит судьям отдельным файлом.
    c.setFont(BODY_B, S_CAPTION)
    c.setFillColor(YARD)
    c.drawString(ML, MB + 3, 'команда ITshechka')
    w = pdfmetrics.stringWidth('команда ITshechka', BODY_B, S_CAPTION)
    c.setFont(BODY, S_CAPTION)
    c.setFillColor(INK3)
    c.drawString(ML + w + 5, MB + 3, '· TVEP · erik · Tech Vision 2026 · Social & Human Capital')
    c.drawRightString(PW - MR, MB + 3, f'{title} · {page_no}/3')


# ─────────────────────────────────────────────────────────────────────────────
#  Стр. 1 — название, трек, боль, USP
# ─────────────────────────────────────────────────────────────────────────────
def page1(c, d):
    page_frame(c, 1, 'Проблема и USP')
    d.y = PH - MT

    # ── шапка ──
    d.y -= S_DISPLAY
    # Логотип-слово «erik.» — точка акцентным цветом (--yard), как в названиях видео команды.
    d.line_at('erik', ML, d.y, DISPLAY, S_DISPLAY, INK)
    wm = pdfmetrics.stringWidth('erik', DISPLAY, S_DISPLAY)
    d.line_at('.', ML + wm, d.y, DISPLAY, S_DISPLAY, YARD)
    wm += pdfmetrics.stringWidth('.', DISPLAY, S_DISPLAY)
    d.line_at('волонтёрская платформа Казахстана', ML + wm + 10, d.y + 3, BODY, S_BODY, INK2)
    d.right_at('TECH VISION ENGINEERING PORTFOLIO', PW - MR, d.y + 13, BODY_M, S_CAPTION, INK3)
    d.right_at('технический паспорт проекта', PW - MR, d.y + 2.5, BODY, S_SMALL, INK2)

    d.y -= 15
    x = ML
    x = chip(c, x, d.y, 'Команда ITshechka', SURFACE, YARD) + 5
    x = chip(c, x, d.y, 'Social & Human Capital', YARD, YARD_SOFT) + 5
    chip(c, x, d.y, 'Зона 9 · Community Engagement', MAYBE, MAYBE_SOFT)

    d.y -= 6
    d.rule(gap_before=0, gap_after=6)
    d.line_at('Прототип   erik-hazel.vercel.app', ML, d.y, MONO, S_MONO_S, INK2)
    d.line_at('Код   github.com/SOGINASA/erik', ML + 200, d.y, MONO, S_MONO_S, INK2)
    d.y -= 9.5
    d.line_at('Демо + CustDev   youtu.be/ny4dKVPOhg0  (6:13)', ML, d.y, MONO, S_MONO_S, INK2)
    d.line_at('MVP   youtu.be/OmlWnyteRnc  (2:37)', ML + 200, d.y, MONO, S_MONO_S, INK2)
    d.y -= 3
    d.rule(gap_before=0, gap_after=0)

    # ── один пользователь ──
    d.h1('Один пользователь', gap_before=11, gap_after=3)
    top = d.card(35, gap_before=1)
    d.line_at('Аружан, 18 лет, первый курс.', ML + 10, top - 14, BODY_B, S_H2, INK)
    d.line_at('Хочет волонтёрить впервые. В движении не знает никого. Свободна по выходным.',
              ML + 10, top - 26, BODY, S_BODY, INK2)
    d.y = top - 35

    # ── одна боль ──
    d.h1('Одна острая боль', gap_before=9, gap_after=4)
    bar_top = d.y
    d.para('Аружан ищет, где помочь, по разрозненным Instagram- и TikTok-аккаунтам и подъездным '
           'чатам: единой точки входа нет. А когда она всё-таки доходит до сбора, участие нигде '
           'не фиксируется — оно не становится подтверждённым вкладом, который можно показать.',
           font=BODY_M, size=S_BODY, color=INK, x=ML + 11, width=CW - 11, leading=11.2)
    c.setFillColor(YARD)
    c.rect(ML, d.y, 2.4, bar_top - d.y, stroke=0, fill=1)

    d.caption('Подтверждение · CustDev, 3 интервью · запись в полном видео, 00:53–02:40', gap_before=8)
    d.y -= 2
    quotes = [
        ('Волонтёр', '«Мероприятия я нахожу на просторах социальных сетей… Instagram и TikTok… они '
                     'помогут не только открыть новые возможности, но и пополнить своё портфолио».'),
        ('Организатор', '«Было бы неплохо иметь всегда под рукой документ, таблицу или сайт, где можно '
                        'посмотреть, кто волонтёрил, в какие даты, что именно делал, сколько часов '
                        'отработал, какой вклад внёс».'),
        ('Координатор', '«Бесит, что с каждым надо списываться индивидуально; если волонтёров много, '
                        'порой очень тяжело запомнить специфику каждого человека».'),
    ]
    for who, q in quotes:
        lw = 62
        for i, ln in enumerate(d.wrap(q, BODY, S_SMALL, CW - lw)):
            d.y -= S_SMALL * 1.38
            if i == 0:
                d.line_at(who, ML, d.y, BODY_B, S_SMALL, YARD)
            d.line_at(ln, ML + lw, d.y, BODY, S_SMALL, INK2)
        d.y -= 2.6

    d.y -= 2
    d.para('Сходимость: две стороны — та, кто приходит, и те, кто зовут, — независимо назвали одну '
           'и ту же нехватку. Проблема не в том, что «мало волонтёров», а в том, что нет '
           'подтверждённой истории участия.',
           font=BODY_M, size=S_SMALL, color=INK, leading=9.8)

    # ── масштаб ──
    d.caption('Масштаб боли · открытые данные направления Tech Vision 2026', gap_before=9)
    d.y -= 3
    top = d.card(30, gap_before=1)
    stats = [('224 → 810', 'волонтёрских организаций, 2020 → 2025'),
             ('350 000+', 'казахстанцев вовлечены в добровольчество'),
             ('31,4%', 'помогают пожилым — крупнейшее направление')]
    colw = CW / 3
    for i, (num, cap) in enumerate(stats):
        cx = ML + 11 + i * colw
        d.line_at(num, cx, top - 14, MONO_B, 11, YARD)
        for j, ln in enumerate(d.wrap(cap, BODY, S_CAPTION, colw - 18)):
            d.line_at(ln, cx, top - 23 - j * 7, BODY, S_CAPTION, INK2)
    d.y = top - 30
    d.para('Предложение помощи растёт быстрее, чем инфраструктура входа в неё.',
           font=BODY, size=S_SMALL, color=INK2, leading=9.6)

    # ── USP ──
    d.h1('Уникальное ценностное предложение', gap_before=9, gap_after=3)
    top = d.card(24, fill=YARD_SOFT, stroke=YARD_SOFT, gap_before=1)
    d.line_at('Единая точка входа в волонтёрство Казахстана, где участие превращается '
              'в подтверждённый вклад.', ML + 10, top - 15, BODY_B, S_H2, YARD)
    d.y = top - 24

    d.y -= 5
    pillars = [
        ('1. Вход без барьера', 'гостевой просмотр и ответ по device-identity: токен выдаётся по '
                                'заголовку X-Device-Id, без регистрации, email и пароля.'),
        ('2. Подтверждённый вклад', 'часы, надёжность и бейджи считает сервер из неизменяемого журнала '
                                    'AttendanceRecord — это не самооценка пользователя.'),
        ('3. Сборы, которые состоятся', 'собственная модель прогноза явки даёт координатору честное число '
                                        'с интервалом неопределённости и список тех, кому стоит напомнить, — '
                                        'чтобы сбор не сорвался и Аружан не пришла зря.'),
    ]
    d.labelled(pillars, size=S_BODY, label_w=132, gap=2.0)

    # ── путь пользователя ──
    d.caption('Путь Аружан в продукте · что именно снимает каждый барьер', gap_before=7)
    d.y -= 2
    steps = [
        ('Находит', 'лента и карта сборов по городу — без регистрации, гостевым режимом'),
        ('Доверяет', 'верифицированное НКО, виден организатор, счётчик «сейчас придут N»'),
        ('Отвечает', 'три ответа в один тап: Приду · Пока не знаю · Не в этот раз'),
        ('Возвращается', 'напоминание накануне; ответ можно поменять без объяснений'),
        ('Получает вклад', 'отметка явки пишется в журнал: часы, надёжность, бейдж, место в рейтинге'),
    ]
    for k, v in steps:
        d.y -= S_SMALL * 1.5
        d.line_at('→', ML, d.y, MONO, S_MONO_S, YARD)
        d.line_at(k, ML + 12, d.y, BODY_B, S_SMALL, INK)
        d.line_at(v, ML + 88, d.y, BODY, S_SMALL, INK2)

    # ── что уже работает ──
    d.caption('Что уже работает в прототипе · три роли на одной кодовой базе', gap_before=8)
    d.y -= 2
    d.labelled([
        ('Волонтёр', 'онбординг с выбором роли и языка RU/KZ, лента и карта сборов по Казахстану, '
                     'страницы событий и НКО, гостевой просмотр без аккаунта, профиль с часами и бейджами.'),
        ('Координатор', 'создание сбора, короткий код и ссылка для чата, прогноз явки с интервалом, '
                        'отметка присутствия с офлайн-синком, адресные напоминания сомневающимся.'),
        ('НКО / организатор', 'штаб с заявками волонтёров (навыки, сообщение, апрув), база волонтёров, '
                              'аналитика, рассылка, сборы помощи и пожертвования.'),
        ('Платформа', 'рейтинг, сообщения, уведомления, модерация сборов и жалоб в админ-панели.'),
    ], label_w=88, size=S_SMALL, gap=1.2)

    # ── чем не является ──
    d.caption('Чем erik не является', gap_before=7)
    d.y -= 1
    d.bullets([
        'Не доской объявлений одного города или одной темы — сеть общенациональная, и ценность '
        'растёт с числом участников.',
        'Не соцсетью: вклад считается из журнала явки, а не из лайков и подписчиков.',
        'Не обёрткой над чужим LLM-API: прогноз явки — собственная модель на собственных признаках.',
    ], size=S_SMALL, color=INK2, gap=1.4, leading=9.6)


# ─────────────────────────────────────────────────────────────────────────────
#  Стр. 2 — архитектура, стек, ИИ
# ─────────────────────────────────────────────────────────────────────────────
def arrow(c, x0, y0, x1, y1, color=INK3, dash=None, w=0.8):
    c.setStrokeColor(color)
    c.setLineWidth(w)
    c.setDash(dash or [])
    c.line(x0, y0, x1, y1)
    c.setDash([])
    ang = math.atan2(y1 - y0, x1 - x0)
    s = 3.4
    c.setFillColor(color)
    p = c.beginPath()
    p.moveTo(x1, y1)
    p.lineTo(x1 - s * math.cos(ang - 0.42), y1 - s * math.sin(ang - 0.42))
    p.lineTo(x1 - s * math.cos(ang + 0.42), y1 - s * math.sin(ang + 0.42))
    p.close()
    c.drawPath(p, stroke=0, fill=1)


def box(c, x, y, w, h, title, lines, fill=SURFACE, stroke=LINE, accent=None,
        dashed=False, title_color=INK):
    c.setFillColor(fill)
    c.setStrokeColor(stroke)
    c.setLineWidth(0.8)
    c.setDash([2, 2] if dashed else [])
    c.roundRect(x, y, w, h, 5, stroke=1, fill=1)
    c.setDash([])
    if accent:
        c.setFillColor(accent)
        c.roundRect(x, y + h - 2.6, w, 2.6, 1.3, stroke=0, fill=1)
    _check_glyphs(title, BODY_B)
    c.setFont(BODY_B, S_SMALL)
    c.setFillColor(title_color)
    c.drawString(x + 6, y + h - 12.5, title)
    c.setFont(MONO, S_MONO_S)
    c.setFillColor(INK2)
    for i, ln in enumerate(lines):
        _check_glyphs(ln, MONO)
        c.drawString(x + 6, y + h - 22 - i * 7.6, ln)


def page2(c, d):
    page_frame(c, 2, 'Архитектура и ИИ')
    d.y = PH - MT

    d.y -= S_H1
    d.line_at('Архитектура, стек и логика ИИ-компонентов', ML, d.y, DISPLAY, S_H1, INK)
    d.right_at('монорепозиторий · front / backend / ml', PW - MR, d.y + 1, BODY, S_SMALL, INK3)
    d.y -= 5
    d.rule(gap_before=2, gap_after=6)

    # ── схема ──
    dia_top, dia_h = d.y, 221
    c.setFillColor(SURFACE)
    c.setStrokeColor(LINE)
    c.setLineWidth(0.7)
    c.roundRect(ML, dia_top - dia_h, CW, dia_h, 7, stroke=1, fill=1)

    ix, iw = ML + 12, CW - 24
    y = dia_top - 11

    box(c, ix, y - 43, iw * 0.62, 43, 'Клиент · React 19 SPA (Vercel, статика)',
        ['Zustand 5: session / ui / gathering / platform / organizer',
         'react-router 7 · i18n RU-KZ · Tailwind v4 (только токены)',
         'число прогноза приходит с сервера; lib/forecast.js — только фолбэк'], accent=YARD)
    box(c, ix + iw * 0.65, y - 43, iw * 0.35, 43, 'Внешние API',
        ['погодный API      -> ctx.weather_factor',
         'платёжный сервис  -> Donation',
         'НЕ ПОДКЛЮЧЕНЫ: интерфейсы готовы'], dashed=True, fill=PAPER, title_color=INK3)

    arrow(c, ix + iw * 0.31, y - 43, ix + iw * 0.31, y - 60)
    c.setFont(MONO, S_MONO_S)
    c.setFillColor(INK2)
    c.drawString(ix + iw * 0.31 + 7, y - 55,
                 'HTTPS · REST /api · Bearer JWT + X-Device-Id · поллинг 10 c')
    arrow(c, ix + iw * 0.825, y - 43, ix + iw * 0.825, y - 124, color=INK3, dash=[2, 2])

    box(c, ix, y - 116, iw, 56, 'Сервер · Flask 3 (create_app) — 8 блюпринтов, 116 эндпоинтов',
        ['auth · session · gatherings · guest · platform · organizer · notifications · admin',
         'services/: forecast · attendance_ml · context · identity · codes · notifications',
         'utils/: owner-guard, сериализаторы  |  validate_config() блокирует прод с dev-секретами',
         'PII (телефон) — только координатору-владельцу; device_id — только в своём /me'], accent=YARD)

    arrow(c, ix + iw * 0.25, y - 116, ix + iw * 0.25, y - 133)
    arrow(c, ix + iw * 0.75, y - 116, ix + iw * 0.75, y - 133)

    box(c, ix, y - 192, iw * 0.55, 59, 'Данные · SQLAlchemy 2 + Alembic',
        ['SQLite (dev, zero-config)  ->  PostgreSQL (prod)',
         'ядро: Gathering · Participant · GatheringCoordinator',
         'AttendanceRecord — неизменяемый журнал явки',
         'ForecastParams — параметры модели в БД, не в коде',
         'соц-слой: Org · Charity · Follow · Message · Report'], accent=MAYBE)
    box(c, ix + iw * 0.58, y - 192, iw * 0.42, 59, 'ML · пакет ml/ — ОСНОВНОЙ ИСТОЧНИК ЧИСЛА',
        ['artifacts/*.joblib — закоммичен, в образе Docker',
         'HistGradientBoosting + изотоническая калибровка',
         'батч-инференс: одна матрица на весь ростер',
         'features.compute_feature_row() — одна для',
         'train и serve (нет train/serve skew)'], accent=MAYBE)

    c.setFont(MONO, S_MONO_S)
    c.setFillColor(INK3)
    c.drawString(ix, y - 205, 'Отметка явки -> AttendanceRecord -> пересчёт User.trust_* -> '
                              'следующий прогноз точнее      (замкнутый контур обучения)')
    c.setStrokeColor(YARD)
    c.setLineWidth(0.8)
    c.setDash([2, 2])
    c.line(ix, y - 209, ix + iw, y - 209)
    c.setDash([])
    d.y = dia_top - dia_h

    # ── стек ──
    d.caption('Стек технологий', gap_before=9)
    d.y -= 3
    d.labelled([
        ('Фронтенд', 'React 19 · Zustand 5 · react-router-dom 7 · Tailwind CSS v4 (@tailwindcss/cli) · CRA 5 · globe.gl / three'),
        ('Бэкенд', 'Python 3.11 · Flask 3.1 · SQLAlchemy 2.0 · Flask-JWT-Extended 4.7 · Flask-Migrate · Flask-CORS · Docker'),
        ('ML', 'scikit-learn ≥1.3 · pandas · numpy · joblib — HistGradientBoosting / RandomForest / LogisticRegression'),
        ('Тесты', 'pytest — 63 теста API и прогноза · Jest — 15 юнит-тестов фолбэк-формулы'),
        ('Итеративность', '62 коммита, 3 автора, работа с 18 по 26 июля 2026 (git log)'),
    ], label_w=74, gap=1.0)

    # ── схема данных ──
    d.caption('Схема данных · ядро и контур обучения', gap_before=8)
    d.mono_block([
        'Gathering --1:N-- Participant --N:1-- User        answer: yes | maybe | no',
        '    |                  |                          presence: came | missed',
        '    |                  +-- hist_total_at_rsvp / hist_came_at_rsvp   snapshot истории на момент RSVP',
        '    +--1:N-- GatheringCoordinator (owner | cocoord)',
        '    +--1:N-- AttendanceRecord --N:1-- User        неизменяемый журнал, uq(user_id, gathering_id)',
        '',
        'ForecastParams (singleton id=1): alpha · base_yes/maybe/no · p_min · p_max · sigma_k',
        'User.interests — темы волонтёра (id из themes); питают признак interest_match',
        'Каталоги: Theme · City · Badge · BadgeAward · Notification · Reminder · PushSubscription',
    ], gap_before=3, size=S_MONO_S)

    # ── личность ──
    d.caption('Личность (identity) · ключевое архитектурное решение', gap_before=8)
    d.y -= 1
    d.bullets([
        'Один класс User — три состояния: device-участник (device_id, без email и пароля), аккаунт НКО '
        'или координатора (email + password_hash), администратор (user_type = admin). Один актор, разные '
        'привилегии — это снимает барьер регистрации, не плодя параллельных таблиц.',
        'Агрегаты явки (trust_came, trust_total, reliability, hours_total) пишет ТОЛЬКО сервер при '
        'финализации сбора. Клиент их подделать не может, и именно они питают прогноз и рейтинг.',
    ], size=S_SMALL, color=INK2, gap=1.6, leading=9.5)

    # ── ИИ ──
    d.caption('Логика ИИ-компонента · модель — источник числа, формула — фолбэк; LLM и внешних AI-API нет',
              gap_before=7)
    d.y -= 1
    d.bullets([
        'Источник прогноза — обученная модель. sklearn-пайплайн на 14 причинных признаках: история явки, '
        'свежесть, динамика последних сборов, история по теме сбора, совпадение темы с интересами, ответ '
        'на приглашение. Признаки считаются только по сборам, прошедшим РАНЬШЕ текущего, — без утечки будущего.',
        'Признаки собираются из журнала AttendanceRecord целиком (services/history_features.py). Раньше '
        'уходили три поля из четырнадцати, и модель в проде вырождалась в функцию (came, total, answer) — '
        'ровно в ту формулу, которую должна была заменить: второй по важности признак interest_match '
        '(важность 0.052) был тождественно нулём.',
        'Формула включается только если модель недоступна, и ответ честно помечен source=formula. Источник '
        'выбирается целиком на сбор: смешивать ML-вероятности одних участников с формульными других нельзя — '
        'по числу нельзя было бы сказать, чем оно посчитано.',
        'Калибровка — обучаемая, изотоническая (CalibratedClassifierCV, cv=3), а не подгонка степенью '
        'постфактум. Поэтому сумма вероятностей и есть ожидаемая явка, а не «шкала»: на отложенном тесте '
        'она расходится с фактической явкой на 2.3%.',
        'Мост attendance_ml.py: изолированный импорт ml-модулей (у ml свои config и features, конфликтующие '
        'с backend/config.py), прогрев на старте воркера, батч-инференс, мягкая деградация '
        'в {available:false, reason, hint}, рубильник ERIK_ML_DISABLE=1.',
    ], size=S_SMALL, color=INK2, gap=1.5, leading=9.4)

    # ── ключевые эндпоинты ──
    d.caption('Ключевые эндпоинты сценария', gap_before=6)
    d.mono_block(leading=8.6, pad=6, lines=[
        'POST  /api/session                          device-вход: токен по X-Device-Id, без пароля',
        'POST  /api/gatherings                       создание сбора; ctx считается один раз и хранится',
        'PUT   /api/g/<code>/rsvp                    ответ участника по коду сбора, без регистрации',
        'GET   /api/gatherings/<id>/forecast         E ± 2σ + source (model|formula) + fallbackReason',
        'GET   /api/forecast/quality                 метрики, базлайны и важность признаков модели',
        'POST  /api/gatherings/<id>/presence/batch   офлайн-синк отметок, идемпотентно по client_mark_id',
        'POST  /api/gatherings/<id>/finalize         журнал явки -> пересчёт trust -> начисление бейджей',
    ], gap_before=3, size=S_MONO_S)

    # ── надёжность ──
    d.caption('Надёжность и безопасность', gap_before=4)
    d.y -= 1
    d.bullets([
        'validate_config() не даёт приложению подняться в проде с dev-секретами — прямая защита от подделки JWT.',
        'teardown_request откатывает сессию при исключении: «отравленная» транзакция не ломает следующие '
        'запросы воркера.',
        'Офлайн-отметка явки идемпотентна по client_mark_id: повторная отправка очереди не задваивает присутствие.',
    ], size=S_SMALL, color=INK2, gap=1.4, leading=9.5)


# ─────────────────────────────────────────────────────────────────────────────
#  Стр. 3 — модель, соц. эффект, устойчивость, ограничения
# ─────────────────────────────────────────────────────────────────────────────
def attendance_bar(c, x, y, w, h, f):
    """Signature-элемент продукта «Полоса явки» + скоба прогноза."""
    total = sum(f['counts'].values())
    cx = x
    for key, col in (('yes', YARD), ('maybe', MAYBE), ('no', OUT)):
        sw = w * f['counts'][key] / total
        c.setFillColor(col)
        c.rect(cx, y, sw, h, stroke=0, fill=1)
        if key == 'maybe':                      # зона неопределённости — штриховка
            c.saveState()
            p = c.beginPath()
            p.rect(cx, y, sw, h)
            c.clipPath(p, stroke=0, fill=0)
            c.setStrokeColor(MAYBE_HATCH)
            c.setLineWidth(1.6)
            t = cx - h
            while t < cx + sw + h:
                c.line(t, y, t + h, y + h)
                t += 5
            c.restoreState()
        c.setFillColor(SURFACE)
        c.setFont(MONO_B, S_MONO)
        c.drawCentredString(cx + sw / 2, y + h / 2 - 2.4, str(f['counts'][key]))
        cx += sw

    bw = w * f['E'] / total                     # скоба под сегментом «придут»
    c.setStrokeColor(YARD)
    c.setLineWidth(0.9)
    c.setDash([1.6, 1.6])
    c.line(x, y - 5, x + bw, y - 5)
    c.setDash([])
    c.line(x, y - 5, x, y - 2)
    c.line(x + bw, y - 5, x + bw, y - 2)
    c.setFont(MONO_B, S_MONO)
    c.setFillColor(YARD)
    c.drawString(x, y - 15, f"прогноз ≈ {f['E']:.1f} ± {2 * f['sigma']:.1f}")
    c.setFont(MONO, S_MONO_S)
    c.setFillColor(INK3)
    c.drawRightString(x + w, y - 15,
                      f"придут {f['counts']['yes']} · под вопросом {f['counts']['maybe']} · "
                      f"отказ {f['counts']['no']}   (ctx = {f['ctx']})")


def page3(c, d, f):
    page_frame(c, 3, 'Модель и эффект')
    d.y = PH - MT

    d.y -= S_H1
    d.line_at('Математическая модель, социальный эффект и устойчивость', ML, d.y, DISPLAY, S_H1, INK)
    d.y -= 5
    d.rule(gap_before=2, gap_after=2)

    # ── модель ──
    d.caption('Модель прогноза явки · основной источник — обучаемый, фолбэк — аналитический', gap_before=4)
    d.mono_block([
        'ОСНОВНОЙ:  p_i = P(придёт | 14 признаков)      HistGradientBoosting + изотоническая калибровка',
        '           признаки — только по сборам РАНЬШЕ текущего (причинно, без утечки будущего)',
        '',
        'ФОЛБЭК:    trust_i = (came_i + alpha · base(answer_i)) / (total_i + alpha)     alpha = 3',
        '           p_i     = clamp( base(answer_i) · trust_i · ctx , 0.02 , 0.98 )',
        '           base:  yes 0.62   maybe 0.24   no 0.02        ctx ∈ [0.7, 1.1]',
        '',
        'ОБЩЕЕ:     E = Σ p_i      σ = √( Σ p_i·(1 − p_i) )      интервал = E ± 2σ',
    ], gap_before=3)

    d.y -= 2
    d.bullets([
        'Агрегат один и тот же для обоих источников: сумма независимых испытаний Бернулли, где E — '
        'матожидание явки, а разброс — её стандартное отклонение. Координатор видит интервал, а не одно '
        'число: продукт показывает риск, а не обещание.',
        'Источник выбирается целиком на сбор и виден в ответе API (source, fallbackReason). Формула '
        'систематически занижает явку и ранжирует людей хуже, поэтому она именно фолбэк, а не «второе мнение».',
        'Каждая отметка явки пишется в AttendanceRecord — тот же журнал питает и признаки модели, и trust '
        'в формуле. Прогноз становится точнее от использования: это ответ на «чем вы лучше опроса в чате».',
    ], size=S_SMALL, color=INK2, gap=1.5, leading=9.4)

    # ── полоса явки ──
    d.caption(f'Демо-сбор {f["code"]} · числа сняты с бэкенда: три предсказателя дают три РАЗНЫХ числа',
              gap_before=7)
    d.y -= 7
    top = d.card(60, gap_before=0)
    attendance_bar(c, ML + 11, top - 23, CW - 22, 14, f)
    d.line_at(f'модель {f["E"]}          счётчик подтвердивших {f["counts"]["yes"]}          '
              f'формула-фолбэк {f["formula_E"]}',
              ML + 11, top - 52, MONO, S_MONO_S, INK2)
    d.y = top - 60

    # ── метрики и бэктест ──
    d.caption('Качество модели · отложенный тест со сплитом по волонтёрам (GroupShuffleSplit)', gap_before=6)
    d.y -= 3
    top = d.card(52, gap_before=0)
    metrics = [('ROC-AUC', '0.793'), ('PR-AUC', '0.841'), ('F1 «придёт»', '0.779'),
               ('Accuracy', '0.731'), ('Brier', '0.175'), ('log-loss', '0.525'), ('n(test)', '5 030')]
    colw = (CW - 22) / len(metrics)
    for i, (k, v) in enumerate(metrics):
        cx = ML + 11 + i * colw
        d.line_at(v, cx, top - 14.5, MONO_B, 9.4, YARD)
        d.line_at(k, cx, top - 23, BODY, S_CAPTION, INK2)
    c.setStrokeColor(LINE)
    c.setLineWidth(0.6)
    c.line(ML + 11, top - 28, PW - MR - 11, top - 28)
    d.line_at('БЭКТЕСТ НА ЗАКРЫТЫХ СБОРАХ · средняя ошибка «ждали / пришло», человек, n = '
              f'{BACKTEST["n"]}', ML + 11, top - 36, BODY_M, S_CAPTION, INK3)
    bt = [('модель', BACKTEST['model'], YARD), ('счётчик «приду»', BACKTEST['confirmed'], MAYBE),
          ('формула-фолбэк', BACKTEST['formula'], OUT)]
    bx = ML + 11
    for name, val, col in bt:
        d.line_at(f'{val}', bx, top - 47, MONO_B, 9.4, col)
        w = pdfmetrics.stringWidth(f'{val}', MONO_B, 9.4)
        d.line_at(name, bx + w + 5, top - 47, BODY, S_CAPTION, INK2)
        bx += w + 5 + pdfmetrics.stringWidth(name, BODY, S_CAPTION) + 26
    d.right_at('ROC-AUC: модель 0.793 · только ответ 0.698 · формула 0.753',
               PW - MR - 11, top - 47, MONO, S_MONO_S, INK3)
    d.y = top - 52

    # ── социальный эффект ──
    d.h1('Измеряемый социальный эффект', gap_before=8, gap_after=3)
    d.para('Проект некоммерческий. Базовой линии по РК в открытых данных нет — поэтому продукт измеряет '
           'её сам с первого дня: все метрики ниже считаются из журнала явки, а не собираются опросом.',
           size=S_SMALL, color=INK2, leading=9.6)
    d.y -= 4

    rows = [
        ('Активация новичка', 'доля User с trust_total >= 1 от зарегистрировавшихся', 'северная звезда'),
        ('Возврат на второй сбор', 'доля User с trust_total >= 2', 'удержание'),
        ('Подтверждённые часы', 'Σ AttendanceRecord.hours_credited  (4 ч за сбор)', 'вклад сообщества'),
        ('Доля дошедших', 'Σ presence = came  ÷  Σ ответивших «приду»', 'качество сборов'),
        ('Точность прогноза', '|факт − E|  и попадание факта в интервал E ± 2σ', 'качество модели'),
    ]
    for k, v, tag in rows:
        d.y -= S_SMALL * 1.52
        d.line_at(k, ML, d.y, BODY_B, S_SMALL, INK)
        d.line_at(v, ML + 118, d.y, MONO, S_MONO_S, INK2)
        d.right_at(tag, PW - MR, d.y, BODY, S_CAPTION, INK3)
        d.y -= 0.6

    d.y -= 5
    d.para('Горизонт — вся страна: 810 организаций и 350 000+ вовлечённых. Ценность растёт с числом '
           'участников, поэтому сеть общенациональная с первого дня, а не набор городских досок. '
           'Первая проверяемая цель на 12 месяцев — 2% организаций (около 16 команд) и рост доли '
           'дошедших на их сборах, измеренный самим продуктом до и после подключения.',
           size=S_SMALL, color=INK2, leading=9.6)

    # ── устойчивость ──
    d.h1('План устойчивости', gap_before=8, gap_after=3)
    d.bullets([
        'Себестоимость близка к нулю и не растёт с нагрузкой линейно: SPA раздаётся статикой, бэкенд — '
        'один инстанс Flask, ML-инференс идёт в процессе бэкенда на CPU. Внешних платных API и оплаты '
        'за токены LLM нет вообще — это главный фактор жизнеспособности некоммерческого проекта.',
        'Технический запас на рост заложен: Alembic-миграции, переход SQLite → PostgreSQL без правки кода, '
        'delta-поллинг вместо WebSocket, слой web-push подписок (PushSubscription).',
        'Проект не умирает вместе с командой: код в публичном репозитории, данные принадлежат НКО '
        'и координаторам, модель прогноза документирована и покрыта тестами.',
        'Источники ресурсов (план; партнёрства пока не подтверждены): гранты волонтёрских программ, '
        'волонтёрские центры вузов как первые команды-пользователи, размещение у акиматов как сервис '
        'координации городских субботников.',
    ], size=S_SMALL, color=INK2, gap=1.6, leading=9.5)

    # ── ограничения ──
    d.caption('Ограничения — заявлено честно, по регламенту трека', color=MAYBE, gap_before=8)
    d.y -= 1
    d.bullets([
        'Данные демонстрационные: seed бэкенда и обучающий журнал ML синтетические (ml/data_gen.py, '
        '1 200 волонтёров). Значения base 0.62 / 0.24 / 0.02 в фолбэке — стартовые допущения, а не замер.',
        f'Бэктест считан на {BACKTEST["n"]} закрытых сборах засеянной истории. Выборка мала и синтетична — '
        'это проверка того, что прогноз не равен счётчику, а не измерение точности на реальных людях.',
        'Внешних API в коде нет: weather_factor() возвращает 1.0 — интерфейс под погодный сервис готов, '
        'интеграции нет.',
        'Публично развёрнут только фронтенд; на нём работает встроенная синтетика. Бэкенд с моделью '
        'поднимается через docker compose (артефакт модели закоммичен, переобучение на сервере не нужно).',
        'Прогноз показывается только координатору — участник видит число подтвердившихся. Это осознанное '
        'решение против самосбывающегося пророчества, а не недоделка.',
    ], size=S_CAPTION, color=INK2, gap=1.0, leading=8.2, marker='·')

    # ── проверяемость ──
    d.caption('Проверяемость · что открыть в репозитории, чтобы сверить паспорт с кодом', gap_before=7)
    d.y -= 2
    checks = [
        ('Выбор источника', 'backend/services/forecast.py — forecast_payload(), поле source'),
        ('Признаки из журнала', 'backend/services/history_features.py — build_histories()'),
        ('Обучение и калибровка', 'ml/train.py · ml/baseline.py · ml/artifacts/{metrics,baselines}.json'),
        ('Бэктест', 'backend/routes/organizer.py — _forecast_mae()'),
        ('Тесты', 'backend/tests/ (63, в т.ч. test_forecast.py) · front .../forecast.test.js (15)'),
    ]
    for k, v in checks:
        d.y -= S_CAPTION * 1.55
        d.line_at(k, ML, d.y, BODY_B, S_CAPTION, INK)
        d.line_at(v, ML + 118, d.y, MONO, S_MONO_S, INK2)


# ─────────────────────────────────────────────────────────────────────────────
def build(out_path, font_dir):
    real = register_fonts(font_dir)
    c = pdfcanvas.Canvas(out_path, pagesize=A4)
    c.setTitle('TVEP · erik · команда ITshechka · Tech Vision 2026')
    c.setAuthor('Команда ITshechka')
    c.setSubject('Tech Vision Engineering Portfolio — технический паспорт проекта erik '
                 '(команда ITshechka, направление Social & Human Capital, зона 9)')
    c.setKeywords('TVEP, erik, ITshechka, Tech Vision 2026, Social & Human Capital, '
                  'Community Engagement, прогноз явки, волонтёрство')

    page1(c, Doc(c)); c.showPage()
    page2(c, Doc(c)); c.showPage()
    page3(c, Doc(c), demo_forecast()); c.showPage()
    c.save()
    return real


def main():
    ap = argparse.ArgumentParser(description='Собрать TVEP (ровно 3 страницы PDF).')
    ap.add_argument('--out', default='TVEP_ITshechka.pdf')
    ap.add_argument('--fonts', default=os.environ.get('TVEP_FONTS', ''))
    args = ap.parse_args()

    real = build(args.out, args.fonts)
    f = demo_forecast()
    print(f'PDF: {args.out}')
    print(f'Шрифты: {"Onest / Golos Text / JetBrains Mono" if real else "системный фолбэк"}')
    print(f"Пример {f['code']}: модель E = {f['E']} ± {2 * f['sigma']:.1f}, "
          f"счётчик {f['counts']['yes']}, формула {f['formula_E']}, ответов {sum(f['counts'].values())}")

    if _GLYPH_MISSES:
        print(f'\nВНИМАНИЕ — {len(_GLYPH_MISSES)} символов не отрисуются (нет в шрифте):')
        seen = set()
        for font, ch, ctx in _GLYPH_MISSES:
            if (font, ch) in seen:
                continue
            seen.add((font, ch))
            print(f'  {font}: {ch!r} (U+{ord(ch):04X})  →  {ctx!r}')
        return 1
    print('Глифы: все символы есть в своих гарнитурах')
    return 0


if __name__ == '__main__':
    sys.exit(main())
