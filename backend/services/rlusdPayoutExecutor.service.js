/**
 * Payout executor seam.
 * In PR-16 this adapter is where external rails will be integrated:
 * - bank rails
 * - SINPE rails
 * - wallet transfer rails
 * - webhook / reconciliation callbacks
 */
export async function executeWithdrawalPayout(withdrawalRequest) {
  return {
    ok: true,
    provider: 'internal_mock',
    externalReference: `mock-${withdrawalRequest.id}`
  };
}

export default {
  executeWithdrawalPayout
};
