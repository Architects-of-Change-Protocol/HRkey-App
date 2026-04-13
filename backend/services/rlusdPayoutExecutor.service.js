import { executeSinpeMobileManualPayout } from './payoutAdapters/sinpeMobileManual.adapter.js';

const DEFAULT_PROVIDER_BY_RAIL = {
  sinpe_mobile: 'manual_sinpe_cr'
};

function resolveRail(withdrawalRequest, options = {}) {
  return String(options.payoutRail || withdrawalRequest.payout_rail || withdrawalRequest.destination_type || '').trim().toLowerCase();
}

function resolveProvider(withdrawalRequest, options = {}, rail) {
  const explicit = String(options.payoutProvider || withdrawalRequest.payout_provider || '').trim().toLowerCase();
  return explicit || DEFAULT_PROVIDER_BY_RAIL[rail] || null;
}

/**
 * Generalized payout seam.
 * Extension point for future rails/providers:
 * - wallet_transfer
 * - bank_transfer
 * - global_fiat_provider
 */
export async function executeWithdrawalPayout(withdrawalRequest, options = {}) {
  const payoutRail = resolveRail(withdrawalRequest, options);
  const payoutProvider = resolveProvider(withdrawalRequest, options, payoutRail);

  if (payoutRail === 'sinpe_mobile' && payoutProvider === 'manual_sinpe_cr') {
    return executeSinpeMobileManualPayout(withdrawalRequest);
  }

  const error = new Error(`Unsupported payout route: ${payoutRail || 'unknown'}:${payoutProvider || 'unknown'}`);
  error.status = 422;
  error.code = 'UNSUPPORTED_PAYOUT_ROUTE';
  throw error;
}

export default {
  executeWithdrawalPayout
};
