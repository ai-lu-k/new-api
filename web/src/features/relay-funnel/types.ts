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
export type ObservationCost = {
  status: 'reported' | 'estimated' | 'unknown'
  amount: string | null
  currency?: string
  source: string
}

export type ObservationAttempt = {
  number: number
  channel_id: number
  upstream_model: string
  outcome: string
  duration_ms: number
  first_reasoning_ms: number | null
  first_content_ms: number | null
  output_tps: number | null
  response_bytes: number
  usage: {
    input_tokens: number | null
    output_tokens: number | null
    cache_read_tokens: number | null
    cache_write_tokens: number | null
  } | null
  cost: ObservationCost
}

export type RequestObservation = {
  request_id: string
  model: string
  outcome: string
  duration_ms: number
  first_reasoning_ms: number | null
  first_content_ms: number | null
  downstream_bytes: number
  truncated: boolean
  attempts: ObservationAttempt[]
  procurement_costs?:
    | { currency: string; reported: string; estimated: string }[]
    | null
  unknown_cost_attempts?: number
}

export type ObservationAverage = { samples: number; value: number | null }

export type ObservationCostTotal = {
  currency: string
  reported: string
  estimated: string
}

export type AttemptMetrics = {
  attempts: number
  successful: number
  errors: number
  timeouts: number
  cancelled: number
  incomplete: number
  with_output: number
  response_bytes: number
  request_bytes: number
  request_bytes_known: number
  first_reasoning_ms: ObservationAverage
  first_content_ms: ObservationAverage
  output_tokens: number
  output_usage_known: number
  output_tps: number | null
  tps_observed_attempts: number
  cache_observed_attempts: number
  cache_hit_attempts: number
  cache_request_hit_rate: number | null
  cache_read_tokens: number
  cache_input_tokens: number
  cache_token_hit_rate: number | null
  cache_paired_attempts: number
  unknown_cost_attempts: number
  costs: ObservationCostTotal[] | null
}

export type RequestMetrics = {
  requests: number
  with_upstream: number
  with_output: number
  completed: number
  failed: number
  cancelled: number
  local_rejected: number
  routing_errors: number
  capacity_rejected: number
  delivery_errors: number
  incomplete: number
  failover_requests: number
  failover_saved: number
  capacity_skipped: number
  candidate_checks: number
  truncated_requests: number
  downstream_bytes: number
  first_reasoning_ms: ObservationAverage
  first_content_ms: ObservationAverage
  duration_ms: ObservationAverage
  upstream: AttemptMetrics
}

export type ChannelMetrics = {
  channel_id: number
  upstream_model: string
  metrics: AttemptMetrics
}

export type ModelMetrics = {
  model: string
  metrics: RequestMetrics
}

export type ChainChannel = {
  channel_id: number
  upstream_model: string
  /** Configured order: the highest priority tier is tried first. */
  priority: number
  weight: number
  reached: number
  attempted: number
  succeeded: number
  failed: number
  skipped: number
  rejected: number
  /** Requests whose chain ended on this channel without a success. */
  terminated: number
}

export type ModelChain = {
  model: string
  requests: number
  completed: number
  failed: number
  /** Channels in routing order, one row each. */
  channels: ChainChannel[]
}

export type FunnelReport = {
  schema_version: number
  scope: string
  traffic_kind: string
  start: number
  end: number
  matched_requests: number
  scanned_requests: number
  channel_names?: Record<string, string>
  scan_truncated: boolean
  scan_limit: number
  writes: { dropped: number; failed: number }
  summary: {
    totals: RequestMetrics
    by_channel: ChannelMetrics[]
    by_model: ModelMetrics[]
    chains: ModelChain[]
  }
}
