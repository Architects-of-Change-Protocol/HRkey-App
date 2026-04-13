import { assertAdapterAllowedInCurrentEnv } from './payoutAdapters/adapterRuntimeGuard.js';
import { executeMockGlobalFiatPayout } from './payoutAdapters/mockGlobalFiat.adapter.js';
import { normalizePayoutExecutionResult } from './payoutAdapters/normalizePayoutResponse.js';
import { executeSinpeMobileManualPayout } from './payoutAdapters/sinpeMobileManual.adapter.js';

const DEFAULT_PROVIDER_BY_RAIL = {
  sinpe_mobile: 'manual_sinpe_cr'
};

const PAYOUT_ADAPTERS = {
  'sinpe_mobile:manual_sinpe_cr': {
    execute: executeSinpeMobileManualPayout,
    meta: {
      name: 'sinpe_manual_cr',
      provider: 'manual_sinpe_cr',
      rail: 'sinpe_mobile',
      environmentClass: 'production'
    }
  },
  'bank:mock_global_fiat': {
    execute: executeMockGlobalFiatPayout,
    meta: {
      name: 'mock_global_fiat',
      provider: 'mock_global_fiat',
      rail: 'bank',
      environmentClass: 'mock'
    }
  }
};

function resolveRail(withdrawalRequest, options = {}) {
  const rail = String(options.payoutRail || withdrawalRequest.payout_rail || withdrawalRequest.destination_type || '').trim().toLowerCase();
  return rail === 'sinpe' ? 'sinpe_mobile' : rail;
}

function resolveProvider(withdrawalRequest, options = {}, rail) {
  const explicit = String(options.payoutProvider || withdrawalRequest.payout_provider || '').trim().toLowerCase();
  return explicit || DEFAULT_PROVIDER_BY_RAIL[rail] || null;
}

export function resolvePayoutAdapter(withdrawalRequest, options = {}) {
  const payoutRail = resolveRail(withdrawalRequest, options);
  const payoutProvider = resolveProvider(withdrawalRequest, options, payoutRail);
  const resolved = PAYOUT_ADAPTERS[`${payoutRail}:${payoutProvider}`] || null;

  return { payoutRail, payoutProvider, adapter: resolved?.execute || null, adapterMeta: resolved?.meta || null };
}

export async function executeWithdrawalPayout(withdrawalRequest, options = {}) {
  const resolved = resolvePayoutAdapter(withdrawalRequest, options);

  if (!resolved.adapter) {
    const error = new Error(`Unsupported payout route: ${resolved.payoutRail || 'unknown'}:${resolved.payoutProvider || 'unknown'}`);
    error.status = 422;
    error.code = 'UNSUPPORTED_PAYOUT_ROUTE';
    throw error;
  }

  assertAdapterAllowedInCurrentEnv(resolved.adapterMeta);

  const rawResult = await resolved.adapter(withdrawalRequest, options);
  return normalizePayoutExecutionResult(rawResult, resolved);
}

export default {
  executeWithdrawalPayout,
  resolvePayoutAdapter
};
