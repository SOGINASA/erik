# Erik — iOS WebView

Нативная iOS-обёртка (WKWebView) над веб-приложением
[erik-hazel.vercel.app](https://erik-hazel.vercel.app) — то же самое, что и
Android-версия в папке `../android`, только под iPhone/iPad.
API бэкенда (`https://foodtrack.beast-inside.kz/erik/api`) сайт дёргает сам
изнутри WebView — приложение ничего не проксирует.

## Что внутри
- `Erik.xcodeproj` — проект Xcode (открывать эту папку/файл).
- `Erik/`
  - `ErikApp.swift` — точка входа (SwiftUI).
  - `RootView.swift` — мост SwiftUI ↔ UIKit.
  - `WebViewController.swift` — весь функционал WebView.
  - `Assets.xcassets` — иконка приложения и accent-цвет.

Экран умеет то же, что Android-версия:
- JS, localStorage, cookies/сессии сохраняются между запусками;
- pull-to-refresh, индикатор загрузки сверху, экран «нет сети» с «Повторить»;
- свайп от левого края = «назад» по истории сайта;
- загрузка файлов `<input type=file>` и съёмка с камеры (нативно в WKWebView);
- камера/микрофон (`getUserMedia`) и геолокация с системными разрешениями;
- внешние ссылки (другой домен, `tel:`, `mailto:`) открываются в Safari/системе.

Адрес сайта — одна строка в `WebViewController.swift`:
`private static let baseURLString = "https://erik-hazel.vercel.app"`.

## Как открыть и запустить (нужен Mac + Xcode)
1. Открыть `ios/Erik.xcodeproj` в Xcode.
2. Выбрать таргет **Erik** → в «Signing & Capabilities» указать свою
   **Team** (Apple ID подойдёт для запуска на своём устройстве). Bundle ID
   уже стоит `kz.beastinside.erik` — при необходимости поменяй на свой.
3. Выбрать симулятор (напр. iPhone 15) или подключённый iPhone и нажать ▶.

## Требования
- Xcode 15+ (проект: `objectVersion 56`, `compatibilityVersion Xcode 14.0`).
- iOS 15.0+ на устройстве/симуляторе.

## Раздать другу без App Store
На iOS просто «скинуть файл», как APK на Android, нельзя. Варианты:
- **TestFlight** — залить сборку в App Store Connect и разослать ссылку
  (до 10 000 тестировщиков, нужен аккаунт Apple Developer, $99/год).
- **Ad Hoc** — подписать под конкретные UDID устройств и поставить через
  Apple Configurator / сторонние сервисы.
- Для себя/близких — просто запустить с Mac на свой iPhone через Xcode
  (бесплатный Apple ID, приложение живёт 7 дней до переподписи).
