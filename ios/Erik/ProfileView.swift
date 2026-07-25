import SwiftUI

struct ProfileView: View {
    let userId: Int
    @EnvironmentObject var session: Session
    @EnvironmentObject var store: PlatformStore
    @State private var user: UserProfile?
    @State private var loading = true

    private var isMe: Bool { session.user?.id == userId }

    var body: some View {
        ScrollView {
            if let u = user ?? (isMe ? session.user : nil) {
                VStack(spacing: 16) {
                    AvatarView(name: u.full_name, size: 88)
                    Text(u.full_name ?? session.tr("Волонтёр", "Волонтёр"))
                        .font(.system(size: 22, weight: .bold))
                    Text(roleLabel(u.role)).font(.system(size: 14)).foregroundColor(Palette.ink)
                    if let city = store.cityName(u.city_id, lang: session.lang) as String?, !city.isEmpty {
                        Label(city, systemImage: "mappin").font(.system(size: 13)).foregroundColor(Palette.sub)
                    }
                    HStack(spacing: 14) {
                        statCard("\(u.hours_total ?? 0)", session.tr("часов", "сағат"))
                        statCard("\(u.events_attended ?? 0)", session.tr("событий", "іс-шара"))
                        statCard("\(u.reliability ?? 0)%", session.tr("надёжность", "сенімділік"))
                    }
                    if let skills = u.skills, !skills.isEmpty {
                        FlowChips(items: skills)
                    }
                    if isMe {
                        NavigationLink(value: Route.editProfile) {
                            Text(session.tr("Редактировать профиль", "Профильді өңдеу"))
                        }.buttonStyle(SecondaryButtonStyle())
                    }
                }
                .padding(20)
            } else {
                LoadStateView(isLoading: loading, error: nil, isEmpty: false, emptyText: "")
            }
        }
        .background(Palette.page.ignoresSafeArea())
        .navigationTitle(session.tr("Профиль", "Профиль"))
        .navigationBarTitleDisplayMode(.inline)
        .task { await load() }
    }

    private func statCard(_ v: String, _ l: String) -> some View {
        VStack(spacing: 4) {
            Text(v).font(.system(size: 20, weight: .bold)).foregroundColor(Palette.ink)
            Text(l).font(.system(size: 11)).foregroundColor(Palette.sub)
        }
        .frame(maxWidth: .infinity).padding(.vertical, 14).card()
    }

    private func roleLabel(_ role: String?) -> String {
        switch role {
        case "coord": return session.tr("Координатор", "Үйлестіруші")
        case "org": return session.tr("Организация", "Ұйым")
        case "admin": return session.tr("Администратор", "Әкімші")
        default: return session.tr("Волонтёр", "Волонтёр")
        }
    }

    private func load() async {
        loading = true
        if isMe { user = session.user }
        user = (try? await APIClient.shared.userPublic(userId)) ?? user
        loading = false
    }
}

/// Простые чипы навыков в строку с переносом.
struct FlowChips: View {
    let items: [String]
    var body: some View {
        let cols = [GridItem(.adaptive(minimum: 80), spacing: 8)]
        LazyVGrid(columns: cols, alignment: .leading, spacing: 8) {
            ForEach(items, id: \.self) { s in
                Text(s)
                    .font(.system(size: 12, weight: .medium)).foregroundColor(Palette.ink)
                    .padding(.horizontal, 10).padding(.vertical, 5)
                    .background(Color(hex: "E8F1EB")).cornerRadius(8)
            }
        }
    }
}
