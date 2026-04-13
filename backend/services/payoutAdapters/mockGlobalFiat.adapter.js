function nowIso() {
  return new Date().toISOString();
}

function buildReference(withdrawalRequestId) {
  return `mock-global-${withdrawalRequestId}-${Date.now()}`;
}

function buildExternalId(withdrawalRequestId) {
  return `mgf-${withdrawalRequestId}-${Date.now()}`;
}

export async function executeMockGlobalFiatPayout(withdrawalRequest) {
  return {
    ok: true,
    rail: 'bank',
    provider: 'mock_global_fiat',
    status: 'provider_pending',
    statusDetail: 'awaiting_provider_webhook',
    reference: buildReference(withdrawalRequest.id),
    externalId: buildExternalId(withdrawalRequest.id),
    processedAt: nowIso(),
    destinationSnapshot: {
      type: withdrawalRequest.destination_type || 'bank',
      value: withdrawalRequest.destination_ref || null
    },
    callbackPreview: {
      endpoint: '/api/internal/rlusd/withdrawals/provider-callback',
      expectedStatuses: ['completed', 'failed']
    }
  };
}

export default {
  executeMockGlobalFiatPayout
};
