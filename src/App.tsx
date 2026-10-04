import React, { useState, useEffect, useMemo } from 'react'
import { ScrubChart } from './components/ScrubChart'
import { SolanaService } from './services/solanaService'
import { Series, ChartMode, TickerStats } from './types'
import { Sun, Moon, RefreshCw, BarChart3, LineChart } from 'lucide-react'

export function App() {
  const [isDarkMode, setIsDarkMode] = useState<boolean>(() => {
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches
  })
  const [chartMode, setChartMode] = useState<ChartMode>('line')
  const [selectedRangeIndex, setSelectedRangeIndex] = useState<number>(1) // Default to 1D
  const [seriesList, setSeriesList] = useState<Series[]>([])
  const [stats, setStats] = useState<TickerStats | null>(null)
  const [isLiveConnected, setIsLiveConnected] = useState<boolean>(false)
  const [isLoading, setIsLoading] = useState<boolean>(true)

  const solanaService = useMemo(() => new SolanaService(), [])

  // Sync dark class to root HTML
  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark')
    } else {
      document.documentElement.classList.remove('dark')
    }
  }, [isDarkMode])

  // Fetch initial data and start live WebSocket stream
  useEffect(() => {
    let mounted = true

    async function init() {
      setIsLoading(true)
      try {
        const [statsData, allSeries] = await Promise.all([
          solanaService.fetch24hStats(),
          solanaService.fetchAllSeries()
        ])

        if (!mounted) return
        setStats(statsData)
        setSeriesList(allSeries)
        setIsLoading(false)

        // Start live WebSocket stream
        solanaService.startLiveStream(
          (newStats) => {
            if (!mounted) return
            setStats(prev => ({
              ...prev,
              ...newStats
            }))

            // Update the latest point of every series with the new real-time tick
            setSeriesList(prevSeries => {
              if (!prevSeries.length) return prevSeries
              const now = new Date()
              return prevSeries.map(s => {
                if (!s.points.length) return s
                const updatedPoints = [...s.points]
                const lastIdx = updatedPoints.length - 1
                updatedPoints[lastIdx] = {
                  date: now,
                  value: newStats.price
                }
                return { ...s, points: updatedPoints }
              })
            })
          },
          (connected) => {
            if (mounted) setIsLiveConnected(connected)
          }
        )
      } catch (err) {
        console.error('Initialization error:', err)
        if (mounted) setIsLoading(false)
      }
    }

    init()

    return () => {
      mounted = false
      solanaService.stopLiveStream()
    }
  }, [solanaService])

  const handleRefresh = async () => {
    setIsLoading(true)
    try {
      const [statsData, allSeries] = await Promise.all([
        solanaService.fetch24hStats(),
        solanaService.fetchAllSeries()
      ])
      setStats(statsData)
      setSeriesList(allSeries)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        backgroundColor: 'var(--app-bg)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: '24px 16px 48px',
        transition: 'background-color 0.3s ease'
      }}
    >
      {/* TOP CONTROLS BAR */}
      <header
        style={{
          width: '100%',
          maxWidth: '560px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'flex-end',
          marginBottom: '20px'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {/* Mode toggle (Line / Bars) */}
          <div
            style={{
              display: 'flex',
              padding: '3px',
              backgroundColor: 'var(--chart-band)',
              borderRadius: '8px'
            }}
          >
            <button
              onClick={() => setChartMode('line')}
              title="Line Mode"
              style={{
                border: 'none',
                background: chartMode === 'line' ? 'var(--chart-ground)' : 'transparent',
                color: chartMode === 'line' ? 'var(--chart-line)' : 'var(--chart-muted)',
                padding: '4px 8px',
                borderRadius: '6px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                boxShadow: chartMode === 'line' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                transition: 'all 0.15s ease'
              }}
            >
              <LineChart size={15} />
            </button>
            <button
              onClick={() => setChartMode('bars')}
              title="Bars Mode"
              style={{
                border: 'none',
                background: chartMode === 'bars' ? 'var(--chart-ground)' : 'transparent',
                color: chartMode === 'bars' ? 'var(--chart-line)' : 'var(--chart-muted)',
                padding: '4px 8px',
                borderRadius: '6px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                boxShadow: chartMode === 'bars' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                transition: 'all 0.15s ease'
              }}
            >
              <BarChart3 size={15} />
            </button>
          </div>

          {/* Refresh button */}
          <button
            onClick={handleRefresh}
            title="Refresh Data"
            style={{
              width: '34px',
              height: '34px',
              borderRadius: '8px',
              border: 'none',
              backgroundColor: 'var(--chart-band)',
              color: 'var(--chart-line)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer'
            }}
          >
            <RefreshCw size={15} className={isLoading ? 'animate-spin' : ''} />
          </button>

          {/* Theme Switcher */}
          <button
            onClick={() => setIsDarkMode(!isDarkMode)}
            title={isDarkMode ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
            style={{
              width: '34px',
              height: '34px',
              borderRadius: '8px',
              border: 'none',
              backgroundColor: 'var(--chart-band)',
              color: 'var(--chart-line)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer'
            }}
          >
            {isDarkMode ? <Sun size={15} /> : <Moon size={15} />}
          </button>
        </div>
      </header>

      {/* MAIN CONTAINER CARD */}
      <main
        style={{
          width: '100%',
          maxWidth: '560px',
          backgroundColor: 'var(--chart-ground)',
          borderRadius: '34px',
          padding: '24px 24px 28px',
          boxShadow: '0 20px 48px var(--shadow-color)',
          border: '1px solid var(--card-border)',
          display: 'flex',
          flexDirection: 'column',
          gap: '18px',
          transition: 'background-color 0.3s ease, border-color 0.3s ease'
        }}
      >
        {/* Token Header Pill */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingBottom: '4px'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div
              style={{
                width: '38px',
                height: '38px',
                borderRadius: '50%',
                background: 'linear-gradient(135deg, #9945FF 0%, #14F195 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 4px 12px rgba(153, 69, 255, 0.25)',
                color: '#FFFFFF',
                fontWeight: 900,
                fontSize: '13px',
                fontFamily: 'var(--font-sans)'
              }}
            >
              SOL
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ fontSize: '17px', fontWeight: 800, color: 'var(--chart-line)' }}>
                  Solana
                </span>
                <span
                  style={{
                    fontSize: '11px',
                    fontWeight: 700,
                    padding: '2px 6px',
                    borderRadius: '4px',
                    backgroundColor: 'var(--chart-band)',
                    color: 'var(--chart-muted)',
                    fontFamily: 'var(--font-mono)'
                  }}
                >
                  SOL / USD
                </span>
              </div>
              <div style={{ fontSize: '11.5px', fontWeight: 500, color: 'var(--chart-muted)' }}>
                Real-Time Price Feed
              </div>
            </div>
          </div>

          {/* Live Feed Status Indicator */}
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '4px 10px',
              backgroundColor: 'var(--chart-band)',
              borderRadius: '9999px',
              fontSize: '11px',
              fontWeight: 700,
              fontFamily: 'var(--font-mono)',
              color: 'var(--chart-line)'
            }}
          >
            <div
              className={isLiveConnected ? 'live-dot' : ''}
              style={{
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                backgroundColor: isLiveConnected ? '#22c55e' : '#f59e0b'
              }}
            />
            <span>{isLiveConnected ? 'LIVE' : 'SYNCING'}</span>
          </div>
        </div>

        {/* SCRUB CHART COMPONENT */}
        <ScrubChart
          series={seriesList}
          mode={chartMode}
          rangeIndex={selectedRangeIndex}
          onRangeChange={(idx) => setSelectedRangeIndex(idx)}
        />
      </main>

      {/* QUICK MARKET STATS PILLS */}
      {stats && (
        <section
          style={{
            width: '100%',
            maxWidth: '560px',
            marginTop: '20px',
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: '10px'
          }}
        >
          <div
            style={{
              backgroundColor: 'var(--chart-ground)',
              borderRadius: '16px',
              padding: '12px 14px',
              border: '1px solid var(--card-border)',
              display: 'flex',
              flexDirection: 'column',
              gap: '4px'
            }}
          >
            <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--chart-muted)', textTransform: 'uppercase' }}>
              24h High
            </span>
            <span style={{ fontSize: '15px', fontWeight: 700, color: 'var(--chart-line)', fontFamily: 'var(--font-mono)' }}>
              ${stats.high24h.toFixed(2)}
            </span>
          </div>

          <div
            style={{
              backgroundColor: 'var(--chart-ground)',
              borderRadius: '16px',
              padding: '12px 14px',
              border: '1px solid var(--card-border)',
              display: 'flex',
              flexDirection: 'column',
              gap: '4px'
            }}
          >
            <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--chart-muted)', textTransform: 'uppercase' }}>
              24h Low
            </span>
            <span style={{ fontSize: '15px', fontWeight: 700, color: 'var(--chart-line)', fontFamily: 'var(--font-mono)' }}>
              ${stats.low24h.toFixed(2)}
            </span>
          </div>

          <div
            style={{
              backgroundColor: 'var(--chart-ground)',
              borderRadius: '16px',
              padding: '12px 14px',
              border: '1px solid var(--card-border)',
              display: 'flex',
              flexDirection: 'column',
              gap: '4px'
            }}
          >
            <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--chart-muted)', textTransform: 'uppercase' }}>
              24h Volume
            </span>
            <span style={{ fontSize: '15px', fontWeight: 700, color: 'var(--chart-line)', fontFamily: 'var(--font-mono)' }}>
              {(stats.volume24h / 1000).toFixed(1)}K SOL
            </span>
          </div>
        </section>
      )}
    </div>
  )
}
