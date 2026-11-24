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
import type { WorkBuddyAccount } from '../../types'

/**
 * One growth task as the hub reports it. `status` is the upstream accept
 * status (`not_accepted`, `claimed`, and the in-progress variants the
 * dashboard also renders), `unforgeable` marks a task the hub cannot automate
 * because the upstream only counts real desktop actions.
 */
export type WorkBuddyGrowthTask = {
  task_code: string
  name: string
  description: string
  jump_url: string
  status: string
  task_type: string
  current: number
  target: number
  reward_credit: number
  reward_energy: number
  unforgeable: boolean
  reason: string
}

/** Where the buddy cat is and what its trip is worth. */
export type WorkBuddyCatTravel = {
  state?: string
  reward_credit?: number
  daily_limit_reached?: boolean
  duration_hours?: number
  depart_at?: number
  arrive_at?: number
  server_now?: number
  location?: {
    id?: number
    code?: string
    name?: string
    duration_hours?: number
  }
}

/** Streak, energy, makeup cards and lottery chances for the selected account. */
export type WorkBuddyGrowthSummary = {
  energy?: number
  streak_days?: number
  travel?: WorkBuddyCatTravel
  makeup_cards?: number
  lottery_chances?: number
  tiers?: {
    tier: string
    days: number
    credit: number
    energy: number
    cards: number
    chances: number
  }[]
  tier_statuses?: Record<string, string>
}

/** A domestic account that takes part in growth tasks. */
export type WorkBuddyTaskAccount = { uid: string; nickname: string }

/** `GET /tasks`: one account's snapshot plus the account picker's options. */
export type WorkBuddyTasksPayload = {
  tasks: WorkBuddyGrowthTask[]
  summary: WorkBuddyGrowthSummary
  account?: WorkBuddyAccount
  accounts: WorkBuddyTaskAccount[]
  msg?: string
}

/** Today's daily-chat slots and what the scheduler already ran. */
export type WorkBuddySchedulerDailyChat = {
  times?: string[]
  random?: boolean
  done_slots?: string[]
  next_slot?: string
  budget_s?: number
  abandoned?: number
}

/** `GET /scheduler` and the answer to `POST /scheduler/toggle`. */
export type WorkBuddyScheduler = {
  enabled: boolean
  mode?: string
  mode_cn?: string
  mode_intl?: string
  last_run_time?: string
  next_run_time?: string
  daily_chat?: WorkBuddySchedulerDailyChat
  logs?: string[]
  msg?: string
}

/** One recorded check-in or daily-chat attempt. */
export type WorkBuddyActivityRow = {
  ts: string
  uid: string
  nickname?: string
  realm: string
  task: string
  trigger: string
  ok: boolean
  message?: string
}

/** `GET /activity/history`: newest first, filtered by the hub. */
export type WorkBuddyActivityHistory = {
  rows: WorkBuddyActivityRow[]
  total: number
  limit: number
  range: string
}

export type WorkBuddyClaimInput = { uid: string; code: string }

export type WorkBuddyRunInput = { uid?: string; claim: boolean }

export type WorkBuddyUidInput = { uid?: string }

/** `POST /tasks/claim`. */
export type WorkBuddyClaimResult = {
  ok?: boolean
  msg?: string
  credit?: number
}

/** `POST /tasks/run`. */
export type WorkBuddyRunResult = {
  ok?: boolean
  msg?: string
  credit_added?: number
  logs?: string[]
  accounts_count?: number
}

/** One account's outcome inside `POST /tasks/travel`. */
export type WorkBuddyTravelRow = {
  uid: string
  nickname?: string
  action?: string
  msg?: string
  reward_credit?: number
}

/** `POST /tasks/travel` and `POST /tasks/streak-bonus`. */
export type WorkBuddyWelfareResult = {
  ok?: boolean
  msg?: string
  results?: WorkBuddyTravelRow[]
  accounts_count?: number
}

/** `POST /scheduler/trigger`. */
export type WorkBuddySchedulerTriggerResult = { ok?: boolean; msg?: string }

/** One account's outcome inside the bulk check-in and daily-chat calls. */
export type WorkBuddyActivityResultRow = {
  uid: string
  nickname?: string
  ok?: boolean
  msg?: string
  error?: string
  conversation?: string
}

/** `POST /accounts/checkin`, `/accounts/daily-chat`, `/accounts/daily-chat-web`. */
export type WorkBuddyActivityResult = {
  results?: WorkBuddyActivityResultRow[]
}
