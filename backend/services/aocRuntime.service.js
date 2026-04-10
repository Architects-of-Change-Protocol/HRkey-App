import logger from '../logger.js';

const MARKET_MAKER_ID = 'hrkey';
const DEFAULT_ADAPTER = 'hrkey';
const DEFAULT_MOCK_CAPABILITY = 'mock-capability-hrkey';

let hostedRuntimeCtor = null;
let clientInstance = null;
let clientInitErrorLogged = false;

async function loadHostedRuntimeCtor() {
  if (hostedRuntimeCtor) return hostedRuntimeCtor;

  try {
    const module = await import('aoc/runtime');
    hostedRuntimeCtor = module.HostedRuntimeClient;
    return hostedRuntimeCtor;
  } catch (error) {
    if (!clientInitErrorLogged) {
      clientInitErrorLogged = true;
      logger.warn('AOC runtime module is not available; falling back to legacy authorization flow', {
        error: error.message
      });
    }
    return null;
  }
}

async function getAocClient() {
  if (clientInstance) return clientInstance;

  const baseUrl = process.env.AOC_BASE_URL;
  const apiKey = process.env.AOC_API_KEY;

  if (!baseUrl || !apiKey) {
    return null;
  }

  const HostedRuntimeClient = await loadHostedRuntimeCtor();
  if (!HostedRuntimeClient) return null;

  clientInstance = new HostedRuntimeClient({ baseUrl, apiKey });
  return clientInstance;
}


function shouldAllowTransitionalMock() {
  const enforce = process.env.AOC_ENFORCE === 'true';
  const explicit = process.env.AOC_ALLOW_MOCK_FALLBACK === 'true';
  return !enforce || explicit;
}

function normalizeScopeEntry(entry) {
  if (!entry) return null;
  if (typeof entry === 'string' && entry.trim()) {
    return { type: 'operation', ref: entry.trim() };
  }
  if (typeof entry === 'object') {
    const type = typeof entry.type === 'string' ? entry.type.trim() : '';
    const ref = typeof entry.ref === 'string' ? entry.ref.trim() : '';
    if (type && ref) return { type, ref };
  }
  return null;
}

function normalizeRequestedScope(scope = []) {
  if (!Array.isArray(scope)) return [];
  return scope.map(normalizeScopeEntry).filter(Boolean);
}

function normalizeRequestedPermissions(permissions = []) {
  if (!Array.isArray(permissions)) return [];
  return permissions.filter((item) => typeof item === 'string' && item.trim().length > 0);
}

function extractCapabilityHash(capability) {
  if (!capability || typeof capability !== 'object') return null;
  return capability.capability_hash || capability.hash || capability.id || null;
}

function extractConsentHash(capability) {
  if (!capability || typeof capability !== 'object') return null;
  return capability.parent_consent_hash || capability.consent_hash || capability.consentId || null;
}

export async function mintAocCapability({
  consent,
  requestedScope = [],
  requestedPermissions = [],
  issuedAt = null,
  expiresAt = null,
  subjectDid,
  granteeDid,
  resourceType = 'candidate',
  resourceRef,
  req = null
}) {
  const shouldEnforce = process.env.AOC_ENFORCE === 'true';
  const normalizedScope = normalizeRequestedScope(requestedScope);
  const normalizedPermissions = normalizeRequestedPermissions(requestedPermissions);
  const decisionLogBase = {
    requestId: req?.requestId,
    subjectDid,
    granteeDid,
    resourceRef,
    requestedScope: normalizedScope,
    requestedPermissions: normalizedPermissions
  };

  logger.info('AOC capability mint intent', decisionLogBase);

  const client = await getAocClient();
  if (!client) {
    if (shouldAllowTransitionalMock()) {
      const fallbackCapability = process.env.AOC_MOCK_CAPABILITY || DEFAULT_MOCK_CAPABILITY;
      logger.warn('AOC capability mint fallback (client unavailable)', {
        ...decisionLogBase,
        reason_code: 'AOC_CLIENT_UNAVAILABLE'
      });
      return {
        capability: fallbackCapability,
        capability_hash: fallbackCapability,
        parent_consent_hash: null,
        expires_at: expiresAt || null,
        isMock: true,
        source: 'transitional_fallback'
      };
    }

    const error = new Error('AOC capability mint failed: runtime client unavailable');
    error.status = shouldEnforce ? 503 : 403;
    error.reason_code = 'AOC_CLIENT_UNAVAILABLE';
    throw error;
  }

  const payload = {
    consent,
    requested_scope: normalizedScope,
    requested_permissions: normalizedPermissions,
    issued_at: issuedAt || new Date().toISOString(),
    expires_at: expiresAt || null,
    marketMakerId: MARKET_MAKER_ID,
    subject: subjectDid,
    grantee: granteeDid,
    resource: {
      type: resourceType,
      ref: resourceRef
    }
  };

  try {
    const minted = await client.mintCapability(payload);
    const capabilityHash = extractCapabilityHash(minted);
    const parentConsentHash = extractConsentHash(minted);

    logger.info('AOC capability mint success', {
      ...decisionLogBase,
      capability_hash: capabilityHash,
      parent_consent_hash: parentConsentHash
    });

    return {
      capability: minted,
      capability_hash: capabilityHash,
      parent_consent_hash: parentConsentHash,
      expires_at: minted?.expires_at || payload.expires_at || null,
      isMock: false,
      source: 'runtime'
    };
  } catch (error) {
    logger.error('AOC capability mint failed', {
      ...decisionLogBase,
      error: error.message
    });

    if (shouldAllowTransitionalMock()) {
      const fallbackCapability = process.env.AOC_MOCK_CAPABILITY || DEFAULT_MOCK_CAPABILITY;
      return {
        capability: fallbackCapability,
        capability_hash: fallbackCapability,
        parent_consent_hash: null,
        expires_at: expiresAt || null,
        isMock: true,
        source: 'transitional_fallback'
      };
    }

    const mintError = new Error(`AOC capability mint failed: ${error.message}`);
    mintError.status = shouldEnforce ? 403 : 500;
    mintError.reason_code = 'AOC_MINT_FAILED';
    throw mintError;
  }
}

function resolveAocCapabilityForRequest({ capability, req = null }) {
  const storedCapability = req?.referenceAccess?.resolvedCapability || req?.referenceAccess?.grant?.aoc_capability || null;
  const tokenCapability = capability || req?.headers?.['x-aoc-capability'] || null;

  if (storedCapability) {
    return { value: storedCapability, source: 'stored_capability' };
  }

  if (tokenCapability) {
    return { value: tokenCapability, source: 'token_or_request_capability' };
  }

  if (shouldAllowTransitionalMock()) {
    return {
      value: process.env.AOC_MOCK_CAPABILITY || DEFAULT_MOCK_CAPABILITY,
      source: 'mock_fallback'
    };
  }

  return { value: null, source: 'missing' };
}

export const HrkOperations = Object.freeze({
  READ_CANDIDATE_DATA: 'read_candidate_data',
  WRITE_REFERENCE: 'write_reference',
  READ_REFERENCE: 'read_reference',
  GENERATE_INSIGHT: 'generate_insight',
  SHARE_PROFILE: 'share_profile'
});

export function mapLegacyActionToOperation(action) {
  const normalized = String(action || '').trim();

  switch (normalized) {
    case 'read_references':
    case 'read_reference_pack':
      return HrkOperations.READ_REFERENCE;
    case 'generate_insight':
      return HrkOperations.GENERATE_INSIGHT;
    case 'share_profile':
      return HrkOperations.SHARE_PROFILE;
    case 'write_reference':
      return HrkOperations.WRITE_REFERENCE;
    default:
      return HrkOperations.READ_CANDIDATE_DATA;
  }
}

export async function authorizeAocExecution({
  operation,
  capability = null,
  requestedScope = [],
  requestedPermissions = [],
  subjectDid,
  granteeDid,
  resourceType = 'content',
  resourceRef,
  req = null
}) {
  const resolvedOperation = operation || HrkOperations.READ_CANDIDATE_DATA;
  const shouldEnforce = process.env.AOC_ENFORCE === 'true';

  const decisionLogBase = {
    requestId: req?.requestId,
    operation: resolvedOperation,
    subjectDid,
    granteeDid,
    resourceRef,
    requestedScope,
    requestedPermissions
  };

  logger.info('AOC authorization intent', decisionLogBase);

  if ((process.env.NODE_ENV === 'test' || process.env.JEST_WORKER_ID) && process.env.AOC_TEST_BYPASS !== 'false') {
    const bypassDecision = { authorized: true, reason_code: 'AOC_TEST_BYPASS' };
    logger.info('AOC authorization decision', {
      ...decisionLogBase,
      authorized: true,
      reason_code: bypassDecision.reason_code
    });
    return bypassDecision;
  }

  const client = await getAocClient();
  if (!client) {
    const fallbackDecision = {
      authorized: !shouldEnforce,
      reason_code: shouldEnforce ? 'AOC_CLIENT_UNAVAILABLE' : 'AOC_LEGACY_FALLBACK'
    };

    logger.info('AOC authorization decision', {
      ...decisionLogBase,
      authorized: fallbackDecision.authorized,
      reason_code: fallbackDecision.reason_code
    });

    return fallbackDecision;
  }

  const resolvedCapability = resolveAocCapabilityForRequest({ capability, req });
  const effectiveCapability = resolvedCapability.value;

  if (!effectiveCapability) {
    const missingCapDecision = {
      authorized: false,
      reason_code: 'CAPABILITY_MISSING'
    };

    logger.info('AOC authorization decision', {
      ...decisionLogBase,
      authorized: false,
      reason_code: missingCapDecision.reason_code,
      capability_source: resolvedCapability.source
    });

    return missingCapDecision;
  }

  const payload = {
    capability: effectiveCapability,
    requested_scope: normalizeRequestedScope(requestedScope),
    requested_permissions: normalizeRequestedPermissions(requestedPermissions),
    subject: subjectDid,
    grantee: granteeDid,
    marketMakerId: MARKET_MAKER_ID,
    execution_target: {
      adapter: DEFAULT_ADAPTER,
      operation: resolvedOperation
    },
    resource: {
      type: resourceType,
      ref: resourceRef
    }
  };

  try {
    const result = await client.authorizeExecution(payload);

    logger.info('AOC authorization decision', {
      ...decisionLogBase,
      authorized: Boolean(result?.authorized),
      reason_code: result?.reason_code || null,
      capability_source: resolvedCapability.source
    });

    return {
      authorized: Boolean(result?.authorized),
      reason_code: result?.reason_code || null,
      raw: result || null,
      capability_source: resolvedCapability.source
    };
  } catch (error) {
    logger.error('AOC authorizeExecution failed', {
      ...decisionLogBase,
      error: error.message
    });

    return {
      authorized: false,
      reason_code: 'AOC_RUNTIME_ERROR'
    };
  }
}
