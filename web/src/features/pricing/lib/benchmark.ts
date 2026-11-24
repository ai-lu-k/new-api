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
export type BenchmarkScore = {
  rating: number
  date: string
}

export type BenchmarkTier = {
  id: string
  source_name: string
  scores: Record<string, BenchmarkScore>
}

/** Speech filters have their own modality to keep text scores out of audio rows. */
export type BenchmarkModality = 'text' | 'image' | 'speech'

export type BenchmarkModel = {
  id: string
  modality?: string
  aliases: string[]
  highest_tier: string
  tiers: BenchmarkTier[]
}

export type BenchmarkDimension = {
  id: string
  label_key: string
  modality: string
  group: string
  date: string
}

export type BenchmarkSource = {
  version: string
  source_url: string
  license_url: string
}

export type BenchmarkSnapshot = BenchmarkSource & {
  image_attribution?: BenchmarkSource
  updated_at: string
  stale: boolean
  dimensions: BenchmarkDimension[]
  models: BenchmarkModel[]
}

export function benchmarkSource(
  snapshot: BenchmarkSnapshot | undefined,
  modality: BenchmarkModality
): BenchmarkSource | undefined {
  if (modality === 'image') return snapshot?.image_attribution
  if (modality === 'text') return snapshot
}

/** Only audited aliases match. Never strip fast, distill, snapshot or price suffixes. */
export function indexBenchmarkModels(
  models: BenchmarkModel[]
): Map<string, BenchmarkModel> {
  const index = new Map<string, BenchmarkModel>()
  for (const model of models) {
    for (const alias of model.aliases) index.set(alias, model)
  }
  return index
}

/** The dimensions one modality is scored on, in published order. */
export function benchmarkDimensionsForModality(
  dimensions: BenchmarkDimension[],
  modality: BenchmarkModality
): BenchmarkDimension[] {
  return dimensions.filter((dimension) => dimension.modality === modality)
}

/** The dimension a modality opens with. */
export function defaultBenchmarkDimension(modality: BenchmarkModality): string {
  if (modality === 'image') return 'image:overall'
  if (modality === 'speech') return 'speech:elo'
  return 'overall'
}

/**
 * Elo ratings are four-digit and cluster tightly, so a zero baseline hides the
 * differences the ladder is about. This window follows the scores instead.
 */
export function eloWindow(ratings: number[]): {
  domain: [number, number]
  ticks: number[]
} {
  const step = 50
  const low = Math.min(...ratings)
  const high = Math.max(...ratings)
  const pad = Math.max(20, (high - low) * 0.3)
  const start = Math.floor((low - pad) / step) * step
  const end = Math.ceil((high + pad) / step) * step
  const ticks: number[] = []
  for (let value = start; value <= end; value += step) ticks.push(value)
  return { domain: [start, end], ticks }
}

/** The ladder a model is scored on; an unmarked model is a text one. */
export function benchmarkModelModality(
  model?: BenchmarkModel
): BenchmarkModality {
  return model?.modality === 'image' ? 'image' : 'text'
}

/** Highest inference strength is configured independently from observed ratings. */
export function highestBenchmarkTier(
  model?: BenchmarkModel
): BenchmarkTier | undefined {
  return model?.tiers.find((tier) => tier.id === model.highest_tier)
}

export function benchmarkScore(
  model: BenchmarkModel | undefined,
  dimension: string,
  tier = model?.highest_tier
): BenchmarkScore | undefined {
  return model?.tiers.find((item) => item.id === tier)?.scores[dimension]
}
