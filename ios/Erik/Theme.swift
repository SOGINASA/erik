import SwiftUI

/// Палитра и стили — под фирменный зелёный дизайн Erik (как на сайте).
enum Palette {
    static let ink = Color(hex: "2F6F4F")        // основной зелёный
    static let inkDark = Color(hex: "245C41")
    static let page = Color(hex: "F4F2EC")       // кремовый фон
    static let card = Color.white
    static let line = Color(hex: "E4E1D8")
    static let text = Color(hex: "1A1A1A")
    static let sub = Color(hex: "6B7280")
    static let danger = Color(hex: "9A3B34")
    static let gold = Color(hex: "B8873B")
}

extension Color {
    /// Цвет из hex-строки ("2F6F4F" или "#2F6F4F").
    init(hex: String) {
        var s = hex.trimmingCharacters(in: .whitespacesAndNewlines)
        if s.hasPrefix("#") { s.removeFirst() }
        var v: UInt64 = 0
        Scanner(string: s).scanHexInt64(&v)
        let r, g, b, a: Double
        switch s.count {
        case 8:
            r = Double((v >> 24) & 0xFF) / 255
            g = Double((v >> 16) & 0xFF) / 255
            b = Double((v >> 8) & 0xFF) / 255
            a = Double(v & 0xFF) / 255
        case 6:
            r = Double((v >> 16) & 0xFF) / 255
            g = Double((v >> 8) & 0xFF) / 255
            b = Double(v & 0xFF) / 255
            a = 1
        default:
            r = 0; g = 0; b = 0; a = 1
        }
        self.init(.sRGB, red: r, green: g, blue: b, opacity: a)
    }
}

// MARK: - Переиспользуемые стили

/// Крупная зелёная кнопка действия.
struct PrimaryButtonStyle: ButtonStyle {
    var enabled: Bool = true
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.system(size: 16, weight: .semibold))
            .foregroundColor(.white)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 14)
            .background(enabled ? Palette.ink : Palette.ink.opacity(0.4))
            .cornerRadius(14)
            .opacity(configuration.isPressed ? 0.85 : 1)
    }
}

/// Вторичная (обводка) кнопка.
struct SecondaryButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.system(size: 16, weight: .semibold))
            .foregroundColor(Palette.text)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 14)
            .background(Palette.card)
            .overlay(RoundedRectangle(cornerRadius: 14).stroke(Palette.line, lineWidth: 1))
            .cornerRadius(14)
            .opacity(configuration.isPressed ? 0.85 : 1)
    }
}

/// Карточка с тенью.
struct CardModifier: ViewModifier {
    func body(content: Content) -> some View {
        content
            .background(Palette.card)
            .cornerRadius(18)
            .overlay(RoundedRectangle(cornerRadius: 18).stroke(Palette.line, lineWidth: 1))
    }
}

extension View {
    func card() -> some View { modifier(CardModifier()) }
}
