import logger from '../logger.js';

const MARKET_MAKER_ID = 'hrkey';
const DEFAULT_ADAPTER = 'hrkey';

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

  const baseUrl = process.env.AOC_RUNTIME_BASE_URL || process.env.AOC_BASE_URL;
  const apiKey = process.env.AOC_RUNTIME_API_KEY || process.env.AOC_API_KEY;
  const runtimeMode = String(process.env.AOC_RUNTIME_MODE || '').toLowerCase();
  const useRemoteRuntime = String(process.env.USE_AOC_TRUST_RUNTIME || '').toLowerCase() === 'true';

  if (useRemoteRuntime && runtimeMode !== 'remote') {
    return null;
  }

  if (!baseUrl || !apiKey) {
    return null;
  }

  const HostedRuntimeClient = await loadHostedRuntimeCtor();
  if (!HostedRuntimeClient) return null;

  clientInstance = new HostedRuntimeClient({ baseUrl, apiKey });
  return clientInstance;
}

function isTruthyEnv(value) {
  return String(value || '').toLowerCase() === 'true';
}

function shouldAllowHeaderCapability() {
  return isTruthyEnv(process.env.AOC_ALLOW_HEADER_CAPABILITY);
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
    if (!shouldEnforce) {
      logger.warn('AOC capability mint skipped (client unavailable, legacy mode)', {
        ...decisionLogBase,
        reason_code: 'AOC_CLIENT_UNAVAILABLE'
      });
      return {
        capability: null,
        capability_hash: null,
        parent_consent_hash: null,
        expires_at: expiresAt || null,
        isMock: false,
        source: 'legacy_no_capability'
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

    if (!shouldEnforce) {
      return {
        capability: null,
        capability_hash: null,
        parent_consent_hash: null,
        expires_at: expiresAt || null,
        isMock: false,
        source: 'legacy_no_capability'
      };
    }

    const mintError = new Error(`AOC capability mint failed: ${error.message}`);
    mintError.status = shouldEnforce ? 403 : 500;
    mintError.reason_code = 'AOC_MINT_FAILED';
    throw mintError;
  }
}

function normalizeCapabilityPayload(capability) {
  if (!capability) return null;
  if (typeof capability === 'object') return capability;
  if (typeof capability === 'string') {
    const trimmed = capability.trim();
    if (!trimmed) return null;
    if (trimmed.startsWith('{')) {
      try {
        return JSON.parse(trimmed);
      } catch (_error) {
        return null;
      }
    }
  }
  return null;
}

function extractCapabilitySubject(capability) {
  return capability?.subject || capability?.sub || capability?.candidate_did || null;
}

function extractCapabilityGrantee(capability) {
  return capability?.grantee || capability?.aud || capability?.recruiter_did || null;
}

function extractCapabilityPermissions(capability) {
  if (Array.isArray(capability?.requested_permissions)) return capability.requested_permissions;
  if (Array.isArray(capability?.permissions)) return capability.permissions;
  return [];
}

function isIsoExpired(value) {
  if (!value) return false;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return true;
  return parsed.getTime() <= Date.now();
}

export async function validateStoredAocCapability({
  capabilityRecord = null,
  grant = null,
  subjectDid = null,
  granteeDid = null,
  requestedPermissions = [],
  req = null
}) {
  const capabilityPayload = normalizeCapabilityPayload(capabilityRecord?.capability || capabilityRecord?.aoc_capability || capabilityRecord);
  if (!capabilityPayload) {
    return { isValid: false, reason_code: 'AOC_CAPABILITY_INVALID', validation_result: 'shape_invalid' };
  }

  const capabilityHash = capabilityRecord?.capability_hash || capabilityRecord?.aoc_capability_hash || extractCapabilityHash(capabilityPayload);
  if (!capabilityHash) {
    return { isValid: false, reason_code: 'AOC_CAPABILITY_INVALID', validation_result: 'capability_hash_missing' };
  }

  const parentConsentHash = capabilityRecord?.parent_consent_hash || capabilityRecord?.aoc_parent_consent_hash || extractConsentHash(capabilityPayload) || null;
  if (parentConsentHash !== null && typeof parentConsentHash !== 'string') {
    return { isValid: false, reason_code: 'AOC_CAPABILITY_INVALID', validation_result: 'parent_consent_hash_invalid' };
  }

  const expiresAt = capabilityRecord?.expires_at || capabilityRecord?.aoc_expires_at || capabilityPayload?.expires_at || null;
  if (isIsoExpired(expiresAt)) {
    return { isValid: false, reason_code: 'AOC_CAPABILITY_EXPIRED', validation_result: 'expired' };
  }

  if (subjectDid && extractCapabilitySubject(capabilityPayload) && extractCapabilitySubject(capabilityPayload) !== subjectDid) {
    return { isValid: false, reason_code: 'AOC_CAPABILITY_INVALID', validation_result: 'subject_mismatch' };
  }

  if (granteeDid && extractCapabilityGrantee(capabilityPayload) && extractCapabilityGrantee(capabilityPayload) !== granteeDid) {
    return { isValid: false, reason_code: 'AOC_CAPABILITY_INVALID', validation_result: 'grantee_mismatch' };
  }

  if (grant?.candidate_user_id && extractCapabilitySubject(capabilityPayload)) {
    const expectedSubjectDid = `did:hrkey:user:${grant.candidate_user_id}`;
    if (extractCapabilitySubject(capabilityPayload) !== expectedSubjectDid) {
      return { isValid: false, reason_code: 'AOC_CAPABILITY_INVALID', validation_result: 'grant_subject_mismatch' };
    }
  }

  if (grant?.recruiter_user_id && extractCapabilityGrantee(capabilityPayload)) {
    const expectedGranteeDid = `did:hrkey:user:${grant.recruiter_user_id}`;
    if (extractCapabilityGrantee(capabilityPayload) !== expectedGranteeDid) {
      return { isValid: false, reason_code: 'AOC_CAPABILITY_INVALID', validation_result: 'grant_grantee_mismatch' };
    }
  }

  const capabilityPermissions = extractCapabilityPermissions(capabilityPayload);
  if (Array.isArray(requestedPermissions) && requestedPermissions.length > 0) {
    const hasAllRequested = requestedPermissions.every((permission) => capabilityPermissions.includes(permission));
    if (!hasAllRequested) {
      return { isValid: false, reason_code: 'AOC_CAPABILITY_INVALID', validation_result: 'permissions_mismatch' };
    }
  }

  const client = await getAocClient();
  if (client && typeof client.verifyCapability === 'function') {
    try {
      const verifyResult = await client.verifyCapability({
        capability: capabilityPayload,
        subject: subjectDid || null,
        grantee: granteeDid || null,
        marketMakerId: MARKET_MAKER_ID
      });
      if (verifyResult?.valid === false) {
        return { isValid: false, reason_code: 'AOC_CAPABILITY_INVALID', validation_result: 'runtime_verify_failed' };
      }
    } catch (error) {
      logger.warn('AOC capability verification call failed', {
        requestId: req?.requestId,
        error: error.message,
        capability_hash: capabilityHash
      });
      return { isValid: false, reason_code: 'AOC_CAPABILITY_INVALID', validation_result: 'runtime_verify_error' };
    }
  }

  return {
    isValid: true,
    reason_code: null,
    validation_result: 'valid',
    capability: capabilityPayload,
    capability_hash: capabilityHash,
    parent_consent_hash: parentConsentHash,
    expires_at: expiresAt
  };
}

export async function resolveUsableAocCapability({
  req = null,
  inlineCapability = null,
  grant = null,
  subjectDid = null,
  granteeDid = null,
  requestedPermissions = []
}) {
  const storedCapabilityRecord = req?.referenceAccess?.resolvedCapability
    || req?.referenceAccess?.grant
    || grant
    || null;
  if (storedCapabilityRecord?.aoc_capability || storedCapabilityRecord?.capability) {
    const validatedStored = await validateStoredAocCapability({
      capabilityRecord: storedCapabilityRecord,
      grant: req?.referenceAccess?.grant || grant || null,
      subjectDid,
      granteeDid,
      requestedPermissions,
      req
    });
    if (validatedStored.isValid) {
      return { capability: validatedStored.capability, source: 'stored_capability', validation: validatedStored };
    }
  }

  if (inlineCapability) {
    const validatedInline = await validateStoredAocCapability({
      capabilityRecord: inlineCapability,
      grant: req?.referenceAccess?.grant || grant || null,
      subjectDid,
      granteeDid,
      requestedPermissions,
      req
    });
    if (validatedInline.isValid) {
      return { capability: validatedInline.capability, source: 'token_derived_capability', validation: validatedInline };
    }
    return { capability: null, source: 'token_derived_capability', validation: validatedInline };
  }

  const headerCapability = req?.headers?.['x-aoc-capability'] || null;
  if (headerCapability && shouldAllowHeaderCapability()) {
    const validatedHeader = await validateStoredAocCapability({
      capabilityRecord: headerCapability,
      grant: req?.referenceAccess?.grant || grant || null,
      subjectDid,
      granteeDid,
      requestedPermissions,
      req
    });
    if (validatedHeader.isValid) {
      return { capability: validatedHeader.capability, source: 'header_capability', validation: validatedHeader };
    }
    return { capability: null, source: 'header_capability', validation: validatedHeader };
  }

  if (headerCapability && !shouldAllowHeaderCapability()) {
    return {
      capability: null,
      source: 'header_capability_blocked',
      validation: { isValid: false, reason_code: 'AOC_CAPABILITY_INVALID', validation_result: 'header_capability_disabled' }
    };
  }

  return {
    capability: null,
    source: 'missing',
    validation: { isValid: false, reason_code: 'AOC_CAPABILITY_MISSING', validation_result: 'missing' }
  };
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
  req = null,
  capabilitySource = null
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

  const resolvedCapability = await resolveUsableAocCapability({
    req,
    inlineCapability: capability,
    subjectDid,
    granteeDid,
    requestedPermissions
  });
  const effectiveCapability = resolvedCapability.capability;
  const capabilitySourceLabel = capabilitySource || resolvedCapability.source;

  if (!effectiveCapability) {
    const reasonCode = resolvedCapability?.validation?.reason_code || 'AOC_CAPABILITY_MISSING';
    const missingCapDecision = {
      authorized: false,
      reason_code: reasonCode,
      capability_source: capabilitySourceLabel
    };

    logger.info('AOC authorization decision', {
      ...decisionLogBase,
      authorized: false,
      reason_code: missingCapDecision.reason_code,
      capability_source: capabilitySourceLabel,
      capability_validation_result: resolvedCapability?.validation?.validation_result || 'missing'
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
      capability_source: capabilitySourceLabel,
      capability_validation_result: resolvedCapability?.validation?.validation_result || 'valid',
      capability_hash: resolvedCapability?.validation?.capability_hash || null
    });

    return {
      authorized: Boolean(result?.authorized),
      reason_code: result?.reason_code || null,
      raw: result || null,
      capability_source: capabilitySourceLabel
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
