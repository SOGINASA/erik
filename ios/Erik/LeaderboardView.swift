import SwiftUI

struct LeaderboardView: View {
    @EnvironmentObject var session: Session
    @State private var items: [LeaderVolunteer] = []
    @State private var loading = true
    @State private var error: String?

    var body: some View {
        ScrollView {
            LazyVStack(spacing: 10) {
                if items.isEmpty {
                    LoadStateView(isLoading: loading, error: error, isEmpty: !loading && error == nil,
                                  emptyText: session.tr("Пусто", "Бос")) { Task { await load() } }
                } else {
                    ForEach(Array(items.enumerated()), id: \.element.id) { idx, v in
                        NavigationLink(value: Route.user(v.id)) {
                            row(idx + 1, v)
                        }.buttonStyle(.plain)
                    }
                }
            }
            .padding(16)
        }
        .background(Palette.page.ignoresSafeArea())
        .navigationTitle(session.tr("Рейтинг волонтёров", "Волонтёрлер рейтингі"))
        .navigationBarTitleDisplayMode(.inline)
        .toolbar { ToolbarItem(placement: .topBarLeading) { LangToggle() } }
        .erikDestinations()
        .task { if items.isEmpty { await load() } }
        .refreshable { await load() }
    }

    private func row(_ rank: Int, _ v: LeaderVolunteer) -> some View {
        HStack(spacing: 12) {
            Text("\(rank)")
                .font(.system(size: 15, weight: .bold))
                .foregroundColor(rank <= 3 ? Palette.gold : Palette.sub)
                .frame(width: 26)
            AvatarView(name: v.name, size: 42)
            VStack(alignment: .leading, spacing: 2) {
                Text(v.name ?? "").font(.system(size: 15, weight: .semibold)).foregroundColor(Palette.text)
                Text(v.city ?? "").font(.system(size: 12)).foregroundColor(Palette.sub)
            }
            Spacer()
            VStack(alignment: .trailing, spacing: 2) {
                Text("\(v.hours ?? 0) " + session.tr("ч", "сағ"))
                    .font(.system(size: 14, weight: .bold)).foregroundColor(Palette.ink)
                Text("\(v.events ?? 0) " + session.tr("событий", "іс-шара"))
                    .font(.system(size: 11)).foregroundColor(Palette.sub)
            }
        }
        .padding(12)
        .card()
    }

    private func load() async {
        loading = true; error = nil
        do { items = try await APIClient.shared.leaderboard() }
        catch { self.error = (error as? APIError)?.message ?? "Ошибка" }
        loading = false
    }
}
