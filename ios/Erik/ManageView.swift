import SwiftUI

/// Штаб организатора — его сборы со сводкой.
struct ManageView: View {
    @EnvironmentObject var session: Session
    @EnvironmentObject var store: PlatformStore
    @State private var events: [Event] = []
    @State private var loading = true
    @State private var error: String?

    var body: some View {
        ScrollView {
            LazyVStack(spacing: 14) {
                Text(session.tr("Ваши сборы и мероприятия", "Сіздің жиындар мен іс-шаралар"))
                    .font(.system(size: 14)).foregroundColor(Palette.sub)
                    .frame(maxWidth: .infinity, alignment: .leading)
                if events.isEmpty {
                    LoadStateView(isLoading: loading, error: error, isEmpty: !loading && error == nil,
                                  emptyText: session.tr("Пока нет сборов", "Әзірге жиындар жоқ")) { Task { await load() } }
                } else {
                    ForEach(events) { e in
                        NavigationLink(value: Route.event(e.id)) {
                            EventCardView(event: e, theme: store.theme(e.theme), orgName: nil,
                                          cityName: store.cityName(e.cityId, lang: session.lang))
                        }.buttonStyle(.plain)
                    }
                }
            }
            .padding(16)
        }
        .background(Palette.page.ignoresSafeArea())
        .navigationTitle(session.tr("Штаб", "Штаб"))
        .navigationBarTitleDisplayMode(.inline)
        .task { await load() }
        .refreshable { await load() }
    }

    private func load() async {
        loading = true; error = nil
        do { events = try await APIClient.shared.orgEvents() }
        catch { self.error = (error as? APIError)?.message ?? "Ошибка" }
        loading = false
    }
}
