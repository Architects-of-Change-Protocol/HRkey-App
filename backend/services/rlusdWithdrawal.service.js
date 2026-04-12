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

  const payloadFingerprint = buildWithdrawalPayloadFingerprint(sanitized);

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
        context: {
          withdrawalRequestId: request.id,
          idempotencyKey: safeKey,
          amount: quote.amount,
          feeAmount: quote.feeAmount,
          netAmount: quote.netAmount,
          destinationType: sanitized.destinationType
        },
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
        updates: { status: WITHDRAWAL_STATUSES.CANCELLED, failure_reason: null, completed_at: null }
      });

      await logEvent({
        userId,
        eventType: 'rlusd_withdrawal_cancelled',
        context: { withdrawalRequestId: current.id, idempotencyKey: current.idempotency_key || null, action: 'cancel', from: current.status, to: WITHDRAWAL_STATUSES.CANCELLED },
        source: 'backend'
      });

      return { request, balance: released.balance, alreadyCancelled: false };
    }
  });
}

export async function markWithdrawalProcessing({ withdrawalRequestId }) {
  assertWithdrawalsFeatureEnabled();

  const current = await getWithdrawalRequestForUser({ withdrawalRequestId });
  if (!current) {
    const error = new Error('Withdrawal request not found');
    error.status = 404;
    throw error;
  }

  if (current.status === WITHDRAWAL_STATUSES.PROCESSING) return { request: current, alreadyProcessing: true };

  assertValidWithdrawalTransition(current.status, WITHDRAWAL_STATUSES.PROCESSING);

  const request = await updateWithdrawalRequest({ withdrawalRequestId, updates: { status: WITHDRAWAL_STATUSES.PROCESSING } });

  await logEvent({
    userId: current.user_id,
    eventType: 'rlusd_withdrawal_processing',
    context: { withdrawalRequestId: current.id, idempotencyKey: current.idempotency_key || null, action: 'process', from: current.status, to: WITHDRAWAL_STATUSES.PROCESSING },
    source: 'backend'
  });

  return { request, alreadyProcessing: false };
}

export async function completeWithdrawalRequest({ withdrawalRequestId }) {
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

      const payoutResult = await executeWithdrawalPayout(refreshed);
      if (!payoutResult?.ok) {
        const error = new Error('Payout execution failed');
        error.status = 502;
        error.code = 'PAYOUT_EXECUTION_FAILED';
        throw error;
      }

      const completed = await completeRlusdWithdrawalHold({ userId: refreshed.user_id, amount: Number(refreshed.amount), referenceId: refreshed.id });

      const request = await updateWithdrawalRequest({
        withdrawalRequestId,
        updates: {
          status: WITHDRAWAL_STATUSES.COMPLETED,
          completed_at: nowIso(),
          failure_reason: null,
          reference_note: refreshed.reference_note || payoutResult.externalReference || null
        }
      });

      await logEvent({
        userId: refreshed.user_id,
        eventType: 'rlusd_withdrawal_completed',
        context: { withdrawalRequestId: refreshed.id, idempotencyKey: refreshed.idempotency_key || null, action: 'complete', from: refreshed.status, to: WITHDRAWAL_STATUSES.COMPLETED },
        source: 'backend'
      });

      return { request, balance: completed.balance, alreadyCompleted: false };
    }
  });
}

export async function failWithdrawalRequest({ withdrawalRequestId, failureReason = null }) {
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
          completed_at: null
        }
      });

      await logEvent({
        userId: refreshed.user_id,
        eventType: 'rlusd_withdrawal_failed',
        context: { withdrawalRequestId: refreshed.id, idempotencyKey: refreshed.idempotency_key || null, action: 'fail', from: refreshed.status, to: WITHDRAWAL_STATUSES.FAILED },
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
