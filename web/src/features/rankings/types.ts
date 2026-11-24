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
// ----------------------------------------------------------------------------
// Rankings types
// ----------------------------------------------------------------------------
//
// Shape of the real data shown on the /rankings page.

export type RankingPeriod = 'today' | 'week' | 'month' | 'year'

/**
 * What a model board counts. Text models are ranked by the tokens they
 * served; image generation models by the number of calls they answered.
 */
export type ModelMetric = 'tokens' | 'requests'

/**
 * Which model board the rankings show. It is kept in the `kind` search
 * param, and text is the default so an old link keeps its meaning.
 */
export type ModelKind = 'text' | 'image' | 'audio' | 'decision'

export type RankingCategoryId =
  | 'all'
  | 'programming'
  | 'roleplay'
  | 'marketing'
  | 'translation'
  | 'science'
  | 'finance'
  | 'health'
  | 'legal'
  | 'education'
  | 'productivity'
  | 'multimodal'

export type ModelRanking = {
  rank: number
  /** Previous rank in the same period; undefined means "new". */
  previous_rank?: number
  model_name: string
  vendor: string
  vendor_icon?: string
  category: RankingCategoryId
  /** Total tokens routed through this model in the period. */
  total_tokens: number
  /**
   * Calls answered in the period. Present where the server reports it, so a
   * model priced by token can still show how often it was called.
   */
  total_requests?: number
  /** Share of all tokens served (0..1). */
  share: number
  /** Period-over-period change in token volume (%). */
  growth_pct: number
}

/** One image generation model, ranked by the calls it answered. */
export type ImageModelRanking = {
  rank: number
  /** Previous rank in the same period; undefined means "new". */
  previous_rank?: number
  model_name: string
  vendor: string
  vendor_icon?: string
  /** Image generations served in the period. */
  total_requests: number
  /** Share of all image calls served (0..1). */
  share: number
  /** Period-over-period change in call volume (%). */
  growth_pct: number
}

export type VendorRanking = {
  rank: number
  vendor: string
  vendor_icon?: string
  total_tokens: number
  share: number
  growth_pct: number
  /** Number of distinct models from this vendor with traffic. */
  models_count: number
  /** Top model from this vendor in the period. */
  top_model: string
}

export type RankingMover = {
  model_name: string
  vendor: string
  vendor_icon?: string
  /** Positive = climbed, negative = dropped. */
  rank_delta: number
  current_rank: number
  /** Token-volume change percent. */
  growth_pct: number
}

/**
 * One sample of a model's token usage at a given timestamp.
 * Flat shape ready to feed VChart's stacked-bar spec.
 */
export type ModelHistoryPoint = {
  ts: string
  /** Pre-formatted x-axis label (e.g. "May 5", "12:00"). */
  label: string
  /** Model display name shown in tooltip / legend. */
  model: string
  vendor: string
  /** Token count routed through the model in this bucket. */
  tokens: number
}

export type ModelHistorySeries = {
  /** Flat points ready for VChart, ordered oldest → newest. */
  points: ModelHistoryPoint[]
  /** Models that appear in the series, sorted by total tokens desc. */
  models: Array<{ name: string; vendor: string; total: number }>
  /** Bucket count (used for sizing axis ticks). */
  buckets: number
}

/** One sample of an image model's call volume at a given timestamp. */
export type ImageModelHistoryPoint = {
  ts: string
  /** Pre-formatted x-axis label (e.g. "May 5", "12:00"). */
  label: string
  model: string
  vendor: string
  /** Calls answered by the model in this bucket. */
  requests: number
}

export type ImageModelHistorySeries = {
  /** Flat points ready for VChart, ordered oldest → newest. */
  points: ImageModelHistoryPoint[]
  /** Models that appear in the series, sorted by total calls desc. */
  models: Array<{ name: string; vendor: string; total: number }>
  /** Bucket count (used for sizing axis ticks). */
  buckets: number
}

/** The text model board: token usage, the default view. */
export type TextModelBoard = {
  metric: 'tokens'
  rows: ModelRanking[]
  history: ModelHistorySeries
}

/** The image model board: call counts instead of tokens. */
export type ImageModelBoard = {
  metric: 'requests'
  rows: ImageModelRanking[]
  history: ImageModelHistorySeries
}

/**
 * The decision model board, such as the synchronous "jev" model. Its usage
 * counts tokens like the text board, but over decision models only.
 */
export type DecisionModelBoard = {
  metric: 'tokens'
  rows: ModelRanking[]
  history: ModelHistorySeries
}

/** Either board the "Top Models" card can show. */
export type ModelBoard = TextModelBoard | ImageModelBoard | DecisionModelBoard

/**
 * One sample of a vendor's market share at a given timestamp. `share` is
 * normalised within the bucket (sums to 1.0 across all vendors at the same
 * `ts`); `tokens` is preserved for tooltip use.
 */
export type VendorSharePoint = {
  ts: string
  label: string
  vendor: string
  share: number
  tokens: number
}

export type VendorShareSeries = {
  /** Flat points ready for VChart, ordered oldest → newest. */
  points: VendorSharePoint[]
  /** Vendors that appear in the series, sorted by aggregate tokens desc. */
  vendors: Array<{ name: string; total: number; share: number }>
  buckets: number
}

export type RankingsSnapshot = {
  // Overall (all categories) ------------------------------------------------
  /** Text models only; image generation models are ranked on their own. */
  models: ModelRanking[]
  /** Image generation models, ranked by call count. */
  image_models?: ImageModelRanking[]
  /** Decision models (tagged 决策模型, such as "jev"), ranked by tokens. */
  decision_models?: ModelRanking[]
  vendors: VendorRanking[]
  /** Largest rank gainers in this period. */
  top_movers: RankingMover[]
  /** Largest rank losers in this period. */
  top_droppers: RankingMover[]
  /** Stacked-bar history of token usage by model over the period. */
  models_history: ModelHistorySeries
  /**
   * Stacked-bar history of call counts by image model over the period.
   * Optional until the server ships it; the image board is then empty.
   */
  image_models_history?: ImageModelHistorySeries
  audio_models_history?: ImageModelHistorySeries
  /**
   * Stacked-bar history of token usage by decision model over the period,
   * the text series' shape. Optional until the server ships it.
   */
  decision_models_history?: ModelHistorySeries
  /** 100%-stacked area history of token share by vendor over the period. */
  vendor_share_history: VendorShareSeries
}

/** One line of what the site paid in a month. */
export type ExpenseItem = {
  name: string
  amount: number
  note?: string
  /** The day the money left, "2026-10-14". Older lines have none. */
  date?: string
  /**
   * Set by the server on a line that is one month's share of a prepaid
   * expense. Such a line is computed, never saved with the month.
   */
  spread?: { total: number; months: number; index: number }
  /** Set on the monthly line the site books from a gateway's payments. */
  automatic?: boolean
}

/** The expense lines of one calendar month, "2026-10". */
export type ExpenseMonth = {
  month: string
  items: ExpenseItem[]
}

/**
 * An expense paid once that covers several months, such as a server rented
 * by the year. Each covered month shows an equal share of it.
 */
export type PrepaidExpense = {
  name: string
  /** The whole payment. */
  amount: number
  /** First covered month, "2026-10". */
  start: string
  /** Number of covered months. */
  months: number
  note?: string
}

export type ExpenseLedgerData = {
  /** What the public page shows: entered lines plus prepaid shares. */
  months: ExpenseMonth[]
  /** The months as the operator entered them; the editor works on these. */
  entered: ExpenseMonth[]
  prepaid: PrepaidExpense[]
}
