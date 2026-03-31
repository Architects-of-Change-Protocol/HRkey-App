'use client';

import { useMemo, useState } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

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

export default function OnboardingPage() {
  const [title, setTitle] = useState('');
  const [company, setCompany] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const canSubmit = useMemo(() => title.trim().length > 0 && !isSaving, [title, isSaving]);

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

      if (userError || !user) {
        window.location.href = '/landing/auth.html';
        return;
      }

      const { error: upsertError } = await supabase.from('profiles').upsert({
        id: user.id,
        title: title.trim(),
        company: company.trim() || null,
      });

      if (upsertError) {
        throw upsertError;
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
          loginDate: existingUserData?.loginDate || new Date().toISOString(),
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
      <div className="mx-auto flex min-h-screen w-full max-w-3xl flex-col px-6 py-8 md:px-8">
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
                Company
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