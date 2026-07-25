import Foundation

struct APIError: LocalizedError {
    let status: Int
    let message: String
    var errorDescription: String? { message }
}

/// Обёртка, чтобы передавать произвольный Encodable-словарь в тело запроса.
struct AnyEncodable: Encodable {
    private let encodeFunc: (Encoder) throws -> Void
    init<T: Encodable>(_ wrapped: T) { encodeFunc = wrapped.encode }
    func encode(to encoder: Encoder) throws { try encodeFunc(encoder) }
}

/// REST-клиент бэкенда erik. Личность по устройству (X-Device-Id) + Bearer-токен,
/// с автоматическим обновлением access-токена по refresh-токену на 401.
final class APIClient {
    static let shared = APIClient()

    private let baseString = "https://foodtrack.beast-inside.kz/erik/api"
    private let session = URLSession(configuration: .default)

    var deviceId: String = ""
    var token: String?
    var refreshToken: String?
    /// Колбэк — новый access-токен после refresh (чтобы Session его сохранил).
    var onTokenRefresh: ((String) -> Void)?

    private init() {}

    // MARK: - Базовый запрос

    @discardableResult
    func request<T: Decodable>(
        _ path: String,
        method: String = "GET",
        body: AnyEncodable? = nil,
        auth: Bool = true,
        bearer: String? = nil,
        retry: Bool = false
    ) async throws -> T {
        guard let url = URL(string: baseString + path) else {
            throw APIError(status: -1, message: "Неверный адрес")
        }
        var req = URLRequest(url: url)
        req.httpMethod = method
        if !deviceId.isEmpty { req.setValue(deviceId, forHTTPHeaderField: "X-Device-Id") }
        let useToken = bearer ?? token
        if auth, let t = useToken { req.setValue("Bearer " + t, forHTTPHeaderField: "Authorization") }
        if let body = body {
            req.setValue("application/json", forHTTPHeaderField: "Content-Type")
            req.httpBody = try JSONEncoder().encode(body)
        }

        let (data, response): (Data, URLResponse)
        do {
            (data, response) = try await session.data(for: req)
        } catch {
            throw APIError(status: -1, message: "Нет подключения к интернету")
        }
        guard let http = response as? HTTPURLResponse else {
            throw APIError(status: -1, message: "Пустой ответ сервера")
        }

        if http.statusCode == 204 || data.isEmpty {
            if let empty = EmptyResponse() as? T { return empty }
        }

        if !(200...299).contains(http.statusCode) {
            // Истёк access — один раз пробуем refresh и повтор.
            if http.statusCode == 401, auth, bearer == nil, !retry,
               let rt = refreshToken, path != "/auth/refresh" {
                if let refreshed: RefreshResponse = try? await request(
                    "/auth/refresh", method: "POST", auth: true, bearer: rt) {
                    token = refreshed.access_token
                    onTokenRefresh?(refreshed.access_token)
                    return try await request(path, method: method, body: body, auth: auth, retry: true)
                }
            }
            let msg = (try? JSONDecoder().decode([String: String].self, from: data))?["error"]
            throw APIError(status: http.statusCode, message: msg ?? "Ошибка запроса (\(http.statusCode))")
        }

        do {
            return try JSONDecoder().decode(T.self, from: data)
        } catch {
            throw APIError(status: http.statusCode, message: "Не удалось разобрать ответ")
        }
    }

    // Удобные хелперы для тел запросов.
    private func enc(_ dict: [String: String]) -> AnyEncodable { AnyEncodable(dict) }

    // MARK: - Сессия / профиль

    func createSession(deviceId: String, name: String?, role: String?) async throws -> SessionResponse {
        var payload: [String: String] = ["deviceId": deviceId]
        if let name = name { payload["name"] = name }
        if let role = role { payload["role"] = role }
        return try await request("/session", method: "POST", body: enc(payload), auth: false)
    }
    func me() async throws -> UserProfile { (try await request("/me", auth: true) as UserResponse).user }
    func updateMe(_ patch: [String: String]) async throws -> UserProfile {
        let r: UserResponse = try await request("/me", method: "PATCH", body: enc(patch))
        return r.user
    }

    // MARK: - Аккаунт-авторизация

    func login(identifier: String, password: String) async throws -> AuthResponse {
        try await request("/auth/login", method: "POST",
                          body: enc(["identifier": identifier, "password": password]), auth: false)
    }
    func register(identifier: String, password: String, fullName: String) async throws -> AuthResponse {
        try await request("/auth/register", method: "POST",
                          body: enc(["identifier": identifier, "password": password, "full_name": fullName]),
                          auth: false)
    }

    // MARK: - Платформа (публичное)

    func cities() async throws -> [City] { (try await request("/cities") as CitiesResponse).cities }
    func themes() async throws -> [Theme] { (try await request("/themes") as ThemesResponse).themes }
    func badges() async throws -> [Badge] { (try await request("/badges") as BadgesResponse).badges }
    func events(query: String = "") async throws -> [Event] {
        (try await request("/events" + query) as EventsResponse).events
    }
    func event(_ id: Int) async throws -> Event { (try await request("/events/\(id)") as EventResponse).event }
    func eventParticipants(_ id: Int, limit: Int = 7) async throws -> [Participant] {
        (try await request("/events/\(id)/participants?limit=\(limit)") as ParticipantsResponse).participants
    }
    func orgs() async throws -> [Org] { (try await request("/orgs") as OrgsResponse).orgs }
    func org(_ id: Int) async throws -> Org { (try await request("/orgs/\(id)") as OrgResponse).org }
    func charity() async throws -> [Charity] { (try await request("/charity") as CharityResponse).charity }
    func leaderboard() async throws -> [LeaderVolunteer] {
        (try await request("/leaderboard/volunteers") as LeaderboardResponse).volunteers
    }
    func userPublic(_ id: Int) async throws -> UserProfile {
        (try await request("/users/\(id)") as UserResponse).user
    }

    // MARK: - Записи / RSVP

    func setEventRegistration(_ id: Int, answer: String) async throws -> RsvpResponse {
        try await request("/events/\(id)/registration", method: "PUT", body: enc(["answer": answer]))
    }
    func deleteEventRegistration(_ id: Int) async throws {
        let _: EmptyResponse = try await request("/events/\(id)/registration", method: "DELETE")
    }
    func myRegistrations() async throws -> [String: String] {
        (try await request("/me/registrations") as RegistrationsResponse).registrations
    }
    func myEvents() async throws -> [Event] { (try await request("/me/events") as EventsResponse).events }

    // MARK: - НКО / подписки

    func followOrg(_ id: Int) async throws { let _: EmptyResponse = try await request("/orgs/\(id)/follow", method: "POST") }
    func unfollowOrg(_ id: Int) async throws { let _: EmptyResponse = try await request("/orgs/\(id)/follow", method: "DELETE") }
    func donate(_ id: Int, amount: Int) async throws {
        let _: EmptyResponse = try await request("/charity/\(id)/donate", method: "POST",
                                                 body: AnyEncodable(["amount": amount]))
    }

    // MARK: - Уведомления

    func notifications() async throws -> NotificationsResponse { try await request("/notifications") }
    func readAllNotifications() async throws { let _: EmptyResponse = try await request("/notifications/read-all", method: "POST") }

    // MARK: - Сообщения

    func conversations() async throws -> [Conversation] {
        (try await request("/conversations") as ConversationsResponse).conversations
    }
    func conversation(_ id: Int) async throws -> Conversation {
        (try await request("/conversations/\(id)") as ConversationResponse).conversation
    }
    func createConversation(peerUserId: Int) async throws -> Conversation {
        (try await request("/conversations", method: "POST",
                           body: AnyEncodable(["peerUserId": peerUserId])) as ConversationResponse).conversation
    }
    func sendMessage(_ id: Int, text: String) async throws {
        let _: EmptyResponse = try await request("/conversations/\(id)/messages", method: "POST",
                                                 body: enc(["text": text]))
    }
    func searchUsers(_ q: String) async throws -> [UserProfile] {
        let encoded = q.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? q
        return (try await request("/users/search?q=\(encoded)") as UsersSearchResponse).users ?? []
    }

    // MARK: - Организатор (Manage HQ)

    func orgEvents() async throws -> [Event] { (try await request("/me/org/events") as EventsResponse).events }

    // MARK: - Админ

    func adminStats() async throws -> AdminStats { try await request("/admin/stats") }
    func adminOrgs(status: String = "pending") async throws -> [Org] {
        (try await request("/admin/orgs?status=\(status)") as OrgsResponse).orgs
    }
    func approveOrg(_ id: Int) async throws { let _: EmptyResponse = try await request("/admin/orgs/\(id)/approve", method: "POST") }
    func rejectOrg(_ id: Int) async throws { let _: EmptyResponse = try await request("/admin/orgs/\(id)/reject", method: "POST") }
}
