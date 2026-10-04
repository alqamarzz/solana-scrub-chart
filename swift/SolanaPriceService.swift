import Foundation
import SwiftUI
import Combine

/// Service to fetch real-time Solana price data and historical series for ScrubChart.
@MainActor
public final class SolanaPriceService: ObservableObject {
    public struct Candlestick {
        public let timestamp: Date
        public let open: Double
        public let high: Double
        public let low: Double
        public let close: Double
        public let volume: Double
    }

    public enum Timeframe: String, CaseIterable, Identifiable {
        case oneHour = "1H"
        case oneDay = "1D"
        case oneWeek = "1W"
        case oneMonth = "1M"
        case oneYear = "1Y"

        public var id: String { rawValue }

        var binanceInterval: String {
            switch self {
            case .oneHour: return "1m"
            case .oneDay: return "15m"
            case .oneWeek: return "1h"
            case .oneMonth: return "4h"
            case .oneYear: return "1d"
            }
        }

        var limit: Int {
            switch self {
            case .oneHour: return 60
            case .oneDay: return 96
            case .oneWeek: return 168
            case .oneMonth: return 180
            case .oneYear: return 365
            }
        }
    }

    @Published public var currentPrice: Double = 0.0
    @Published public var priceChange24h: Double = 0.0
    @Published public var priceChangePercent24h: Double = 0.0
    @Published public var high24h: Double = 0.0
    @Published public var low24h: Double = 0.0
    @Published public var isLiveConnected: Bool = false
    @Published public var isLoading: Bool = true
    @Published public var errorMessage: String? = nil

    /// All series formatted directly for ScrubChart
    @Published public var chartSeries: [ScrubChart<FloatingPointFormatStyle<Double>.Currency>.Series] = []

    private var rawData: [Timeframe: [ScrubChart<FloatingPointFormatStyle<Double>.Currency>.Point]] = [:]
    private var webSocketTask: URLSessionWebSocketTask?
    private let urlSession = URLSession(configuration: .default)

    public init() {
        Task {
            await fetchAllTimeframes()
            connectWebSocket()
        }
    }

    deinit {
        webSocketTask?.cancel(with: .goingAway, reason: nil)
    }

    // MARK: - REST API Fetching

    public func fetchAllTimeframes() async {
        isLoading = true
        errorMessage = nil

        do {
            async let tickerData = fetch24hTicker()
            async let h1 = fetchKlines(for: .oneHour)
            async let d1 = fetchKlines(for: .oneDay)
            async let w1 = fetchKlines(for: .oneWeek)
            async let m1 = fetchKlines(for: .oneMonth)
            async let y1 = fetchKlines(for: .oneYear)

            let (ticker, p1h, p1d, p1w, p1m, p1y) = try await (tickerData, h1, d1, w1, m1, y1)

            self.currentPrice = ticker.lastPrice
            self.priceChange24h = ticker.priceChange
            self.priceChangePercent24h = ticker.priceChangePercent
            self.high24h = ticker.highPrice
            self.low24h = ticker.lowPrice

            self.rawData[.oneHour] = p1h
            self.rawData[.oneDay] = p1d
            self.rawData[.oneWeek] = p1w
            self.rawData[.oneMonth] = p1m
            self.rawData[.oneYear] = p1y

            rebuildChartSeries()
            isLoading = false
        } catch {
            print("Failed to fetch Solana data: \(error)")
            self.errorMessage = "Failed to load live Solana data: \(error.localizedDescription)"
            isLoading = false
        }
    }

    private struct Ticker24hResponse: Decodable {
        let lastPrice: String
        let priceChange: String
        let priceChangePercent: String
        let highPrice: String
        let lowPrice: String
    }

    private func fetch24hTicker() async throws -> (lastPrice: Double, priceChange: Double, priceChangePercent: Double, highPrice: Double, lowPrice: Double) {
        let url = URL(string: "https://api.binance.com/api/v3/ticker/24hr?symbol=SOLUSDT")!
        let (data, _) = try await urlSession.data(from: url)
        let res = try JSONDecoder().decode(Ticker24hResponse.self, from: data)

        return (
            Double(res.lastPrice) ?? 0.0,
            Double(res.priceChange) ?? 0.0,
            (Double(res.priceChangePercent) ?? 0.0) / 100.0,
            Double(res.highPrice) ?? 0.0,
            Double(res.lowPrice) ?? 0.0
        )
    }

    private func fetchKlines(for timeframe: Timeframe) async throws -> [ScrubChart<FloatingPointFormatStyle<Double>.Currency>.Point] {
        let urlString = "https://api.binance.com/api/v3/klines?symbol=SOLUSDT&interval=\(timeframe.binanceInterval)&limit=\(timeframe.limit)"
        guard let url = URL(string: urlString) else { return [] }

        let (data, _) = try await urlSession.data(from: url)
        guard let jsonArray = try JSONSerialization.jsonObject(with: data) as? [[Any]] else {
            return []
        }

        return jsonArray.compactMap { item in
            guard item.count >= 5,
                  let openTimeMs = item[0] as? Double ?? (item[0] as? Int).map(Double.init),
                  let closeStr = item[4] as? String,
                  let closePrice = Double(closeStr) else {
                return nil
            }
            let date = Date(timeIntervalSince1970: openTimeMs / 1000.0)
            return ScrubChart<FloatingPointFormatStyle<Double>.Currency>.Point(date: date, value: closePrice)
        }
    }

    private func rebuildChartSeries() {
        self.chartSeries = [
            .init(label: "1H", points: rawData[.oneHour] ?? []),
            .init(label: "1D", points: rawData[.oneDay] ?? []),
            .init(label: "1W", points: rawData[.oneWeek] ?? []),
            .init(label: "1M", points: rawData[.oneMonth] ?? []),
            .init(label: "1Y", points: rawData[.oneYear] ?? [])
        ]
    }

    // MARK: - WebSocket Live Streaming

    public func connectWebSocket() {
        webSocketTask?.cancel(with: .goingAway, reason: nil)

        guard let url = URL(string: "wss://stream.binance.com:9443/ws/solusdt@ticker") else { return }
        webSocketTask = urlSession.webSocketTask(with: url)
        webSocketTask?.resume()

        listenWebSocket()
    }

    private func listenWebSocket() {
        webSocketTask?.receive { [weak self] result in
            guard let self = self else { return }
            switch result {
            case .failure(let error):
                print("Binance WebSocket error: \(error)")
                Task { @MainActor in
                    self.isLiveConnected = false
                    try? await Task.sleep(nanoseconds: 3_000_000_000)
                    self.connectWebSocket()
                }
            case .success(let message):
                Task { @MainActor in
                    self.isLiveConnected = true
                }
                if case .string(let text) = message,
                   let data = text.data(using: .utf8),
                   let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] {
                    if let cStr = json["c"] as? String, let newPrice = Double(cStr) {
                        Task { @MainActor in
                            self.currentPrice = newPrice
                            if let pStr = json["p"] as? String, let pChange = Double(pStr) {
                                self.priceChange24h = pChange
                            }
                            if let pPercentStr = json["P"] as? String, let pPercent = Double(pPercentStr) {
                                self.priceChangePercent24h = pPercent / 100.0
                            }
                            // Append / update last point of current series
                            self.updateLatestPriceInSeries(newPrice)
                        }
                    }
                }
                self.listenWebSocket()
            }
        }
    }

    private func updateLatestPriceInSeries(_ price: Double) {
        let now = Date()
        for tf in Timeframe.allCases {
            guard var points = rawData[tf], !points.isEmpty else { continue }
            let lastIndex = points.count - 1
            // Update the latest point
            points[lastIndex] = .init(date: now, value: price)
            rawData[tf] = points
        }
        rebuildChartSeries()
    }
}
