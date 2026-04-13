import { jest } from '@jest/globals';

const grantIdentityConsentMock = jest.fn();

const insertSingleMock = jest.fn();
const fromMock = jest.fn();

function configureConsentFromMock() {
  fromMock.mockImplementation(() => ({
    insert: () => ({
      select: () => ({
        single: insertSingleMock
      })
    })
  }));
}

jest.unstable_mockModule('@supabase/supabase-js', () => ({
  createClient: () => ({ from: fromMock })
}));

jest.unstable_mockModule('../services/aocRuntimeClient.js', () => ({
  grantIdentityConsent: grantIdentityConsentMock
}));

jest.unstable_mockModule('../logger.js', () => ({
  default: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
  }
}));

const { createConsent } = await import('../../utils/consentManager.js');

describe('consentManager createConsent with AOC runtime', () => {
  beforeEach(() => {
    grantIdentityConsentMock.mockReset();
    insertSingleMock.mockReset();
    fromMock.mockReset();
    configureConsentFromMock();
  });

  test('calls grantIdentityConsent before storing local consent record', async () => {
    grantIdentityConsentMock.mockResolvedValue({ consentId: 'aoc-consent-1' });
    insertSingleMock.mockResolvedValue({ data: { id: 'local-consent-1', subject_user_id: 'subject-1' }, error: null });

    await createConsent({
      subjectUserId: 'subject-1',
      grantedToUser: 'grantee-1',
      resourceType: 'references',
      purpose: 'hiring_review',
      scope: ['read']
    });

    expect(grantIdentityConsentMock).toHaveBeenCalledWith(expect.objectContaining({
      subjectUserId: 'subject-1',
      grantedToUser: 'grantee-1',
      resourceType: 'references'
    }));
    expect(insertSingleMock).toHaveBeenCalledTimes(1);
  });
});
