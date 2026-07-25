import Foundation
import SwiftUI

enum Lang: String { case ru, kz }

/// Личность и состояние сессии. Аналог useSessionStore на фронте.
@MainActor
final class Session: ObservableObject {
    @Published var lang: Lang = .ru
    @Published var deviceId: String = ""
    @Published var token: String?
    @Published var refreshToken: String?
    @Published var user: UserProfile?
    @Published var loggedIn: Bool = false
    @Published var booted: Bool = false

    private let d = UserDefaults.standard

    var name: String? { user?.full_name }
    var role: String { user?.role ?? "vol" }
    var isAdmin: Bool { user?.user_type == "admin" }
    var isOrganizer: Bool { role == "coord" || role == "org" }
    /// Профиль заполнен (есть имя) — часть эндпоинтов требует этого.
    var profiled: Bool { loggedIn && (name?.isEmpty == false) }

    init() {
        deviceId = d.string(forKey: "erik.deviceId") ?? {
            let id = UUID().uuidString
            d.set(id, forKey: "erik.deviceId")
            return id
        }()
        lang = Lang(rawValue: d.string(forKey: "erik.lang") ?? "ru") ?? .ru
        token = d.string(forKey: "erik.token")
        refreshToken = d.string(forKey: "erik.refresh")
        loggedIn = d.bool(forKey: "erik.loggedIn")

        let api = APIClient.shared
        api.deviceId = deviceId
        api.token = token
        api.refreshToken = refreshToken
        api.onTokenRefresh = { [weak self] t in
            Task { @MainActor in self?.setToken(t, refresh: self?.refreshToken) }
        }
    }

    // MARK: - Локализация

    /// Выбор строки по языку.
    func tr(_ ru: String, _ kz: String) -> String { lang == .ru ? ru : kz }
    /// Локализованное поле сущности.
    func loc(_ ru: String?, _ kz: String?) -> String { (lang == .ru ? ru : kz) ?? ru ?? kz ?? "" }

    func toggleLang() {
        lang = lang == .ru ? .kz : .ru
        d.set(lang.rawValue, forKey: "erik.lang")
    }

    // MARK: - Токены

    private func setToken(_ token: String?, refresh: String?) {
        self.token = token
        self.refreshToken = refresh
        APIClient.shared.token = token
        APIClient.shared.refreshToken = refresh
        d.set(token, forKey: "erik.token")
        d.set(refresh, forKey: "erik.refresh")
    }

    private func persistLoggedIn(_ value: Bool) {
        loggedIn = value
        d.set(value, forKey: "erik.loggedIn")
    }

    // MARK: - Boot

    /// Поднять сессию при запуске. Безопасно к офлайну.
    func boot() async {
        APIClient.shared.deviceId = deviceId
        if token != nil {
            if let me = try? await APIClient.shared.me() {
                user = me
                booted = true
                return
            }
        }
        // device-путь: создаём/находим личность по deviceId
        if let res = try? await APIClient.shared.createSession(deviceId: deviceId, name: name, role: nil) {
            setToken(res.token, refresh: res.refreshToken)
            user = res.user
        }
        booted = true
    }

    // MARK: - Авторизация

    func loginWithPassword(identifier: String, password: String) async throws {
        let res = try await APIClient.shared.login(identifier: identifier, password: password)
        setToken(res.access_token, refresh: res.refresh_token)
        user = res.user ?? user
        persistLoggedIn(true)
    }

    func registerAccount(identifier: String, password: String, fullName: String,
                         role: String?, phone: String?, cityId: String?) async throws {
        let res = try await APIClient.shared.register(identifier: identifier, password: password, fullName: fullName)
        setToken(res.access_token, refresh: res.refresh_token)
        user = res.user ?? user
        persistLoggedIn(true)
        var patch: [String: String] = [:]
        if let role = role { patch["role"] = role }
        if let phone = phone { patch["phone"] = phone }
        if let cityId = cityId { patch["cityId"] = cityId }
        if !patch.isEmpty { user = try? await APIClient.shared.updateMe(patch) }
    }

    /// Гостевой вход по устройству (быстрый старт без пароля) с именем/ролью.
    func continueAsGuest(name: String, role: String, cityId: String?) async throws {
        let res = try await APIClient.shared.createSession(deviceId: deviceId, name: name, role: role)
        setToken(res.token, refresh: res.refreshToken)
        user = res.user
        persistLoggedIn(true)
        if let cityId = cityId {
            user = try? await APIClient.shared.updateMe(["cityId": cityId])
        }
    }

    func updateProfile(_ patch: [String: String]) async throws {
        user = try await APIClient.shared.updateMe(patch)
    }

    func logout() {
        let fresh = UUID().uuidString
        deviceId = fresh
        d.set(fresh, forKey: "erik.deviceId")
        APIClient.shared.deviceId = fresh
        setToken(nil, refresh: nil)
        persistLoggedIn(false)
        user = nil
    }
}
