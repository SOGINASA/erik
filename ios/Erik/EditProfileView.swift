import SwiftUI

struct EditProfileView: View {
    @EnvironmentObject var session: Session
    @EnvironmentObject var store: PlatformStore
    @Environment(\.dismiss) private var dismiss
    @State private var name = ""
    @State private var phone = ""
    @State private var cityId: String?
    @State private var busy = false
    @State private var saved = false

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                labeled(session.tr("Имя", "Аты")) {
                    TextField("", text: $name).textFieldStyle(.roundedBorder)
                }
                labeled(session.tr("Телефон", "Телефон")) {
                    TextField("", text: $phone).keyboardType(.phonePad).textFieldStyle(.roundedBorder)
                }
                Text(session.tr("Город", "Қала")).font(.system(size: 15, weight: .semibold))
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 8) {
                        ForEach(store.cities) { c in
                            FilterPill(title: session.lang == .ru ? c.ru : c.kz, active: cityId == c.id) {
                                cityId = c.id
                            }
                        }
                    }
                }
                Button(saved ? session.tr("Сохранено", "Сақталды") : session.tr("Сохранить", "Сақтау")) {
                    Task { await save() }
                }
                .buttonStyle(PrimaryButtonStyle(enabled: !busy))
                .disabled(busy)
            }
            .padding(20)
        }
        .background(Palette.page.ignoresSafeArea())
        .navigationTitle(session.tr("Профиль", "Профиль"))
        .navigationBarTitleDisplayMode(.inline)
        .onAppear {
            name = session.user?.full_name ?? ""
            phone = session.user?.phone ?? ""
            cityId = session.user?.city_id
        }
    }

    private func labeled<Content: View>(_ title: String, @ViewBuilder _ content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(title).font(.system(size: 15, weight: .semibold)).foregroundColor(Palette.text)
            content()
        }
    }

    private func save() async {
        busy = true; defer { busy = false }
        var patch: [String: String] = [:]
        if !name.isEmpty { patch["name"] = name }
        if !phone.isEmpty { patch["phone"] = phone }
        if let cityId = cityId { patch["cityId"] = cityId }
        do { try await session.updateProfile(patch); saved = true }
        catch {}
    }
}
