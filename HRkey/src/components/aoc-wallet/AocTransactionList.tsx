import type { AocTransaction } from './types';

type Props = {
  userId: string;
  transactions: AocTransaction[];
};

const formatDate = (iso: string) => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return 'Fecha no disponible';
  return date.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' });
};

export default function AocTransactionList({ userId, transactions }: Props) {
  if (!transactions.length) {
    return (
      <div className="rounded-lg border bg-slate-50 p-4 text-sm text-slate-600">
        Todavía no tienes transacciones. Cuando autorices accesos pagados, verás tus ingresos aquí.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {transactions.map((tx) => {
        const incoming = tx.to_user_id === userId;
        const verb = incoming ? 'Recibiste' : 'Pagaste';

        return (
          <div key={tx.id} className="rounded-lg border bg-slate-50 p-4">
            <p className="text-sm text-slate-900">
              <span className="font-semibold">{verb} {Number(tx.amount || 0).toFixed(2)} AOCs</span>{' '}
              por acceso autorizado a tu perfil.
            </p>
            <p className="text-xs text-slate-600 mt-1">{formatDate(tx.created_at)}</p>
            {tx.reference_id ? (
              <p className="text-xs text-slate-500 mt-1">Referencia: {tx.reference_id}</p>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
