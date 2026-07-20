# Обложки сборов и запросов помощи

Сюда кладутся 16 файлов с ровно такими именами. `seed.py` прописывает в базу пути
вида `/assets/covers/<имя>.jpg`, фронт отдаёт их со своего домена.

Требования: **JPG, горизонтальные, ~1200x750** (обрезается по центру в 800x500),
до ~300 КБ на файл. Если файла нет — карточка просто покажет цветной тинт темы,
ничего не сломается.

## Сборы (по темам)

| файл | поисковый запрос | о чём карточка |
|---|---|---|
| `eco.jpg` | volunteers cleaning park litter | субботник, уборка парка |
| `elderly.jpg` | volunteer helping elderly woman | навестить одиноких пожилых |
| `animals.jpg` | animal shelter dog volunteer | день в приюте для животных |
| `blood.jpg` | blood donation donor arm | день донора |
| `edu.jpg` | volunteer teaching children classroom | занятия с детьми |
| `trees.jpg` | volunteers planting tree sapling | посадка деревьев |
| `homeless.jpg` | clothes donation charity volunteers | помощь бездомным |
| `medical.jpg` | nurse helping patient hospital corridor | сопровождение в больницу |
| `disaster.jpg` | flood relief volunteers sandbags | помощь после паводка |
| `sport.jpg` | charity run marathon runners street | благотворительный забег |
| `culture.jpg` | children reading books library | книжный фестиваль |
| `it.jpg` | senior person learning laptop computer | цифровая грамотность для пожилых |

## Запросы помощи

| файл | поисковый запрос | о чём карточка |
|---|---|---|
| `charity-tools.jpg` | cleaning tools rakes gloves garden | инвентарь для субботников |
| `charity-clothes.jpg` | folded warm clothes donation box | тёплые вещи для приюта |
| `charity-petfood.jpg` | dog food bowl animal shelter | корм для приюта «Лапа» |
| `charity-books.jpg` | stack of school textbooks | учебники сельским школам |

## Где искать

- **pexels.com** и **unsplash.com** — бесплатно, коммерческое использование разрешено,
  атрибуция не требуется. Качать кнопкой скачивания, размер «Medium» достаточно.
- Ключевые слова выше — английские: на них выдача заметно лучше, чем на русских.

Свободные CC-банки (Wikimedia Commons, Openverse) для этой задачи проверены и не подходят:
там энциклопедический и любительский материал, а не репортаж «волонтёры за работой».

## После добавления файлов

```bash
cd ~/erik/backend
docker compose up -d --build
docker compose exec backend flask seed-demo --reset
```

Фронт передеплоить отдельно — картинки лежат в его сборке.
