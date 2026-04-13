function nowIso() {
  return new Date().toISOString();
}

function buildInternalReference(withdrawalRequestId) {
  return `sinpe-manual-${withdrawalRequestId}-${Date.now()}`;
}

export async function executeSinpeMobileManualPayout(withdrawalRequest) {
  const destination = String(withdrawalRequest?.destination_ref || '').trim();

  if (!/^\+506[2678]\d{7}$/.test(destination)) {
    const error = new Error('SINPE destination must be normalized before payout execution');
    error.status = 422;
    error.code = 'INVALID_PAYOUT_DESTINATION';
    throw error;
  }

  return {
    ok: true,
    status: 'pending_manual_execution',
    provider: 'manual_sinpe_cr',
    rail: 'sinpe_mobile',
    reference: buildInternalReference(withdrawalRequest.id),
    externalId: null,
    statusDetail: 'requires_operator_action',
    processedAt: nowIso(),
    completedAt: null,
    failedAt: null,
    destinationSnapshot: {
      type: 'sinpe_mobile',
      value: destination
    }
  };
}

export default {
  executeSinpeMobileManualPayout
};
