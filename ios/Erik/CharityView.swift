import SwiftUI

struct CharityView: View {
    @EnvironmentObject var session: Session
    @EnvironmentObject var store: PlatformStore
    @State private var items: [Charity] = []
    @State private var loading = true
    @State private var error: String?
    @State private var donateTarget: Charity?
    @State private var showAuth = false

    var body: some View {
        ScrollView {
            LazyVStack(spacing: 14) {
                if items.isEmpty {
                    LoadStateView(isLoading: loading, error: error, isEmpty: !loading && error == nil,
                                  emptyText: session.tr("Пока нет сборов помощи", "Әзірге көмек жиындары жоқ")) {
                        Task { await load() }
                    }
                } else {
                    ForEach(items) { c in card(c) }
                }
            }
            .padding(16)
        }
        .background(Palette.page.ignoresSafeArea())
        .navigationTitle(session.tr("Помощь", "Көмек"))
        .navigationBarTitleDisplayMode(.inline)
        .toolbar { ToolbarItem(placement: .topBarLeading) { LangToggle() } }
        .task { if items.isEmpty { await load() } }
        .refreshable { await load() }
        .sheet(item: $donateTarget) { c in DonateSheet(charity: c) { await load() } }
        .sheet(isPresented: $showAuth) { AuthView() }
    }

    private func card(_ c: Charity) -> some View {
        let ratio = (c.goal ?? 0) > 0 ? min(1, Double(c.raised ?? 0) / Double(c.goal!)) : 0
        return VStack(alignment: .leading, spacing: 0) {
            CoverView(image: c.image, tint: Color(hex: "E8F1EB"), height: 130)
            VStack(alignment: .leading, spacing: 10) {
                Text(session.loc(c.titleRu, c.titleKz))
                    .font(.system(size: 17, weight: .bold)).foregroundColor(Palette.text)
                GeometryReader { geo in
                    ZStack(alignment: .leading) {
                        Capsule().fill(Palette.line)
                        Capsule().fill(Palette.ink).frame(width: geo.size.width * ratio)
                    }
                }.frame(height: 8)
                HStack {
                    Text("\(c.raised ?? 0) / \(c.goal ?? 0) \(c.unit ?? "")")
                        .font(.system(size: 13, weight: .medium)).foregroundColor(Palette.sub)
                    Spacer()
                    Button(session.tr("Помочь", "Көмектесу")) {
                        if session.profiled { donateTarget = c } else { showAuth = true }
                    }
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundColor(.white)
                    .padding(.horizontal, 16).padding(.vertical, 8)
                    .background(Palette.ink).cornerRadius(10)
                }
            }
            .padding(14)
        }
        .card()
    }

    private func load() async {
        loading = true; error = nil
        do { items = try await APIClient.shared.charity() }
        catch { self.error = (error as? APIError)?.message ?? "Ошибка" }
        loading = false
    }
}

struct DonateSheet: View {
    let charity: Charity
    let onDone: () async -> Void
    @EnvironmentObject var session: Session
    @Environment(\.dismiss) private var dismiss
    @State private var amount = ""
    @State private var busy = false
    @State private var error: String?

    var body: some View {
        NavigationStack {
            VStack(alignment: .leading, spacing: 16) {
                Text(session.loc(charity.titleRu, charity.titleKz))
                    .font(.system(size: 18, weight: .bold))
                TextField(session.tr("Сумма/количество", "Сома/саны"), text: $amount)
                    .keyboardType(.numberPad)
                    .padding(12)
                    .background(Palette.card)
                    .overlay(RoundedRectangle(cornerRadius: 12).stroke(Palette.line))
                if let error = error { Text(error).foregroundColor(Palette.danger).font(.system(size: 13)) }
                Button(session.tr("Отправить", "Жіберу")) { Task { await donate() } }
                    .buttonStyle(PrimaryButtonStyle(enabled: !busy && Int(amount) != nil))
                    .disabled(busy || Int(amount) == nil)
                Spacer()
            }
            .padding(20)
            .navigationTitle(session.tr("Помочь", "Көмектесу"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .topBarTrailing) {
                Button(session.tr("Закрыть", "Жабу")) { dismiss() }
            } }
        }
    }

    private func donate() async {
        guard let value = Int(amount) else { return }
        busy = true; defer { busy = false }
        do {
            try await APIClient.shared.donate(charity.id, amount: value)
            await onDone()
            dismiss()
        } catch {
            self.error = (error as? APIError)?.message ?? "Не удалось"
        }
    }
}
