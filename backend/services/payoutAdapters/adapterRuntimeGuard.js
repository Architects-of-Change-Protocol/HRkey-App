export function isProductionRuntime() {
  return String(process.env.NODE_ENV || '').trim().toLowerCase() === 'production';
}

function nonProdAdaptersExplicitlyAllowed() {
  return String(process.env.PAYOUT_ALLOW_NON_PROD_ADAPTERS || 'false').trim().toLowerCase() === 'true';
}

export function assertAdapterAllowedInCurrentEnv(adapterMeta = {}) {
  const envClass = String(adapterMeta.environmentClass || 'production').toLowerCase();
  const adapterName = adapterMeta.name || 'unknown_adapter';

  if (envClass === 'production') return;

  if (isProductionRuntime()) {
    const error = new Error(`Adapter not allowed in production runtime: ${adapterName}`);
    error.status = 422;
    error.code = 'PAYOUT_ADAPTER_ENV_BLOCKED';
    throw error;
  }

  if (!nonProdAdaptersExplicitlyAllowed()) {
    const error = new Error(`Adapter requires explicit opt-in: ${adapterName}`);
    error.status = 422;
    error.code = 'PAYOUT_ADAPTER_NOT_EXPLICITLY_ENABLED';
    throw error;
  }
}

export default {
  isProductionRuntime,
  assertAdapterAllowedInCurrentEnv
};
