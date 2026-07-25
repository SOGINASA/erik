import SwiftUI

struct AuthView: View {
    @EnvironmentObject var session: Session
    @Environment(\.dismiss) private var dismiss
    @State private var mode: Mode = .login
    @State private var identifier = ""
    @State private var password = ""
    @State private var fullName = ""
    @State private var busy = false
    @State private var error: String?

    enum Mode { case login, register }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 16) {
                    Text("erik.").font(.system(size: 34, weight: .bold)).foregroundColor(Palette.ink)
                    Picker("", selection: $mode) {
                        Text(session.tr("Вход", "Кіру")).tag(Mode.login)
                        Text(session.tr("Регистрация", "Тіркелу")).tag(Mode.register)
                    }
                    .pickerStyle(.segmented)

                    if mode == .register {
                        field(session.tr("Имя и фамилия", "Аты-жөні"), text: $fullName)
                    }
                    field(session.tr("Email или никнейм", "Email немесе никнейм"), text: $identifier)
                    secureField(session.tr("Пароль", "Құпиясөз"), text: $password)

                    if let error = error {
                        Text(error).foregroundColor(Palette.danger).font(.system(size: 13))
                    }

                    Button(mode == .login ? session.tr("Войти", "Кіру") : session.tr("Создать аккаунт", "Аккаунт құру")) {
                        Task { await submit() }
                    }
                    .buttonStyle(PrimaryButtonStyle(enabled: canSubmit && !busy))
                    .disabled(!canSubmit || busy)

                    Divider().padding(.vertical, 4)

                    NavigationLink {
                        OnboardingView(inSheet: true) { dismiss() }
                    } label: {
                        Text(session.tr("Продолжить как гость", "Қонақ ретінде жалғастыру"))
                    }
                    .buttonStyle(SecondaryButtonStyle())
                }
                .padding(24)
            }
            .background(Palette.page.ignoresSafeArea())
            .toolbar { ToolbarItem(placement: .topBarTrailing) {
                Button(session.tr("Закрыть", "Жабу")) { dismiss() } } }
        }
    }

    private var canSubmit: Bool {
        !identifier.isEmpty && password.count >= 4 && (mode == .login || !fullName.isEmpty)
    }

    private func submit() async {
        busy = true; defer { busy = false }
        error = nil
        do {
            if mode == .login {
                try await session.loginWithPassword(identifier: identifier, password: password)
            } else {
                try await session.registerAccount(identifier: identifier, password: password,
                                                  fullName: fullName, role: "vol", phone: nil, cityId: nil)
            }
            dismiss()
        } catch {
            self.error = (error as? APIError)?.message ?? session.tr("Не удалось", "Сәтсіз аяқталды")
        }
    }

    private func field(_ placeholder: String, text: Binding<String>) -> some View {
        TextField(placeholder, text: text)
            .autocorrectionDisabled().textInputAutocapitalization(.never)
            .padding(12).background(Palette.card)
            .overlay(RoundedRectangle(cornerRadius: 12).stroke(Palette.line))
    }
    private func secureField(_ placeholder: String, text: Binding<String>) -> some View {
        SecureField(placeholder, text: text)
            .padding(12).background(Palette.card)
            .overlay(RoundedRectangle(cornerRadius: 12).stroke(Palette.line))
    }
}
