import {
  buildEducationRows,
  buildExperienceRows,
  shouldPersistStructuredImport,
} from '@/app/onboarding/importPersistence';

describe('onboarding import persistence helpers', () => {
  const parsedImport = {
    experiences: [
      {
        title: 'Senior Engineer',
        company: 'HRKey',
        start_date: '2023-01',
        end_date: null,
        is_current: true,
        summary: 'Built onboarding systems',
      },
    ],
    education: [
      {
        institution: 'MIT',
        degree: 'BS',
        field_of_study: 'Computer Science',
        start_date: '2018',
        end_date: '2022',
      },
    ],
  };

  it('persists only when import is accepted', () => {
    expect(shouldPersistStructuredImport(parsedImport, 'accepted')).toBe(true);
    expect(shouldPersistStructuredImport(parsedImport, 'skipped')).toBe(false);
    expect(shouldPersistStructuredImport(parsedImport, 'none')).toBe(false);
    expect(shouldPersistStructuredImport(null, 'accepted')).toBe(false);
  });

  it('builds experience rows with deterministic sort order', () => {
    const rows = buildExperienceRows('profile-1', [
      parsedImport.experiences[0],
      {
        title: 'Engineer',
        company: 'Acme',
        start_date: '2020',
        end_date: '2022',
        is_current: false,
        summary: null,
      },
    ]);

    expect(rows).toEqual([
      {
        profile_id: 'profile-1',
        sort_order: 0,
        title: 'Senior Engineer',
        company: 'HRKey',
        start_date: '2023-01',
        end_date: null,
        is_current: true,
        summary: 'Built onboarding systems',
        source: 'cv_import',
      },
      {
        profile_id: 'profile-1',
        sort_order: 1,
        title: 'Engineer',
        company: 'Acme',
        start_date: '2020',
        end_date: '2022',
        is_current: false,
        summary: null,
        source: 'cv_import',
      },
    ]);
  });

  it('builds education rows with deterministic sort order', () => {
    const rows = buildEducationRows('profile-1', parsedImport.education);

    expect(rows).toEqual([
      {
        profile_id: 'profile-1',
        sort_order: 0,
        institution: 'MIT',
        degree: 'BS',
        field_of_study: 'Computer Science',
        start_date: '2018',
        end_date: '2022',
        source: 'cv_import',
      },
    ]);
  });
});
