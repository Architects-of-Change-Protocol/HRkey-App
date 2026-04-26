import { supabase } from "@/lib/supabaseClient";
import type {
  CandidateAdditionalDetailsWriteInput,
  CandidateCVUploadInput,
  CandidateCVUploadResult,
  CandidateProfileRecord,
  CandidateProfileWriteInput,
  CandidateWorkExperienceWriteInput,
  StorageProvider,
} from "@/lib/storage/storage-provider";

const CV_UPLOAD_BUCKET = "cv-uploads";

function sanitizeFilename(fileName: string): string {
  return fileName.replace(/[^a-zA-Z0-9._-]/g, "-").toLowerCase();
}

function parseMissingColumn(error: { message?: string } | null): string | null {
  const message = error?.message || "";
  const match = message.match(/column\s+"?([a-zA-Z0-9_]+)"?\s+of\s+relation\s+"profiles"\s+does\s+not\s+exist/i);
  return match?.[1] ?? null;
}

function isMissingRelationError(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  if (error.code === "42P01") return true;
  return /relation\s+"?[a-zA-Z0-9_]+"?\s+does\s+not\s+exist/i.test(error.message || "");
}

async function persistProfilePayload(payload: Record<string, unknown>): Promise<CandidateProfileRecord> {
  const { data, error } = await supabase.from("profiles").upsert(payload).select("*").single();

  if (error) {
    const missingColumn = parseMissingColumn(error);

    if (missingColumn && Object.prototype.hasOwnProperty.call(payload, missingColumn)) {
      const reducedPayload = { ...payload };
      delete reducedPayload[missingColumn];
      return persistProfilePayload(reducedPayload);
    }

    throw error;
  }

  return data as CandidateProfileRecord;
}

function withDefinedField(target: Record<string, unknown>, key: string, value: unknown) {
  if (value !== undefined) {
    target[key] = value;
  }
}

export class SupabaseStorageProvider implements StorageProvider {
  async saveCandidateProfile(input: CandidateProfileWriteInput): Promise<CandidateProfileRecord> {
    const payload: Record<string, unknown> = {
      id: input.userId,
      updated_at: new Date().toISOString(),
    };

    withDefinedField(payload, "full_name", input.full_name);
    withDefinedField(payload, "title", input.title);
    withDefinedField(payload, "company", input.company);
    withDefinedField(payload, "professional_summary", input.professional_summary);
    withDefinedField(payload, "account_type", input.account_type ?? "candidate");
    withDefinedField(payload, "onboarding_complete", input.onboarding_complete);
    withDefinedField(payload, "cv_url", input.cv_url);
    withDefinedField(payload, "onboarding_details", input.onboarding_details);
    withDefinedField(payload, "profile_meta", input.profile_meta);
    withDefinedField(payload, "metadata", input.metadata);

    return persistProfilePayload(payload);
  }

  async getCandidateProfile(userId: string): Promise<CandidateProfileRecord | null> {
    const { data, error } = await supabase.from("profiles").select("*").eq("id", userId).maybeSingle();

    if (error) {
      console.error("[storage] failed to fetch candidate profile", error);
      return null;
    }

    return (data as CandidateProfileRecord | null) ?? null;
  }

  async uploadCandidateCV(input: CandidateCVUploadInput): Promise<CandidateCVUploadResult> {
    const timestamp = Date.now();
    const safeName = sanitizeFilename(input.file.name || "candidate-cv");
    const path = `${input.userId}/${timestamp}-${safeName}`;

    const { error: uploadError } = await supabase.storage.from(CV_UPLOAD_BUCKET).upload(path, input.file, {
      cacheControl: "3600",
      upsert: false,
      contentType: input.file.type || undefined,
    });

    if (uploadError) throw uploadError;

    const {
      data: { publicUrl },
    } = supabase.storage.from(CV_UPLOAD_BUCKET).getPublicUrl(path);

    return {
      storagePath: path,
      publicUrl: publicUrl || null,
    };
  }

  async saveCandidateWorkExperiences(input: CandidateWorkExperienceWriteInput): Promise<void> {
    const { error: deleteError } = await supabase.from("profile_experiences").delete().eq("profile_id", input.userId);

    if (deleteError) {
      throw deleteError;
    }

    if (input.experiences.length === 0) return;

    const rows = input.experiences.map((experience, index) => ({
      profile_id: input.userId,
      sort_order: index,
      title: experience.role,
      company: experience.company,
      start_date: experience.duration,
      end_date: null,
      is_current: false,
      summary: experience.keyResponsibilities,
      source: "experience_review",
    }));

    const { error: insertError } = await supabase.from("profile_experiences").insert(rows);

    if (insertError) {
      throw insertError;
    }
  }

  async saveCandidateAdditionalDetails(input: CandidateAdditionalDetailsWriteInput): Promise<void> {
    const normalizedEducation = input.education.filter((row) => Boolean(row.degree || row.institution));

    const { error: deleteEducationError } = await supabase
      .from("profile_education")
      .delete()
      .eq("profile_id", input.userId)
      .eq("source", "onboarding_details");

    if (deleteEducationError && !isMissingRelationError(deleteEducationError)) {
      throw deleteEducationError;
    }

    const canWriteEducation = !deleteEducationError || !isMissingRelationError(deleteEducationError);

    if (canWriteEducation && normalizedEducation.length > 0) {
      const educationRows = normalizedEducation.map((row, index) => ({
        profile_id: input.userId,
        sort_order: index,
        institution: row.institution,
        degree: row.degree,
        field_of_study: null,
        source: "onboarding_details",
      }));

      const { error: insertEducationError } = await supabase.from("profile_education").insert(educationRows);

      if (insertEducationError && !isMissingRelationError(insertEducationError)) {
        throw insertEducationError;
      }
    }

    const detailsPayload = {
      education: normalizedEducation,
      languages: input.languages,
      certifications: input.certifications,
      skills: input.skills,
    };

    await this.saveCandidateProfile({
      userId: input.userId,
      onboarding_details: detailsPayload,
      profile_meta: detailsPayload,
      metadata: detailsPayload,
    });
  }
}
