import SwiftUI

/// Экраны, на которые можно перейти из любого стека.
enum Route: Hashable {
    case event(Int)
    case org(Int)
    case user(Int)
    case orgsList
    case notifications
    case messages
    case conversation(Int, String)
    case myEvents
    case manage
    case admin
    case editProfile
    case onboarding
}

extension Route {
    @ViewBuilder var destination: some View {
        switch self {
        case .event(let id): EventDetailView(eventId: id)
        case .org(let id): OrgDetailView(orgId: id)
        case .user(let id): ProfileView(userId: id)
        case .orgsList: OrgsView()
        case .notifications: NotificationsView()
        case .messages: MessagesView()
        case .conversation(let id, let name): ConversationView(conversationId: id, title: name)
        case .myEvents: MyEventsView()
        case .manage: ManageView()
        case .admin: AdminView()
        case .editProfile: EditProfileView()
        case .onboarding: OnboardingView()
        }
    }
}

extension View {
    /// Единый набор пунктов назначения для навигационных стеков.
    func erikDestinations() -> some View {
        navigationDestination(for: Route.self) { $0.destination }
    }
}
