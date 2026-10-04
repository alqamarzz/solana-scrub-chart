# Solana Live Scrub Chart 📈

An interactive, real-time Solana price chart styled after [Swift Pieces Scrub Chart](https://swiftpieces.com/docs/components/data/scrub-chart), featuring Catmull-Rom spline curves, live Binance/Coinbase WebSockets, dataset morphing, hold-and-drag range selection, and dimmed decimals.

This repository includes both a **live React web application** and **native SwiftUI components** for iOS 17+.

---

## ✨ Features
- **Real-Time Solana Feed**: Connected to live WebSockets for tick-by-tick real-time price updates with a pulsing live indicator.
- **Interactive Scrubbing**: Hover or drag across the chart to move the vertical scrub ruler and floating flag with precise timestamps.
- **Hold-and-Drag Range Selection**: Press and hold for 300ms to measure price delta ($\Delta$) and percentage across any custom range.
- **Smooth Dataset Morphing**: Seamlessly switch between timeframes (`1H`, `1D`, `1W`, `1M`, `1Y`) with resampled Catmull-Rom curves that bend smoothly between datasets.
- **Readout with Dimmed Decimals**: High-visibility typography splitting whole digits and dimmed decimals.
- **Solid Delta Chips**: Green and Tangerine solid capsule badges indicating gains and losses.
- **Chart Modes & Themes**: Toggle between Line and Bars mode, with complete Light and Dark theme support.
- **Native SwiftUI Ready**: Includes native iOS 17+ Swift files in `swift/` ready to drop into Xcode.

---

## 🚀 Getting Started (Web)

### Prerequisites
- Node.js (v18+)
- npm or yarn

### Installation
```bash
git clone https://github.com/alqamarzz/solana-scrub-chart.git
cd solana-scrub-chart
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

---

## 📱 SwiftUI Components (iOS 17+)
Find the native Swift files in [`swift/`](./swift):
- `ScrubChart.swift`: The core interactive chart component.
- `SolanaPriceService.swift`: WebSocket and REST Kline data provider for live Solana prices.
- `SolanaScrubChartView.swift`: Complete SwiftUI view.

---

## 📄 License
MIT
