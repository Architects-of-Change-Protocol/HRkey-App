"use client";

import type { CSSProperties } from "react";

type ManualEntryFormProps = {
  fullName: string;
  onFullNameChange: (value: string) => void;
  role: string;
  onRoleChange: (value: string) => void;
};

export default function ManualEntryForm({
  fullName,
  onFullNameChange,
  role,
  onRoleChange,
}: ManualEntryFormProps) {
  return (
    <div className="space-y-4 rounded-xl border p-4" style={{ borderColor: "var(--border)" }}>
      <h3 className="text-sm font-semibold text-slate-900">Manual profile entry</h3>
      <p className="text-sm text-slate-600">Enter your details manually if you prefer not to upload a CV.</p>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="text-sm text-slate-700">
          Full name
          <input
            value={fullName}
            onChange={(event) => onFullNameChange(event.target.value)}
            className="mt-1 w-full rounded-lg border px-3 py-2 outline-none transition focus:ring-2"
            style={{ borderColor: "var(--border)", "--tw-ring-color": "var(--teal-primary)" } as CSSProperties}
            placeholder="Alex Rivera"
          />
        </label>
        <label className="text-sm text-slate-700">
          Current role
          <input
            value={role}
            onChange={(event) => onRoleChange(event.target.value)}
            className="mt-1 w-full rounded-lg border px-3 py-2 outline-none transition focus:ring-2"
            style={{ borderColor: "var(--border)", "--tw-ring-color": "var(--teal-primary)" } as CSSProperties}
            placeholder="Product Manager"
          />
        </label>
      </div>

      <label className="block text-sm text-slate-700">
        Professional summary
        <textarea
          className="mt-1 min-h-[100px] w-full rounded-lg border px-3 py-2 outline-none transition focus:ring-2"
          style={{ borderColor: "var(--border)", "--tw-ring-color": "var(--teal-primary)" } as CSSProperties}
          placeholder="Briefly describe your background and goals."
        />
      </label>

      <p className="text-xs text-slate-500">Manual mode is currently a visual mock and not persisted yet.</p>
    </div>
  );
}
