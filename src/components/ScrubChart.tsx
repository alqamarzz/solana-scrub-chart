import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { Series, Point, ChartMode } from '../types'
import { ArrowUpRight, ArrowDownRight } from 'lucide-react'

export interface ScrubChartProps {
  series: Series[]
  mode?: ChartMode
  rangeIndex: number
  onRangeChange: (index: number) => void
  formatCurrency?: (val: number) => string
}

const SAMPLE_COUNT = 64

export const ScrubChart: React.FC<ScrubChartProps> = ({
  series,
  mode = 'line',
  rangeIndex,
  onRangeChange,
  formatCurrency = (v) =>
    v.toLocaleString('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    })
}) => {
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  // Selection state
  const [scrubIndex, setScrubIndex] = useState<number | null>(null)
  const [rangeSpan, setRangeSpan] = useState<{ from: number; to: number } | null>(null)
  const [isHoldingRange, setIsHoldingRange] = useState(false)

  // Drag & hold gesture tracking
  const dragStartRef = useRef<{ x: number; y: number; index: number } | null>(null)
  const holdTimerRef = useRef<number | null>(null)
  const hasMovedRef = useRef<boolean>(false)

  // Morphing animation state: resampled normalized points
  const [displayedNormalized, setDisplayedNormalized] = useState<number[]>([])
  const animationFrameRef = useRef<number | null>(null)
  const morphStartRef = useRef<{ startValues: number[]; targetValues: number[]; startTime: number } | null>(null)

  // Active series and points
  const activeSeries = series[rangeIndex] || series[0]
  const rawPoints = useMemo(() => activeSeries?.points || [], [activeSeries])

  // Bounds
  const bounds = useMemo(() => {
    if (!rawPoints.length) return { min: 0, max: 1, range: 1 }
    let min = Infinity
    let max = -Infinity
    for (const p of rawPoints) {
      if (p.value < min) min = p.value
      if (p.value > max) max = p.value
    }
    const range = max - min < 0.0001 ? 1 : max - min
    return { min, max, range }
  }, [rawPoints])

  // Resample points to 64 samples for smooth morphing transitions
  const resample = useCallback((pts: Point[], count: number): number[] => {
    if (!pts.length) return []
    if (pts.length === 1) return Array(count).fill(pts[0].value)

    const startTime = pts[0].date.getTime()
    const endTime = pts[pts.length - 1].date.getTime()
    const totalSpan = Math.max(1, endTime - startTime)
    const result: number[] = []

    let j = 0
    for (let i = 0; i < count; i++) {
      const t = startTime + (totalSpan * i) / (count - 1)
      while (j < pts.length - 2 && pts[j + 1].date.getTime() < t) {
        j++
      }
      const p1 = pts[j]
      const p2 = pts[j + 1]
      const segSpan = Math.max(1, p2.date.getTime() - p1.date.getTime())
      const u = Math.min(Math.max((t - p1.date.getTime()) / segSpan, 0), 1)
      result.push(p1.value + (p2.value - p1.value) * u)
    }
    return result
  }, [])

  // Target normalized values
  const targetNormalized = useMemo(() => {
    if (!rawPoints.length) return []
    const resampled = resample(rawPoints, SAMPLE_COUNT)
    return resampled.map(v => (v - bounds.min) / bounds.range)
  }, [rawPoints, bounds, resample])

  // Trigger morphing animation when target changes
  useEffect(() => {
    if (!targetNormalized.length) return

    if (!displayedNormalized.length) {
      setDisplayedNormalized(targetNormalized)
      return
    }

    const startValues = [...displayedNormalized]
    const targetValues = [...targetNormalized]
    const startTime = performance.now()
    const duration = 450 // ms

    const animate = (time: number) => {
      const elapsed = time - startTime
      const progress = Math.min(1, elapsed / duration)
      // Ease out cubic
      const ease = 1 - Math.pow(1 - progress, 3)

      const current = startValues.map((sv, idx) => {
        const tv = targetValues[idx] ?? sv
        return sv + (tv - sv) * ease
      })

      setDisplayedNormalized(current)

      if (progress < 1) {
        animationFrameRef.current = requestAnimationFrame(animate)
      } else {
        setDisplayedNormalized(targetValues)
      }
    }

    if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current)
    animationFrameRef.current = requestAnimationFrame(animate)

    return () => {
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current)
    }
  }, [targetNormalized])

  // Extreme indices for min / max markers
  const extremeIndices = useMemo(() => {
    if (!rawPoints.length) return null
    let maxIdx = 0
    let minIdx = 0
    for (let i = 1; i < rawPoints.length; i++) {
      if (rawPoints[i].value > rawPoints[maxIdx].value) maxIdx = i
      if (rawPoints[i].value < rawPoints[minIdx].value) minIdx = i
    }
    return { maxIdx, minIdx }
  }, [rawPoints])

  // Canvas drawing effect
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr = window.devicePixelRatio || 1
    const width = canvas.clientWidth
    const height = canvas.clientHeight

    canvas.width = width * dpr
    canvas.height = height * dpr
    ctx.scale(dpr, dpr)

    ctx.clearRect(0, 0, width, height)

    if (!rawPoints.length) return

    // Compute drawing dimensions: top margin 36px (for flag and max label), bottom margin 24px
    const topPad = 40
    const bottomPad = 24
    const plotHeight = height - topPad - bottomPad
    const plotWidth = width

    const getY = (normVal: number) => {
      // Norm 0 is at bottom (plotHeight), norm 1 is at top (0)
      return topPad + (1 - normVal) * plotHeight
    }

    // 1. Draw Baseline (Dashed rule at first point's value)
    if (rawPoints.length > 0) {
      const firstNorm = (rawPoints[0].value - bounds.min) / bounds.range
      const baseY = getY(firstNorm)
      ctx.save()
      ctx.beginPath()
      ctx.setLineDash([2, 5])
      ctx.strokeStyle = getComputedStyle(canvas).getPropertyValue('--chart-muted').trim() || '#888'
      ctx.globalAlpha = 0.55
      ctx.lineWidth = 1
      ctx.moveTo(0, baseY)
      ctx.lineTo(plotWidth, baseY)
      ctx.stroke()
      ctx.restore()
    }

    // 2. Draw Range Selection Band if active
    if (rangeSpan && rawPoints.length > 1) {
      const fromIdx = Math.min(rangeSpan.from, rangeSpan.to)
      const toIdx = Math.max(rangeSpan.from, rangeSpan.to)
      const x1 = (fromIdx / (rawPoints.length - 1)) * plotWidth
      const x2 = (toIdx / (rawPoints.length - 1)) * plotWidth

      ctx.save()
      ctx.fillStyle = getComputedStyle(canvas).getPropertyValue('--chart-band').trim() || '#f3f2ee'
      ctx.fillRect(x1, topPad, x2 - x1, plotHeight)

      // Vertical line rules at boundaries
      ctx.strokeStyle = getComputedStyle(canvas).getPropertyValue('--chart-line').trim() || '#000'
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.moveTo(x1, topPad)
      ctx.lineTo(x1, topPad + plotHeight)
      ctx.moveTo(x2, topPad)
      ctx.lineTo(x2, topPad + plotHeight)
      ctx.stroke()
      ctx.restore()
    }

    // 3. Draw Chart Content (Line or Bars)
    const lineColor = getComputedStyle(canvas).getPropertyValue('--chart-line').trim() || '#141414'
    const accentColor = getComputedStyle(canvas).getPropertyValue('--chart-accent').trim() || '#FFD976'
    const groundColor = getComputedStyle(canvas).getPropertyValue('--chart-ground').trim() || '#FFFFFF'
    const mutedColor = getComputedStyle(canvas).getPropertyValue('--chart-muted').trim() || '#5C5A56'

    if (mode === 'line') {
      const normData = displayedNormalized.length ? displayedNormalized : targetNormalized

      if (normData.length > 1) {
        ctx.save()
        ctx.strokeStyle = lineColor
        ctx.lineWidth = 2.5
        ctx.lineCap = 'round'
        ctx.lineJoin = 'round'

        // Catmull-Rom Spline through normalized points
        ctx.beginPath()
        const coords = normData.map((yVal, i) => ({
          x: (i / (normData.length - 1)) * plotWidth,
          y: getY(yVal)
        }))

        ctx.moveTo(coords[0].x, coords[0].y)
        for (let i = 0; i < coords.length - 1; i++) {
          const p0 = coords[Math.max(i - 1, 0)]
          const p1 = coords[i]
          const p2 = coords[i + 1]
          const p3 = coords[Math.min(i + 2, coords.length - 1)]

          // Catmull-Rom control points
          const cp1x = p1.x + (p2.x - p0.x) / 6
          const cp1y = p1.y + (p2.y - p0.y) / 6
          const cp2x = p2.x - (p3.x - p1.x) / 6
          const cp2y = p2.y - (p3.y - p1.y) / 6

          ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, p2.x, p2.y)
        }
        ctx.stroke()
        ctx.restore()
      }

      // Min & Max point markers when idle
      if (scrubIndex === null && !rangeSpan && extremeIndices) {
        const { maxIdx, minIdx } = extremeIndices
        const maxX = (maxIdx / (rawPoints.length - 1)) * plotWidth
        const maxY = getY((rawPoints[maxIdx].value - bounds.min) / bounds.range)
        const minX = (minIdx / (rawPoints.length - 1)) * plotWidth
        const minY = getY((rawPoints[minIdx].value - bounds.min) / bounds.range)

        ctx.save()
        ctx.font = '600 11px var(--font-mono)'
        ctx.fillStyle = mutedColor
        ctx.textAlign = 'center'

        // Max text on top
        ctx.fillText(formatCurrency(rawPoints[maxIdx].value), Math.min(Math.max(maxX, 40), plotWidth - 40), maxY - 10)

        // Min text on bottom
        ctx.fillText(formatCurrency(rawPoints[minIdx].value), Math.min(Math.max(minX, 40), plotWidth - 40), minY + 16)
        ctx.restore()
      }

      // Latest Point Dot (when idle)
      if (scrubIndex === null && !rangeSpan && rawPoints.length > 0) {
        const lastIdx = rawPoints.length - 1
        const lastX = plotWidth
        const lastY = getY((rawPoints[lastIdx].value - bounds.min) / bounds.range)

        ctx.save()
        // Outer ring in ground color
        ctx.beginPath()
        ctx.arc(lastX, lastY, 7.5, 0, Math.PI * 2)
        ctx.fillStyle = groundColor
        ctx.fill()
        // Inner butter accent dot
        ctx.beginPath()
        ctx.arc(lastX, lastY, 5, 0, Math.PI * 2)
        ctx.fillStyle = accentColor
        ctx.fill()
        ctx.restore()
      }

      // Scrub Ruler & Dot
      if (scrubIndex !== null && !rangeSpan) {
        const scrubX = (scrubIndex / (rawPoints.length - 1)) * plotWidth
        const scrubY = getY((rawPoints[scrubIndex].value - bounds.min) / bounds.range)

        ctx.save()
        // Vertical ruler
        ctx.strokeStyle = lineColor
        ctx.lineWidth = 1.5
        ctx.beginPath()
        ctx.moveTo(scrubX, topPad - 10)
        ctx.lineTo(scrubX, topPad + plotHeight)
        ctx.stroke()

        // Scrub dot with ground border
        ctx.beginPath()
        ctx.arc(scrubX, scrubY, 8, 0, Math.PI * 2)
        ctx.fillStyle = groundColor
        ctx.fill()
        ctx.beginPath()
        ctx.arc(scrubX, scrubY, 5.5, 0, Math.PI * 2)
        ctx.fillStyle = accentColor
        ctx.fill()
        ctx.restore()
      }
    } else {
      // BARS MODE
      const count = rawPoints.length
      const barWidth = Math.max(3, (plotWidth / count) * 0.65)
      const gap = plotWidth / count

      rawPoints.forEach((p, idx) => {
        const x = idx * gap + gap / 2 - barWidth / 2
        const normY = (p.value - bounds.min) / bounds.range
        const y = getY(normY)
        const barHeight = Math.max(4, (topPad + plotHeight) - y)

        const isHighlighted =
          (rangeSpan && idx >= Math.min(rangeSpan.from, rangeSpan.to) && idx <= Math.max(rangeSpan.from, rangeSpan.to)) ||
          (scrubIndex !== null && scrubIndex === idx) ||
          (scrubIndex === null && !rangeSpan && idx === count - 1)

        const opacity = (scrubIndex !== null || rangeSpan) && !isHighlighted ? 0.35 : 1

        ctx.save()
        ctx.globalAlpha = opacity
        ctx.fillStyle = isHighlighted ? accentColor : lineColor

        // Rounded top rectangle
        const r = Math.min(4, barWidth / 2)
        ctx.beginPath()
        ctx.roundRect(x, y, barWidth, barHeight, [r, r, 0, 0])
        ctx.fill()
        ctx.restore()
      })
    }
  }, [
    rawPoints,
    displayedNormalized,
    targetNormalized,
    mode,
    bounds,
    scrubIndex,
    rangeSpan,
    extremeIndices,
    formatCurrency
  ])

  // Mouse & Touch Gesture Handlers
  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const canvas = canvasRef.current
    if (!canvas || !rawPoints.length) return

    const rect = canvas.getBoundingClientRect()
    const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width))
    const index = Math.round((x / rect.width) * (rawPoints.length - 1))

    dragStartRef.current = { x: e.clientX, y: e.clientY, index }
    hasMovedRef.current = false
    setScrubIndex(index)
    setRangeSpan(null)

    // Hold gesture timer (300ms) turns drag into range selection
    if (holdTimerRef.current) clearTimeout(holdTimerRef.current)
    holdTimerRef.current = window.setTimeout(() => {
      if (!hasMovedRef.current) {
        setIsHoldingRange(true)
        setRangeSpan({ from: index, to: index })
      }
    }, 280)
  }

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const canvas = canvasRef.current
    if (!canvas || !rawPoints.length) return

    const rect = canvas.getBoundingClientRect()
    const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width))
    const index = Math.min(Math.max(0, Math.round((x / rect.width) * (rawPoints.length - 1))), rawPoints.length - 1)

    if (dragStartRef.current) {
      const dist = Math.hypot(e.clientX - dragStartRef.current.x, e.clientY - dragStartRef.current.y)
      if (dist > 8 && !isHoldingRange) {
        hasMovedRef.current = true
        if (holdTimerRef.current) clearTimeout(holdTimerRef.current)
      }

      if (isHoldingRange || e.shiftKey) {
        setRangeSpan({ from: dragStartRef.current.index, to: index })
      } else {
        setScrubIndex(index)
      }
    } else {
      // Hover scrubbing
      setScrubIndex(index)
    }
  }

  const handlePointerUp = () => {
    if (holdTimerRef.current) clearTimeout(holdTimerRef.current)
    dragStartRef.current = null
    setIsHoldingRange(false)
  }

  const handlePointerLeave = () => {
    if (holdTimerRef.current) clearTimeout(holdTimerRef.current)
    dragStartRef.current = null
    setIsHoldingRange(false)
    setScrubIndex(null)
    setRangeSpan(null)
  }

  // Active Value & Delta Computations
  const activeValue = useMemo(() => {
    if (!rawPoints.length) return 0
    if (rangeSpan) {
      const fromVal = rawPoints[rangeSpan.from]?.value || 0
      const toVal = rawPoints[rangeSpan.to]?.value || 0
      return toVal - fromVal
    }
    if (scrubIndex !== null && rawPoints[scrubIndex]) {
      return rawPoints[scrubIndex].value
    }
    return rawPoints[rawPoints.length - 1]?.value || 0
  }, [rawPoints, scrubIndex, rangeSpan])

  const deltaStats = useMemo(() => {
    if (rawPoints.length < 2) return null
    let fromVal: number
    let toVal: number

    if (rangeSpan) {
      fromVal = rawPoints[rangeSpan.from]?.value || 0
      toVal = rawPoints[rangeSpan.to]?.value || 0
    } else if (scrubIndex !== null) {
      fromVal = rawPoints[0].value
      toVal = rawPoints[scrubIndex]?.value || rawPoints[0].value
    } else {
      fromVal = rawPoints[0].value
      toVal = rawPoints[rawPoints.length - 1].value
    }

    const delta = toVal - fromVal
    const percent = fromVal === 0 ? 0 : delta / Math.abs(fromVal)
    return { delta, percent }
  }, [rawPoints, scrubIndex, rangeSpan])

  // Split decimals for numeral: Whole part in line color, fractional part in dimmed muted color
  const splitNumeral = useMemo(() => {
    const isSigned = rangeSpan !== null
    const val = isSigned ? Math.abs(activeValue) : activeValue
    const signPrefix = isSigned ? (activeValue < 0 ? '−' : '+') : ''
    const formatted = formatCurrency(val)

    // Locate decimal point
    const match = formatted.match(/^(.*?)(\.\d+)?$/)
    if (!match) return { whole: signPrefix + formatted, fraction: '' }

    return {
      whole: signPrefix + match[1],
      fraction: match[2] || ''
    }
  }, [activeValue, rangeSpan, formatCurrency])

  // Meta line formatting
  const metaLine = useMemo(() => {
    if (!rawPoints.length) return activeSeries?.label || ''
    if (rangeSpan) {
      const d1 = rawPoints[Math.min(rangeSpan.from, rangeSpan.to)]?.date
      const d2 = rawPoints[Math.max(rangeSpan.from, rangeSpan.to)]?.date
      return `${formatDate(d1)} – ${formatDate(d2)}`
    }
    if (scrubIndex !== null && rawPoints[scrubIndex]) {
      return formatDate(rawPoints[scrubIndex].date, true)
    }
    return `Latest · ${activeSeries?.label || ''}`
  }, [rawPoints, scrubIndex, rangeSpan, activeSeries])

  // Flag position & content
  const flagInfo = useMemo(() => {
    if (scrubIndex === null || rangeSpan || !rawPoints.length || !containerRef.current) return null
    const width = containerRef.current.clientWidth || 300
    const ratio = scrubIndex / (rawPoints.length - 1)
    const rawX = ratio * width
    const clampedX = Math.min(Math.max(rawX, 48), width - 48)
    const dateStr = formatDate(rawPoints[scrubIndex].date, true)
    return { x: clampedX, text: dateStr }
  }, [scrubIndex, rangeSpan, rawPoints])

  // Axis Labels
  const axisLabels = useMemo(() => {
    if (!rawPoints.length) return []
    const first = rawPoints[0].date
    const mid = rawPoints[Math.floor(rawPoints.length / 2)].date
    const last = rawPoints[rawPoints.length - 1].date

    return [
      { text: formatDate(first).toUpperCase(), align: 'left' },
      { text: formatDate(mid).toUpperCase(), align: 'center' },
      { text: formatDate(last).toUpperCase(), align: 'right' }
    ]
  }, [rawPoints])

  return (
    <div
      ref={containerRef}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '14px',
        width: '100%',
        maxWidth: '100%'
      }}
    >
      {/* 1. READOUT HEADER */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        {/* Meta Line */}
        <div
          style={{
            fontSize: '12px',
            fontWeight: 600,
            letterSpacing: '1.2px',
            color: 'var(--chart-muted)',
            textTransform: 'uppercase',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis'
          }}
        >
          {metaLine}
        </div>

        {/* Big Figure & Solid Delta Chip */}
        <div
          style={{
            display: 'flex',
            alignItems: 'baseline',
            gap: '12px',
            flexWrap: 'wrap'
          }}
        >
          {/* Split Numeral */}
          <div
            style={{
              fontSize: '44px',
              fontWeight: 300,
              letterSpacing: '-0.02em',
              lineHeight: 1,
              fontFeatureSettings: '"tnum"',
              display: 'flex',
              alignItems: 'baseline'
            }}
          >
            <span style={{ color: 'var(--chart-line)' }}>{splitNumeral.whole}</span>
            <span style={{ color: 'var(--chart-muted)' }}>{splitNumeral.fraction}</span>
          </div>

          {/* Delta Chip */}
          {deltaStats && (
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                padding: '0 10px',
                height: '28px',
                borderRadius: '9999px',
                fontSize: '13px',
                fontWeight: 600,
                color: deltaStats.delta === 0 ? 'var(--chart-muted)' : 'var(--chart-ink)',
                backgroundColor:
                  deltaStats.delta > 0
                    ? 'var(--chart-up)'
                    : deltaStats.delta < 0
                    ? 'var(--chart-down)'
                    : 'var(--chart-band)',
                transition: 'background-color 0.2s ease, transform 0.2s ease',
                flexShrink: 0
              }}
            >
              {deltaStats.delta >= 0 ? (
                <ArrowUpRight size={13} strokeWidth={3} />
              ) : (
                <ArrowDownRight size={13} strokeWidth={3} />
              )}
              {rangeSpan === null && (
                <span>
                  {deltaStats.delta < 0 ? '−' : '+'}
                  {formatCurrency(Math.abs(deltaStats.delta))}
                </span>
              )}
              <span>{(Math.abs(deltaStats.percent) * 100).toFixed(1)}%</span>
            </div>
          )}
        </div>
      </div>

      {/* 2. CHART AREA WITH OVERLAYS */}
      <div
        style={{
          position: 'relative',
          width: '100%',
          height: '220px',
          cursor: isHoldingRange ? 'col-resize' : 'crosshair',
          touchAction: 'none'
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerLeave}
      >
        <canvas
          ref={canvasRef}
          style={{
            width: '100%',
            height: '100%',
            display: 'block'
          }}
        />

        {/* Floating Flag riding the scrub ruler */}
        {flagInfo && (
          <div
            style={{
              position: 'absolute',
              top: '10px',
              left: `${flagInfo.x}px`,
              transform: 'translateX(-50%)',
              backgroundColor: 'var(--chart-line)',
              color: 'var(--chart-ground)',
              fontFamily: 'var(--font-mono)',
              fontSize: '11px',
              fontWeight: 600,
              padding: '3px 8px',
              borderRadius: '9999px',
              whiteSpace: 'nowrap',
              pointerEvents: 'none',
              boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
              transition: 'left 0.08s ease-out'
            }}
          >
            {flagInfo.text}
          </div>
        )}

        {/* Empty State */}
        {!rawPoints.length && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--chart-muted)',
              fontSize: '14px',
              fontWeight: 600
            }}
          >
            Loading Solana data...
          </div>
        )}
      </div>

      {/* 3. X-AXIS LABELS */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          paddingTop: '2px'
        }}
      >
        {axisLabels.map((lbl, idx) => (
          <div
            key={idx}
            style={{
              fontSize: '11px',
              fontWeight: 600,
              letterSpacing: '0.6px',
              color: 'var(--chart-muted)',
              fontFamily: 'var(--font-sans)',
              textAlign: lbl.align as any
            }}
          >
            {lbl.text}
          </div>
        ))}
      </div>

      {/* 4. RANGE PICKER (SLIDING PILL) */}
      {series.length > 1 && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            padding: '4px',
            backgroundColor: 'var(--chart-band)',
            borderRadius: '9999px',
            position: 'relative'
          }}
        >
          {series.map((item, idx) => {
            const isSelected = idx === rangeIndex
            return (
              <button
                key={item.id}
                onClick={() => onRangeChange(idx)}
                style={{
                  flex: 1,
                  minHeight: '40px',
                  border: 'none',
                  background: isSelected ? 'var(--chart-accent)' : 'transparent',
                  color: isSelected ? 'var(--chart-ink)' : 'var(--chart-muted)',
                  fontSize: '13.5px',
                  fontWeight: 700,
                  borderRadius: '9999px',
                  cursor: 'pointer',
                  transition: 'background-color 0.25s ease, color 0.2s ease, transform 0.15s ease',
                  outline: 'none',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              >
                {item.label}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

function formatDate(date?: Date, precise = false): string {
  if (!date) return ''
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  const m = months[date.getMonth()]
  const d = date.getDate()
  const hours = date.getHours().toString().padStart(2, '0')
  const minutes = date.getMinutes().toString().padStart(2, '0')

  if (precise) {
    return `${m} ${d}, ${hours}:${minutes}`
  }
  return `${m} ${d}`
}
