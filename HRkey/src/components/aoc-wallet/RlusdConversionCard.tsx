import { useMemo, useState } from 'react';
import { ApiClientError, apiGet, apiPost } from '@/lib/apiClient';
import type { AocConversionRequest, RlusdQuote, RlusdTransaction } from './types';

type Props = {
  aocBalance: number;
  rlusdBalance: number;
  requests: AocConversionRequest[];
  rlusdTransactions: RlusdTransaction[];
  onRequestCreated: (payload: { request: AocConversionRequest; balanceAfterDebit: number }) => void;
  onRequestCancelled: (payload: { request: AocConversionRequest; balanceAfterRefund: number }) => void;
  onIntent: () => void;
  onQuoteRequested: () => void;
  onConversionRequested: () => void;
  onConversionFailed: () => void;
  onRlusdBalanceViewed: () => void;
};

const formatDate = (isoDate: string) =>
  new Date(isoDate).toLocaleString('es-ES', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

const statusClassName: Record<string, string> = {
  pending: 'bg-amber-50 text-amber-700 border-amber-200',
  processing: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  completed: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  failed: 'bg-red-50 text-red-700 border-red-200',
  cancelled: 'bg-slate-100 text-slate-700 border-slate-300',
  quoted: 'bg-slate-100 text-slate-700 border-slate-300',
};

const toFixed = (value: number, decimals = 2) => Number(value || 0).toFixed(decimals);

export default function RlusdConversionCard({
  aocBalance,
  rlusdBalance,
  requests,
  rlusdTransactions,
  onRequestCreated,
  onRequestCancelled,
  onIntent,
  onQuoteRequested,
  onConversionRequested,
  onConversionFailed,
  onRlusdBalanceViewed,
}: Props) {
  const [sourceAmount, setSourceAmount] = useState('');
  const [quote, setQuote] = useState<RlusdQuote | null>(null);
  const [loadingQuote, setLoadingQuote] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const numericAmount = useMemo(() => Number(sourceAmount), [sourceAmount]);

  const fetchQuote = async () => {
    onIntent();
    onQuoteRequested();
    setError(null);
    setSuccess(null);

    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      setError('Ingresa un monto mayor que 0 para convertir.');
      return;
    }

    setLoadingQuote(true);
    try {
      const response = await apiPost<{ ok: boolean; quote: RlusdQuote }>(
        '/api/aoc/convert/quote',
        { sourceAmount: numericAmount }
      );
      setQuote(response.quote);
    } catch (err) {
      onConversionFailed();
      const fallbackMessage =
        err instanceof ApiClientError ? err.message : 'No pudimos calcular el quote en este momento.';
      setError(fallbackMessage);
      setQuote(null);
    } finally {
      setLoadingQuote(false);
    }
  };

  const confirmConversion = async () => {
    if (!quote) return;

    setConfirming(true);
    setError(null);
    setSuccess(null);
    onConversionRequested();

    try {
      const response = await apiPost<{
        ok: boolean;
        conversionRequest: AocConversionRequest;
        balanceAfterDebit: number;
      }>('/api/aoc/convert/requests', {
        sourceAmount: quote.sourceAmount,
      });

      onRequestCreated({
        request: response.conversionRequest,
        balanceAfterDebit: Number(response.balanceAfterDebit || 0),
      });
      setSuccess('Solicitud enviada. Tu conversión quedó en estado pendiente.');
      setSourceAmount('');
      setQuote(null);
    } catch (err) {
      onConversionFailed();
      const apiMessage = err instanceof ApiClientError ? err.message : null;
      if (apiMessage?.includes('INSUFFICIENT_AOC_BALANCE')) {
        setError('No tienes AOCs suficientes para confirmar esta conversión.');
      } else {
        setError(apiMessage || 'No pudimos confirmar la conversión.');
      }
    } finally {
      setConfirming(false);
    }
  };

  const refreshHistory = async () => {
    try {
      const response = await apiGet<{ ok: boolean; requests: AocConversionRequest[] }>(
        '/api/aoc/convert/requests'
      );
      if (response.requests?.[0]) {
          onRequestCreated({
            request: response.requests[0],
            balanceAfterDebit: aocBalance,
          });
        }
    } catch (_error) {
      // Silent fallback by design.
    }
  };

  const cancelRequest = async (requestId: string) => {
    setCancellingId(requestId);
    setError(null);
    setSuccess(null);

    try {
      const response = await apiPost<{
        ok: boolean;
        request: AocConversionRequest;
        balanceAfterRefund: number;
      }>(`/api/aoc/convert/requests/${requestId}/cancel`, {});

      onRequestCancelled({
        request: response.request,
        balanceAfterRefund: Number(response.balanceAfterRefund || 0)
      });
      setSuccess('Solicitud cancelada. Tus AOCs fueron restaurados.');
    } catch (err) {
      const fallbackMessage =
        err instanceof ApiClientError ? err.message : 'No pudimos cancelar la solicitud.';
      setError(fallbackMessage);
    } finally {
      setCancellingId(null);
    }
  };

  return (
    <div className="rounded-lg border border-indigo-200 bg-indigo-50/50 p-4 shadow-sm space-y-4">
      <div className="rounded-lg border border-emerald-200 bg-white p-3 space-y-2">
        <h3 className="text-base font-semibold text-slate-900">Balance RLUSD</h3>
        <p className="text-xl font-bold text-emerald-700">{toFixed(rlusdBalance, 6)} RLUSD</p>
        <p className="text-xs text-slate-600">
          Este balance representa conversiones completadas dentro del sistema.
        </p>
        <button type="button" onClick={onRlusdBalanceViewed} className="text-xs text-emerald-700 underline">
          Actualizar saldo RLUSD
        </button>
      </div>

      <div>
        <h3 className="text-base font-semibold text-slate-900">Convertir AOC a RLUSD</h3>
        <p className="text-sm text-slate-700">
          Esta conversión todavía se procesa dentro del sistema.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <label className="text-sm text-slate-700 md:col-span-2">
          Monto AOC
          <input
            value={sourceAmount}
            onChange={(event) => setSourceAmount(event.target.value)}
            className="mt-1 w-full rounded-lg border border-indigo-200 bg-white px-3 py-2"
            type="number"
            min="0"
            step="0.01"
            placeholder="Ej. 100"
          />
        </label>
        <button
          type="button"
          onClick={fetchQuote}
          disabled={loadingQuote}
          className="self-end rounded-lg border border-indigo-300 bg-white px-3 py-2 text-sm font-medium text-indigo-700 disabled:opacity-60"
        >
          {loadingQuote ? 'Calculando...' : 'Obtener quote'}
        </button>
      </div>

      {quote && (
        <div className="rounded-lg border border-indigo-200 bg-white p-3 space-y-2 text-sm text-slate-700">
          <div className="flex justify-between"><span>Monto</span><span>{toFixed(quote.sourceAmount)} AOC</span></div>
          <div className="flex justify-between"><span>Tasa estimada</span><span>{quote.quotedRate} RLUSD / AOC</span></div>
          <div className="flex justify-between"><span>Comisión</span><span>{toFixed(quote.platformFeeAmount, 6)} RLUSD</span></div>
          <div className="flex justify-between font-semibold text-slate-900"><span>Recibirás</span><span>{toFixed(quote.netTargetAmount, 6)} RLUSD</span></div>
          <button
            type="button"
            onClick={confirmConversion}
            disabled={confirming}
            className="mt-2 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
          >
            {confirming ? 'Confirmando...' : 'Confirmar conversión'}
          </button>
        </div>
      )}

      <div className="text-xs text-slate-600">Balance actual: {toFixed(aocBalance)} AOCs.</div>
      {error ? <p className="text-sm text-red-700">{error}</p> : null}
      {success ? <p className="text-sm text-emerald-700">{success}</p> : null}

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-semibold text-slate-900">Historial de conversiones</h4>
          <button
            type="button"
            onClick={refreshHistory}
            className="text-xs text-indigo-700 underline"
          >
            Actualizar
          </button>
        </div>
        {requests.length === 0 ? (
          <p className="text-sm text-slate-600">Todavía no tienes solicitudes de conversión.</p>
        ) : (
          <ul className="space-y-2">
            {requests.map((request) => (
              <li key={request.id} className="rounded-lg border border-indigo-100 bg-white p-3 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <span>{formatDate(request.created_at)}</span>
                  <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${statusClassName[request.status] || statusClassName.pending}`}>
                    {request.status}
                  </span>
                </div>
                <div className="mt-1 text-slate-700">
                  {toFixed(Number(request.source_amount))} AOC → {toFixed(Number(request.net_target_amount), 6)} RLUSD
                </div>
                {request.status === 'completed' ? (
                  <p className="mt-1 text-xs text-emerald-700">Conversión completada y acreditado a tu saldo RLUSD.</p>
                ) : null}
                {request.status === 'failed' && request.failure_reason ? (
                  <p className="mt-1 text-xs text-red-700">Falló: {request.failure_reason}</p>
                ) : null}
                {request.status === 'pending' ? (
                  <button
                    type="button"
                    onClick={() => cancelRequest(request.id)}
                    disabled={cancellingId === request.id}
                    className="mt-2 rounded-lg border border-red-200 bg-red-50 px-2 py-1 text-xs font-medium text-red-700 disabled:opacity-60"
                  >
                    {cancellingId === request.id ? 'Cancelando...' : 'Cancelar solicitud'}
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="space-y-2">
        <h4 className="text-sm font-semibold text-slate-900">Movimientos RLUSD</h4>
        {rlusdTransactions.length === 0 ? (
          <p className="text-sm text-slate-600">Todavía no tienes movimientos RLUSD.</p>
        ) : (
          <ul className="space-y-2">
            {rlusdTransactions.map((tx) => (
              <li key={tx.id} className="rounded-lg border border-emerald-100 bg-white p-3 text-sm">
                <p className="text-slate-800">
                  {tx.direction === 'credit' ? 'Recibiste' : 'Se debitó'} {toFixed(Number(tx.amount), 6)} RLUSD
                  {tx.type === 'conversion_credit' ? ' por conversión' : ''}.
                </p>
                <p className="text-xs text-slate-600">{formatDate(tx.created_at)}</p>
                {tx.reference_id ? <p className="text-xs text-slate-600">Referencia: {tx.reference_id}</p> : null}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
        <strong>Retiros próximamente disponibles.</strong> Estamos preparando el flujo de retiro real para una próxima versión.
      </div>
    </div>
  );
}
