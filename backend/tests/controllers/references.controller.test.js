import { jest } from '@jest/globals';

process.env.SUPABASE_URL = 'https://test.supabase.co';
process.env.SUPABASE_SERVICE_KEY = 'test-service-key';
process.env.NODE_ENV = 'test';

const fromMock = jest.fn();
const mockSupabaseClient = { from: fromMock };

jest.unstable_mockModule('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => mockSupabaseClient)
}));

jest.unstable_mockModule('../../services/references.service.js', () => ({
  ReferenceService: class {},
  resolveCandidateId: jest.fn(),
  getActiveSignerCompanyIds: jest.fn(),
  hasApprovedReferenceAccess: jest.fn(),
  hashInviteToken: jest.fn()
}));

const {
  getMyReferences,
  getMyPendingInvites,
  requestReferenceInvite,
  __setSupabaseClientForTests
} = await import('../../controllers/referencesController.js');
const referencesService = await import('../../services/references.service.js');

function createRes() {
  return {
    status: jest.fn(function status(code) {
      this.statusCode = code;
      return this;
    }),
    json: jest.fn(function json(payload) {
      this.body = payload;
      return this;
    })
  };
}

describe('referencesController.getMyReferences', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    __setSupabaseClientForTests(mockSupabaseClient);
  });

  test('includes approved references and uses status in-filter for self visibility', async () => {
    const references = [
      { id: 'ref-active', status: 'active', reference_hash: 'hash-active' },
      { id: 'ref-approved', status: 'approved', reference_hash: 'hash-approved' }
    ];

    const builder = {
      select: jest.fn(() => builder),
      eq: jest.fn(() => builder),
      in: jest.fn(() => builder),
      order: jest.fn(async () => ({ data: references, error: null }))
    };
    fromMock.mockReturnValue(builder);

    const req = { user: { id: 'user-1' }, requestId: 'req-1' };
    const res = createRes();

    await getMyReferences(req, res);

    expect(fromMock).toHaveBeenCalledWith('references');
    expect(builder.eq).toHaveBeenCalledWith('owner_id', 'user-1');
    expect(builder.in).toHaveBeenCalledWith('status', ['active', 'approved']);
    expect(builder.eq).not.toHaveBeenCalledWith('status', 'active');
    expect(builder.select.mock.calls[0][0]).toContain('reference_hash');
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.body.references).toEqual(references);
  });
});

describe('referencesController.requestReferenceInvite', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    __setSupabaseClientForTests(mockSupabaseClient);
  });

  test('creates invite with owned profile_experience_id', async () => {
    const selectedExperience = {
      id: '11111111-1111-4111-8111-111111111111',
      title: 'Senior Engineer',
      company: 'HRKey',
      start_date: '2022-01',
      end_date: '2024-12'
    };

    const profileExperiencesBuilder = {
      select: jest.fn(() => profileExperiencesBuilder),
      eq: jest.fn(() => profileExperiencesBuilder),
      order: jest.fn(async () => ({ data: [selectedExperience], error: null }))
    };

    fromMock.mockImplementation((table) => {
      if (table === 'profile_experiences') return profileExperiencesBuilder;
      throw new Error(`Unexpected table: ${table}`);
    });

    referencesService.resolveCandidateId.mockResolvedValue('22222222-2222-4222-8222-222222222222');
    referencesService.ReferenceService.createReferenceRequest = jest.fn().mockResolvedValue({
      reference_id: '33333333-3333-4333-8333-333333333333',
      profile_experience_id: selectedExperience.id
    });

    const req = {
      user: { id: '22222222-2222-4222-8222-222222222222', role: 'candidate' },
      requestId: 'req-2',
      body: {
        candidate_id: '22222222-2222-4222-8222-222222222222',
        referee_email: 'referee@example.com',
        profile_experience_id: selectedExperience.id
      }
    };
    const res = createRes();

    await requestReferenceInvite(req, res);

    expect(referencesService.ReferenceService.createReferenceRequest).toHaveBeenCalledWith(expect.objectContaining({
      userId: '22222222-2222-4222-8222-222222222222',
      profileExperienceId: selectedExperience.id
    }));
    expect(res.body.profile_experience_id).toBe(selectedExperience.id);
  });

  test('fails when candidate has experiences but none selected', async () => {
    const profileExperiencesBuilder = {
      select: jest.fn(() => profileExperiencesBuilder),
      eq: jest.fn(() => profileExperiencesBuilder),
      order: jest.fn(async () => ({ data: [{ id: '44444444-4444-4444-8444-444444444444' }], error: null }))
    };
    fromMock.mockReturnValue(profileExperiencesBuilder);
    referencesService.resolveCandidateId.mockResolvedValue('22222222-2222-4222-8222-222222222222');

    const req = {
      user: { id: '22222222-2222-4222-8222-222222222222', role: 'candidate' },
      requestId: 'req-3',
      body: {
        candidate_id: '22222222-2222-4222-8222-222222222222',
        referee_email: 'referee@example.com'
      }
    };
    const res = createRes();

    await requestReferenceInvite(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.body.error).toBe('PROFILE_EXPERIENCE_REQUIRED');
  });

  test('fails when selected experience does not belong to candidate', async () => {
    const profileExperiencesBuilder = {
      select: jest.fn(() => profileExperiencesBuilder),
      eq: jest.fn(() => profileExperiencesBuilder),
      order: jest.fn(async () => ({ data: [{ id: '55555555-5555-4555-8555-555555555555' }], error: null }))
    };
    fromMock.mockReturnValue(profileExperiencesBuilder);
    referencesService.resolveCandidateId.mockResolvedValue('22222222-2222-4222-8222-222222222222');

    const req = {
      user: { id: '22222222-2222-4222-8222-222222222222', role: 'candidate' },
      requestId: 'req-4',
      body: {
        candidate_id: '22222222-2222-4222-8222-222222222222',
        referee_email: 'referee@example.com',
        profile_experience_id: '66666666-6666-4666-8666-666666666666'
      }
    };
    const res = createRes();

    await requestReferenceInvite(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.body.error).toBe('INVALID_PROFILE_EXPERIENCE');
  });
});

describe('referencesController.getMyPendingInvites', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    __setSupabaseClientForTests(mockSupabaseClient);
  });

  test('keeps legacy invite rows without profile_experience_id readable', async () => {
    const invitesBuilder = {
      select: jest.fn(() => invitesBuilder),
      eq: jest.fn(() => invitesBuilder),
      in: jest.fn(() => invitesBuilder),
      order: jest.fn(async () => ({
        data: [{ id: 'invite-1', profile_experience_id: null, status: 'pending' }],
        error: null
      }))
    };

    fromMock.mockImplementation((table) => {
      if (table === 'reference_invites') return invitesBuilder;
      throw new Error(`Unexpected table: ${table}`);
    });

    const req = { user: { id: 'user-1' }, requestId: 'req-5' };
    const res = createRes();

    await getMyPendingInvites(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.body.invites[0].profile_experience).toBeNull();
  });

  test('returns minimal linked experience context for pending invites', async () => {
    const invitesBuilder = {
      select: jest.fn(() => invitesBuilder),
      eq: jest.fn(() => invitesBuilder),
      in: jest.fn(() => invitesBuilder),
      order: jest.fn(async () => ({
        data: [{ id: 'invite-2', profile_experience_id: '77777777-7777-4777-8777-777777777777', status: 'pending' }],
        error: null
      }))
    };

    const experiencesBuilder = {
      select: jest.fn(() => experiencesBuilder),
      eq: jest.fn(() => experiencesBuilder),
      in: jest.fn(async () => ({
        data: [{
          id: '77777777-7777-4777-8777-777777777777',
          title: 'Engineering Manager',
          company: 'Acme',
          start_date: '2021-01',
          end_date: '2023-12'
        }],
        error: null
      }))
    };

    fromMock.mockImplementation((table) => {
      if (table === 'reference_invites') return invitesBuilder;
      if (table === 'profile_experiences') return experiencesBuilder;
      throw new Error(`Unexpected table: ${table}`);
    });

    const req = { user: { id: 'user-1' }, requestId: 'req-6' };
    const res = createRes();

    await getMyPendingInvites(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.body.invites[0].profile_experience).toEqual(expect.objectContaining({
      id: '77777777-7777-4777-8777-777777777777',
      title: 'Engineering Manager',
      company: 'Acme'
    }));
  });
});
