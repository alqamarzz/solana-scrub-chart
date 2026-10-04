import SwiftUI

/// Live Solana Price Chart using the SwiftPieces ScrubChart component.
public struct SolanaScrubChartView: View {
    @StateObject private var service = SolanaPriceService()
    @State private var selectedRange = 1 // Default to 1D
    @State private var chartMode: ScrubChart<FloatingPointFormatStyle<Double>.Currency>.Mode = .line
    @Environment(\.colorScheme) private var colorScheme

    public init() {}

    public var body: some View {
        VStack(spacing: 20) {
            // Header with Solana token info & Live indicator
            headerBar

            // Main Chart Card
            VStack(alignment: .leading, spacing: 16) {
                if service.isLoading && service.chartSeries.isEmpty {
                    loadingPlaceholder
                } else if let error = service.errorMessage, service.chartSeries.isEmpty {
                    errorPlaceholder(error)
                } else {
                    ScrubChart(
                        series: service.chartSeries,
                        mode: chartMode,
                        format: .currency(code: "USD"),
                        range: $selectedRange,
                        style: .standard
                    )
                }
            }
            .frame(height: 360)
            .padding(22)
            .background(ScrubChartStyle.standard.ground, in: .rect(cornerRadius: 34, style: .continuous))
            .shadow(color: Color.black.opacity(colorScheme == .dark ? 0.4 : 0.06), radius: 24, x: 0, y: 12)

            // Mode toggle & quick stats
            controlsFooter
        }
        .padding(16)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(ScrubChartStyle.adaptive(0xF3F2EE, 0x121212).ignoresSafeArea())
    }

    // MARK: - Header Bar

    private var headerBar: some View {
        HStack(spacing: 12) {
            // Solana Logo Icon
            ZStack {
                Circle()
                    .fill(LinearGradient(
                        colors: [Color(red: 0.6, green: 0.1, blue: 0.9), Color(red: 0.08, green: 0.9, blue: 0.7)],
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    ))
                    .frame(width: 42, height: 42)

                Text("SOL")
                    .font(.system(size: 13, weight: .black, design: .rounded))
                    .foregroundStyle(.white)
            }

            VStack(alignment: .leading, spacing: 2) {
                HStack(spacing: 6) {
                    Text("Solana")
                        .font(.system(size: 19, weight: .bold))
                        .foregroundStyle(ScrubChartStyle.standard.line)

                    Text("SOL / USD")
                        .font(.system(size: 11, weight: .semibold, design: .monospaced))
                        .padding(.horizontal, 6)
                        .padding(.vertical, 2)
                        .background(ScrubChartStyle.standard.band, in: Capsule())
                        .foregroundStyle(ScrubChartStyle.standard.muted)
                }

                Text("Live Solana Market Price Feed")
                    .font(.system(size: 12, weight: .medium))
                    .foregroundStyle(ScrubChartStyle.standard.muted)
            }

            Spacer()

            // Live Connection Badge
            HStack(spacing: 5) {
                Circle()
                    .fill(service.isLiveConnected ? Color(red: 0.2, green: 0.85, blue: 0.4) : Color.orange)
                    .frame(width: 8, height: 8)
                    .scaleEffect(service.isLiveConnected ? 1.0 : 0.8)
                    .animation(.easeInOut(duration: 0.8).repeatForever(), value: service.isLiveConnected)

                Text(service.isLiveConnected ? "LIVE" : "SYNCING")
                    .font(.system(size: 11, weight: .heavy, design: .monospaced))
                    .foregroundStyle(ScrubChartStyle.standard.line)
            }
            .padding(.horizontal, 10)
            .padding(.vertical, 5)
            .background(ScrubChartStyle.standard.band, in: Capsule())
        }
    }

    // MARK: - Loading & Error States

    private var loadingPlaceholder: some View {
        VStack(spacing: 16) {
            ProgressView()
                .scaleEffect(1.3)
            Text("Streaming Solana market data...")
                .font(.system(size: 13, weight: .medium))
                .foregroundStyle(ScrubChartStyle.standard.muted)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private func errorPlaceholder(_ message: String) -> some View {
        VStack(spacing: 12) {
            Image(systemName: "exclamationmark.triangle.fill")
                .font(.system(size: 32))
                .foregroundStyle(ScrubChartStyle.standard.down)

            Text(message)
                .font(.system(size: 13, weight: .medium))
                .foregroundStyle(ScrubChartStyle.standard.muted)
                .multilineTextAlignment(.center)

            Button("Retry") {
                Task { await service.fetchAllTimeframes() }
            }
            .buttonStyle(.borderedProminent)
            .tint(ScrubChartStyle.standard.accent)
            .foregroundStyle(ScrubChartStyle.standard.ink)
        }
        .padding()
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    // MARK: - Controls Footer

    private var controlsFooter: some View {
        HStack {
            // Mode toggle (Line vs Bars)
            Picker("Chart Mode", selection: $chartMode) {
                Text("Line").tag(ScrubChart<FloatingPointFormatStyle<Double>.Currency>.Mode.line)
                Text("Bars").tag(ScrubChart<FloatingPointFormatStyle<Double>.Currency>.Mode.bars)
            }
            .pickerStyle(.segmented)
            .frame(width: 140)

            Spacer()

            // Refresh button
            Button {
                Task { await service.fetchAllTimeframes() }
            } label: {
                Label("Refresh", systemImage: "arrow.clockwise")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(ScrubChartStyle.standard.muted)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 7)
                    .background(ScrubChartStyle.standard.band, in: Capsule())
            }
        }
    }
}

// MARK: - Previews

#Preview("Light Mode") {
    SolanaScrubChartView()
        .preferredColorScheme(.light)
}

#Preview("Dark Mode") {
    SolanaScrubChartView()
        .preferredColorScheme(.dark)
}
