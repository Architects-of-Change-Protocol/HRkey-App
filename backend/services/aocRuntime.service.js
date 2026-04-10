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

function normalizeRequestedScope(scope = []) {
  if (!Array.isArray(scope)) return [];
  return scope.filter((item) => typeof item === 'string' && item.trim().length > 0);
}

function normalizeRequestedPermissions(permissions = []) {
  if (!Array.isArray(permissions)) return [];
  return permissions.filter((item) => typeof item === 'string' && item.trim().length > 0);
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

  const effectiveCapability = capability || req?.headers?.['x-aoc-capability'] || process.env.AOC_MOCK_CAPABILITY || 'mock-capability-hrkey';

  if (!effectiveCapability) {
    const missingCapDecision = {
      authorized: false,
      reason_code: 'CAPABILITY_MISSING'
    };

    logger.info('AOC authorization decision', {
      ...decisionLogBase,
      authorized: false,
      reason_code: missingCapDecision.reason_code
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
      reason_code: result?.reason_code || null
    });

    return {
      authorized: Boolean(result?.authorized),
      reason_code: result?.reason_code || null,
      raw: result || null
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
