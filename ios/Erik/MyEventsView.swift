import SwiftUI

struct MyEventsView: View {
    @EnvironmentObject var session: Session
    @EnvironmentObject var store: PlatformStore
    @State private var events: [Event] = []
    @State private var loading = true
    @State private var error: String?

    var body: some View {
        ScrollView {
            LazyVStack(spacing: 14) {
                if !session.profiled {
                    GuestPrompt(text: session.tr("Войдите, чтобы видеть свои мероприятия",
                                                 "Іс-шараларыңызды көру үшін кіріңіз"))
                } else if events.isEmpty {
                    LoadStateView(isLoading: loading, error: error, isEmpty: !loading && error == nil,
                                  emptyText: session.tr("Вы ещё никуда не записались", "Сіз әзірге тіркелген жоқсыз")) {
                        Task { await load() }
                    }
                } else {
                    ForEach(events) { e in
                        NavigationLink(value: Route.event(e.id)) {
                            EventCardView(event: e, theme: store.theme(e.theme),
                                          orgName: nil, cityName: store.cityName(e.cityId, lang: session.lang))
                        }.buttonStyle(.plain)
                    }
                }
            }
            .padding(16)
        }
        .background(Palette.page.ignoresSafeArea())
        .navigationTitle(session.tr("Мои мероприятия", "Менің іс-шараларым"))
        .navigationBarTitleDisplayMode(.inline)
        .task { if session.profiled { await load() } }
        .refreshable { if session.profiled { await load() } }
    }

    private func load() async {
        loading = true; error = nil
        do { events = try await APIClient.shared.myEvents() }
        catch { self.error = (error as? APIError)?.message ?? "Ошибка" }
        loading = false
    }
}
