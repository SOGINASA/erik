import SwiftUI

/// Быстрый вход по устройству: имя, роль, город.
struct OnboardingView: View {
    var inSheet: Bool = false
    var onDone: (() -> Void)? = nil

    @EnvironmentObject var session: Session
    @EnvironmentObject var store: PlatformStore
    @Environment(\.dismiss) private var dismiss
    @State private var name = ""
    @State private var role = "vol"
    @State private var cityId: String?
    @State private var busy = false
    @State private var error: String?
    @State private var legal = LegalAcceptance()
    @State private var legalDocuments: LegalDocuments?

    private let roles: [(String, String, String)] = [
        ("vol", "Волонтёр", "Волонтёр"),
        ("coord", "Координатор", "Үйлестіруші"),
        ("org", "Организация", "Ұйым"),
    ]

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                Text(session.tr("Как вас зовут?", "Атыңыз кім?"))
                    .font(.system(size: 22, weight: .bold))
                TextField(session.tr("Фамилия, имя, отчество (если есть)", "Тегі, аты, әкесінің аты (бар болса)"), text: $name)
                    .padding(12).background(Palette.card)
                    .overlay(RoundedRectangle(cornerRadius: 12).stroke(Palette.line))

                Text(session.tr("Ваша роль", "Рөліңіз")).font(.system(size: 17, weight: .semibold))
                HStack(spacing: 8) {
                    ForEach(roles, id: \.0) { r in
                        Button { role = r.0 } label: {
                            Text(session.tr(r.1, r.2))
                                .font(.system(size: 13, weight: .semibold))
                                .foregroundColor(role == r.0 ? .white : Palette.text)
                                .frame(maxWidth: .infinity).padding(.vertical, 10)
                                .background(role == r.0 ? Palette.ink : Palette.card)
                                .overlay(RoundedRectangle(cornerRadius: 10).stroke(Palette.line, lineWidth: role == r.0 ? 0 : 1))
                                .cornerRadius(10)
                        }
                    }
                }

                Text(session.tr("Город", "Қала")).font(.system(size: 17, weight: .semibold))
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 8) {
                        ForEach(store.cities) { c in
                            FilterPill(title: session.lang == .ru ? c.ru : c.kz, active: cityId == c.id) {
                                cityId = (cityId == c.id ? nil : c.id)
                            }
                        }
                    }
                }

                LegalAcceptanceSection(acceptance: $legal, documents: $legalDocuments)
                if let error = error {
                    Text(error).foregroundColor(Palette.danger).font(.system(size: 13))
                }
                Button(session.tr("Продолжить", "Жалғастыру")) { Task { await go() } }
                    .buttonStyle(PrimaryButtonStyle(enabled: canSubmit && !busy))
                    .disabled(!canSubmit || busy)
                    .padding(.top, 8)
            }
            .padding(20)
        }
        .background(Palette.page.ignoresSafeArea())
        .navigationTitle(session.tr("Добро пожаловать", "Қош келдіңіз"))
        .navigationBarTitleDisplayMode(.inline)
    }

    private func go() async {
        busy = true; defer { busy = false }
        error = nil
        do {
            try await session.continueAsGuest(name: name, role: role, cityId: cityId, legal: legal)
            onDone?()
            if !inSheet { dismiss() }
        } catch {
            self.error = (error as? APIError)?.message ?? session.tr("Не удалось продолжить", "Жалғастыру мүмкін болмады")
            if (error as? APIError)?.status == 409 {
                legal = LegalAcceptance()
                legalDocuments = nil
            }
        }
    }

    private var canSubmit: Bool {
        name.split(whereSeparator: { $0.isWhitespace }).count >= 2
            && legalDocuments?.registrationAvailable == true && legal.isComplete
    }
}
