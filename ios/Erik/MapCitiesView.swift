import SwiftUI

/// «Карта» — города Казахстана со статистикой активности.
struct MapCitiesView: View {
    @EnvironmentObject var session: Session
    @EnvironmentObject var store: PlatformStore

    private let cols = [GridItem(.flexible(), spacing: 12), GridItem(.flexible(), spacing: 12)]

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                Text(session.tr("Волонтёрство по городам", "Қалалар бойынша волонтёрлік"))
                    .font(.system(size: 15)).foregroundColor(Palette.sub)
                LazyVGrid(columns: cols, spacing: 12) {
                    ForEach(store.cities) { c in
                        VStack(alignment: .leading, spacing: 8) {
                            Text(session.lang == .ru ? c.ru : c.kz)
                                .font(.system(size: 17, weight: .bold)).foregroundColor(Palette.text)
                            HStack(spacing: 6) {
                                Circle().fill(Palette.ink).frame(width: 8, height: 8)
                                Text("\(c.active ?? 0) " + session.tr("активных", "белсенді"))
                                    .font(.system(size: 13)).foregroundColor(Palette.sub)
                            }
                            Text("\(c.vol ?? 0) " + session.tr("волонтёров", "волонтёр"))
                                .font(.system(size: 13)).foregroundColor(Palette.sub)
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(14)
                        .card()
                    }
                }
            }
            .padding(16)
        }
        .background(Palette.page.ignoresSafeArea())
        .navigationTitle(session.tr("Карта", "Карта"))
        .navigationBarTitleDisplayMode(.inline)
        .toolbar { ToolbarItem(placement: .topBarLeading) { LangToggle() } }
    }
}
