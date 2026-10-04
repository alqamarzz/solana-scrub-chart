# Solana Live Scrub Chart (SwiftUI)

This directory contains the full native SwiftUI implementation of the [Swift Pieces Scrub Chart](https://swiftpieces.com/docs/components/data/scrub-chart) powered by real-time live Solana (`SOL/USD`) price data.

## Files
- `ScrubChart.swift`: The original Swift Pieces Scrub Chart component featuring Catmull-Rom line smoothing, dimmed decimals, hold-and-drag range selection, floating scrub flag, and dataset morphing.
- `SolanaPriceService.swift`: An `ObservableObject` service that connects to live Binance WebSockets (`wss://stream.binance.com:9443/ws/solusdt@ticker`) and Kline REST endpoints (`1H`, `1D`, `1W`, `1M`, `1Y`) to provide real-time price ticks and historical candlesticks.
- `SolanaScrubChartView.swift`: Ready-to-use SwiftUI view complete with live Solana market ticker, connection indicator, mode switcher (Line / Bars), and dark/light mode support.

## How to use in Xcode
1. Drag the 3 `.swift` files into your Xcode iOS 17+ or macOS 14+ project.
2. In any view, simply instantiate:
   ```swift
   SolanaScrubChartView()
   ```
3. Ensure Network permissions are enabled in your project's App Sandbox / Capabilities (Outgoing Connections).
