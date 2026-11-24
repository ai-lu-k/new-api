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
import type { ImageModelHistoryPoint, ModelHistoryPoint } from '../types'

/** One bucket of the traffic line: what the site moved in that period. */
export type TrafficBucket = {
  /** Start of the bucket, as the API stamped it. */
  ts: string
  label: string
  value: number
}

/**
 * Collapse the per-model history into one total per bucket, oldest first.
 * The public page shows site-wide traffic only, so every model's contribution
 * to the same bucket is added up and the model name is dropped.
 */
function sumByBucket(
  points: Array<{ ts: string; label: string; value: number }>
): { points: TrafficBucket[]; peakLabel: string } {
  const ordered = [...points].sort((a, b) => a.ts.localeCompare(b.ts))
  const buckets = new Map<string, { ts: string; value: number }>()
  for (const point of ordered) {
    const bucket = buckets.get(point.label)
    buckets.set(point.label, {
      ts: bucket?.ts ?? point.ts,
      value: (bucket?.value ?? 0) + point.value,
    })
  }

  let peakLabel = ''
  let peakValue = 0
  for (const [label, bucket] of buckets) {
    if (bucket.value > peakValue) {
      peakLabel = label
      peakValue = bucket.value
    }
  }

  return {
    points: [...buckets].map(([label, bucket]) => ({
      ts: bucket.ts,
      label,
      value: bucket.value,
    })),
    peakLabel,
  }
}

/** Tokens the text and decision models served, summed per bucket. */
export function bucketTotals(points: ModelHistoryPoint[]) {
  return sumByBucket(
    points.map((point) => ({
      ts: point.ts,
      label: point.label,
      value: point.tokens,
    }))
  )
}

/**
 * Calls the image models answered, summed per bucket. They are billed per
 * call, so a call count is the only traffic figure they have.
 */
export function bucketCalls(points: ImageModelHistoryPoint[]) {
  return sumByBucket(
    points.map((point) => ({
      ts: point.ts,
      label: point.label,
      value: point.requests,
    }))
  )
}
