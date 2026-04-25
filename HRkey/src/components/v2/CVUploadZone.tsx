"use client";

import { useRef, useState } from "react";

const ACCEPTED_EXTENSIONS = [".pdf", ".doc", ".docx"];
const ACCEPTED_MIME_TYPES = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];

type CVUploadZoneProps = {
  onFileAccepted?: (file: File | null) => void;
};

function isAllowedFile(file: File) {
  const extension = `.${file.name.split(".").pop()?.toLowerCase() || ""}`;
  return ACCEPTED_MIME_TYPES.includes(file.type) || ACCEPTED_EXTENSIONS.includes(extension);
}

export default function CVUploadZone({ onFileAccepted }: CVUploadZoneProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [error, setError] = useState("");

  const handleFileSelection = (file: File | null) => {
    if (!file) {
      setSelectedFile(null);
      setError("");
      onFileAccepted?.(null);
      return;
    }

    if (!isAllowedFile(file)) {
      setSelectedFile(null);
      setError("Invalid file type. Please upload a PDF, DOC, or DOCX file.");
      onFileAccepted?.(null);
      return;
    }

    setSelectedFile(file);
    setError("");
    onFileAccepted?.(file);
  };

  return (
    <div className="space-y-3">
      <div
        className="rounded-xl border border-dashed p-5"
        style={{ borderColor: "var(--border)", backgroundColor: "var(--teal-soft)" }}
      >
        <div className="space-y-2 text-sm text-slate-700">
          <p className="font-semibold text-slate-900">Upload your CV</p>
          <p>Supported formats: PDF, DOC, DOCX.</p>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="button"
            className="rounded-lg px-4 py-2 text-sm font-medium text-white transition"
            style={{ backgroundColor: "var(--teal-primary)" }}
            onClick={() => inputRef.current?.click()}
          >
            Select file
          </button>
          {selectedFile ? <p className="text-sm text-slate-700">Selected: {selectedFile.name}</p> : null}
        </div>
        <input
          ref={inputRef}
          type="file"
          className="hidden"
          accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          onChange={(event) => handleFileSelection(event.target.files?.[0] || null)}
        />
      </div>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      <p className="text-xs text-slate-500">TODO: Connect CV parser to auto-fill candidate profile fields.</p>
    </div>
  );
}
