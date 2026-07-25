import SwiftUI

struct ConversationView: View {
    let conversationId: Int
    let title: String
    @EnvironmentObject var session: Session
    @State private var messages: [ChatMessage] = []
    @State private var draft = ""
    @State private var loading = true
    @State private var sending = false

    var body: some View {
        VStack(spacing: 0) {
            ScrollViewReader { proxy in
                ScrollView {
                    LazyVStack(spacing: 8) {
                        ForEach(Array(messages.enumerated()), id: \.offset) { idx, m in
                            bubble(m).id(idx)
                        }
                    }
                    .padding(16)
                }
                .onChange(of: messages.count) { _ in
                    if let last = messages.indices.last {
                        withAnimation { proxy.scrollTo(last, anchor: .bottom) }
                    }
                }
            }
            inputBar
        }
        .background(Palette.page.ignoresSafeArea())
        .navigationTitle(title)
        .navigationBarTitleDisplayMode(.inline)
        .task { await load() }
    }

    private func bubble(_ m: ChatMessage) -> some View {
        HStack {
            if m.me { Spacer(minLength: 40) }
            Text(m.txt)
                .font(.system(size: 15))
                .foregroundColor(m.me ? .white : Palette.text)
                .padding(.horizontal, 12).padding(.vertical, 8)
                .background(m.me ? Palette.ink : Palette.card)
                .overlay(RoundedRectangle(cornerRadius: 14).stroke(m.me ? Color.clear : Palette.line))
                .cornerRadius(14)
            if !m.me { Spacer(minLength: 40) }
        }
        .frame(maxWidth: .infinity, alignment: m.me ? .trailing : .leading)
    }

    private var inputBar: some View {
        HStack(spacing: 10) {
            TextField(session.tr("Сообщение…", "Хабарлама…"), text: $draft, axis: .vertical)
                .padding(10)
                .background(Palette.card)
                .overlay(RoundedRectangle(cornerRadius: 20).stroke(Palette.line))
                .cornerRadius(20)
            Button { Task { await send() } } label: {
                Image(systemName: "arrow.up.circle.fill")
                    .font(.system(size: 30))
                    .foregroundColor(draft.trimmingCharacters(in: .whitespaces).isEmpty ? Palette.line : Palette.ink)
            }
            .disabled(sending || draft.trimmingCharacters(in: .whitespaces).isEmpty)
        }
        .padding(12)
        .background(Palette.page)
    }

    private func load() async {
        loading = true
        if let c = try? await APIClient.shared.conversation(conversationId) {
            messages = c.msgs ?? []
        }
        loading = false
    }

    private func send() async {
        let text = draft.trimmingCharacters(in: .whitespaces)
        guard !text.isEmpty else { return }
        sending = true; defer { sending = false }
        messages.append(ChatMessage(me: true, txt: text, created_at: nil))
        draft = ""
        do { try await APIClient.shared.sendMessage(conversationId, text: text) }
        catch { /* оптимистично оставляем */ }
    }
}
