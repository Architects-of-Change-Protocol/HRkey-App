import { fetchCurrentUser } from "@/lib/auth/profile-service";
import { SupabaseStorageProvider } from "@/lib/storage/supabase-storage-provider";
import type {
  CandidateAdditionalDetailsWriteInput,
  CandidateProfileRecord,
  CandidateWorkExperienceInput,
} from "@/lib/storage/storage-provider";

const ALLOWED_EXTENSIONS = ["pdf", "doc", "docx"];
const ALLOWED_MIME_TYPES = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];
const MAX_CV_SIZE_BYTES = 10 * 1024 * 1024;

export type CandidateOnboardingInput = {
  full_name: string;
  title: string;
  company: string;
  professional_summary: string;
  onboarding_complete?: boolean;
};

export type CandidateEducationInput = {
  degree: string;
  institution: string;
};

export type CandidateAdditionalDetailsInput = {
  education: CandidateEducationInput[];
  languages: string[];
  certifications: string[];
  skills: string[];
};

const provider = new SupabaseStorageProvider();

function normalize(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

function isFilled(value: unknown): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

function assertValidCV(file: File) {
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";

  if (!ALLOWED_EXTENSIONS.includes(extension) && !ALLOWED_MIME_TYPES.includes(file.type)) {
    throw new Error("Invalid file type. Please upload a PDF, DOC, or DOCX file.");
  }

  if (file.size > MAX_CV_SIZE_BYTES) {
    throw new Error("CV file is too large. Maximum size is 10MB.");
  }
}

export async function requireAuthenticatedCandidateUserId(): Promise<string> {
  const user = await fetchCurrentUser();

  if (!user?.id) {
    throw new Error("AUTH_REQUIRED");
  }

  return user.id;
}

export async function saveCandidateOnboarding(data: CandidateOnboardingInput): Promise<CandidateProfileRecord> {
  const userId = await requireAuthenticatedCandidateUserId();

  return provider.saveCandidateProfile({
    userId,
    full_name: normalize(data.full_name),
    title: normalize(data.title),
    company: normalize(data.company),
    professional_summary: normalize(data.professional_summary),
    account_type: "candidate",
    onboarding_complete: data.onboarding_complete ?? true,
  });
}

export async function saveCandidateWorkExperiences(experiences: CandidateWorkExperienceInput[]): Promise<void> {
  const userId = await requireAuthenticatedCandidateUserId();

  const normalizedExperiences = experiences
    .map((experience) => ({
      role: normalize(experience.role || ""),
      company: normalize(experience.company || ""),
      duration: normalize(experience.duration || ""),
      keyResponsibilities: normalize(experience.keyResponsibilities || ""),
    }))
    .filter((experience) =>
      Boolean(experience.role || experience.company || experience.duration || experience.keyResponsibilities)
    )
    .map((experience) => ({
      role: experience.role,
      company: experience.company,
      duration: experience.duration,
      keyResponsibilities: experience.keyResponsibilities,
    }));

  await provider.saveCandidateWorkExperiences({
    userId,
    experiences: normalizedExperiences,
  });

  await provider.saveCandidateProfile({
    userId,
    account_type: "candidate",
    onboarding_complete: false,
  });
}

function normalizeTagValues(values: string[]): string[] {
  const seen = new Set<string>();

  return values
    .map((value) => value.trim())
    .filter((value) => {
      if (!value) return false;
      const normalized = value.toLowerCase();
      if (seen.has(normalized)) return false;
      seen.add(normalized);
      return true;
    });
}

export async function saveCandidateAdditionalDetails(data: CandidateAdditionalDetailsInput): Promise<void> {
  const userId = await requireAuthenticatedCandidateUserId();

  await provider.saveCandidateAdditionalDetails({
    userId,
    education: data.education.map((row) => ({
      degree: normalize(row.degree),
      institution: normalize(row.institution),
    })),
    languages: normalizeTagValues(data.languages),
    certifications: normalizeTagValues(data.certifications),
    skills: normalizeTagValues(data.skills),
  } satisfies CandidateAdditionalDetailsWriteInput);
}

export async function completeCandidateOnboarding(data?: CandidateAdditionalDetailsInput): Promise<void> {
  const userId = await requireAuthenticatedCandidateUserId();

  if (data) {
    await provider.saveCandidateAdditionalDetails({
      userId,
      education: data.education.map((row) => ({
        degree: normalize(row.degree),
        institution: normalize(row.institution),
      })),
      languages: normalizeTagValues(data.languages),
      certifications: normalizeTagValues(data.certifications),
      skills: normalizeTagValues(data.skills),
    });
  }

  await provider.saveCandidateProfile({
    userId,
    account_type: "candidate",
    onboarding_complete: true,
  });
}

export async function uploadCV(file: File): Promise<{ cvUrl: string; storagePath: string }> {
  const userId = await requireAuthenticatedCandidateUserId();

  assertValidCV(file);

  const upload = await provider.uploadCandidateCV({ userId, file });

  await provider.saveCandidateProfile({
    userId,
    cv_url: upload.storagePath,
    account_type: "candidate",
  });

  return {
    cvUrl: upload.publicUrl ?? upload.storagePath,
    storagePath: upload.storagePath,
  };
}

export async function getCurrentCandidateProfile(userId?: string): Promise<CandidateProfileRecord | null> {
  const resolvedUserId = userId ?? (await requireAuthenticatedCandidateUserId());
  return provider.getCandidateProfile(resolvedUserId);
}

export function getProfileCompletion(profile: CandidateProfileRecord | null): number {
  if (!profile) return 0;

  const completedFields = [
    profile.full_name,
    profile.title,
    profile.company,
    profile.professional_summary,
    profile.cv_url,
  ].filter(isFilled).length;

  return completedFields * 20;
}
