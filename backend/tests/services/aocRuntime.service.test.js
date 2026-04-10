import { jest } from '@jest/globals';

process.env.NODE_ENV = 'test';

jest.unstable_mockModule('../../logger.js', () => ({
  default: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
  }
}));

const {
  authorizeAocExecution,
  resolveUsableAocCapability,
  mintAocCapability
} = await import('../../services/aocRuntime.service.js');

describe('aocRuntime.service hardening', () => {
  beforeEach(() => {
    process.env.AOC_ENFORCE = 'true';
    process.env.AOC_TEST_BYPASS = 'false';
    process.env.AOC_ALLOW_HEADER_CAPABILITY = 'false';
    delete process.env.AOC_BASE_URL;
    delete process.env.AOC_API_KEY;
  });

  test('enforce mode rejects missing capability fail-closed', async () => {
    const decision = await authorizeAocExecution({
      operation: 'read_reference',
      requestedPermissions: ['read_references'],
      subjectDid: 'did:hrkey:user:candidate-1',
      granteeDid: 'did:hrkey:user:recruiter-1',
      req: { headers: {}, referenceAccess: {} }
    });

    expect(decision).toMatchObject({
      authorized: false,
      reason_code: 'AOC_CLIENT_UNAVAILABLE'
    });
  });

  test('header capability is blocked by default', async () => {
    const resolved = await resolveUsableAocCapability({
      req: {
        headers: { 'x-aoc-capability': JSON.stringify({ capability_hash: 'cap-header' }) },
        referenceAccess: {}
      },
      subjectDid: 'did:hrkey:user:candidate-1',
      granteeDid: 'did:hrkey:user:recruiter-1',
      requestedPermissions: ['read_references']
    });

    expect(resolved).toMatchObject({
      capability: null,
      source: 'header_capability_blocked',
      validation: { reason_code: 'AOC_CAPABILITY_INVALID' }
    });
  });

  test('header capability works only with explicit flag', async () => {
    process.env.AOC_ALLOW_HEADER_CAPABILITY = 'true';
    const resolved = await resolveUsableAocCapability({
      req: {
        headers: {
          'x-aoc-capability': JSON.stringify({
            capability_hash: 'cap-header-valid',
            subject: 'did:hrkey:user:candidate-1',
            grantee: 'did:hrkey:user:recruiter-1',
            permissions: ['read_references'],
            expires_at: '2030-01-01T00:00:00.000Z'
          })
        },
        referenceAccess: {}
      },
      subjectDid: 'did:hrkey:user:candidate-1',
      granteeDid: 'did:hrkey:user:recruiter-1',
      requestedPermissions: ['read_references']
    });

    expect(resolved).toMatchObject({
      source: 'header_capability',
      validation: { isValid: true }
    });
  });

  test('mint capability no longer falls back to mock capability', async () => {
    await expect(mintAocCapability({
      consent: { type: 'reference_access' },
      requestedPermissions: ['read_references'],
      subjectDid: 'did:hrkey:user:candidate-1',
      granteeDid: 'did:hrkey:user:recruiter-1',
      resourceRef: 'candidate-1'
    })).rejects.toMatchObject({ reason_code: 'AOC_CLIENT_UNAVAILABLE' });
  });
});
