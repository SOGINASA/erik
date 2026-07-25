import SwiftUI

/// Базовый адрес статики фронта (обложки событий/сборов лежат там).
let assetBase = "https://erik-hazel.vercel.app"

func coverURL(_ path: String?) -> URL? {
    guard let path = path, !path.isEmpty else { return nil }
    if path.hasPrefix("http") { return URL(string: path) }
    return URL(string: assetBase + path)
}

/// Аватар-кружок с инициалом.
struct AvatarView: View {
    var name: String?
    var size: CGFloat = 40
    var tint: Color = Palette.ink
    private var initial: String {
        let ch = (name ?? "?").trimmingCharacters(in: .whitespaces).first.map(String.init) ?? "?"
        return ch.uppercased()
    }
    var body: some View {
        Text(initial)
            .font(.system(size: size * 0.42, weight: .semibold))
            .foregroundColor(.white)
            .frame(width: size, height: size)
            .background(tint)
            .clipShape(Circle())
    }
}

/// Чип темы (эко / пожилые / …), цвета берём из справочника.
struct ThemeChip: View {
    let theme: Theme?
    let lang: Lang
    var body: some View {
        let name = theme.map { lang == .ru ? $0.ru : $0.kz } ?? ""
        let ink = theme.map { Color(hex: $0.ink) } ?? Palette.ink
        let tint = theme.map { Color(hex: $0.tint) } ?? Palette.line
        Text(name)
            .font(.system(size: 12, weight: .semibold))
            .foregroundColor(ink)
            .padding(.horizontal, 10)
            .padding(.vertical, 5)
            .background(tint)
            .cornerRadius(8)
    }
}

/// Прогресс «идёт X из Y».
struct GoingBar: View {
    let going: Int
    let needed: Int
    var body: some View {
        let ratio = needed > 0 ? min(1, Double(going) / Double(needed)) : 0
        VStack(alignment: .leading, spacing: 4) {
            GeometryReader { geo in
                ZStack(alignment: .leading) {
                    Capsule().fill(Palette.line)
                    Capsule().fill(Palette.ink).frame(width: geo.size.width * ratio)
                }
            }
            .frame(height: 6)
            Text("\(going) / \(needed)")
                .font(.system(size: 12, weight: .medium))
                .foregroundColor(Palette.sub)
        }
    }
}

/// Обложка события (фото или цветная подложка темы).
struct CoverView: View {
    let image: String?
    let tint: Color
    var height: CGFloat = 140
    var body: some View {
        ZStack {
            tint
            if let url = coverURL(image) {
                AsyncImage(url: url) { phase in
                    if let img = phase.image {
                        img.resizable().aspectRatio(contentMode: .fill)
                    } else {
                        tint
                    }
                }
            }
        }
        .frame(height: height)
        .frame(maxWidth: .infinity)
        .clipped()
    }
}

/// Карточка события в ленте.
struct EventCardView: View {
    let event: Event
    let theme: Theme?
    let orgName: String?
    let cityName: String
    @EnvironmentObject var session: Session

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            CoverView(image: event.image,
                      tint: theme.map { Color(hex: $0.tint) } ?? Palette.line)
            VStack(alignment: .leading, spacing: 8) {
                HStack {
                    ThemeChip(theme: theme, lang: session.lang)
                    Spacer()
                    if !cityName.isEmpty {
                        Text(cityName).font(.system(size: 12)).foregroundColor(Palette.sub)
                    }
                }
                Text(session.loc(event.titleRu, event.titleKz))
                    .font(.system(size: 17, weight: .bold))
                    .foregroundColor(Palette.text)
                    .lineLimit(2)
                if let orgName = orgName {
                    Text(orgName).font(.system(size: 13)).foregroundColor(Palette.ink)
                }
                Label(session.loc(event.placeRu, event.placeKz), systemImage: "mappin.and.ellipse")
                    .font(.system(size: 13)).foregroundColor(Palette.sub)
                    .lineLimit(1)
                HStack(spacing: 6) {
                    Image(systemName: "calendar")
                    Text(session.loc(event.dateRu, event.dateKz))
                    if let time = event.time { Text("· \(time)") }
                }
                .font(.system(size: 13)).foregroundColor(Palette.sub)
                GoingBar(going: event.going ?? 0, needed: event.needed ?? 0)
                    .padding(.top, 2)
            }
            .padding(14)
        }
        .card()
    }
}

/// Заголовок секции.
struct SectionHeader: View {
    let title: String
    var body: some View {
        Text(title)
            .font(.system(size: 22, weight: .bold))
            .foregroundColor(Palette.text)
            .frame(maxWidth: .infinity, alignment: .leading)
    }
}

/// Универсальное состояние загрузки/ошибки/пустоты для списков.
struct LoadStateView: View {
    let isLoading: Bool
    let error: String?
    let isEmpty: Bool
    let emptyText: String
    var retry: (() -> Void)?
    var body: some View {
        if isLoading {
            ProgressView().padding(40)
        } else if let error = error {
            VStack(spacing: 12) {
                Text(error).foregroundColor(Palette.sub).multilineTextAlignment(.center)
                if let retry = retry {
                    Button("Повторить", action: retry).buttonStyle(SecondaryButtonStyle()).frame(maxWidth: 200)
                }
            }.padding(30)
        } else if isEmpty {
            Text(emptyText).foregroundColor(Palette.sub).padding(40)
        }
    }
}

/// Языковой переключатель RU/KZ.
struct LangToggle: View {
    @EnvironmentObject var session: Session
    var body: some View {
        Button(action: { session.toggleLang() }) {
            Text(session.lang == .ru ? "RU" : "KZ")
                .font(.system(size: 13, weight: .bold))
                .foregroundColor(Palette.ink)
                .padding(.horizontal, 10).padding(.vertical, 5)
                .overlay(Capsule().stroke(Palette.ink, lineWidth: 1.5))
        }
    }
}
