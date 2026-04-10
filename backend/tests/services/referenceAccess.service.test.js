import { jest } from '@jest/globals';

process.env.SUPABASE_URL = 'https://test.supabase.co';
process.env.SUPABASE_SERVICE_KEY = 'test-service-key';
process.env.NODE_ENV = 'test';

const fromMock = jest.fn();
const mockSupabaseClient = { from: fromMock };
const recordAccessDecisionMock = jest.fn().mockResolvedValue({ success: true });

jest.unstable_mockModule('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => mockSupabaseClient)
}));

jest.unstable_mockModule('../../services/accessDecisionAudit.service.js', () => ({
  recordAccessDecision: recordAccessDecisionMock
}));

const {
  grantReferenceAccess,
  revokeReferenceAccess,
  getReferenceAccessStatus,
  assertRecruiterCanAccessReferencePack
} = await import('../../services/referenceAccess.service.js');

function createBuilder(response) {
  const builder = {
    select: jest.fn(() => builder),
    insert: jest.fn(() => builder),
    update: jest.fn(() => builder),
    eq: jest.fn(() => builder),
    maybeSingle: jest.fn(async () => response),
    single: jest.fn(async () => response),
    order: jest.fn(async () => response)
  };
  return builder;
}

describe('referenceAccess.service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('candidate can grant recruiter access', async () => {
    const inserted = {
      id: 'grant-1',
      candidate_user_id: 'candidate-1',
      recruiter_user_id: 'recruiter-1',
      status: 'active',
      expires_at: null
    };
    let userLookupCall = 0;

    fromMock.mockImplementation((table) => {
      if (table === 'users') {
        userLookupCall += 1;
        return createBuilder({
          data: { id: userLookupCall === 1 ? 'candidate-1' : 'recruiter-1', role: 'user' },
          error: null
        });
      }
      if (table === 'company_signers') {
        return createBuilder({ data: { id: 'signer-1', company_id: 'company-1', user_id: 'recruiter-1', is_active: true }, error: null });
      }
      if (table === 'reference_pack_access_grants') {
        const builder = {
          select: jest.fn(() => builder),
          insert: jest.fn(() => builder),
          update: jest.fn(() => builder),
          eq: jest.fn(() => builder),
          maybeSingle: jest.fn(async () => ({ data: null, error: null })),
          single: jest.fn(async () => ({ data: inserted, error: null }))
        };
        return builder;
      }
      throw new Error(`Unexpected table ${table}`);
    });

    const grant = await grantReferenceAccess({
      candidateUserId: 'candidate-1',
      recruiterUserId: 'recruiter-1',
      grantedByUserId: 'candidate-1'
    });

    expect(userLookupCall).toBe(2);
    expect(grant.status).toBe('active');
    expect(recordAccessDecisionMock).toHaveBeenCalled();
  });

  test('grant stores expiration when supplied', async () => {
    const inserted = {
      id: 'grant-2',
      candidate_user_id: 'candidate-1',
      recruiter_user_id: 'recruiter-1',
      status: 'active',
      expires_at: '2030-01-01T00:00:00.000Z'
    };
    const grantTable = {
      select: jest.fn(() => grantTable),
      insert: jest.fn((payload) => {
        expect(payload[0].expires_at).toBe('2030-01-01T00:00:00.000Z');
        return grantTable;
      }),
      update: jest.fn(() => grantTable),
      eq: jest.fn(() => grantTable),
      maybeSingle: jest.fn(async () => ({ data: null, error: null })),
      single: jest.fn(async () => ({ data: inserted, error: null }))
    };

    let userCall = 0;
    fromMock.mockImplementation((table) => {
      if (table === 'users') {
        userCall += 1;
        return createBuilder({ data: { id: userCall === 1 ? 'candidate-1' : 'recruiter-1', role: 'user' }, error: null });
      }
      if (table === 'company_signers') return createBuilder({ data: { id: 'signer-1', company_id: 'company-1' }, error: null });
      if (table === 'reference_pack_access_grants') return grantTable;
      throw new Error(`Unexpected table ${table}`);
    });

    const grant = await grantReferenceAccess({
      candidateUserId: 'candidate-1',
      recruiterUserId: 'recruiter-1',
      grantedByUserId: 'candidate-1',
      expiresAt: '2030-01-01T00:00:00Z'
    });

    expect(grant.expires_at).toBe('2030-01-01T00:00:00.000Z');
  });

  test('duplicate active grant is handled idempotently by update', async () => {
    const updated = {
      id: 'grant-3',
      candidate_user_id: 'candidate-1',
      recruiter_user_id: 'recruiter-1',
      status: 'active'
    };
    const grantTable = {
      select: jest.fn(() => grantTable),
      insert: jest.fn(() => grantTable),
      update: jest.fn(() => grantTable),
      eq: jest.fn(() => grantTable),
      maybeSingle: jest.fn(async () => ({ data: { id: 'grant-3', candidate_user_id: 'candidate-1', recruiter_user_id: 'recruiter-1', status: 'active' }, error: null })),
      single: jest.fn(async () => ({ data: updated, error: null }))
    };

    let userCall = 0;
    fromMock.mockImplementation((table) => {
      if (table === 'users') {
        userCall += 1;
        return createBuilder({ data: { id: userCall === 1 ? 'candidate-1' : 'recruiter-1', role: 'user' }, error: null });
      }
      if (table === 'company_signers') return createBuilder({ data: { id: 'signer-1', company_id: 'company-1' }, error: null });
      if (table === 'reference_pack_access_grants') return grantTable;
      throw new Error(`Unexpected table ${table}`);
    });

    const grant = await grantReferenceAccess({
      candidateUserId: 'candidate-1',
      recruiterUserId: 'recruiter-1',
      grantedByUserId: 'candidate-1'
    });

    expect(grantTable.insert).not.toHaveBeenCalled();
    expect(grantTable.update).toHaveBeenCalled();
    expect(grant.id).toBe('grant-3');
  });

  test('candidate can revoke access', async () => {
    const grantTable = {
      select: jest.fn(() => grantTable),
      insert: jest.fn(() => grantTable),
      update: jest.fn(() => grantTable),
      eq: jest.fn(() => grantTable),
      maybeSingle: jest.fn(async () => ({ data: { id: 'grant-4', candidate_user_id: 'candidate-1', recruiter_user_id: 'recruiter-1', status: 'active' }, error: null })),
      single: jest.fn(async () => ({ data: { id: 'grant-4', status: 'revoked', revoked_at: '2030-01-02T00:00:00.000Z' }, error: null }))
    };
    fromMock.mockImplementation((table) => {
      if (table === 'reference_pack_access_grants') return grantTable;
      throw new Error(`Unexpected table ${table}`);
    });

    const grant = await revokeReferenceAccess({
      candidateUserId: 'candidate-1',
      recruiterUserId: 'recruiter-1',
      revokedByUserId: 'candidate-1'
    });

    expect(grant.status).toBe('revoked');
  });

  test('revoked grant denies access', async () => {
    let grantFetches = 0;
    fromMock.mockImplementation((table) => {
      if (table === 'company_signers') return createBuilder({ data: { id: 'signer-1', company_id: 'company-1' }, error: null });
      if (table === 'reference_pack_access_grants') {
        grantFetches += 1;
        return createBuilder({ data: { id: 'grant-5', status: 'revoked', candidate_user_id: 'candidate-1', recruiter_user_id: 'recruiter-1' }, error: null });
      }
      throw new Error(`Unexpected table ${table}`);
    });

    await expect(assertRecruiterCanAccessReferencePack({ candidateUserId: 'candidate-1', recruiterUserId: 'recruiter-1' }))
      .rejects.toMatchObject({ status: 403, message: 'Reference access grant has been revoked' });
    expect(grantFetches).toBeGreaterThan(0);
  });

  test('expired grant denies access', async () => {
    const grantTable = {
      select: jest.fn(() => grantTable),
      insert: jest.fn(() => grantTable),
      update: jest.fn(() => grantTable),
      eq: jest.fn(() => grantTable),
      maybeSingle: jest.fn(async () => ({ data: { id: 'grant-6', status: 'active', candidate_user_id: 'candidate-1', recruiter_user_id: 'recruiter-1', expires_at: '2020-01-01T00:00:00.000Z' }, error: null })),
      single: jest.fn(async () => ({ data: { id: 'grant-6', status: 'expired', candidate_user_id: 'candidate-1', recruiter_user_id: 'recruiter-1', expires_at: '2020-01-01T00:00:00.000Z' }, error: null }))
    };
    fromMock.mockImplementation((table) => {
      if (table === 'company_signers') return createBuilder({ data: { id: 'signer-1', company_id: 'company-1' }, error: null });
      if (table === 'reference_pack_access_grants') return grantTable;
      throw new Error(`Unexpected table ${table}`);
    });

    await expect(assertRecruiterCanAccessReferencePack({ candidateUserId: 'candidate-1', recruiterUserId: 'recruiter-1' }))
      .rejects.toMatchObject({ status: 403, message: 'Reference access grant has expired' });
  });

  test('active grant allows access', async () => {
    fromMock.mockImplementation((table) => {
      if (table === 'company_signers') return createBuilder({ data: { id: 'signer-1', company_id: 'company-1' }, error: null });
      if (table === 'reference_pack_access_grants') {
        return createBuilder({ data: { id: 'grant-7', status: 'active', candidate_user_id: 'candidate-1', recruiter_user_id: 'recruiter-1', expires_at: '2030-01-01T00:00:00.000Z' }, error: null });
      }
      throw new Error(`Unexpected table ${table}`);
    });

    const grant = await assertRecruiterCanAccessReferencePack({ candidateUserId: 'candidate-1', recruiterUserId: 'recruiter-1' });
    expect(grant.id).toBe('grant-7');
  });



  test('enforce mode denies active grant without persisted AOC capability', async () => {
    const previousEnforce = process.env.AOC_ENFORCE;
    process.env.AOC_ENFORCE = 'true';

    fromMock.mockImplementation((table) => {
      if (table === 'company_signers') return createBuilder({ data: { id: 'signer-1', company_id: 'company-1' }, error: null });
      if (table === 'reference_pack_access_grants') {
        return createBuilder({ data: { id: 'grant-8', status: 'active', candidate_user_id: 'candidate-1', recruiter_user_id: 'recruiter-1', expires_at: '2030-01-01T00:00:00.000Z', aoc_capability: null }, error: null });
      }
      throw new Error(`Unexpected table ${table}`);
    });

    await expect(assertRecruiterCanAccessReferencePack({ candidateUserId: 'candidate-1', recruiterUserId: 'recruiter-1' }))
      .rejects.toMatchObject({ status: 403, reason_code: 'AOC_CAPABILITY_MISSING' });

    process.env.AOC_ENFORCE = previousEnforce;
  });

  test('enforce mode denies invalid persisted AOC capability', async () => {
    const previousEnforce = process.env.AOC_ENFORCE;
    process.env.AOC_ENFORCE = 'true';

    fromMock.mockImplementation((table) => {
      if (table === 'company_signers') return createBuilder({ data: { id: 'signer-1', company_id: 'company-1' }, error: null });
      if (table === 'reference_pack_access_grants') {
        return createBuilder({
          data: {
            id: 'grant-9a',
            status: 'active',
            candidate_user_id: 'candidate-1',
            recruiter_user_id: 'recruiter-1',
            expires_at: '2030-01-01T00:00:00.000Z',
            aoc_capability: { subject: 'did:hrkey:user:other-candidate', capability_hash: 'cap-123' },
            aoc_expires_at: '2030-01-01T00:00:00.000Z'
          },
          error: null
        });
      }
      throw new Error(`Unexpected table ${table}`);
    });

    await expect(assertRecruiterCanAccessReferencePack({ candidateUserId: 'candidate-1', recruiterUserId: 'recruiter-1' }))
      .rejects.toMatchObject({ status: 403, reason_code: 'AOC_CAPABILITY_INVALID' });

    process.env.AOC_ENFORCE = previousEnforce;
  });

  test('enforce mode denies expired persisted AOC capability', async () => {
    const previousEnforce = process.env.AOC_ENFORCE;
    process.env.AOC_ENFORCE = 'true';

    fromMock.mockImplementation((table) => {
      if (table === 'company_signers') return createBuilder({ data: { id: 'signer-1', company_id: 'company-1' }, error: null });
      if (table === 'reference_pack_access_grants') {
        return createBuilder({
          data: {
            id: 'grant-9b',
            status: 'active',
            candidate_user_id: 'candidate-1',
            recruiter_user_id: 'recruiter-1',
            expires_at: '2030-01-01T00:00:00.000Z',
            aoc_capability: { subject: 'did:hrkey:user:candidate-1', grantee: 'did:hrkey:user:recruiter-1', capability_hash: 'cap-123', permissions: ['read_references'] },
            aoc_expires_at: '2020-01-01T00:00:00.000Z'
          },
          error: null
        });
      }
      throw new Error(`Unexpected table ${table}`);
    });

    await expect(assertRecruiterCanAccessReferencePack({ candidateUserId: 'candidate-1', recruiterUserId: 'recruiter-1' }))
      .rejects.toMatchObject({ status: 403, reason_code: 'AOC_CAPABILITY_EXPIRED' });

    process.env.AOC_ENFORCE = previousEnforce;
  });

  test('enforce mode allows active grant with valid persisted AOC capability', async () => {
    const previousEnforce = process.env.AOC_ENFORCE;
    process.env.AOC_ENFORCE = 'true';

    fromMock.mockImplementation((table) => {
      if (table === 'company_signers') return createBuilder({ data: { id: 'signer-1', company_id: 'company-1' }, error: null });
      if (table === 'reference_pack_access_grants') {
        return createBuilder({
          data: {
            id: 'grant-9',
            status: 'active',
            candidate_user_id: 'candidate-1',
            recruiter_user_id: 'recruiter-1',
            expires_at: '2030-01-01T00:00:00.000Z',
            aoc_capability: {
              capability_hash: 'cap-123',
              subject: 'did:hrkey:user:candidate-1',
              grantee: 'did:hrkey:user:recruiter-1',
              permissions: ['read_references']
            },
            aoc_expires_at: '2030-01-01T00:00:00.000Z'
          },
          error: null
        });
      }
      throw new Error(`Unexpected table ${table}`);
    });

    const grant = await assertRecruiterCanAccessReferencePack({ candidateUserId: 'candidate-1', recruiterUserId: 'recruiter-1' });
    expect(grant.id).toBe('grant-9');

    process.env.AOC_ENFORCE = previousEnforce;
  });

  test('getReferenceAccessStatus reports none when no grant exists', async () => {
    fromMock.mockImplementation((table) => {
      if (table === 'reference_pack_access_grants') return createBuilder({ data: null, error: null });
      throw new Error(`Unexpected table ${table}`);
    });

    const status = await getReferenceAccessStatus({ candidateUserId: 'candidate-1', recruiterUserId: 'recruiter-1' });
    expect(status).toMatchObject({ exists: false, status: 'none', isActive: false });
  });
});
