# Erik — Android WebView

Нативная Android-обёртка (WebView) над веб-приложением
[erik-hazel.vercel.app](https://erik-hazel.vercel.app).
API бэкенда: `https://foodtrack.beast-inside.kz/erik/api` — приложение ничего
не проксирует, весь трафик идёт напрямую из веба внутри WebView.

## Что внутри
- `app/` — модуль приложения (Kotlin, минимум зависимостей).
- Экран `MainActivity` открывает сайт в WebView и умеет:
  - JS, DOM/localStorage, cookies (в т.ч. сторонние — для авторизации);
  - pull-to-refresh, индикатор загрузки, экран «нет сети» с кнопкой «Повторить»;
  - аппаратная кнопка «Назад» = навигация по истории сайта;
  - загрузка файлов `<input type=file>` + съёмка с камеры;
  - запросы геолокации и камеры (`getUserMedia`) с системными разрешениями;
  - внешние ссылки (другой домен, `mailto:`, `tel:` …) открываются в системе.

Адрес сайта задаётся одной строкой — `res/values/strings.xml` → `base_url`.

## Открыть в Android Studio
File → Open → выбрать папку `android/`. Studio сама подтянет Gradle 8.11.1
и синхронизирует проект. Запуск — кнопкой ▶ на эмуляторе или устройстве.

## Сборка из терминала
```bash
cd android
./gradlew assembleDebug     # debug APK
./gradlew assembleRelease   # release (нужна подпись, см. ниже)
```
Готовый debug-APK:
`app/build/outputs/apk/debug/app-debug.apk`

Установить на подключённое устройство:
```bash
./gradlew installDebug
# или
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

## Требования
- JDK 17+ (проверено на 21), Android SDK Platform 36, Build-Tools.
- `local.properties` с `sdk.dir=...` создаётся автоматически / Android Studio.

## Release-подпись
Для публикации создайте keystore и добавьте `signingConfigs` в
`app/build.gradle.kts`, затем `./gradlew assembleRelease` (или `bundleRelease`
для `.aab` в Google Play).
