import crypto from 'node:crypto';
import { canonicalizeForHash, hashCanonicalPayload } from '../utils/canonicalPayload.js';

const DEFAULT_MAX_SKEW_SECONDS = Number(process.env.PAYOUT_CALLBACK_MAX_SKEW_SECONDS || 300);

const PROVIDER_CONFIG = {
  manual_sinpe_cr: {
    requiresSignature: false,
    secretEnvKey: null
  },
  mock_global_fiat: {
    requiresSignature: true,
    secretEnvKey: 'PAYOUT_CALLBACK_SECRET_MOCK_GLOBAL_FIAT'
  }
};

function normalizeProvider(provider) {
  return String(provider || '').trim().toLowerCase();
}

function safeEqualHex(left, right) {
  const a = Buffer.from(String(left || ''), 'hex');
  const b = Buffer.from(String(right || ''), 'hex');
  if (a.length === 0 || b.length === 0 || a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export function buildPayoutCallbackSignature({ provider, timestamp, eventId, payload, secret }) {
  const canonicalBody = canonicalizeForHash(payload || {});
  const message = `${provider}.${timestamp}.${eventId}.${canonicalBody}`;
  return crypto.createHmac('sha256', secret).update(message).digest('hex');
}

export function resolvePayoutProviderConfig(provider) {
  const normalizedProvider = normalizeProvider(provider);
  const config = PROVIDER_CONFIG[normalizedProvider] || null;

  if (!config) {
    const error = new Error(`Unknown payout provider: ${normalizedProvider || 'unknown'}`);
    error.status = 400;
    error.code = 'UNKNOWN_PAYOUT_PROVIDER';
    throw error;
  }

  return { normalizedProvider, ...config };
}

export function validatePayoutCallbackAuth({ headers, body }) {
  const provider = normalizeProvider(headers['x-payout-provider']);
  const signature = String(headers['x-payout-signature'] || '').trim().toLowerCase();
  const eventId = String(headers['x-payout-event-id'] || '').trim();
  const timestampRaw = String(headers['x-payout-timestamp'] || '').trim();
  const timestamp = Number(timestampRaw);

  const providerConfig = resolvePayoutProviderConfig(provider);

  if (!eventId) {
    const error = new Error('Missing x-payout-event-id header');
    error.status = 400;
    error.code = 'PAYOUT_EVENT_ID_REQUIRED';
    throw error;
  }

  if (!Number.isFinite(timestamp)) {
    const error = new Error('Invalid x-payout-timestamp header');
    error.status = 400;
    error.code = 'PAYOUT_TIMESTAMP_INVALID';
    throw error;
  }

  const nowSeconds = Math.floor(Date.now() / 1000);
  if (Math.abs(nowSeconds - timestamp) > DEFAULT_MAX_SKEW_SECONDS) {
    const error = new Error('Payout callback timestamp outside accepted window');
    error.status = 401;
    error.code = 'PAYOUT_TIMESTAMP_EXPIRED';
    throw error;
  }

  const payloadHash = hashCanonicalPayload(body || {});
  const signatureFingerprint = signature ? signature.slice(0, 16) : null;

  if (!providerConfig.requiresSignature) {
    return {
      provider,
      eventId,
      timestamp,
      payloadHash,
      signatureFingerprint,
      signatureVerified: false
    };
  }

  const secret = process.env[providerConfig.secretEnvKey] || '';
  if (!secret) {
    const error = new Error(`Callback secret is not configured for provider: ${provider}`);
    error.status = 503;
    error.code = 'PAYOUT_CALLBACK_SECRET_NOT_CONFIGURED';
    throw error;
  }

  if (!signature) {
    const error = new Error('Missing x-payout-signature header');
    error.status = 401;
    error.code = 'PAYOUT_SIGNATURE_REQUIRED';
    throw error;
  }

  const expected = buildPayoutCallbackSignature({
    provider,
    timestamp,
    eventId,
    payload: body,
    secret
  });

  if (!safeEqualHex(expected, signature)) {
    const error = new Error('Invalid payout callback signature');
    error.status = 401;
    error.code = 'PAYOUT_SIGNATURE_INVALID';
    throw error;
  }

  return {
    provider,
    eventId,
    timestamp,
    payloadHash,
    signatureFingerprint,
    signatureVerified: true
  };
}

export default {
  validatePayoutCallbackAuth,
  buildPayoutCallbackSignature,
  resolvePayoutProviderConfig
};
