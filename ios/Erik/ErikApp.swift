import SwiftUI

@main
struct ErikApp: App {
    @StateObject private var session = Session()
    @StateObject private var store = PlatformStore()

    var body: some Scene {
        WindowGroup {
            RootShell()
                .environmentObject(session)
                .environmentObject(store)
                .tint(Palette.ink)
                .task {
                    await session.boot()
                    await store.load()
                }
        }
    }
}
