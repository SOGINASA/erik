import SwiftUI

struct MessagesView: View {
    @EnvironmentObject var session: Session
    @State private var convos: [Conversation] = []
    @State private var loading = true
    @State private var error: String?
    @State private var showSearch = false

    var body: some View {
        Group {
            if !session.profiled {
                ScrollView { GuestPrompt(text: session.tr("Войдите, чтобы писать сообщения",
                                                          "Хабарлама жазу үшін кіріңіз")).padding(.top, 40) }
            } else {
                ScrollView {
                    LazyVStack(spacing: 10) {
                        if convos.isEmpty {
                            LoadStateView(isLoading: loading, error: error, isEmpty: !loading && error == nil,
                                          emptyText: session.tr("Нет диалогов", "Диалог жоқ")) { Task { await load() } }
                        } else {
                            ForEach(convos) { c in
                                NavigationLink(value: Route.conversation(c.id, c.name ?? "")) { row(c) }
                                    .buttonStyle(.plain)
                            }
                        }
                    }
                    .padding(16)
                }
            }
        }
        .background(Palette.page.ignoresSafeArea())
        .navigationTitle(session.tr("Сообщения", "Хабарламалар"))
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            if session.profiled {
                ToolbarItem(placement: .topBarTrailing) {
                    Button { showSearch = true } label: { Image(systemName: "square.and.pencil") }
                }
            }
        }
        .task { if session.profiled { await load() } }
        .refreshable { if session.profiled { await load() } }
        .sheet(isPresented: $showSearch) { UserSearchSheet { await load() } }
    }

    private func row(_ c: Conversation) -> some View {
        HStack(spacing: 12) {
            AvatarView(name: c.name, size: 48)
            VStack(alignment: .leading, spacing: 3) {
                Text(c.name ?? "").font(.system(size: 15, weight: .semibold)).foregroundColor(Palette.text)
                Text(c.msgs?.last?.txt ?? (c.role ?? ""))
                    .font(.system(size: 13)).foregroundColor(Palette.sub).lineLimit(1)
            }
            Spacer()
        }
        .padding(12).card()
    }

    private func load() async {
        loading = true; error = nil
        do { convos = try await APIClient.shared.conversations() }
        catch { self.error = (error as? APIError)?.message ?? "Ошибка" }
        loading = false
    }
}

struct UserSearchSheet: View {
    let onOpened: () async -> Void
    @EnvironmentObject var session: Session
    @Environment(\.dismiss) private var dismiss
    @State private var query = ""
    @State private var results: [UserProfile] = []
    @State private var searching = false

    var body: some View {
        NavigationStack {
            VStack {
                TextField(session.tr("Имя или телефон", "Аты немесе телефон"), text: $query)
                    .textFieldStyle(.roundedBorder)
                    .padding(.horizontal)
                    .onChange(of: query) { _ in Task { await search() } }
                List(results) { u in
                    Button { Task { await open(u) } } label: {
                        HStack(spacing: 10) {
                            AvatarView(name: u.full_name, size: 38)
                            Text(u.full_name ?? "—").foregroundColor(Palette.text)
                        }
                    }
                }
                .listStyle(.plain)
                Spacer()
            }
            .navigationTitle(session.tr("Новый диалог", "Жаңа диалог"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .topBarTrailing) {
                Button(session.tr("Закрыть", "Жабу")) { dismiss() } } }
        }
    }

    private func search() async {
        guard query.count >= 2 else { results = []; return }
        searching = true
        results = (try? await APIClient.shared.searchUsers(query)) ?? []
        searching = false
    }
    private func open(_ u: UserProfile) async {
        if (try? await APIClient.shared.createConversation(peerUserId: u.id)) != nil {
            await onOpened()
            dismiss()
        }
    }
}
