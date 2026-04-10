"use client";

type PermissionStatus = "active" | "expired" | "revoked";

type PermissionStatusCardProps = {
  status: PermissionStatus;
  expiresAt?: string | null;
  permissions: string[];
  recruiterUserId: string;
};

const statusStyles: Record<PermissionStatus, string> = {
  active: "bg-emerald-50 text-emerald-700 border-emerald-200",
  expired: "bg-amber-50 text-amber-700 border-amber-200",
  revoked: "bg-rose-50 text-rose-700 border-rose-200",
};

const statusLabel: Record<PermissionStatus, string> = {
  active: "Active",
  expired: "Expired",
  revoked: "Revoked",
};

const permissionLabelMap: Record<string, string> = {
  read_references: "Lectura de referencias",
  generate_insight: "Generación de análisis",
};

export default function PermissionStatusCard({ status, expiresAt, permissions, recruiterUserId }: PermissionStatusCardProps) {
  const readablePermissions = permissions.map((permission) => permissionLabelMap[permission] || permission.replaceAll("_", " "));

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium text-slate-600">Reclutador: {recruiterUserId}</p>
        <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${statusStyles[status]}`}>{statusLabel[status]}</span>
      </div>
      <p className="mt-3 text-sm text-slate-700">
        Permiso {status === "active" ? "activo" : status === "expired" ? "vencido" : "revocado"}
        {expiresAt ? ` hasta: ${new Date(expiresAt).toLocaleDateString("es-ES", { day: "2-digit", month: "short", year: "numeric" })}` : ""}
      </p>
      <p className="mt-2 text-sm text-slate-700">Permisos otorgados: {readablePermissions.join(", ")}</p>
    </div>
  );
}
