import SwiftUI

@MainActor
final class EventDetailViewModel: ObservableObject {
    @Published var event: Event?
    @Published var participants: [Participant] = []
    @Published var org: Org?
    @Published var answer: String?
    @Published var loading = true
    @Published var error: String?
    @Published var busy = false

    func load(_ id: Int) async {
        loading = true; error = nil
        do {
            event = try await APIClient.shared.event(id)
            participants = (try? await APIClient.shared.eventParticipants(id, limit: 8)) ?? []
            if let oid = event?.orgId { org = try? await APIClient.shared.org(oid) }
            if let regs = try? await APIClient.shared.myRegistrations() { answer = regs[String(id)] }
        } catch {
            self.error = (error as? APIError)?.message ?? "Ошибка"
        }
        loading = false
    }

    func setAnswer(_ id: Int, _ value: String) async {
        busy = true
        defer { busy = false }
        do {
            if answer == value {
                try await APIClient.shared.deleteEventRegistration(id)
                answer = nil
                if var e = event { e.going = max(0, (e.going ?? 1) - 1); event = e }
            } else {
                let res = try await APIClient.shared.setEventRegistration(id, answer: value)
                answer = value
                if var e = event, let g = res.going { e.going = g; event = e }
            }
        } catch {
            self.error = (error as? APIError)?.message ?? "Не удалось"
        }
    }
}

struct EventDetailView: View {
    let eventId: Int
    @EnvironmentObject var session: Session
    @EnvironmentObject var store: PlatformStore
    @StateObject private var vm = EventDetailViewModel()
    @State private var showAuth = false

    var body: some View {
        ScrollView {
            if let e = vm.event {
                VStack(alignment: .leading, spacing: 16) {
                    CoverView(image: e.image,
                              tint: store.theme(e.theme).map { Color(hex: $0.tint) } ?? Palette.line,
                              height: 200)
                    VStack(alignment: .leading, spacing: 14) {
                        ThemeChip(theme: store.theme(e.theme), lang: session.lang)
                        Text(session.loc(e.titleRu, e.titleKz))
                            .font(.system(size: 24, weight: .bold)).foregroundColor(Palette.text)
                        if let org = vm.org {
                            NavigationLink(value: Route.org(org.id)) {
                                HStack(spacing: 6) {
                                    Image(systemName: "building.2")
                                    Text(org.name ?? "").fontWeight(.semibold)
                                    if org.verified == true { Image(systemName: "checkmark.seal.fill") }
                                }
                                .font(.system(size: 14)).foregroundColor(Palette.ink)
                            }
                        }
                        infoRow("mappin.and.ellipse", session.loc(e.placeRu, e.placeKz))
                        infoRow("calendar", session.loc(e.dateRu, e.dateKz) + (e.time.map { " · \($0)" } ?? ""))
                        infoRow("person.2", store.cityName(e.cityId, lang: session.lang))

                        GoingBar(going: e.going ?? 0, needed: e.needed ?? 0)

                        rsvpButtons(e)

                        if !vm.participants.isEmpty {
                            Text(session.tr("Идут", "Барады"))
                                .font(.system(size: 16, weight: .bold)).padding(.top, 4)
                            participantsStrip
                        }
                    }
                    .padding(16)
                }
            } else {
                LoadStateView(isLoading: vm.loading, error: vm.error,
                              isEmpty: false, emptyText: "") { Task { await vm.load(eventId) } }
                    .frame(maxWidth: .infinity)
            }
        }
        .background(Palette.page.ignoresSafeArea())
        .navigationTitle(session.tr("Сбор", "Жиын"))
        .navigationBarTitleDisplayMode(.inline)
        .task { await vm.load(eventId) }
        .sheet(isPresented: $showAuth) { AuthView() }
    }

    private func rsvpButtons(_ e: Event) -> some View {
        HStack(spacing: 8) {
            rsvp(e, "yes", session.tr("Пойду", "Барамын"), Palette.ink)
            rsvp(e, "maybe", session.tr("Может", "Мүмкін"), Palette.gold)
            rsvp(e, "no", session.tr("Не смогу", "Келе алмаймын"), Palette.danger)
        }
    }

    private func rsvp(_ e: Event, _ value: String, _ label: String, _ color: Color) -> some View {
        Button {
            if session.profiled {
                Task { await vm.setAnswer(e.id, value) }
            } else { showAuth = true }
        } label: {
            Text(label)
                .font(.system(size: 14, weight: .semibold))
                .foregroundColor(vm.answer == value ? .white : color)
                .frame(maxWidth: .infinity).padding(.vertical, 11)
                .background(vm.answer == value ? color : color.opacity(0.12))
                .cornerRadius(12)
        }
        .disabled(vm.busy)
    }

    private var participantsStrip: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 14) {
                ForEach(vm.participants) { p in
                    VStack(spacing: 4) {
                        AvatarView(name: p.name, size: 46)
                        Text(p.name ?? "").font(.system(size: 11)).foregroundColor(Palette.sub).lineLimit(1)
                    }.frame(width: 56)
                }
            }
        }
    }

    private func infoRow(_ icon: String, _ text: String) -> some View {
        Label(text, systemImage: icon)
            .font(.system(size: 14)).foregroundColor(Palette.sub)
    }
}
