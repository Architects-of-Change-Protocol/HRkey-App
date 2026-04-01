import { jest } from '@jest/globals';

process.env.SUPABASE_URL = 'https://test.supabase.co';
process.env.SUPABASE_SERVICE_KEY = 'test-service-key';
process.env.NODE_ENV = 'test';

const fromMock = jest.fn();
const mockSupabaseClient = {
  from: fromMock,
  rpc: jest.fn(),
  auth: { admin: { getUserById: jest.fn() } }
};

jest.unstable_mockModule('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => mockSupabaseClient)
}));

jest.unstable_mockModule('../../services/analytics/eventTracker.js', () => ({
  logEvent: jest.fn(),
  EventTypes: {}
}));

jest.unstable_mockModule('../../services/validation/index.js', () => ({
  validateReference: jest.fn()
}));

jest.unstable_mockModule('../../services/hrscore/autoTrigger.js', () => ({
  onReferenceValidated: jest.fn()
}));

jest.unstable_mockModule('../../utils/auditLogger.js', () => ({
  logReferenceSubmissionAudit: jest.fn(),
  AuditActionTypes: {}
}));

const { fetchSelfReferences, ReferenceService } = await import('../../services/references.service.js');

describe('references.service.fetchSelfReferences', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('includes approved references and uses status in-filter', async () => {
    const rows = [
      { id: 'ref-active', status: 'active', reference_hash: 'hash-active' },
      { id: 'ref-approved', status: 'approved', reference_hash: 'hash-approved' }
    ];

    const builder = {
      select: jest.fn(() => builder),
      eq: jest.fn(() => builder),
      in: jest.fn(() => builder),
      order: jest.fn(async () => ({ data: rows, error: null }))
    };
    fromMock.mockReturnValue(builder);

    const result = await fetchSelfReferences('user-1');

    expect(fromMock).toHaveBeenCalledWith('references');
    expect(builder.eq).toHaveBeenCalledWith('owner_id', 'user-1');
    expect(builder.in).toHaveBeenCalledWith('status', ['active', 'approved']);
    expect(builder.eq).not.toHaveBeenCalledWith('status', 'active');
    expect(builder.select.mock.calls[0][0]).toContain('validation_status');
    expect(builder.select.mock.calls[0][0]).toContain('reference_hash');
    expect(result.data).toEqual(rows);
  });
});

describe('references.service.createReferenceRequest', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('persists profile_experience_id on reference_invites row', async () => {
    const insertMock = jest.fn(() => ({
      select: jest.fn(() => ({
        single: jest.fn(async () => ({
          data: { id: 'invite-1', profile_experience_id: 'exp-1' },
          error: null
        }))
      }))
    }));

    fromMock.mockImplementation((table) => {
      if (table === 'reference_invites') {
        return { insert: insertMock };
      }
      throw new Error(`Unexpected table: ${table}`);
    });

    const result = await ReferenceService.createReferenceRequest({
      userId: 'user-1',
      email: 'referee@example.com',
      name: 'Referee',
      profileExperienceId: 'exp-1',
      applicantData: { message: 'Please provide feedback' }
    });

    expect(insertMock).toHaveBeenCalledWith([expect.objectContaining({
      profile_experience_id: 'exp-1',
      requester_id: 'user-1'
    })]);
    expect(result.profile_experience_id).toBe('exp-1');
  });
});
