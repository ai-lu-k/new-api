/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { TrafficPlot } from '../components/traffic-plot'
import { expenseColorScale } from '../lib/expense-scale'
import { bucketCalls, bucketTotals } from '../lib/traffic'
import type { ImageModelHistoryPoint, ModelHistoryPoint } from '../types'

const POINTS: ModelHistoryPoint[] = [
  {
    ts: '2026-10-08T00:00:00Z',
    label: 'Oct 8',
    model: 'beta',
    vendor: 'acme',
    tokens: 200,
  },
  {
    ts: '2026-10-01T00:00:00Z',
    label: 'Oct 1',
    model: 'alpha',
    vendor: 'acme',
    tokens: 100,
  },
  {
    ts: '2026-10-01T00:00:00Z',
    label: 'Oct 1',
    model: 'beta',
    vendor: 'acme',
    tokens: 200,
  },
  {
    ts: '2026-10-15T00:00:00Z',
    label: 'Oct 15',
    model: 'alpha',
    vendor: 'acme',
    tokens: 900,
  },
  {
    ts: '2026-10-15T00:00:00Z',
    label: 'Oct 15',
    model: 'beta',
    vendor: 'acme',
    tokens: 900,
  },
  {
    ts: '2026-10-22T00:00:00Z',
    label: 'Oct 22',
    model: 'alpha',
    vendor: 'acme',
    tokens: 10,
  },
]

describe('bucketTotals', () => {
  it('adds every model into one total per bucket, oldest first', () => {
    const { points } = bucketTotals(POINTS)

    expect(points).toEqual([
      { ts: '2026-10-01T00:00:00Z', label: 'Oct 1', value: 300 },
      { ts: '2026-10-08T00:00:00Z', label: 'Oct 8', value: 200 },
      { ts: '2026-10-15T00:00:00Z', label: 'Oct 15', value: 1800 },
      { ts: '2026-10-22T00:00:00Z', label: 'Oct 22', value: 10 },
    ])
  })

  it('names the busiest bucket so the plot can accent it', () => {
    expect(bucketTotals(POINTS).peakLabel).toBe('Oct 15')
  })

  it('keeps the earlier bucket when two buckets tie on volume', () => {
    const tied: ModelHistoryPoint[] = [
      { ...POINTS[0], label: 'Oct 8', tokens: 400 },
      { ...POINTS[1], label: 'Oct 1', tokens: 400 },
    ]

    expect(bucketTotals(tied).peakLabel).toBe('Oct 1')
  })
})

describe('traffic plot', () => {
  const { points, peakLabel } = bucketTotals(POINTS)

  it('accents exactly one bucket with the red marker', () => {
    const { container } = render(
      <TrafficPlot points={points} peakLabel={peakLabel} />
    )

    expect(container.querySelectorAll('circle[fill="#e40018"]')).toHaveLength(1)
  })

  it('draws today as a hatched bar instead of a cliff at the end of the line', () => {
    // The API stamps buckets by UTC day; today is the bucket still counting.
    const today = new Date().toISOString().slice(0, 10)
    const withToday = [
      ...points,
      { ts: `${today}T00:00:00Z`, label: 'Today', value: 40 },
    ]
    const { container } = render(
      <TrafficPlot points={withToday} peakLabel={peakLabel} showToday />
    )

    const bar = container.querySelector('[data-slot="traffic-today-bar"]')
    expect(bar).toBeInTheDocument()
    expect(screen.getByText('Today, still counting')).toBeInTheDocument()
    expect(screen.getByText('Today')).toBeInTheDocument()

    // The area keeps running through today; the bar only sits on top of it.
    const line = container.querySelector('path[fill="none"]')?.getAttribute('d')
    const lastX = Number(line?.match(/([0-9.]+),[0-9.]+$/)?.[1] ?? -1)
    const barCentre =
      Number(bar?.getAttribute('x') ?? 0) +
      Number(bar?.getAttribute('width') ?? 0) / 2
    expect(lastX).toBeCloseTo(barCentre, 1)
  })

  it('leaves the bar out when the newest bucket is a finished day', () => {
    const { container } = render(
      <TrafficPlot points={points} peakLabel={peakLabel} showToday />
    )

    expect(
      container.querySelector('[data-slot="traffic-today-bar"]')
    ).toBeNull()
    expect(screen.queryByText('Today, still counting')).toBeNull()
  })

  it('leaves the bar out on periods that are not bucketed by day', () => {
    const today = new Date().toISOString().slice(0, 10)
    const withToday = [
      ...points,
      { ts: `${today}T00:00:00Z`, label: 'Today', value: 40 },
    ]
    const { container } = render(
      <TrafficPlot points={withToday} peakLabel={peakLabel} />
    )

    expect(
      container.querySelector('[data-slot="traffic-today-bar"]')
    ).toBeNull()
  })

  it('labels the value axis where the gridlines are', () => {
    render(<TrafficPlot points={points} peakLabel={peakLabel} />)

    const labels = [
      ...document.querySelectorAll('[data-slot="traffic-axis-label"]'),
    ].map((node) => node.textContent)
    // 1,800 at the top rounds up to a 3K axis on a 1K step.
    expect(labels).toEqual(['0', '1K', '2K', '3K'])
  })

  it('names every tone the plot uses', () => {
    render(<TrafficPlot points={points} peakLabel={peakLabel} />)

    expect(screen.getByText('Total per period')).toBeInTheDocument()
    expect(screen.getByText('Busiest period')).toBeInTheDocument()
  })
})

describe('image call totals', () => {
  const CALLS: ImageModelHistoryPoint[] = [
    {
      ts: '2026-10-01T00:00:00Z',
      label: 'Oct 1',
      model: 'gpt-image-2.5-flare',
      vendor: 'OpenAI',
      requests: 7,
    },
    {
      ts: '2026-10-01T00:00:00Z',
      label: 'Oct 1',
      model: 'gemini-nano-banana-2.1',
      vendor: 'Google',
      requests: 3,
    },
    {
      ts: '2026-10-08T00:00:00Z',
      label: 'Oct 8',
      model: 'gpt-image-2.5-flare',
      vendor: 'OpenAI',
      requests: 11,
    },
  ]

  it('counts calls, not tokens, for the image board', () => {
    const { points, peakLabel } = bucketCalls(CALLS)

    expect(points).toEqual([
      { ts: '2026-10-01T00:00:00Z', label: 'Oct 1', value: 10 },
      { ts: '2026-10-08T00:00:00Z', label: 'Oct 8', value: 11 },
    ])
    expect(peakLabel).toBe('Oct 8')
  })
})

describe('expense colour scale', () => {
  it('gives the biggest expense item the darkest ink', () => {
    const scale = expenseColorScale(
      new Map([
        ['Server', 300],
        ['Upstream top-ups', 1200],
        ['Domain', 60],
      ])
    )

    expect(scale['Upstream top-ups']).toBe('#111111')
    expect(scale.Server).toBe('#4a4a4a')
    expect(scale.Domain).toBe('#7d7d7d')
  })

  it('inverts the ink on a dark page', () => {
    const scale = expenseColorScale(new Map([['Server', 10]]), true)

    expect(scale.Server).toBe('#f2f2f2')
  })

  it('reuses the lightest tone once an item falls past the fifth step', () => {
    const totals = new Map(
      ['a', 'b', 'c', 'd', 'e', 'f'].map((name, index) => [name, 60 - index])
    )
    const scale = expenseColorScale(totals)

    expect(scale.e).toBe(scale.f)
    expect(scale.a).not.toBe(scale.b)
  })
})
