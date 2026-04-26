export type MarketplaceTransaction = {
  id: string;
  referenceId: string;
  referee: string;
  role: string;
  company: string;
  amountCredits: number;
  refereePayoutCredits: number;
  hrkeyRevenueCredits: number;
  createdAt: string;
};

export type MarketplaceLedger = {
  walletCredits: number;
  watchlist: string[];
  purchasedIds: string[];
  transactions: MarketplaceTransaction[];
};

export const DEFAULT_COMPANY_LEDGER: MarketplaceLedger = {
  walletCredits: 210,
  watchlist: [],
  purchasedIds: [],
  transactions: [],
};

export const COMPANY_LEDGER_STORAGE_KEY = "hrkey_v2_company_marketplace_ledger";

export function loadCompanyLedger(): MarketplaceLedger {
  if (typeof window === "undefined") return DEFAULT_COMPANY_LEDGER;

  const raw = window.localStorage.getItem(COMPANY_LEDGER_STORAGE_KEY);
  if (!raw) return DEFAULT_COMPANY_LEDGER;

  try {
    const parsed = JSON.parse(raw) as Partial<MarketplaceLedger>;
    return {
      walletCredits:
        typeof parsed.walletCredits === "number" ? parsed.walletCredits : DEFAULT_COMPANY_LEDGER.walletCredits,
      watchlist: Array.isArray(parsed.watchlist) ? parsed.watchlist : [],
      purchasedIds: Array.isArray(parsed.purchasedIds) ? parsed.purchasedIds : [],
      transactions: Array.isArray(parsed.transactions) ? parsed.transactions : [],
    };
  } catch {
    return DEFAULT_COMPANY_LEDGER;
  }
}

export function persistCompanyLedger(ledger: MarketplaceLedger) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(COMPANY_LEDGER_STORAGE_KEY, JSON.stringify(ledger));
}

export function buildMarketplaceTransaction(input: {
  referenceId: string;
  referee: string;
  role: string;
  company: string;
  amountCredits: number;
}): MarketplaceTransaction {
  const refereePayoutCredits = Number((input.amountCredits * 0.7).toFixed(2));
  const hrkeyRevenueCredits = Number((input.amountCredits * 0.3).toFixed(2));

  return {
    id: `txn-${input.referenceId}-${Date.now()}`,
    referenceId: input.referenceId,
    referee: input.referee,
    role: input.role,
    company: input.company,
    amountCredits: input.amountCredits,
    refereePayoutCredits,
    hrkeyRevenueCredits,
    createdAt: new Date().toISOString(),
  };
}
