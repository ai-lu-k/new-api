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
export type CampaignState = 'disabled' | 'scheduled' | 'active' | 'ended'

export type CampaignTier = 'beginner' | 'advanced' | 'hard' | 'final'

export type CampaignAttachment = {
  name: string
  url: string
}

export type CampaignChallenge = {
  id: string
  tier: CampaignTier
  points: number
  title: string
  prompt: string
  bonus?: boolean
  image_url?: string
  files: CampaignAttachment[]
  widget: string
  widget_data: string
  hints?: string[] | null
  reward_quota: number
  reward_yuan: number
  solved_count: number
  solved: boolean
  awarded_quota: number
  awarded_yuan: number
}

export type CampaignMe = {
  guest: boolean
  bound: boolean
  points: number
  rank: number
  solved_count: number
  eligible: boolean
  reward_slot: number
  solve_quota: number
  share_quota: number
  rank_quota: number
  total_quota: number
  solve_yuan: number
  share_yuan: number
  rank_yuan: number
  total_yuan: number
  share_claimed: boolean
  share_ready: boolean
  can_share: boolean
  final_rank: number
}

export type CampaignLeaderboardRow = {
  rank: number
  user_id: number
  name: string
  points: number
  solved_count: number
  eligible: boolean
  final_rank: number
}

export type CampaignStatus = {
  /** Stable campaign identifier, rendered when the campaign has no title. */
  slug: string
  /** Campaign name owned by the backend; the page headline reads this first. */
  title: string
  enabled: boolean
  state: CampaignState
  server_time: number
  starts_at: number
  ends_at: number
  claim_deadline: number
  reward_slots: number
  slots_left: number
  total_points: number
  share_yuan: number
  ranking_yuan: number[]
  reward_pool_yuan: number
  participants: number
  solve_count: number
  ranking_settled_at: number
  challenges: CampaignChallenge[]
  me: CampaignMe
  leaderboard: CampaignLeaderboardRow[]
}

export type CampaignSubmitResult = {
  correct: boolean
  already_solved: boolean
  challenge_id: string
  points: number
  awarded_quota: number
  awarded_yuan: number
  total_points: number
  solved_count: number
  reward_slot: number
  eligible: boolean
  guest: boolean
}

export type CampaignShareResult = {
  quota: number
  yuan: number
  already_claimed: boolean
}

/** One paid rank in the post-event settlement, as returned by the backend. */
export type CampaignRankingWinner = {
  rank: number
  user_id: number
  name: string
  points: number
  quota: number
  yuan: number
}

/** Result of the administrator's one-off ranking payout. */
export type CampaignRankingSettlement = {
  settled_at: number
  winners: CampaignRankingWinner[]
}
