import { useMemo, useState } from 'react';
import { ApiClientError, apiGet, apiPost } from '@/lib/apiClient';
import type {
  AocConversionRequest,
  RlusdQuote,
  RlusdTransaction,
  RlusdWithdrawalQuote,
  RlusdWithdrawalRequest
} from './types';

type Props = {
  aocBalance: number;
  rlusdAvailableBalance: number;
  rlusdReservedBalance: number;
  requests: AocConversionRequest[];
  withdrawalRequests: RlusdWithdrawalRequest[];
  rlusdTransactions: RlusdTransaction[];
  onRequestCreated: (payload: { request: AocConversionRequest; balanceAfterDebit: number }) => void;
  onRequestCancelled: (payload: { request: AocConversionRequest; balanceAfterRefund: number }) => void;
  onWithdrawalCreated: (payload: { request: RlusdWithdrawalRequest; availableBalance: number; reservedBalance: number }) => void;
  onWithdrawalCancelled: (payload: { request: RlusdWithdrawalRequest; availableBalance: number; reservedBalance: number }) => void;
  onIntent: () => void;
  onQuoteRequested: () => void;
  onConversionRequested: () => void;
  onConversionFailed: () => void;
  onRlusdBalanceViewed: () => void;
  onWithdrawalQuoteRequested: () => void;
  onWithdrawalRequested: () => void;
  onWithdrawalFailed: () => void;
  onWithdrawalCancelledEvent: () => void;
};

const formatDate = (isoDate: string) => new Date(isoDate).toLocaleString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const toFixed = (value: number, decimals = 2) => Number(value || 0).toFixed(decimals);

const statusClassName: Record<string, string> = {
  pending: 'bg-amber-50 text-amber-700 border-amber-200',
  pending_review: 'bg-amber-50 text-amber-700 border-amber-200',
  processing: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  completed: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  failed: 'bg-red-50 text-red-700 border-red-200',
  cancelled: 'bg-slate-100 text-slate-700 border-slate-300',
  requested: 'bg-slate-100 text-slate-700 border-slate-300',
  quoted: 'bg-slate-100 text-slate-700 border-slate-300',
};

export default function RlusdConversionCard(props: Props) {
  const {
    aocBalance, rlusdAvailableBalance, rlusdReservedBalance, requests, withdrawalRequests, rlusdTransactions,
    onRequestCreated, onRequestCancelled, onWithdrawalCreated, onWithdrawalCancelled,
    onIntent, onQuoteRequested, onConversionRequested, onConversionFailed, onRlusdBalanceViewed,
    onWithdrawalQuoteRequested, onWithdrawalRequested, onWithdrawalFailed, onWithdrawalCancelledEvent
  } = props;

  const [sourceAmount, setSourceAmount] = useState('');
  const [quote, setQuote] = useState<RlusdQuote | null>(null);
  const [loadingQuote, setLoadingQuote] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  const [withdrawalAmount, setWithdrawalAmount] = useState('');
  const [withdrawalDestinationType, setWithdrawalDestinationType] = useState<'wallet' | 'bank' | 'sinpe' | 'other'>('wallet');
  const [withdrawalDestinationRef, setWithdrawalDestinationRef] = useState('');
  const [withdrawalQuote, setWithdrawalQuote] = useState<RlusdWithdrawalQuote | null>(null);
  const [loadingWithdrawalQuote, setLoadingWithdrawalQuote] = useState(false);
  const [requestingWithdrawal, setRequestingWithdrawal] = useState(false);
  const [cancellingWithdrawalId, setCancellingWithdrawalId] = useState<string | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const numericAmount = useMemo(() => Number(sourceAmount), [sourceAmount]);
  const numericWithdrawalAmount = useMemo(() => Number(withdrawalAmount), [withdrawalAmount]);

  const fetchQuote = async () => {
    onIntent(); onQuoteRequested();
    setError(null); setSuccess(null);
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) return setError('Ingresa un monto mayor que 0 para convertir.');
    setLoadingQuote(true);
    try {
      const response = await apiPost<{ ok: boolean; quote: RlusdQuote }>('/api/aoc/convert/quote', { sourceAmount: numericAmount });
      setQuote(response.quote);
    } catch (err) {
      onConversionFailed();
      setError(err instanceof ApiClientError ? err.message : 'No pudimos calcular el quote en este momento.');
      setQuote(null);
    } finally { setLoadingQuote(false); }
  };

  const confirmConversion = async () => {
    if (!quote) return;
    setConfirming(true); setError(null); setSuccess(null); onConversionRequested();
    try {
      const response = await apiPost<{ ok: boolean; conversionRequest: AocConversionRequest; balanceAfterDebit: number }>('/api/aoc/convert/requests', { sourceAmount: quote.sourceAmount });
      onRequestCreated({ request: response.conversionRequest, balanceAfterDebit: Number(response.balanceAfterDebit || 0) });
      setSuccess('Solicitud enviada. Tu conversión quedó en estado pendiente.');
      setSourceAmount(''); setQuote(null);
    } catch (err) {
      onConversionFailed();
      const apiMessage = err instanceof ApiClientError ? err.message : null;
      setError(apiMessage?.includes('INSUFFICIENT_AOC_BALANCE') ? 'No tienes AOCs suficientes para confirmar esta conversión.' : (apiMessage || 'No pudimos confirmar la conversión.'));
    } finally { setConfirming(false); }
  };

  const fetchWithdrawalQuote = async () => {
    onWithdrawalQuoteRequested();
    setError(null); setSuccess(null);
    if (!Number.isFinite(numericWithdrawalAmount) || numericWithdrawalAmount <= 0) return setError('Ingresa un monto mayor que 0 para retirar.');
    setLoadingWithdrawalQuote(true);
    try {
      const response = await apiPost<{ ok: boolean; quote: RlusdWithdrawalQuote }>('/api/rlusd/withdrawals/quote', { amount: numericWithdrawalAmount });
      setWithdrawalQuote(response.quote);
    } catch (err) {
      onWithdrawalFailed();
      setError(err instanceof ApiClientError ? err.message : 'No pudimos calcular el quote de retiro.');
      setWithdrawalQuote(null);
    } finally { setLoadingWithdrawalQuote(false); }
  };

  const requestWithdrawal = async () => {
    if (!withdrawalQuote) return;
    setError(null); setSuccess(null); setRequestingWithdrawal(true); onWithdrawalRequested();
    try {
      const response = await apiPost<{ ok: boolean; withdrawalRequest: RlusdWithdrawalRequest; balance: { availableBalance: number; reservedBalance: number } }>('/api/rlusd/withdrawals', {
        amount: withdrawalQuote.amount,
        destinationType: withdrawalDestinationType,
        destinationRef: withdrawalDestinationRef || null
      });
      onWithdrawalCreated({
        request: response.withdrawalRequest,
        availableBalance: Number(response.balance?.availableBalance || 0),
        reservedBalance: Number(response.balance?.reservedBalance || 0),
      });
      setSuccess('Solicitud de retiro enviada. Quedó en revisión.');
      setWithdrawalAmount(''); setWithdrawalDestinationRef(''); setWithdrawalQuote(null);
    } catch (err) {
      onWithdrawalFailed();
      setError(err instanceof ApiClientError ? err.message : 'No pudimos crear la solicitud de retiro.');
    } finally { setRequestingWithdrawal(false); }
  };

  const cancelRequest = async (requestId: string) => {
    setCancellingId(requestId); setError(null); setSuccess(null);
    try {
      const response = await apiPost<{ ok: boolean; request: AocConversionRequest; balanceAfterRefund: number }>(`/api/aoc/convert/requests/${requestId}/cancel`, {});
      onRequestCancelled({ request: response.request, balanceAfterRefund: Number(response.balanceAfterRefund || 0) });
      setSuccess('Solicitud cancelada. Tus AOCs fueron restaurados.');
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'No pudimos cancelar la solicitud.');
    } finally { setCancellingId(null); }
  };

  const cancelWithdrawalRequest = async (requestId: string) => {
    setCancellingWithdrawalId(requestId); setError(null); setSuccess(null);
    try {
      const response = await apiPost<{ ok: boolean; request: RlusdWithdrawalRequest; balance: { availableBalance: number; reservedBalance: number } }>(`/api/rlusd/withdrawals/${requestId}/cancel`, {});
      onWithdrawalCancelled({
        request: response.request,
        availableBalance: Number(response.balance?.availableBalance || 0),
        reservedBalance: Number(response.balance?.reservedBalance || 0),
      });
      onWithdrawalCancelledEvent();
      setSuccess('Solicitud de retiro cancelada. Tu saldo reservado fue liberado.');
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'No pudimos cancelar el retiro.');
    } finally { setCancellingWithdrawalId(null); }
  };

  return <div className="rounded-lg border border-indigo-200 bg-indigo-50/50 p-4 shadow-sm space-y-4">
    <div className="rounded-lg border border-emerald-200 bg-white p-3 space-y-2">
      <h3 className="text-base font-semibold text-slate-900">Balance RLUSD</h3>
      <p className="text-lg font-bold text-emerald-700">Disponible: {toFixed(rlusdAvailableBalance, 6)} RLUSD</p>
      <p className="text-sm text-amber-700">Reservado: {toFixed(rlusdReservedBalance, 6)} RLUSD</p>
      <p className="text-xs text-slate-600">Los retiros reales se conectarán en una próxima versión. Por ahora, esta solicitud se procesa dentro del sistema.</p>
      <button type="button" onClick={onRlusdBalanceViewed} className="text-xs text-emerald-700 underline">Actualizar saldo RLUSD</button>
    </div>

    <div><h3 className="text-base font-semibold text-slate-900">Convertir AOC a RLUSD</h3></div>
    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
      <label className="text-sm text-slate-700 md:col-span-2">Monto AOC
        <input value={sourceAmount} onChange={(event) => setSourceAmount(event.target.value)} className="mt-1 w-full rounded-lg border border-indigo-200 bg-white px-3 py-2" type="number" min="0" step="0.01" placeholder="Ej. 100" />
      </label>
      <button type="button" onClick={fetchQuote} disabled={loadingQuote} className="self-end rounded-lg border border-indigo-300 bg-white px-3 py-2 text-sm font-medium text-indigo-700 disabled:opacity-60">{loadingQuote ? 'Calculando...' : 'Obtener quote'}</button>
    </div>
    {quote && <div className="rounded-lg border border-indigo-200 bg-white p-3 space-y-2 text-sm text-slate-700">
      <div className="flex justify-between"><span>Monto</span><span>{toFixed(quote.sourceAmount)} AOC</span></div>
      <div className="flex justify-between"><span>Comisión</span><span>{toFixed(quote.platformFeeAmount, 6)} RLUSD</span></div>
      <div className="flex justify-between font-semibold text-slate-900"><span>Recibirás</span><span>{toFixed(quote.netTargetAmount, 6)} RLUSD</span></div>
      <button type="button" onClick={confirmConversion} disabled={confirming} className="mt-2 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-60">{confirming ? 'Confirmando...' : 'Confirmar conversión'}</button>
    </div>}

    <div className="rounded-lg border border-violet-200 bg-white p-3 space-y-3">
      <h3 className="text-base font-semibold text-slate-900">Solicitar retiro RLUSD</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <label className="text-sm text-slate-700">Monto RLUSD
          <input value={withdrawalAmount} onChange={(event) => setWithdrawalAmount(event.target.value)} className="mt-1 w-full rounded-lg border border-violet-200 px-3 py-2" type="number" min="0" step="0.000001" placeholder="Ej. 10" />
        </label>
        <label className="text-sm text-slate-700">Destino
          <select value={withdrawalDestinationType} onChange={(e) => setWithdrawalDestinationType(e.target.value as any)} className="mt-1 w-full rounded-lg border border-violet-200 px-3 py-2">
            <option value="wallet">wallet</option><option value="bank">bank</option><option value="sinpe">sinpe</option><option value="other">other</option>
          </select>
        </label>
      </div>
      <label className="text-sm text-slate-700">Referencia de destino
        <input value={withdrawalDestinationRef} onChange={(event) => setWithdrawalDestinationRef(event.target.value)} className="mt-1 w-full rounded-lg border border-violet-200 px-3 py-2" placeholder="Cuenta, wallet o referencia" />
      </label>
      <button type="button" onClick={fetchWithdrawalQuote} disabled={loadingWithdrawalQuote} className="rounded-lg border border-violet-300 bg-white px-3 py-2 text-sm font-medium text-violet-700 disabled:opacity-60">{loadingWithdrawalQuote ? 'Calculando...' : 'Obtener quote'}</button>
      {withdrawalQuote && <div className="rounded-lg border border-violet-200 bg-violet-50 p-3 text-sm space-y-1">
        <div className="flex justify-between"><span>Monto</span><span>{toFixed(withdrawalQuote.amount, 6)} RLUSD</span></div>
        <div className="flex justify-between"><span>Comisión</span><span>{toFixed(withdrawalQuote.feeAmount, 6)} RLUSD</span></div>
        <div className="flex justify-between font-semibold"><span>Recibirás</span><span>{toFixed(withdrawalQuote.netAmount, 6)} RLUSD</span></div>
        <button type="button" onClick={requestWithdrawal} disabled={requestingWithdrawal} className="mt-2 rounded-lg bg-violet-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-60">{requestingWithdrawal ? 'Enviando...' : 'Solicitar retiro'}</button>
      </div>}
    </div>

    <div className="text-xs text-slate-600">Balance actual: {toFixed(aocBalance)} AOCs.</div>
    {error ? <p className="text-sm text-red-700">{error}</p> : null}
    {success ? <p className="text-sm text-emerald-700">{success}</p> : null}

    <div className="space-y-2">
      <h4 className="text-sm font-semibold text-slate-900">Historial de retiros</h4>
      {withdrawalRequests.length === 0 ? <p className="text-sm text-slate-600">Todavía no tienes solicitudes de retiro.</p> : <ul className="space-y-2">{withdrawalRequests.map((request) => <li key={request.id} className="rounded-lg border border-violet-100 bg-white p-3 text-sm">
        <div className="flex items-center justify-between gap-2"><span>{formatDate(request.created_at)}</span><span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${statusClassName[request.status] || statusClassName.pending}`}>{request.status}</span></div>
        <div className="mt-1 text-slate-700">{toFixed(Number(request.amount), 6)} RLUSD • Comisión {toFixed(Number(request.fee_amount), 6)} • Recibirás {toFixed(Number(request.net_amount), 6)}</div>
        <div className="mt-1 text-xs text-slate-600">Destino: {request.destination_type}{request.destination_ref ? ` - ${request.destination_ref}` : ''}</div>
        {request.failure_reason ? <p className="mt-1 text-xs text-red-700">Falló: {request.failure_reason}</p> : null}
        {['requested', 'pending_review'].includes(request.status) ? <button type="button" onClick={() => cancelWithdrawalRequest(request.id)} disabled={cancellingWithdrawalId === request.id} className="mt-2 rounded-lg border border-red-200 bg-red-50 px-2 py-1 text-xs font-medium text-red-700 disabled:opacity-60">{cancellingWithdrawalId === request.id ? 'Cancelando...' : 'Cancelar solicitud'}</button> : null}
      </li>)}</ul>}
    </div>

    <div className="space-y-2">
      <h4 className="text-sm font-semibold text-slate-900">Movimientos RLUSD</h4>
      {rlusdTransactions.length === 0 ? <p className="text-sm text-slate-600">Todavía no tienes movimientos RLUSD.</p> : <ul className="space-y-2">{rlusdTransactions.map((tx) => <li key={tx.id} className="rounded-lg border border-emerald-100 bg-white p-3 text-sm">
        <p className="text-slate-800">{tx.direction === 'credit' ? 'Recibiste' : 'Se debitó'} {toFixed(Number(tx.amount), 6)} RLUSD {tx.type === 'conversion_credit' ? 'por conversión' : tx.type === 'withdrawal_hold' ? 'reservado para retiro' : tx.type === 'withdrawal_release' ? 'liberado por cancelación/fallo' : tx.type === 'withdrawal_complete' ? 'retirado en completado' : ''}.</p>
        <p className="text-xs text-slate-600">{formatDate(tx.created_at)}</p>
      </li>)}</ul>}
    </div>
  </div>;
}
