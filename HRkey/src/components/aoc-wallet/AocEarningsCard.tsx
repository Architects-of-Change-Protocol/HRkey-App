import type { AocEarningsSummary } from './types';

type Props = {
  summary: AocEarningsSummary | null;
};

const format = (value: number) => `${Number(value || 0).toFixed(2)} AOCs`;

export default function AocEarningsCard({ summary }: Props) {
  const safe = summary || {
    periodDays: 30,
    totalEarnedRecent: 0,
    paidAccessCount: 0,
    averagePerAccess: 0,
    totalEarnedHistorical: 0,
    incomingTransactionCount: 0,
  };

  return (
    <div className="rounded-lg border bg-slate-50 p-4 shadow-sm space-y-3">
      <div>
        <p className="text-sm text-slate-600">Ingresos recientes ({safe.periodDays} días)</p>
        <p className="text-2xl font-semibold text-slate-900">{format(safe.totalEarnedRecent)}</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
        <div>
          <p className="text-slate-500">Accesos pagados</p>
          <p className="font-semibold text-slate-900">{safe.paidAccessCount}</p>
        </div>
        <div>
          <p className="text-slate-500">Promedio por acceso</p>
          <p className="font-semibold text-slate-900">{format(safe.averagePerAccess)}</p>
        </div>
        <div>
          <p className="text-slate-500">Ingresos históricos</p>
          <p className="font-semibold text-slate-900">{format(safe.totalEarnedHistorical)}</p>
        </div>
      </div>

      <p className="text-xs text-slate-600">
        Ganaste AOCs cuando autorizaste accesos a tu perfil.
      </p>
    </div>
  );
}
