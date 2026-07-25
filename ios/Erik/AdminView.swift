import SwiftUI

/// Админ-панель: сводка платформы и модерация НКО.
struct AdminView: View {
    @EnvironmentObject var session: Session
    @State private var stats: AdminStats?
    @State private var pending: [Org] = []
    @State private var loading = true
    @State private var error: String?

    private let cols = [GridItem(.flexible(), spacing: 12), GridItem(.flexible(), spacing: 12)]

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                if let s = stats {
                    LazyVGrid(columns: cols, spacing: 12) {
                        statTile("\(s.users ?? 0)", session.tr("Пользователей", "Қолданушы"))
                        statTile("\(s.volunteers ?? 0)", session.tr("Волонтёров", "Волонтёр"))
                        statTile("\(s.activeEvents ?? 0)", session.tr("Активных сборов", "Белсенді жиын"))
                        statTile("\(s.pendingEvents ?? 0)", session.tr("На модерации", "Модерацияда"))
                        statTile("\(s.verifiedOrgs ?? 0)", session.tr("НКО проверено", "ҮЕҰ тексерілді"))
                        statTile("\(s.openReports ?? 0)", session.tr("Открытых жалоб", "Ашық шағым"))
                        statTile("\(s.hoursTotal ?? 0)", session.tr("Часов волонтёрства", "Волонтёр сағаты"))
                        statTile("\(s.raised ?? 0) ₸", session.tr("Собрано помощи", "Жиналған көмек"))
                    }
                }

                if !pending.isEmpty {
                    Text(session.tr("НКО на модерации", "Модерациядағы ҮЕҰ"))
                        .font(.system(size: 18, weight: .bold))
                    ForEach(pending) { o in moderationRow(o) }
                } else if !loading {
                    Text(session.tr("Заявок на модерацию нет", "Модерацияға өтінім жоқ"))
                        .font(.system(size: 14)).foregroundColor(Palette.sub)
                }

                if loading { ProgressView().frame(maxWidth: .infinity).padding() }
                if let error = error {
                    Text(error).foregroundColor(Palette.danger).font(.system(size: 13))
                }
            }
            .padding(16)
        }
        .background(Palette.page.ignoresSafeArea())
        .navigationTitle(session.tr("Админ-панель", "Әкімші панелі"))
        .navigationBarTitleDisplayMode(.inline)
        .task { await load() }
        .refreshable { await load() }
    }

    private func statTile(_ v: String, _ l: String) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(v).font(.system(size: 22, weight: .bold)).foregroundColor(Palette.ink)
            Text(l).font(.system(size: 12)).foregroundColor(Palette.sub)
        }
        .frame(maxWidth: .infinity, alignment: .leading).padding(14).card()
    }

    private func moderationRow(_ o: Org) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(o.name ?? "").font(.system(size: 15, weight: .semibold)).foregroundColor(Palette.text)
            Text(session.loc(o.aboutRu, o.aboutKz)).font(.system(size: 13)).foregroundColor(Palette.sub).lineLimit(2)
            HStack(spacing: 10) {
                Button(session.tr("Одобрить", "Мақұлдау")) { Task { await approve(o.id) } }
                    .font(.system(size: 14, weight: .semibold)).foregroundColor(.white)
                    .padding(.horizontal, 16).padding(.vertical, 8).background(Palette.ink).cornerRadius(10)
                Button(session.tr("Отклонить", "Қабылдамау")) { Task { await reject(o.id) } }
                    .font(.system(size: 14, weight: .semibold)).foregroundColor(Palette.danger)
                    .padding(.horizontal, 16).padding(.vertical, 8)
                    .background(Palette.danger.opacity(0.12)).cornerRadius(10)
            }
        }
        .padding(14).card()
    }

    private func load() async {
        loading = true; error = nil
        do {
            stats = try await APIClient.shared.adminStats()
            pending = (try? await APIClient.shared.adminOrgs(status: "pending")) ?? []
        } catch {
            self.error = (error as? APIError)?.message ?? session.tr("Доступно только администраторам",
                                                                     "Тек әкімшілерге қолжетімді")
        }
        loading = false
    }

    private func approve(_ id: Int) async {
        try? await APIClient.shared.approveOrg(id)
        pending.removeAll { $0.id == id }
    }
    private func reject(_ id: Int) async {
        try? await APIClient.shared.rejectOrg(id)
        pending.removeAll { $0.id == id }
    }
}
