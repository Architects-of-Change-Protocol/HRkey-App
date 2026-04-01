'use client';

import { useMemo, useState } from 'react';
import { createClient } from '@supabase/supabase-js';

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
}

function CVUploadZone({ onUpload }: CVUploadZoneProps) {
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
        accept=".pdf,.doc,.docx"
        onChange={handleFileSelect}
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

        <p className="mt-2 text-xs text-neutral-400">
          PDF, DOC, or DOCX (max 10MB)
        </p>
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

  const canSubmit = useMemo(() => {
    return title.trim().length > 0 && !isSaving;
  }, [title, isSaving]);

  function handleUpload(file: File) {
    setErrorMessage('');

    const allowedExtensions = ['pdf', 'doc', 'docx'];
    const extension = file.name.split('.').pop()?.toLowerCase() || '';

    if (!allowedExtensions.includes(extension)) {
      setErrorMessage('Please upload a PDF, DOC, or DOCX file.');
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      setErrorMessage('File must be 10MB or smaller.');
      return;
    }

    setUploadedFile(file);

    if (!manualMode) {
      setManualMode(true);
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

          <CVUploadZone onUpload={handleUpload} />

          {uploadedFile ? (
            <div className="mt-4 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
              CV selected: <strong>{uploadedFile.name}</strong>
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
            Manual entry mode is active. CV parsing can be connected next.
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
            disabled={!canSubmit}
            className="h-14 w-full rounded-xl bg-black text-base font-semibold text-white transition disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSaving ? 'Saving...' : 'Continue'}
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
