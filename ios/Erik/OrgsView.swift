import SwiftUI

struct OrgsView: View {
    @EnvironmentObject var session: Session
    @EnvironmentObject var store: PlatformStore
    @State private var orgs: [Org] = []
    @State private var loading = true
    @State private var error: String?

    var body: some View {
        ScrollView {
            LazyVStack(spacing: 12) {
                if orgs.isEmpty {
                    LoadStateView(isLoading: loading, error: error, isEmpty: !loading && error == nil,
                                  emptyText: session.tr("Нет организаций", "Ұйымдар жоқ")) { Task { await load() } }
                } else {
                    ForEach(orgs) { o in
                        NavigationLink(value: Route.org(o.id)) { row(o) }.buttonStyle(.plain)
                    }
                }
            }
            .padding(16)
        }
        .background(Palette.page.ignoresSafeArea())
        .navigationTitle(session.tr("НКО", "ҮЕҰ"))
        .navigationBarTitleDisplayMode(.inline)
        .task { if orgs.isEmpty { await load() } }
        .refreshable { await load() }
    }

    private func row(_ o: Org) -> some View {
        HStack(spacing: 12) {
            AvatarView(name: o.name, size: 46, tint: Color(hex: (store.theme(o.cat)?.ink) ?? "2F6F4F"))
            VStack(alignment: .leading, spacing: 3) {
                HStack(spacing: 4) {
                    Text(o.name ?? "").font(.system(size: 15, weight: .semibold)).foregroundColor(Palette.text)
                    if o.verified == true { Image(systemName: "checkmark.seal.fill").font(.system(size: 12)).foregroundColor(Palette.ink) }
                }
                Text(o.city ?? "").font(.system(size: 12)).foregroundColor(Palette.sub)
                Text(session.loc(o.aboutRu, o.aboutKz)).font(.system(size: 12)).foregroundColor(Palette.sub).lineLimit(2)
            }
            Spacer()
            VStack {
                Text("\(o.vol ?? 0)").font(.system(size: 15, weight: .bold)).foregroundColor(Palette.ink)
                Text(session.tr("вол.", "вол.")).font(.system(size: 10)).foregroundColor(Palette.sub)
            }
        }
        .padding(12)
        .card()
    }

    private func load() async {
        loading = true; error = nil
        do { orgs = try await APIClient.shared.orgs() }
        catch { self.error = (error as? APIError)?.message ?? "Ошибка" }
        loading = false
    }
}

struct OrgDetailView: View {
    let orgId: Int
    @EnvironmentObject var session: Session
    @EnvironmentObject var store: PlatformStore
    @State private var org: Org?
    @State private var events: [Event] = []
    @State private var loading = true
    @State private var busy = false
    @State private var showAuth = false

    var body: some View {
        ScrollView {
            if let o = org {
                VStack(alignment: .leading, spacing: 16) {
                    HStack(spacing: 14) {
                        AvatarView(name: o.name, size: 64)
                        VStack(alignment: .leading, spacing: 4) {
                            HStack(spacing: 5) {
                                Text(o.name ?? "").font(.system(size: 20, weight: .bold))
                                if o.verified == true { Image(systemName: "checkmark.seal.fill").foregroundColor(Palette.ink) }
                            }
                            Text(o.city ?? "").font(.system(size: 13)).foregroundColor(Palette.sub)
                        }
                    }
                    Text(session.loc(o.aboutRu, o.aboutKz)).font(.system(size: 15)).foregroundColor(Palette.text)
                    HStack(spacing: 20) {
                        stat("\(o.events ?? 0)", session.tr("событий", "іс-шара"))
                        stat("\(o.vol ?? 0)", session.tr("волонтёров", "волонтёр"))
                    }
                    Button(o.following == true ? session.tr("Вы подписаны", "Жазылдыңыз") : session.tr("Подписаться", "Жазылу")) {
                        if session.profiled { Task { await toggleFollow() } } else { showAuth = true }
                    }
                    .buttonStyle(o.following == true ? AnyButtonStyle(SecondaryButtonStyle()) : AnyButtonStyle(PrimaryButtonStyle()))
                    .disabled(busy)

                    if !events.isEmpty {
                        Text(session.tr("Сборы организации", "Ұйым жиындары")).font(.system(size: 18, weight: .bold))
                        ForEach(events) { e in
                            NavigationLink(value: Route.event(e.id)) {
                                EventCardView(event: e, theme: store.theme(e.theme),
                                              orgName: o.name, cityName: store.cityName(e.cityId, lang: session.lang))
                            }.buttonStyle(.plain)
                        }
                    }
                }
                .padding(16)
            } else {
                LoadStateView(isLoading: loading, error: nil, isEmpty: false, emptyText: "")
            }
        }
        .background(Palette.page.ignoresSafeArea())
        .navigationTitle(session.tr("Организация", "Ұйым"))
        .navigationBarTitleDisplayMode(.inline)
        .task { await load() }
        .sheet(isPresented: $showAuth) { AuthView() }
    }

    private func stat(_ v: String, _ l: String) -> some View {
        VStack(spacing: 2) {
            Text(v).font(.system(size: 20, weight: .bold)).foregroundColor(Palette.ink)
            Text(l).font(.system(size: 12)).foregroundColor(Palette.sub)
        }
    }

    private func load() async {
        loading = true
        org = try? await APIClient.shared.org(orgId)
        if let all = try? await APIClient.shared.events() {
            events = all.filter { $0.orgId == orgId }
        }
        loading = false
    }

    private func toggleFollow() async {
        guard var o = org else { return }
        busy = true; defer { busy = false }
        do {
            if o.following == true { try await APIClient.shared.unfollowOrg(orgId); o.following = false; o.vol = max(0, (o.vol ?? 1) - 1) }
            else { try await APIClient.shared.followOrg(orgId); o.following = true; o.vol = (o.vol ?? 0) + 1 }
            org = o
        } catch {}
    }
}

/// Обёртка для переключения стиля кнопки во время выполнения.
struct AnyButtonStyle: ButtonStyle {
    private let _make: (Configuration) -> AnyView
    init<S: ButtonStyle>(_ style: S) { _make = { AnyView(style.makeBody(configuration: $0)) } }
    func makeBody(configuration: Configuration) -> some View { _make(configuration) }
}
