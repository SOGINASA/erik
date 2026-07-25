import SwiftUI

@MainActor
final class FeedViewModel: ObservableObject {
    @Published var events: [Event] = []
    @Published var orgNames: [Int: String] = [:]
    @Published var loading = false
    @Published var error: String?

    var cityFilter: String? = nil
    var themeFilter: String? = nil

    func load() async {
        loading = true; error = nil
        var q = "?"
        if let c = cityFilter { q += "city=\(c)&" }
        if let t = themeFilter { q += "theme=\(t)&" }
        do {
            events = try await APIClient.shared.events(query: q == "?" ? "" : String(q.dropLast()))
            if orgNames.isEmpty, let orgs = try? await APIClient.shared.orgs() {
                orgNames = Dictionary(uniqueKeysWithValues: orgs.compactMap { o in o.name.map { (o.id, $0) } })
            }
        } catch {
            self.error = (error as? APIError)?.message ?? "Не удалось загрузить"
        }
        loading = false
    }
}

struct FeedView: View {
    @EnvironmentObject var session: Session
    @EnvironmentObject var store: PlatformStore
    @StateObject private var vm = FeedViewModel()
    @State private var showAuth = false

    var body: some View {
        ScrollView {
            LazyVStack(spacing: 14) {
                filters
                if vm.events.isEmpty {
                    LoadStateView(isLoading: vm.loading, error: vm.error,
                                  isEmpty: !vm.loading && vm.error == nil,
                                  emptyText: session.tr("Пока нет сборов", "Әзірге жиындар жоқ")) {
                        Task { await vm.load() }
                    }
                } else {
                    ForEach(vm.events) { event in
                        NavigationLink(value: Route.event(event.id)) {
                            EventCardView(event: event,
                                          theme: store.theme(event.theme),
                                          orgName: event.orgId.flatMap { vm.orgNames[$0] },
                                          cityName: store.cityName(event.cityId, lang: session.lang))
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
            .padding(16)
        }
        .background(Palette.page.ignoresSafeArea())
        .navigationTitle("erik.")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarLeading) { LangToggle() }
            ToolbarItem(placement: .topBarTrailing) {
                NavigationLink(value: Route.notifications) {
                    Image(systemName: "bell").foregroundColor(Palette.ink)
                }
            }
        }
        .navigationDestination(for: Route.self) { $0.destination }
        .refreshable { await vm.load() }
        .task { if vm.events.isEmpty { await vm.load() } }
        .sheet(isPresented: $showAuth) { AuthView() }
    }

    private var filters: some View {
        VStack(spacing: 8) {
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    FilterPill(title: session.tr("Все города", "Барлық қала"),
                               active: vm.cityFilter == nil) {
                        vm.cityFilter = nil; Task { await vm.load() }
                    }
                    ForEach(store.cities) { c in
                        FilterPill(title: session.lang == .ru ? c.ru : c.kz,
                                   active: vm.cityFilter == c.id) {
                            vm.cityFilter = (vm.cityFilter == c.id ? nil : c.id); Task { await vm.load() }
                        }
                    }
                }
            }
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    FilterPill(title: session.tr("Все темы", "Барлық тақырып"),
                               active: vm.themeFilter == nil) {
                        vm.themeFilter = nil; Task { await vm.load() }
                    }
                    ForEach(store.themes) { t in
                        FilterPill(title: session.lang == .ru ? t.ru : t.kz,
                                   active: vm.themeFilter == t.id,
                                   tint: Color(hex: t.tint), ink: Color(hex: t.ink)) {
                            vm.themeFilter = (vm.themeFilter == t.id ? nil : t.id); Task { await vm.load() }
                        }
                    }
                }
            }
        }
    }
}

struct FilterPill: View {
    let title: String
    let active: Bool
    var tint: Color = Palette.ink
    var ink: Color = .white
    let action: () -> Void
    var body: some View {
        Button(action: action) {
            Text(title)
                .font(.system(size: 13, weight: .semibold))
                .foregroundColor(active ? ink : Palette.text)
                .padding(.horizontal, 12).padding(.vertical, 7)
                .background(active ? tint : Palette.card)
                .overlay(Capsule().stroke(Palette.line, lineWidth: active ? 0 : 1))
                .clipShape(Capsule())
        }
    }
}
