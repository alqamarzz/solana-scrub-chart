export interface Point {
  date: Date
  value: number
}

export interface Series {
  id: string
  label: string
  points: Point[]
}

export type ChartMode = 'line' | 'bars'

export type Timeframe = '1H' | '1D' | '1W' | '1M' | '1Y'

export interface TickerStats {
  price: number
  change24h: number
  changePercent24h: number
  high24h: number
  low24h: number
  volume24h: number
}
