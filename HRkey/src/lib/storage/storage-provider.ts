export type CandidateProfileRecord = {
  id: string;
  full_name?: string | null;
  title?: string | null;
  company?: string | null;
  professional_summary?: string | null;
  account_type?: string | null;
  onboarding_complete?: boolean | null;
  cv_url?: string | null;
  updated_at?: string | null;
};

export type CandidateProfileWriteInput = {
  userId: string;
  full_name?: string | null;
  title?: string | null;
  company?: string | null;
  professional_summary?: string | null;
  account_type?: "candidate" | "company" | null;
  onboarding_complete?: boolean;
  cv_url?: string | null;
  onboarding_details?: Record<string, unknown> | null;
  profile_meta?: Record<string, unknown> | null;
  metadata?: Record<string, unknown> | null;
};

export type CandidateCVUploadInput = {
  userId: string;
  file: File;
};

export type CandidateCVUploadResult = {
  storagePath: string;
  publicUrl: string | null;
};

export type CandidateWorkExperienceInput = {
  role: string | null;
  company: string | null;
  duration: string | null;
  keyResponsibilities: string | null;
};

export type CandidateWorkExperienceWriteInput = {
  userId: string;
  experiences: CandidateWorkExperienceInput[];
};

export type CandidateEducationInput = {
  degree: string | null;
  institution: string | null;
};

export type CandidateAdditionalDetailsWriteInput = {
  userId: string;
  education: CandidateEducationInput[];
  languages: string[];
  certifications: string[];
  skills: string[];
};

export interface StorageProvider {
  saveCandidateProfile(input: CandidateProfileWriteInput): Promise<CandidateProfileRecord>;
  getCandidateProfile(userId: string): Promise<CandidateProfileRecord | null>;
  uploadCandidateCV(input: CandidateCVUploadInput): Promise<CandidateCVUploadResult>;
  saveCandidateWorkExperiences(input: CandidateWorkExperienceWriteInput): Promise<void>;
  saveCandidateAdditionalDetails(input: CandidateAdditionalDetailsWriteInput): Promise<void>;
}
