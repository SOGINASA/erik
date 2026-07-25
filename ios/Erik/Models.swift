import Foundation

// Модели данных под реальные ответы API erik
// (https://foodtrack.beast-inside.kz/erik/api). Поля необязательные там,
// где бэкенд может их не прислать — декодер к этому устойчив.

struct City: Codable, Identifiable, Hashable {
    let id: String
    let ru: String
    let kz: String
    var x: Double?
    var y: Double?
    var active: Int?
    var vol: Int?
}

struct Theme: Codable, Identifiable, Hashable {
    let id: String
    let ru: String
    let kz: String
    var ink: String
    var tint: String
}

struct Badge: Codable, Identifiable, Hashable {
    let id: String
    let ru: String
    let kz: String
    var glyph: String
}

struct Event: Codable, Identifiable, Hashable {
    let id: Int
    var code: String?
    var cityId: String?
    var titleRu: String?
    var titleKz: String?
    var placeRu: String?
    var placeKz: String?
    var dateRu: String?
    var dateKz: String?
    var time: String?
    var startsAt: String?
    var theme: String?
    var orgId: Int?
    var going: Int?
    var needed: Int?
    var format: String?
    var status: String?
    var image: String?
    var mine: Bool?
}

struct Org: Codable, Identifiable, Hashable {
    let id: Int
    var name: String?
    var cat: String?
    var city: String?
    var cityId: String?
    var aboutRu: String?
    var aboutKz: String?
    var verified: Bool?
    var events: Int?
    var vol: Int?
    var following: Bool?
}

struct Charity: Codable, Identifiable, Hashable {
    let id: Int
    var org: Int?
    var cityId: String?
    var titleRu: String?
    var titleKz: String?
    var kind: String?
    var goal: Int?
    var raised: Int?
    var unit: String?
    var image: String?
}

struct LeaderVolunteer: Codable, Identifiable, Hashable {
    let id: Int
    var name: String?
    var city: String?
    var events: Int?
    var hours: Int?
    var rel: Int?
}

struct Participant: Codable, Identifiable, Hashable {
    let id: Int
    var name: String?
}

struct UserProfile: Codable, Identifiable, Hashable {
    let id: Int
    var full_name: String?
    var role: String?
    var user_type: String?
    var city_id: String?
    var phone: String?
    var email: String?
    var nickname: String?
    var hours_total: Int?
    var events_attended: Int?
    var reliability: Int?
    var skills: [String]?
    var is_verified: Bool?
    var has_account: Bool?
}

struct AppNotification: Codable, Identifiable, Hashable {
    let id: Int
    var type: String?
    var ru: String?
    var kz: String?
    var read: Bool?
    var created_at: String?
}

struct ChatMessage: Codable, Hashable {
    var me: Bool
    var txt: String
    var created_at: String?
}

struct Conversation: Codable, Identifiable, Hashable {
    let id: Int
    var name: String?
    var role: String?
    var msgs: [ChatMessage]?
}

// MARK: - Обёртки ответов

struct SessionResponse: Codable {
    var token: String
    var refreshToken: String?
    var user: UserProfile
    var known: Bool?
}

struct AuthResponse: Codable {
    var access_token: String
    var refresh_token: String?
    var user: UserProfile?
}

struct RefreshResponse: Codable { var access_token: String }

struct CitiesResponse: Codable { var cities: [City] }
struct ThemesResponse: Codable { var themes: [Theme] }
struct BadgesResponse: Codable { var badges: [Badge] }
struct EventsResponse: Codable { var events: [Event] }
struct EventResponse: Codable { var event: Event }
struct ParticipantsResponse: Codable { var participants: [Participant] }
struct OrgsResponse: Codable { var orgs: [Org] }
struct OrgResponse: Codable { var org: Org }
struct CharityResponse: Codable { var charity: [Charity] }
struct LeaderboardResponse: Codable { var volunteers: [LeaderVolunteer] }
struct UserResponse: Codable { var user: UserProfile }
struct NotificationsResponse: Codable {
    var notifications: [AppNotification]
    var unread: Int?
}
struct ConversationsResponse: Codable { var conversations: [Conversation] }
struct ConversationResponse: Codable { var conversation: Conversation }
struct RegistrationsResponse: Codable { var registrations: [String: String] }
struct RsvpResponse: Codable { var answer: String?; var going: Int? }
struct UsersSearchResponse: Codable { var users: [UserProfile]? }

struct AdminStats: Codable {
    var pendingOrgs: Int?
    var openReports: Int?
    var verifiedOrgs: Int?
    var users: Int?
    var volunteers: Int?
    var coordinators: Int?
    var activeEvents: Int?
    var pendingEvents: Int?
    var hoursTotal: Int?
    var raised: Int?
    var avgReliability: Int?
}

/// Пустой ответ (204 / тела нет).
struct EmptyResponse: Codable {}
