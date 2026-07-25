import SwiftUI

struct NotificationsView: View {
    @EnvironmentObject var session: Session
    @State private var items: [AppNotification] = []
    @State private var loading = true
    @State private var error: String?

    var body: some View {
        ScrollView {
            LazyVStack(spacing: 10) {
                if !session.profiled {
                    GuestPrompt(text: session.tr("Войдите, чтобы видеть уведомления",
                                                 "Хабарламаларды көру үшін кіріңіз"))
                } else if items.isEmpty {
                    LoadStateView(isLoading: loading, error: error, isEmpty: !loading && error == nil,
                                  emptyText: session.tr("Нет уведомлений", "Хабарлама жоқ")) { Task { await load() } }
                } else {
                    ForEach(items) { n in
                        HStack(alignment: .top, spacing: 10) {
                            Circle().fill(n.read == true ? Palette.line : Palette.ink)
                                .frame(width: 8, height: 8).padding(.top, 6)
                            VStack(alignment: .leading, spacing: 3) {
                                Text(session.loc(n.ru, n.kz)).font(.system(size: 14)).foregroundColor(Palette.text)
                                if let t = n.created_at { Text(prettyDate(t)).font(.system(size: 11)).foregroundColor(Palette.sub) }
                            }
                            Spacer()
                        }
                        .padding(12).card()
                    }
                }
            }
            .padding(16)
        }
        .background(Palette.page.ignoresSafeArea())
        .navigationTitle(session.tr("Уведомления", "Хабарламалар"))
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            if session.profiled && !items.isEmpty {
                ToolbarItem(placement: .topBarTrailing) {
                    Button(session.tr("Прочитать все", "Барлығын оқу")) { Task { await readAll() } }
                }
            }
        }
        .task { if session.profiled { await load() } }
        .refreshable { if session.profiled { await load() } }
    }

    private func load() async {
        loading = true; error = nil
        do { items = try await APIClient.shared.notifications().notifications }
        catch { self.error = (error as? APIError)?.message ?? "Ошибка" }
        loading = false
    }
    private func readAll() async {
        try? await APIClient.shared.readAllNotifications()
        await load()
    }
}

/// Приглашение войти для гостя.
struct GuestPrompt: View {
    let text: String
    @EnvironmentObject var session: Session
    @State private var showAuth = false
    var body: some View {
        VStack(spacing: 14) {
            Image(systemName: "lock").font(.system(size: 32)).foregroundColor(Palette.sub)
            Text(text).foregroundColor(Palette.sub).multilineTextAlignment(.center)
            Button(session.tr("Войти", "Кіру")) { showAuth = true }
                .buttonStyle(PrimaryButtonStyle()).frame(maxWidth: 220)
        }
        .padding(30)
        .sheet(isPresented: $showAuth) { AuthView() }
    }
}

/// Короткая дата из ISO-строки.
func prettyDate(_ iso: String) -> String {
    let f = ISO8601DateFormatter()
    f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    let date = f.date(from: iso) ?? ISO8601DateFormatter().date(from: iso)
    guard let date = date else { return "" }
    let out = DateFormatter()
    out.dateFormat = "d MMM, HH:mm"
    out.locale = Locale(identifier: "ru_RU")
    return out.string(from: date)
}
