export interface ReferralLadderStep {
  ordinal: number
  reward_yuan: number
  reached: boolean
  current: boolean
}

export interface ReferralRewardRecord {
  id: number
  invitee: string
  status: 'pending' | 'issued'
  pending_reason: string
  created_at: number
  issued_at: number
  inviter_ordinal: number
  inviter_reward_yuan: number
  voucher_status: string
  voucher_expires_at: number
}

export interface ReferralOverview {
  aff_code: string
  invites: number
  rewarded: number
  pending: number
  invitee_reward_yuan: number
  next_reward_yuan: number
  available_vouchers: number
  ladder: ReferralLadderStep[]
  rewards: ReferralRewardRecord[]
}
