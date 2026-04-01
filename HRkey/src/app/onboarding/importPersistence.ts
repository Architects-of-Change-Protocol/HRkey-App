export type ImportDecision = 'none' | 'accepted' | 'skipped';

interface ParsedExperience {
  title: string | null;
  company: string | null;
  start_date: string | null;
  end_date: string | null;
  is_current: boolean;
  summary: string | null;
}

interface ParsedEducation {
  institution: string | null;
  degree: string | null;
  field_of_study: string | null;
  start_date: string | null;
  end_date: string | null;
}

interface ParsedCvImportLike {
  experiences: ParsedExperience[];
  education: ParsedEducation[];
}

export function shouldPersistStructuredImport(
  parsedCvImport: ParsedCvImportLike | null,
  importDecision: ImportDecision
): parsedCvImport is ParsedCvImportLike {
  return Boolean(parsedCvImport) && importDecision === 'accepted';
}

export function buildExperienceRows(profileId: string, experiences: ParsedExperience[]) {
  return experiences.map((experience, index) => ({
    profile_id: profileId,
    sort_order: index,
    title: experience.title,
    company: experience.company,
    start_date: experience.start_date,
    end_date: experience.end_date,
    is_current: Boolean(experience.is_current),
    summary: experience.summary,
    source: 'cv_import',
  }));
}

export function buildEducationRows(profileId: string, education: ParsedEducation[]) {
  return education.map((educationItem, index) => ({
    profile_id: profileId,
    sort_order: index,
    institution: educationItem.institution,
    degree: educationItem.degree,
    field_of_study: educationItem.field_of_study,
    start_date: educationItem.start_date,
    end_date: educationItem.end_date,
    source: 'cv_import',
  }));
}
