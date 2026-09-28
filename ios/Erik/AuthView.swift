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
    @State private var legal = LegalAcceptance()
    @State private var legalDocuments: LegalDocuments?

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
                        field(session.tr("Фамилия, имя, отчество (если есть)", "Тегі, аты, әкесінің аты (бар болса)"), text: $fullName)
                    }
                    field(session.tr("Email или никнейм", "Email немесе никнейм"), text: $identifier)
                    secureField(session.tr("Пароль", "Құпиясөз"), text: $password)

                    if mode == .register {
                        LegalAcceptanceSection(acceptance: $legal, documents: $legalDocuments)
                    }

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
        guard !identifier.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty, password.count >= 4 else { return false }
        return mode == .login || (fullName.split(whereSeparator: { $0.isWhitespace }).count >= 2
                                 && legalDocuments?.registrationAvailable == true && legal.isComplete)
    }

    private func submit() async {
        busy = true; defer { busy = false }
        error = nil
        do {
            if mode == .login {
                try await session.loginWithPassword(identifier: identifier, password: password)
            } else {
                try await session.registerAccount(identifier: identifier, password: password,
                                                  fullName: fullName, role: "vol", phone: nil, cityId: nil,
                                                  legal: legal)
            }
            dismiss()
        } catch {
            self.error = (error as? APIError)?.message ?? session.tr("Не удалось", "Сәтсіз аяқталды")
            if (error as? APIError)?.status == 409 {
                legal = LegalAcceptance()
                legalDocuments = nil
            }
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

/// Единый блок для аккаунта и быстрого входа: без заранее проставленных отметок.
struct LegalAcceptanceSection: View {
    @EnvironmentObject var session: Session
    @Binding var acceptance: LegalAcceptance
    @Binding var documents: LegalDocuments?
    @State private var loading = false
    @State private var loadError = false

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(session.tr("Перед регистрацией", "Тіркелу алдында"))
                .font(.system(size: 17, weight: .semibold))
            Link(session.tr("Условия использования", "Пайдалану шарттары"), destination: documentURL("terms"))
            Link(session.tr("Политика конфиденциальности", "Құпиялық саясаты"), destination: documentURL("privacy"))
            Link(session.tr("Согласие на обработку персональных данных", "Дербес деректерді өңдеуге келісім"), destination: documentURL("consent"))

            if loading {
                ProgressView(session.tr("Загружаем условия…", "Шарттар жүктелуде…"))
            } else if loadError {
                Text(session.tr("Не удалось загрузить действующие условия. Регистрация станет доступна после повторной загрузки.",
                                "Қолданыстағы шарттар жүктелмеді. Қайта жүктегеннен кейін тіркелуге болады."))
                    .foregroundColor(Palette.danger)
                Button(session.tr("Повторить", "Қайталау")) { Task { await load() } }
            } else if documents?.registrationAvailable == false {
                Text(session.tr("Регистрация временно недоступна. Попробуйте позже.",
                                "Тіркелу уақытша қолжетімсіз. Кейінірек қайталап көріңіз."))
                    .foregroundColor(Palette.danger)
            }

            Group {
                Toggle(session.tr("Принимаю условия использования", "Пайдалану шарттарын қабылдаймын"), isOn: $acceptance.termsAccepted)
                Toggle(session.tr("Ознакомился(-ась) с политикой конфиденциальности", "Құпиялық саясатымен таныстым"), isOn: $acceptance.privacyAccepted)
                Toggle(session.tr("Даю согласие на сбор и обработку данных на указанных условиях", "Көрсетілген шарттар бойынша деректерді жинауға және өңдеуге келісемін"), isOn: $acceptance.consentAccepted)
                Toggle(session.tr("Мне исполнилось 18 лет. Действую от своего имени", "Мен 18 жасқа толдым. Өз атымнан әрекет етемін"), isOn: $acceptance.adultConfirmed)
            }
            .toggleStyle(LegalCheckboxStyle())
            .disabled(documents?.registrationAvailable != true || loading)
            Text(session.tr("Самостоятельная регистрация доступна с 18 лет. Профиль, рейтинг и сведения об участии могут быть публичными; личная переписка, полный телефон и email публично не размещаются.",
                            "Өз бетіңізше тіркелу 18 жастан бастап қолжетімді. Профиль, рейтинг және қатысу деректері жария болуы мүмкін; жеке хаттар, толық телефон нөмірі және email жарияланбайды."))
                .foregroundColor(Palette.text).font(.system(size: 12))
        }
        .font(.system(size: 14))
        .frame(maxWidth: .infinity, alignment: .leading)
        .task { await load() }
        .onChange(of: documents?.version) { version in
            // Например, сервер отклонил устаревшую редакцию при отправке формы.
            if version == nil && !loading { Task { await load() } }
        }
    }

    private func documentURL(_ path: String) -> URL {
        URL(string: assetBase + "/" + path + "?lang=" + session.lang.rawValue)!
    }

    @MainActor
    private func load() async {
        guard !loading else { return }
        loading = true
        loadError = false
        defer { loading = false }
        do {
            let current = try await APIClient.shared.legalDocuments()
            if current.version != acceptance.version {
                acceptance = LegalAcceptance(version: current.version)
            }
            documents = current
        } catch {
            loadError = true
            documents = nil
            acceptance = LegalAcceptance()
        }
    }
}

private struct LegalCheckboxStyle: ToggleStyle {
    func makeBody(configuration: Configuration) -> some View {
        Button { configuration.isOn.toggle() } label: {
            HStack(alignment: .top, spacing: 10) {
                Image(systemName: configuration.isOn ? "checkmark.square.fill" : "square")
                    .font(.system(size: 22))
                configuration.label.multilineTextAlignment(.leading)
                Spacer(minLength: 0)
            }
            .frame(minHeight: 44, alignment: .leading)
        }
        .buttonStyle(.plain)
        .accessibilityValue(configuration.isOn ? Text("✓") : Text("—"))
        .accessibilityAddTraits(configuration.isOn ? [.isSelected] : [])
    }
}
