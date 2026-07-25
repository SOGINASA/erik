import SwiftUI

struct MoreView: View {
    @EnvironmentObject var session: Session
    @EnvironmentObject var store: PlatformStore
    @State private var showAuth = false

    var body: some View {
        ScrollView {
            VStack(spacing: 14) {
                header
                VStack(spacing: 0) {
                    if let me = session.user, session.profiled {
                        rowLink(Route.user(me.id), "person.crop.circle", session.tr("Мой профиль", "Менің профилім"))
                        Divider().padding(.leading, 48)
                    }
                    rowLink(Route.myEvents, "checkmark.circle", session.tr("Мои мероприятия", "Менің іс-шараларым"))
                    Divider().padding(.leading, 48)
                    rowLink(Route.orgsList, "building.2", session.tr("Организации (НКО)", "Ұйымдар (ҮЕҰ)"))
                    Divider().padding(.leading, 48)
                    rowLink(Route.messages, "message", session.tr("Сообщения", "Хабарламалар"))
                    Divider().padding(.leading, 48)
                    rowLink(Route.notifications, "bell", session.tr("Уведомления", "Хабарламалар"))
                    if session.isOrganizer {
                        Divider().padding(.leading, 48)
                        rowLink(Route.manage, "calendar", session.tr("Штаб организатора", "Ұйымдастырушы штабы"))
                    }
                    if session.isAdmin {
                        Divider().padding(.leading, 48)
                        rowLink(Route.admin, "shield", session.tr("Админ-панель", "Әкімші панелі"))
                    }
                }
                .card()

                VStack(spacing: 0) {
                    Button { session.toggleLang() } label: {
                        rowContent("globe", session.tr("Язык: Русский", "Тіл: Қазақша"),
                                   trailing: session.lang == .ru ? "RU" : "KZ")
                    }
                    if session.profiled {
                        Divider().padding(.leading, 48)
                        Button { session.logout() } label: {
                            rowContent("arrow.right.square", session.tr("Выйти", "Шығу"), tint: Palette.danger)
                        }
                    }
                }
                .card()
            }
            .padding(16)
        }
        .background(Palette.page.ignoresSafeArea())
        .navigationTitle(session.tr("Ещё", "Тағы"))
        .navigationBarTitleDisplayMode(.inline)
        .erikDestinations()
        .sheet(isPresented: $showAuth) { AuthView() }
    }

    @ViewBuilder private var header: some View {
        if session.profiled, let me = session.user {
            HStack(spacing: 14) {
                AvatarView(name: me.full_name, size: 60)
                VStack(alignment: .leading, spacing: 3) {
                    Text(me.full_name ?? "").font(.system(size: 19, weight: .bold)).foregroundColor(Palette.text)
                    Text(store.cityName(me.city_id, lang: session.lang)).font(.system(size: 13)).foregroundColor(Palette.sub)
                }
                Spacer()
            }
            .padding(16).card()
        } else {
            VStack(spacing: 12) {
                Text(session.tr("Вы не вошли", "Сіз кірмегенсіз")).font(.system(size: 17, weight: .semibold))
                Button(session.tr("Войти или зарегистрироваться", "Кіру немесе тіркелу")) { showAuth = true }
                    .buttonStyle(PrimaryButtonStyle())
            }
            .padding(16).card()
        }
    }

    private func rowLink(_ route: Route, _ icon: String, _ title: String) -> some View {
        NavigationLink(value: route) { rowContent(icon, title) }
    }

    private func rowContent(_ icon: String, _ title: String, trailing: String? = nil, tint: Color = Palette.text) -> some View {
        HStack(spacing: 14) {
            Image(systemName: icon).font(.system(size: 18)).foregroundColor(tint == Palette.danger ? Palette.danger : Palette.ink).frame(width: 24)
            Text(title).font(.system(size: 15)).foregroundColor(tint)
            Spacer()
            if let trailing = trailing { Text(trailing).font(.system(size: 13, weight: .semibold)).foregroundColor(Palette.sub) }
            else { Image(systemName: "chevron.right").font(.system(size: 13)).foregroundColor(Palette.sub) }
        }
        .padding(14)
        .contentShape(Rectangle())
    }
}
