import { jest } from '@jest/globals';

const verifyIdentityRuntimeMock = jest.fn();
const registerCredentialMock = jest.fn();
const logIdentityVerificationMock = jest.fn();

const updateSingleMock = jest.fn();
const selectSingleMock = jest.fn();

const fromMock = jest.fn();

function configureSupabaseFromMock() {
  fromMock.mockImplementation((table) => {
    if (table !== 'users') {
      throw new Error(`Unexpected table ${table}`);
    }

    return {
      select: () => ({
        eq: () => ({
          single: selectSingleMock
        })
      }),
      update: () => ({
        eq: () => ({
          select: () => ({
            single: updateSingleMock
          })
        })
      })
    };
  });
}

jest.unstable_mockModule('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => ({
    from: fromMock
  }))
}));

jest.unstable_mockModule('../services/aocRuntimeClient.js', () => ({
  verifyIdentity: verifyIdentityRuntimeMock,
  registerCredential: registerCredentialMock
}));

jest.unstable_mockModule('../utils/auditLogger.js', () => ({
  logIdentityVerification: logIdentityVerificationMock
}));

jest.unstable_mockModule('../logger.js', () => ({
  default: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    withRequest: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() })
  }
}));

const { verifyIdentity } = await import('../../controllers/identityController.js');

function makeRes() {
  const res = {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    }
  };
  return res;
}

describe('identityController verifyIdentity with AOC runtime', () => {
  beforeEach(() => {
    verifyIdentityRuntimeMock.mockReset();
    registerCredentialMock.mockReset();
    logIdentityVerificationMock.mockReset();
    selectSingleMock.mockReset();
    updateSingleMock.mockReset();
    fromMock.mockReset();
    configureSupabaseFromMock();
  });

  test('delegates trust verification to AOC runtime before local persistence', async () => {
    verifyIdentityRuntimeMock.mockResolvedValue({ verified: true, verificationId: 'aoc-v-1' });
    registerCredentialMock.mockResolvedValue({ credentialId: 'cred-1' });
    selectSingleMock.mockResolvedValue({ data: { id: 'u-1', email: 'u1@test.dev', identity_verified: false }, error: null });
    updateSingleMock.mockResolvedValue({ data: { id: 'u-1', email: 'u1@test.dev', identity_verified: true, kyc_verified_at: '2026-01-01T00:00:00.000Z' }, error: null });

    const req = {
      body: { fullName: 'User One', idNumber: '123456789' },
      user: { id: 'u-1' },
      requestId: 'req-1'
    };
    const res = makeRes();

    await verifyIdentity(req, res);

    expect(res.statusCode).toBe(200);
    expect(verifyIdentityRuntimeMock).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'u-1',
      fullName: 'User One'
    }), req);
    expect(registerCredentialMock).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'u-1',
      credentialType: 'identity_verification'
    }), req);
    expect(logIdentityVerificationMock).toHaveBeenCalled();
  });

  test('returns mapped error when AOC runtime verification fails', async () => {
    const runtimeError = new Error('policy denied');
    runtimeError.status = 422;
    runtimeError.code = 'AOC_POLICY_DENY';
    runtimeError.reason_code = 'AOC_POLICY_DENY';
    verifyIdentityRuntimeMock.mockRejectedValue(runtimeError);

    selectSingleMock.mockResolvedValue({ data: { id: 'u-2', email: 'u2@test.dev', identity_verified: false }, error: null });

    const req = {
      body: { fullName: 'User Two', idNumber: '987654321' },
      user: { id: 'u-2' },
      requestId: 'req-2'
    };
    const res = makeRes();

    await verifyIdentity(req, res);

    expect(res.statusCode).toBe(422);
    expect(res.body).toMatchObject({
      error: 'AOC_POLICY_DENY',
      reason_code: 'AOC_POLICY_DENY'
    });
    expect(updateSingleMock).not.toHaveBeenCalled();
  });
});
