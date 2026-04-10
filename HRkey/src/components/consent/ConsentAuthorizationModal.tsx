"use client";

import { useMemo, useState } from "react";

type ConsentAuthorizationModalProps = {
  isOpen: boolean;
  recruiterName: string;
  companyName: string;
  dataTypes: string[];
  permissions: string[];
  duration: string;
  candidateName: string;
  profileSummary?: string | null;
  estimatedCostAOC?: number | null;
  onClose: () => void;
  onReject: () => void;
  onAuthorize: () => Promise<void>;
};

const permissionLabelMap: Record<string, string> = {
  read_references: "Lectura de referencias",
  generate_insight: "Generación de análisis",
};

export default function ConsentAuthorizationModal({
  isOpen,
  recruiterName,
  companyName,
  dataTypes,
  permissions,
  duration,
  candidateName,
  profileSummary,
  estimatedCostAOC,
  onClose,
  onReject,
  onAuthorize,
}: ConsentAuthorizationModalProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const permissionLabels = useMemo(
    () => permissions.map((permission) => permissionLabelMap[permission] || permission.replaceAll("_", " ")),
    [permissions]
  );

  if (!isOpen) return null;

  const handleAuthorize = async () => {
    try {
      setIsSubmitting(true);
      await onAuthorize();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4">
      <div className="w-full max-w-2xl rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-wide text-indigo-600">Confirmación de autorización</p>
            <h2 className="text-xl font-semibold text-slate-900">Estás autorizando acceso a tu información</h2>
            <p className="mt-1 text-sm text-slate-600">{candidateName}, revisa los detalles antes de continuar.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-slate-200 px-2 py-1 text-sm text-slate-500 hover:bg-slate-50"
            aria-label="Cerrar"
          >
            ✕
          </button>
        </div>

        {profileSummary ? (
          <div className="mb-4 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
            {profileSummary}
          </div>
        ) : null}

        <div className="space-y-3 rounded-xl border border-slate-200 p-4">
          <p className="text-sm text-slate-900">
            ✔ <span className="font-semibold">Quién:</span> {recruiterName} — {companyName}
          </p>
          <div className="text-sm text-slate-900">
            <span className="font-semibold">✔ Qué:</span>
            <ul className="ml-5 mt-1 list-disc text-slate-700">
              {dataTypes.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
          <div className="text-sm text-slate-900">
            <span className="font-semibold">✔ Permisos:</span>
            <ul className="ml-5 mt-1 list-disc text-slate-700">
              {permissionLabels.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
          <p className="text-sm text-slate-900">
            ✔ <span className="font-semibold">Duración:</span> {duration}
          </p>
          <p className="text-sm text-slate-900">
            ✔ <span className="font-semibold">Costo estimado:</span>{" "}
            {typeof estimatedCostAOC === "number" ? `${estimatedCostAOC} AOCs` : "Próximamente"}
          </p>
        </div>

        <p className="mt-4 rounded-lg border border-emerald-100 bg-emerald-50 p-3 text-sm text-emerald-800">
          Este permiso será verificable y controlado por AOC. Podrás revocarlo en cualquier momento.
        </p>

        {isSubmitting ? (
          <p className="mt-4 text-sm font-medium text-indigo-700">Creando permiso verificable…</p>
        ) : null}

        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={onReject}
            disabled={isSubmitting}
            className="rounded-lg border border-rose-200 px-4 py-2 text-sm font-medium text-rose-700 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Rechazar
          </button>
          <button
            type="button"
            onClick={handleAuthorize}
            disabled={isSubmitting}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Autorizar
          </button>
        </div>
      </div>
    </div>
  );
}
