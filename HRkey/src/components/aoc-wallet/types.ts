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
