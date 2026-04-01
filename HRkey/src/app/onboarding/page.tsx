'use client';

import { useMemo, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import { resolveApiBase } from '@/lib/apiClient';
import {
  buildEducationRows,
  buildExperienceRows,
  type ImportDecision,
  shouldPersistStructuredImport,
} from './importPersistence';

const FALLBACK_SUPABASE_URL = 'https://wrervcydgdrlcndtjboy.supabase.co';
const FALLBACK_SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndyZXJ2Y3lkZ2RybGNuZHRqYm95Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTc5NzYxNTYsImV4cCI6MjA3MzU1MjE1Nn0.63M53sZW4LEYMOaxScvtLhQr_6VUj7rOaaGtlR745IM';

const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL || FALLBACK_SUPABASE_URL;

const supabaseAnonKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || FALLBACK_SUPABASE_ANON_KEY;

const supabase =
  supabaseUrl && supabaseAnonKey
    ? createClient(supabaseUrl, supabaseAnonKey, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
        },
      })
    : null;

interface CVUploadZoneProps {
  onUpload: (file: File) => void;
  isParsing: boolean;
}

interface ParsedCvImport {
  full_name: string | null;
  title: string | null;
  company: string | null;
  location: string | null;
  skills: string[];
  education_summary: string | null;
  experiences: Array<{
    title: string | null;
    company: string | null;
    start_date: string | null;
    end_date: string | null;
    is_current: boolean;
    summary: string | null;
  }>;
  education: Array<{
    institution: string | null;
    degree: string | null;
    field_of_study: string | null;
    start_date: string | null;
    end_date: string | null;
  }>;
}

function CVUploadZone({ onUpload, isParsing }: CVUploadZoneProps) {
  const [isDragging, setIsDragging] = useState(false);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    const file = e.dataTransfer.files?.[0];
    if (file) onUpload(file);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) onUpload(file);
  };

  return (
    <div
      className={`rounded-xl border-2 border-dashed p-10 text-center transition-colors ${
        isDragging
          ? 'border-blue-500 bg-blue-50'
          : 'border-neutral-300 hover:border-neutral-400'
      }`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <input
        type="file"
        id="cv-upload"
        className="hidden"
        accept=".pdf"
        onChange={handleFileSelect}
        disabled={isParsing}
      />

      <label htmlFor="cv-upload" className="cursor-pointer">
        <div className="mb-4 inline-flex h-14 w-14 items-center justify-center rounded-full bg-neutral-100">
          <svg
            className="h-7 w-7 text-neutral-600"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M12 16V4" />
            <path d="M8 8l4-4 4 4" />
            <path d="M20 16.58A5 5 0 0 1 18 7h-1.26A8 8 0 1 0 4 16.25" />
            <path d="M8 20h8" />
          </svg>
        </div>

        <p className="mb-1 text-lg font-medium text-neutral-900">
          Upload your CV to auto-fill your profile
        </p>

        <p className="text-sm text-neutral-500">
          Drag & drop or{' '}
          <span className="font-medium text-blue-600 hover:text-blue-700">
            browse files
          </span>
        </p>

        <p className="mt-2 text-xs text-neutral-400">PDF only (max 10MB)</p>
      </label>
    </div>
  );
}

export default function OnboardingPage() {
  const [title, setTitle] = useState('');
  const [company, setCompany] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [manualMode, setManualMode] = useState(false);
  const [isParsing, setIsParsing] = useState(false);
  const [parsedCvImport, setParsedCvImport] = useState<ParsedCvImport | null>(null);
  const [hasReviewedImport, setHasReviewedImport] = useState(false);
  const [importDecision, setImportDecision] = useState<ImportDecision>('none');

  const canSubmit = useMemo(() => {
    return title.trim().length > 0 && !isSaving;
  }, [title, isSaving]);

  async function handleUpload(file: File) {
    setErrorMessage('');

    const allowedExtensions = ['pdf'];
    const extension = file.name.split('.').pop()?.toLowerCase() || '';

    if (!allowedExtensions.includes(extension)) {
      setErrorMessage('Please upload a PDF file.');
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      setErrorMessage('File must be 10MB or smaller.');
      return;
    }

    setUploadedFile(file);
    setManualMode(true);
    setIsParsing(true);
    setHasReviewedImport(false);
    setImportDecision('none');
    setParsedCvImport(null);

    try {
      if (!supabase) {
        throw new Error('Supabase is not configured correctly.');
      }

      const {
        data: { session },
      } = await supabase.auth.getSession();

      const formData = new FormData();
      formData.append('cv', file);

      const response = await fetch(`${resolveApiBase()}/api/cv/parse`, {
        method: 'POST',
        headers: session?.access_token
          ? {
              Authorization: `Bearer ${session.access_token}`,
            }
          : undefined,
        body: formData,
        credentials: 'include',
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.message || data?.error || 'Failed to parse CV.');
      }

      const parsed = (data?.parsed || null) as ParsedCvImport | null;

      if (parsed) {
        setParsedCvImport(parsed);
        setImportDecision('accepted');
      }

      if (parsed?.title) {
        setTitle(parsed.title);
      }

      if (parsed?.company) {
        setCompany(parsed.company);
      }
    } catch (error: any) {
      setErrorMessage(
        error?.message ||
          'CV parsing is unavailable right now. You can continue with manual entry.'
      );
    } finally {
      setIsParsing(false);
    }
  }

  async function handleContinue() {
    setErrorMessage('');

    if (!title.trim()) {
      setErrorMessage('Please enter your current role.');
      return;
    }

    if (!supabase) {
      setErrorMessage('Supabase is not configured correctly.');
      return;
    }

    setIsSaving(true);

    try {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();

      console.log('ONBOARDING SESSION:', session);
      console.log('ONBOARDING USER:', user);
      console.log('SESSION ERROR:', sessionError);

      if (userError || !user) {
        window.location.href = '/landing/auth.html';
        return;
      }

      if (!session?.access_token) {
        setErrorMessage('No active Supabase session found.');
        setIsSaving(false);
        return;
      }

      const profilePayload = {
        id: user.id,
        title: title.trim(),
        company: company.trim() || null,
      };

      const { data: existingProfile, error: existingProfileError } = await supabase
        .from('profiles')
        .select('id')
        .eq('id', user.id)
        .maybeSingle();

      if (existingProfileError) {
        throw existingProfileError;
      }

      let writeError = null;

      if (existingProfile?.id) {
        const { error } = await supabase
          .from('profiles')
          .update({
            title: profilePayload.title,
            company: profilePayload.company,
          })
          .eq('id', user.id);

        writeError = error;
      } else {
        const { error } = await supabase
          .from('profiles')
          .insert(profilePayload);

        writeError = error;
      }

      if (writeError) {
        throw writeError;
      }

      const { error: deleteExperiencesError } = await supabase
        .from('profile_experiences')
        .delete()
        .eq('profile_id', user.id);

      if (deleteExperiencesError) {
        throw new Error(deleteExperiencesError.message || 'Failed to reset imported experiences.');
      }

      const { error: deleteEducationError } = await supabase
        .from('profile_education')
        .delete()
        .eq('profile_id', user.id);

      if (deleteEducationError) {
        throw new Error(deleteEducationError.message || 'Failed to reset imported education.');
      }

      if (shouldPersistStructuredImport(parsedCvImport, importDecision)) {
        const experienceRows = buildExperienceRows(user.id, parsedCvImport.experiences);

        if (experienceRows.length > 0) {
          const { error: insertExperiencesError } = await supabase
            .from('profile_experiences')
            .insert(experienceRows);

          if (insertExperiencesError) {
            throw new Error(
              insertExperiencesError.message || 'Failed to save imported experiences.'
            );
          }
        }

        const educationRows = buildEducationRows(user.id, parsedCvImport.education);

        if (educationRows.length > 0) {
          const { error: insertEducationError } = await supabase
            .from('profile_education')
            .insert(educationRows);

          if (insertEducationError) {
            throw new Error(insertEducationError.message || 'Failed to save imported education.');
          }
        }
      }

      const existingUserData = (() => {
        try {
          return JSON.parse(localStorage.getItem('hrkey_user_data') || '{}');
        } catch {
          return {};
        }
      })();

      localStorage.setItem(
        'hrkey_user_data',
        JSON.stringify({
          ...existingUserData,
          name:
            existingUserData?.name ||
            user.user_metadata?.full_name ||
            user.email ||
            'User',
          email: user.email || existingUserData?.email || '',
          authenticated: true,
          title: title.trim(),
          company: company.trim() || null,
          onboardingCompleted: true,
          uploadedCvName: uploadedFile?.name || null,
          loginDate:
            existingUserData?.loginDate || new Date().toISOString(),
        })
      );

      window.location.href = '/landing/app.html';
    } catch (error: any) {
      console.error('Failed to save onboarding profile:', error);
      setErrorMessage(error?.message || 'Failed to save profile.');
    } finally {
      setIsSaving(false);
    }
  }

  function handleSkip() {
    window.location.href = '/landing/app.html';
  }

  function removeExperience(indexToRemove: number) {
    setParsedCvImport((previous) => {
      if (!previous) return previous;
      return {
        ...previous,
        experiences: previous.experiences.filter((_, index) => index !== indexToRemove),
      };
    });
  }

  function updateExperience(
    experienceIndex: number,
    field: 'title' | 'company',
    value: string
  ) {
    setParsedCvImport((previous) => {
      if (!previous) return previous;
      return {
        ...previous,
        experiences: previous.experiences.map((experience, index) =>
          index === experienceIndex ? { ...experience, [field]: value } : experience
        ),
      };
    });
  }

  function removeEducation(indexToRemove: number) {
    setParsedCvImport((previous) => {
      if (!previous) return previous;
      return {
        ...previous,
        education: previous.education.filter((_, index) => index !== indexToRemove),
      };
    });
  }

  function removeSkill(skillToRemove: string) {
    setParsedCvImport((previous) => {
      if (!previous) return previous;
      return {
        ...previous,
        skills: previous.skills.filter((skill) => skill !== skillToRemove),
      };
    });
  }

  function handleUseImportedProfile() {
    setImportDecision('accepted');
    setManualMode(true);
    setHasReviewedImport(true);
  }

  function handleSkipImportedDetails() {
    setImportDecision('skipped');
    setParsedCvImport(null);
    setHasReviewedImport(true);
    setManualMode(true);
  }

  return (
    <main className="min-h-screen bg-white text-black">
      <div className="mx-auto flex min-h-screen w-full max-w-4xl flex-col px-6 py-8 md:px-8">
        <div className="mb-10">
          <div className="mb-3 flex items-center justify-between text-sm text-neutral-600">
            <span>Step 2 of 2</span>
          </div>

          <div className="h-2 w-full rounded-full bg-neutral-200">
            <div className="h-2 w-2/3 rounded-full bg-black" />
          </div>
        </div>

        <div className="mb-10">
          <h1 className="mb-3 text-4xl font-semibold tracking-tight md:text-5xl">
            Build your professional profile
          </h1>

          <p className="text-lg text-neutral-600">
            This helps make your references more meaningful
          </p>
        </div>

        <section className="mb-10">
          <h2 className="mb-6 text-2xl font-semibold">Basic Information</h2>

          <div className="space-y-6">
            <div>
              <label
                htmlFor="title"
                className="mb-2 block text-sm font-medium text-neutral-800"
              >
                Current role
              </label>

              <input
                id="title"
                type="text"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="e.g. Senior Product Designer"
                className="h-14 w-full rounded-xl border border-neutral-300 px-4 text-base outline-none transition focus:border-black"
              />
            </div>

            <div>
              <label
                htmlFor="company"
                className="mb-2 block text-sm font-medium text-neutral-800"
              >
                Company (optional)
              </label>

              <input
                id="company"
                type="text"
                value={company}
                onChange={(event) => setCompany(event.target.value)}
                placeholder="e.g. HRKey"
                className="h-14 w-full rounded-xl border border-neutral-300 px-4 text-base outline-none transition focus:border-black"
              />
            </div>
          </div>
        </section>

        <section className="mb-10">
          <h2 className="mb-6 text-2xl font-semibold">Experience</h2>

          <CVUploadZone onUpload={handleUpload} isParsing={isParsing} />

          {uploadedFile ? (
            <div className="mt-4 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
              {isParsing ? (
                <div>
                  <p>
                    Analyzing your CV: <strong>{uploadedFile.name}</strong>
                  </p>
                  <p className="mt-1 text-xs text-green-700/80">
                    We’re identifying your latest role and company.
                  </p>
                </div>
              ) : (
                <>CV selected: <strong>{uploadedFile.name}</strong></>
              )}
            </div>
          ) : null}

          {parsedCvImport ? (
            <div className="mt-4 rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-4">
              <p className="text-sm font-semibold text-neutral-900">Review your imported profile</p>
              <p className="mt-1 text-sm text-neutral-600">
                We detected the following from your CV. You can edit or remove anything before
                continuing.
              </p>

              <div className="mt-3 grid gap-2 text-sm text-neutral-700 md:grid-cols-2">
                {parsedCvImport.full_name ? (
                  <p>
                    <span className="font-medium text-neutral-900">Name:</span>{' '}
                    {parsedCvImport.full_name}
                  </p>
                ) : null}
                {parsedCvImport.location ? (
                  <p>
                    <span className="font-medium text-neutral-900">Location:</span>{' '}
                    {parsedCvImport.location}
                  </p>
                ) : null}
                <p>
                  <span className="font-medium text-neutral-900">Experiences:</span>{' '}
                  {parsedCvImport.experiences?.length || 0}
                </p>
                <p>
                  <span className="font-medium text-neutral-900">Education:</span>{' '}
                  {parsedCvImport.education?.length || 0}
                </p>
              </div>

              {parsedCvImport.skills?.length ? (
                <div className="mt-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
                    Skills
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {parsedCvImport.skills.map((skill) => (
                      <button
                        key={skill}
                        type="button"
                        onClick={() => removeSkill(skill)}
                        className="inline-flex items-center gap-1 rounded-full border border-neutral-300 bg-white px-2.5 py-1 text-xs text-neutral-700 transition hover:border-neutral-400"
                      >
                        <span>{skill}</span>
                        <span aria-hidden="true">×</span>
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}

              {parsedCvImport.experiences?.length ? (
                <div className="mt-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
                    Experience
                  </p>
                  <div className="mt-2 space-y-3">
                    {parsedCvImport.experiences.map((experience, index) => (
                      <div
                        key={`${experience.title || 'experience'}-${index}`}
                        className="rounded-lg border border-neutral-200 bg-white p-3"
                      >
                        <div className="grid gap-2 md:grid-cols-2">
                          <input
                            type="text"
                            value={experience.title || ''}
                            onChange={(event) =>
                              updateExperience(index, 'title', event.target.value)
                            }
                            placeholder="Role title"
                            className="h-10 rounded-lg border border-neutral-300 px-3 text-sm outline-none transition focus:border-black"
                          />
                          <input
                            type="text"
                            value={experience.company || ''}
                            onChange={(event) =>
                              updateExperience(index, 'company', event.target.value)
                            }
                            placeholder="Company"
                            className="h-10 rounded-lg border border-neutral-300 px-3 text-sm outline-none transition focus:border-black"
                          />
                        </div>
                        {experience.start_date || experience.end_date ? (
                          <p className="mt-2 text-xs text-neutral-500">
                            {experience.start_date || 'Start unknown'} —{' '}
                            {experience.end_date ||
                              (experience.is_current ? 'Present' : 'End unknown')}
                          </p>
                        ) : null}
                        {experience.summary ? (
                          <p className="mt-2 line-clamp-2 text-sm text-neutral-600">
                            {experience.summary}
                          </p>
                        ) : null}
                        <button
                          type="button"
                          onClick={() => removeExperience(index)}
                          className="mt-2 text-xs font-medium text-neutral-600 underline-offset-2 hover:text-black hover:underline"
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              {parsedCvImport.education?.length ? (
                <div className="mt-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
                    Education
                  </p>
                  <div className="mt-2 space-y-2">
                    {parsedCvImport.education.map((educationItem, index) => (
                      <div
                        key={`${educationItem.institution || 'education'}-${index}`}
                        className="rounded-lg border border-neutral-200 bg-white p-3 text-sm text-neutral-700"
                      >
                        <p className="font-medium text-neutral-900">
                          {educationItem.institution || 'Institution not provided'}
                        </p>
                        <p className="mt-1 text-neutral-600">
                          {[educationItem.degree, educationItem.field_of_study]
                            .filter(Boolean)
                            .join(' · ') || 'Degree details not provided'}
                        </p>
                        <button
                          type="button"
                          onClick={() => removeEducation(index)}
                          className="mt-2 text-xs font-medium text-neutral-600 underline-offset-2 hover:text-black hover:underline"
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                <button
                  type="button"
                  onClick={handleUseImportedProfile}
                  className="h-11 rounded-lg bg-black px-4 text-sm font-semibold text-white transition hover:opacity-90"
                >
                  Use imported profile
                </button>
                <button
                  type="button"
                  onClick={handleSkipImportedDetails}
                  className="h-11 rounded-lg border border-neutral-300 bg-white px-4 text-sm font-medium text-neutral-700 transition hover:border-neutral-400"
                >
                  Skip imported details
                </button>
              </div>

              <p className="mt-3 text-xs text-neutral-500">
                {hasReviewedImport
                  ? 'Your import preference has been applied. You can continue when ready.'
                  : 'Choose how you want to continue with these imported details.'}
              </p>
            </div>
          ) : null}

          <div className="my-8 flex items-center gap-4">
            <div className="h-px flex-1 bg-neutral-200" />
            <span className="text-sm text-neutral-500">or</span>
            <div className="h-px flex-1 bg-neutral-200" />
          </div>

          <button
            type="button"
            onClick={() => setManualMode(true)}
            className="h-14 w-full rounded-xl border border-neutral-300 bg-white text-base font-medium text-black transition hover:border-black"
          >
            Enter details manually
          </button>
        </section>

        {manualMode ? (
          <div className="mb-6 rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm text-neutral-600">
            Manual entry mode is active. You can continue even if CV parsing is unavailable.
          </div>
        ) : null}

        {errorMessage ? (
          <div className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {errorMessage}
          </div>
        ) : null}

        <div className="mt-auto border-t border-neutral-200 pt-6">
          <button
            type="button"
            onClick={handleContinue}
            disabled={!canSubmit || isParsing}
            className="h-14 w-full rounded-xl bg-black text-base font-semibold text-white transition disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSaving ? 'Saving...' : isParsing ? 'Parsing CV...' : 'Continue'}
          </button>

          <button
            type="button"
            onClick={handleSkip}
            className="mt-4 w-full text-center text-sm text-neutral-500 underline-offset-4 hover:underline"
          >
            Skip for now
          </button>
        </div>
      </div>
    </main>
  );
}
