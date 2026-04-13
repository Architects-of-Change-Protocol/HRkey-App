export type AocTransaction = {
  id: string;
  from_user_id: string;
  to_user_id: string;
  amount: number;
  type: string;
  reference_id?: string | null;
  created_at: string;
};

export type AocEarningsSummary = {
  periodDays: number;
  totalEarnedRecent: number;
  paidAccessCount: number;
  averagePerAccess: number;
  totalEarnedHistorical: number;
  incomingTransactionCount: number;
};

export type RlusdQuote = {
  sourceCurrency: 'AOC';
  targetCurrency: 'RLUSD';
  sourceAmount: number;
  quotedRate: number;
  quotedTargetAmount: number;
  platformFeeAmount: number;
  netTargetAmount: number;
  quoteExpiresAt: string;
};

export type RlusdWithdrawalQuote = {
  amount: number;
  feeAmount: number;
  netAmount: number;
  minWithdrawal: number;
  availableBalance: number;
};

export type AocConversionRequest = {
  id: string;
  user_id: string;
  source_currency: 'AOC';
  target_currency: 'RLUSD';
  source_amount: number;
  quoted_rate: number;
  quoted_target_amount: number;
  platform_fee_amount: number;
  net_target_amount: number;
  status: 'quoted' | 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';
  reference_note?: string | null;
  quote_expires_at?: string | null;
  wallet_destination?: string | null;
  created_at: string;
  updated_at: string;
  completed_at?: string | null;
  failure_reason?: string | null;
};

export type RlusdWithdrawalRequest = {
  id: string;
  user_id: string;
  amount: number;
  fee_amount: number;
  net_amount: number;
  status: 'requested' | 'pending_review' | 'processing' | 'completed' | 'failed' | 'cancelled';
  destination_type: 'wallet' | 'bank' | 'sinpe' | 'sinpe_mobile' | 'other';
  destination_label?: string | null;
  destination_ref?: string | null;
  reference_note?: string | null;
  payout_rail?: string | null;
  payout_provider?: string | null;
  payout_reference?: string | null;
  payout_external_id?: string | null;
  payout_status?: string | null;
  payout_status_detail?: string | null;
  payout_operator_note?: string | null;
  created_at: string;
  updated_at: string;
  completed_at?: string | null;
  failure_reason?: string | null;
};

export type RlusdTransaction = {
  id: string;
  user_id: string;
  amount: number;
  direction: 'credit' | 'debit';
  type:
    | 'conversion_credit'
    | 'withdrawal_hold'
    | 'withdrawal_release'
    | 'withdrawal_complete'
    | 'adjustment';
  reference_id?: string | null;
  created_at: string;
};
