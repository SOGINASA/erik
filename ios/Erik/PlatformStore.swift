import Foundation

/// Кэш справочников и публичных данных платформы (аналог usePlatformStore).
@MainActor
final class PlatformStore: ObservableObject {
    @Published var cities: [City] = []
    @Published var themes: [Theme] = []
    @Published var badges: [Badge] = []
    @Published var loaded = false

    private var themeById: [String: Theme] = [:]
    private var cityById: [String: City] = [:]

    func load() async {
        async let c = try? APIClient.shared.cities()
        async let t = try? APIClient.shared.themes()
        async let b = try? APIClient.shared.badges()
        let (cc, tt, bb) = await (c, t, b)
        if let cc = cc { cities = cc; cityById = Dictionary(uniqueKeysWithValues: cc.map { ($0.id, $0) }) }
        if let tt = tt { themes = tt; themeById = Dictionary(uniqueKeysWithValues: tt.map { ($0.id, $0) }) }
        if let bb = bb { badges = bb }
        loaded = true
    }

    func theme(_ id: String?) -> Theme? { id.flatMap { themeById[$0] } }
    func city(_ id: String?) -> City? { id.flatMap { cityById[$0] } }
    func cityName(_ id: String?, lang: Lang) -> String {
        guard let c = city(id) else { return "" }
        return lang == .ru ? c.ru : c.kz
    }
}
