import { createClient } from '@supabase/supabase-js';
import { logEvent } from './analytics/eventTracker.js';
import {
  completeRlusdWithdrawalHold,
  getRlusdBalance,
  holdRlusdBalanceForWithdrawal,
  releaseRlusdWithdrawalHold
} from './rlusdLedger.service.js';
import { executeWithdrawalPayout } from './rlusdPayoutExecutor.service.js';
import { assertValidWithdrawalTransition, WITHDRAWAL_STATUSES } from './rlusdWithdrawal.stateMachine.js';
import {
  assertValidDecimalAmount,
  assertValidDestinationType,
  buildWithdrawalPayloadFingerprint,
  roundRlusd,
  sanitizeWithdrawalInput
} from './rlusdWithdrawal.utils.js';
import { withWithdrawalBalanceLock } from './rlusdWithdrawal.locking.js';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://example.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || 'test-service-role-key';
const RLUSD_WITHDRAWAL_FEE_FIXED = Number(process.env.RLUSD_WITHDRAWAL_FEE_FIXED || 0);
const RLUSD_WITHDRAWAL_FEE_RATIO = Number(process.env.RLUSD_WITHDRAWAL_FEE_RATIO || 0);
const RLUSD_MIN_WITHDRAWAL = Number(process.env.RLUSD_MIN_WITHDRAWAL || 5);

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
const nowIso = () => new Date().toISOString();

function withdrawalsFeatureEnabled() {
  return String(process.env.RLUSD_WITHDRAWALS_ENABLED || 'true').toLowerCase() !== 'false';
}

function sinpeRailFeatureEnabled() {
  return String(process.env.RLUSD_SINPE_MOBILE_ENABLED || 'true').toLowerCase() !== 'false';
}

function normalizeOptionalNote(value, { max = 500 } = {}) {
  if (value === undefined || value === null) return null;
  const normalized = String(value).trim();
  if (!normalized) return null;
  return normalized.slice(0, max);
}

function resolveDefaultPayoutRoute(destinationType) {
  if (destinationType === 'sinpe_mobile') {
    return { payoutRail: 'sinpe_mobile', payoutProvider: 'manual_sinpe_cr' };
  }
  return { payoutRail: null, payoutProvider: null };
}

function assertSinpeRailEnabled(destinationType) {
  if (destinationType !== 'sinpe_mobile') return;
  if (!sinpeRailFeatureEnabled()) {
    const error = new Error('SINPE Móvil withdrawals are currently disabled');
    error.status = 503;
    error.code = 'RLUSD_SINPE_MOBILE_DISABLED';
    throw error;
  }
}

function buildPayoutContext(request, action, extra = {}) {
  return {
    withdrawalRequestId: request.id,
    idempotencyKey: request.idempotency_key || null,
    action,
    destinationType: request.destination_type || null,
    normalizedDestination: request.destination_ref || null,
    payoutRail: request.payout_rail || null,
    payoutProvider: request.payout_provider || null,
    ...extra
  };
}

export function assertWithdrawalsFeatureEnabled() {
  if (!withdrawalsFeatureEnabled()) {
    const error = new Error('RLUSD withdrawals feature is currently disabled');
    error.status = 503;
    error.code = 'RLUSD_WITHDRAWALS_DISABLED';
    throw error;
  }
}

function assertMinWithdrawal(amount) {
  if (amount < RLUSD_MIN_WITHDRAWAL) {
    const error = new Error(`El monto mínimo para retirar es ${RLUSD_MIN_WITHDRAWAL} RLUSD`);
    error.status = 400;
    error.code = 'MIN_WITHDRAWAL_NOT_MET';
    error.minAmount = RLUSD_MIN_WITHDRAWAL;
    throw error;
  }
}

function buildQuote(amount) {
  const feeAmount = roundRlusd((amount * RLUSD_WITHDRAWAL_FEE_RATIO) + RLUSD_WITHDRAWAL_FEE_FIXED);
  const netAmount = roundRlusd(Math.max(0, amount - feeAmount));
  return { amount, feeAmount, netAmount };
}

async function getWithdrawalRequestByIdempotency({ userId, idempotencyKey }) {
  const { data, error } = await supabase
    .from('rlusd_withdrawal_requests')
    .select('*')
    .eq('user_id', userId)
    .eq('idempotency_key', idempotencyKey)
    .maybeSingle();

  if (error) throw error;
  return data;
}

async function getWithdrawalRequestForUser({ withdrawalRequestId, userId = null }) {
  let query = supabase
    .from('rlusd_withdrawal_requests')
    .select('*')
    .eq('id', withdrawalRequestId);

  if (userId) query = query.eq('user_id', userId);

  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  return data;
}

async function updateWithdrawalRequest({ withdrawalRequestId, updates }) {
  const { data, error } = await supabase
    .from('rlusd_withdrawal_requests')
    .update({ ...updates, updated_at: nowIso() })
    .eq('id', withdrawalRequestId)
    .select('*')
    .single();

  if (error) throw error;
  return data;
}

function assertSamePayloadFingerprint({ existingRequest, payloadFingerprint }) {
  if ((existingRequest.payload_fingerprint || null) !== payloadFingerprint) {
    const error = new Error('Idempotency key already used with different withdrawal payload');
    error.status = 409;
    error.code = 'IDEMPOTENCY_KEY_PAYLOAD_MISMATCH';
    throw error;
  }
}

export async function getWithdrawalQuote({ userId, amount }) {
  const safeAmount = assertValidDecimalAmount(roundRlusd(amount));
  assertMinWithdrawal(safeAmount);

  const balance = await getRlusdBalance(userId);
  if (balance.availableBalance < safeAmount) {
    const error = new Error('Saldo RLUSD insuficiente');
    error.status = 400;
    error.code = 'INSUFFICIENT_RLUSD_BALANCE';
    throw error;
  }

  const quote = buildQuote(safeAmount);

  await logEvent({
    userId,
    eventType: 'rlusd_withdrawal_quote_requested',
    context: { amount: quote.amount, feeAmount: quote.feeAmount, netAmount: quote.netAmount },
    source: 'backend'
  });

  return {
    ...quote,
    minWithdrawal: RLUSD_MIN_WITHDRAWAL,
    availableBalance: balance.availableBalance
  };
}

export async function createWithdrawalRequest({ userId, idempotencyKey, ...rawInput }) {
  assertWithdrawalsFeatureEnabled();

  const safeKey = String(idempotencyKey || '').trim();
  if (!safeKey) {
    const error = new Error('Idempotency-Key header is required');
    error.status = 400;
    error.code = 'IDEMPOTENCY_KEY_REQUIRED';
    throw error;
  }

  const sanitized = sanitizeWithdrawalInput(rawInput);
  assertValidDecimalAmount(sanitized.amount);
  assertMinWithdrawal(sanitized.amount);
  assertValidDestinationType(sanitized.destinationType);
  assertSinpeRailEnabled(sanitized.destinationType);

  const payloadFingerprint = buildWithdrawalPayloadFingerprint(sanitized);
  const payoutRoute = resolveDefaultPayoutRoute(sanitized.destinationType);

  return withWithdrawalBalanceLock({
    userId,
    handler: async () => {
      const existing = await getWithdrawalRequestByIdempotency({ userId, idempotencyKey: safeKey });
      if (existing) {
        assertSamePayloadFingerprint({ existingRequest: existing, payloadFingerprint });
        const balance = await getRlusdBalance(userId);
        return { request: existing, quote: buildQuote(Number(existing.amount)), balance, idempotentReplay: true };
      }

      const quote = await getWithdrawalQuote({ userId, amount: sanitized.amount });

      let request;
      try {
        const insertResult = await supabase
          .from('rlusd_withdrawal_requests')
          .insert([{
            user_id: userId,
            amount: quote.amount,
            fee_amount: quote.feeAmount,
            net_amount: quote.netAmount,
            status: WITHDRAWAL_STATUSES.PENDING_REVIEW,
            destination_type: sanitized.destinationType,
            destination_label: sanitized.destinationLabel,
            destination_ref: sanitized.destinationRef,
            payout_rail: payoutRoute.payoutRail,
            payout_provider: payoutRoute.payoutProvider,
            payout_destination_snapshot: sanitized.destinationRef ? JSON.stringify({ type: sanitized.destinationType, value: sanitized.destinationRef }) : null,
            reference_note: sanitized.referenceNote,
            idempotency_key: safeKey,
            payload_fingerprint: payloadFingerprint,
            created_at: nowIso(),
            updated_at: nowIso()
          }])
          .select('*')
          .single();

        if (insertResult.error) throw insertResult.error;
        request = insertResult.data;
      } catch (error) {
        if (String(error?.code) === '23505') {
          const conflictExisting = await getWithdrawalRequestByIdempotency({ userId, idempotencyKey: safeKey });
          if (!conflictExisting) throw error;
          assertSamePayloadFingerprint({ existingRequest: conflictExisting, payloadFingerprint });
          const balance = await getRlusdBalance(userId);
          return { request: conflictExisting, quote: buildQuote(Number(conflictExisting.amount)), balance, idempotentReplay: true };
        }
        throw error;
      }

      const holdResult = await holdRlusdBalanceForWithdrawal({ userId, amount: quote.amount, referenceId: request.id });

      await logEvent({
        userId,
        eventType: 'rlusd_withdrawal_requested',
        context: buildPayoutContext(request, 'create', {
          amount: quote.amount,
          feeAmount: quote.feeAmount,
          netAmount: quote.netAmount,
          idempotencyKey: safeKey
        }),
        source: 'backend'
      });

      return { request, quote, balance: holdResult.balance, idempotentReplay: false };
    }
  });
}

export async function listWithdrawalRequests({ userId, limit = 20 }) {
  const safeLimit = Math.max(1, Math.min(Number(limit) || 20, 100));

  const { data, error } = await supabase
    .from('rlusd_withdrawal_requests')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(safeLimit);

  if (error) throw error;
  return data || [];
}

export async function cancelWithdrawalRequest({ userId, withdrawalRequestId }) {
  assertWithdrawalsFeatureEnabled();

  return withWithdrawalBalanceLock({
    userId,
    handler: async () => {
      const current = await getWithdrawalRequestForUser({ withdrawalRequestId, userId });
      if (!current) {
        const error = new Error('Withdrawal request not found');
        error.status = 404;
        throw error;
      }

      if (current.status === WITHDRAWAL_STATUSES.CANCELLED) {
        const balance = await getRlusdBalance(userId);
        return { request: current, balance, alreadyCancelled: true };
      }

      assertValidWithdrawalTransition(current.status, WITHDRAWAL_STATUSES.CANCELLED);

      const released = await releaseRlusdWithdrawalHold({ userId: current.user_id, amount: Number(current.amount), referenceId: current.id });

      const request = await updateWithdrawalRequest({
        withdrawalRequestId,
        updates: {
          status: WITHDRAWAL_STATUSES.CANCELLED,
          failure_reason: null,
          completed_at: null,
          payout_status: 'cancelled',
          payout_status_detail: 'withdrawal_cancelled_by_user'
        }
      });

      await logEvent({
        userId,
        eventType: 'rlusd_withdrawal_cancelled',
        context: buildPayoutContext(request, 'cancel', {
          from: current.status,
          to: WITHDRAWAL_STATUSES.CANCELLED
        }),
        source: 'backend'
      });

      return { request, balance: released.balance, alreadyCancelled: false };
    }
  });
}

export async function markWithdrawalProcessing({ withdrawalRequestId, payoutRail = null, payoutProvider = null, operatorNote = null }) {
  assertWithdrawalsFeatureEnabled();

  const current = await getWithdrawalRequestForUser({ withdrawalRequestId });
  if (!current) {
    const error = new Error('Withdrawal request not found');
    error.status = 404;
    throw error;
  }

  if (current.status === WITHDRAWAL_STATUSES.PROCESSING) return { request: current, alreadyProcessing: true };

  assertValidWithdrawalTransition(current.status, WITHDRAWAL_STATUSES.PROCESSING);

  const route = {
    payoutRail: String(payoutRail || current.payout_rail || current.destination_type || '').trim().toLowerCase() || null,
    payoutProvider: String(payoutProvider || current.payout_provider || '').trim().toLowerCase() || null
  };

  if (route.payoutRail === 'sinpe') route.payoutRail = 'sinpe_mobile';
  if (route.payoutRail === 'sinpe_mobile' && !route.payoutProvider) route.payoutProvider = 'manual_sinpe_cr';

  assertSinpeRailEnabled(route.payoutRail);

  const requestInProcessing = await updateWithdrawalRequest({
    withdrawalRequestId,
    updates: {
      status: WITHDRAWAL_STATUSES.PROCESSING,
      payout_rail: route.payoutRail,
      payout_provider: route.payoutProvider,
      payout_status: 'processing',
      payout_status_detail: 'executor_started',
      payout_processed_at: nowIso(),
      payout_operator_note: normalizeOptionalNote(operatorNote, { max: 500 })
    }
  });

  const payoutResult = await executeWithdrawalPayout(requestInProcessing, route);
  const request = await updateWithdrawalRequest({
    withdrawalRequestId,
    updates: {
      payout_rail: payoutResult.rail || route.payoutRail,
      payout_provider: payoutResult.provider || route.payoutProvider,
      payout_reference: payoutResult.reference || null,
      payout_external_id: payoutResult.externalId || null,
      payout_status: payoutResult.status || 'processing',
      payout_status_detail: payoutResult.statusDetail || null,
      payout_processed_at: payoutResult.processedAt || nowIso(),
      payout_destination_snapshot: payoutResult.destinationSnapshot ? JSON.stringify(payoutResult.destinationSnapshot) : (requestInProcessing.payout_destination_snapshot || null)
    }
  });

  await logEvent({
    userId: current.user_id,
    eventType: 'rlusd_withdrawal_processing',
    context: buildPayoutContext(request, 'process', {
      from: current.status,
      to: WITHDRAWAL_STATUSES.PROCESSING,
      payoutStatus: request.payout_status,
      payoutStatusDetail: request.payout_status_detail
    }),
    source: 'backend'
  });

  return { request, alreadyProcessing: false };
}

export async function completeWithdrawalRequest({ withdrawalRequestId, payoutReference = null, externalId = null, operatorNote = null }) {
  assertWithdrawalsFeatureEnabled();

  const current = await getWithdrawalRequestForUser({ withdrawalRequestId });
  if (!current) {
    const error = new Error('Withdrawal request not found');
    error.status = 404;
    throw error;
  }

  return withWithdrawalBalanceLock({
    userId: current.user_id,
    handler: async () => {
      const refreshed = await getWithdrawalRequestForUser({ withdrawalRequestId });
      if (refreshed.status === WITHDRAWAL_STATUSES.COMPLETED) {
        const balance = await getRlusdBalance(refreshed.user_id);
        return { request: refreshed, balance, alreadyCompleted: true };
      }

      assertValidWithdrawalTransition(refreshed.status, WITHDRAWAL_STATUSES.COMPLETED);

      const completed = await completeRlusdWithdrawalHold({ userId: refreshed.user_id, amount: Number(refreshed.amount), referenceId: refreshed.id });

      const request = await updateWithdrawalRequest({
        withdrawalRequestId,
        updates: {
          status: WITHDRAWAL_STATUSES.COMPLETED,
          completed_at: nowIso(),
          failure_reason: null,
          payout_status: 'completed',
          payout_status_detail: 'manual_execution_confirmed',
          payout_completed_at: nowIso(),
          payout_failed_at: null,
          payout_reference: normalizeOptionalNote(payoutReference, { max: 180 }) || refreshed.payout_reference || null,
          payout_external_id: normalizeOptionalNote(externalId, { max: 180 }) || refreshed.payout_external_id || null,
          payout_operator_note: normalizeOptionalNote(operatorNote, { max: 500 }) || refreshed.payout_operator_note || null
        }
      });

      await logEvent({
        userId: refreshed.user_id,
        eventType: 'rlusd_withdrawal_completed',
        context: buildPayoutContext(request, 'complete', {
          from: refreshed.status,
          to: WITHDRAWAL_STATUSES.COMPLETED
        }),
        source: 'backend'
      });

      return { request, balance: completed.balance, alreadyCompleted: false };
    }
  });
}

export async function failWithdrawalRequest({ withdrawalRequestId, failureReason = null, operatorNote = null }) {
  assertWithdrawalsFeatureEnabled();

  const current = await getWithdrawalRequestForUser({ withdrawalRequestId });
  if (!current) {
    const error = new Error('Withdrawal request not found');
    error.status = 404;
    throw error;
  }

  return withWithdrawalBalanceLock({
    userId: current.user_id,
    handler: async () => {
      const refreshed = await getWithdrawalRequestForUser({ withdrawalRequestId });
      if (refreshed.status === WITHDRAWAL_STATUSES.FAILED) {
        const balance = await getRlusdBalance(refreshed.user_id);
        return { request: refreshed, balance, alreadyFailed: true };
      }

      assertValidWithdrawalTransition(refreshed.status, WITHDRAWAL_STATUSES.FAILED);

      const released = await releaseRlusdWithdrawalHold({ userId: refreshed.user_id, amount: Number(refreshed.amount), referenceId: refreshed.id });

      const request = await updateWithdrawalRequest({
        withdrawalRequestId,
        updates: {
          status: WITHDRAWAL_STATUSES.FAILED,
          failure_reason: (String(failureReason || '').trim() || 'Retiro fallido').slice(0, 300),
          completed_at: null,
          payout_status: 'failed',
          payout_status_detail: 'manual_execution_failed',
          payout_failed_at: nowIso(),
          payout_completed_at: null,
          payout_operator_note: normalizeOptionalNote(operatorNote, { max: 500 }) || refreshed.payout_operator_note || null
        }
      });

      await logEvent({
        userId: refreshed.user_id,
        eventType: 'rlusd_withdrawal_failed',
        context: buildPayoutContext(request, 'fail', {
          from: refreshed.status,
          to: WITHDRAWAL_STATUSES.FAILED
        }),
        source: 'backend'
      });

      return { request, balance: released.balance, alreadyFailed: false };
    }
  });
}

export default {
  getWithdrawalQuote,
  createWithdrawalRequest,
  listWithdrawalRequests,
  cancelWithdrawalRequest,
  markWithdrawalProcessing,
  completeWithdrawalRequest,
  failWithdrawalRequest,
  assertWithdrawalsFeatureEnabled
};
