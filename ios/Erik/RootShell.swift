import SwiftUI

/// Корневой таб-навигатор. Повторяет мобильную навигацию сайта.
struct RootShell: View {
    @EnvironmentObject var session: Session

    var body: some View {
        TabView {
            NavigationStack { FeedView() }
                .tabItem { Label(session.tr("Лента", "Таспа"), systemImage: "square.grid.2x2") }

            NavigationStack { MapCitiesView() }
                .tabItem { Label(session.tr("Карта", "Карта"), systemImage: "map") }

            NavigationStack { CharityView() }
                .tabItem { Label(session.tr("Помощь", "Көмек"), systemImage: "heart") }

            NavigationStack { LeaderboardView() }
                .tabItem { Label(session.tr("Рейтинг", "Рейтинг"), systemImage: "trophy") }

            NavigationStack { MoreView() }
                .tabItem { Label(session.tr("Ещё", "Тағы"), systemImage: "person.crop.circle") }
        }
    }
}
