function normalizeOptional(value) {
  if (value === undefined || value === null) return null;
  const normalized = String(value).trim();
  return normalized || null;
}

export function normalizePayoutExecutionResult(rawResult, fallback = {}) {
  return {
    ok: Boolean(rawResult?.ok ?? true),
    rail: normalizeOptional(rawResult?.rail) || normalizeOptional(fallback.payoutRail),
    provider: normalizeOptional(rawResult?.provider) || normalizeOptional(fallback.payoutProvider),
    status: normalizeOptional(rawResult?.status) || 'processing',
    statusDetail: normalizeOptional(rawResult?.statusDetail),
    reference: normalizeOptional(rawResult?.reference),
    externalId: normalizeOptional(rawResult?.externalId),
    processedAt: rawResult?.processedAt || new Date().toISOString(),
    destinationSnapshot: rawResult?.destinationSnapshot || null,
    callbackPreview: rawResult?.callbackPreview || null
  };
}

export default {
  normalizePayoutExecutionResult
};
