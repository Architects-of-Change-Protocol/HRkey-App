import logger from '../logger.js';

const REMOTE_MODE = 'remote';

function isEnabled() {
  const enabled = String(process.env.USE_AOC_TRUST_RUNTIME || '').toLowerCase() === 'true';
  const mode = String(process.env.AOC_RUNTIME_MODE || '').toLowerCase();
  return enabled && mode === REMOTE_MODE;
}

function getConfig() {
  return {
    baseUrl: String(process.env.AOC_RUNTIME_BASE_URL || '').trim().replace(/\/$/, ''),
    apiKey: String(process.env.AOC_RUNTIME_API_KEY || '').trim(),
    mode: String(process.env.AOC_RUNTIME_MODE || '').trim().toLowerCase()
  };
}

function mapProtocolError(operation, status, payload = {}) {
  const reasonCode = payload?.reason_code || payload?.code || 'AOC_RUNTIME_ERROR';
  const message = payload?.message || payload?.error || `AOC runtime ${operation} failed`;
  const error = new Error(message);
  error.status = Number(status) || 502;
  error.code = reasonCode;
  error.reason_code = reasonCode;
  error.details = payload?.details || null;
  return error;
}

async function callAocRuntime(operation, payload, req = null) {
  const cfg = getConfig();

  if (!isEnabled()) {
    return { skipped: true, reason: 'disabled' };
  }

  if (!cfg.baseUrl || !cfg.apiKey) {
    const error = new Error('AOC runtime remote mode is enabled but missing base URL or API key');
    error.status = 503;
    error.code = 'AOC_RUNTIME_CONFIG_MISSING';
    throw error;
  }

  const endpoint = `${cfg.baseUrl}/${operation}`;
  const requestId = req?.requestId || null;
  logger.info('AOC runtime request', {
    requestId,
    operation,
    endpoint,
    mode: cfg.mode
  });

  let response;
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${cfg.apiKey}`,
        'x-market-maker-id': 'hrkey'
      },
      body: JSON.stringify(payload || {})
    });
  } catch (networkError) {
    const error = new Error(`AOC runtime network failure (${operation}): ${networkError.message}`);
    error.status = 503;
    error.code = 'AOC_RUNTIME_UNREACHABLE';
    throw error;
  }

  let body = null;
  try {
    body = await response.json();
  } catch (_parseError) {
    body = null;
  }

  if (!response.ok) {
    const mapped = mapProtocolError(operation, response.status, body || {});
    logger.warn('AOC runtime protocol error', {
      requestId,
      operation,
      status: response.status,
      reason_code: mapped.reason_code
    });
    throw mapped;
  }

  logger.info('AOC runtime response success', {
    requestId,
    operation,
    status: response.status
  });

  return body || {};
}

export async function registerCredential(payload, req = null) {
  return callAocRuntime('registerCredential', payload, req);
}

export async function verifyIdentity(payload, req = null) {
  return callAocRuntime('verifyIdentity', payload, req);
}

export async function grantIdentityConsent(payload, req = null) {
  return callAocRuntime('grantIdentityConsent', payload, req);
}

export async function executePayout(payload, req = null) {
  return callAocRuntime('executePayout', payload, req);
}

export default {
  registerCredential,
  verifyIdentity,
  grantIdentityConsent,
  executePayout
};
