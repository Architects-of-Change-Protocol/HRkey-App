import { createClient } from '@supabase/supabase-js';
import { logEvent } from './analytics/eventTracker.js';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://example.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || 'test-service-role-key';
const PLATFORM_USER_ID = process.env.AOC_PLATFORM_USER_ID || 'hrkey_platform';

const AOC_RLUSD_RATE = Number(process.env.AOC_RLUSD_RATE || 0.1);
const RLUSD_CONVERSION_FEE_RATIO = Number(process.env.RLUSD_CONVERSION_FEE_RATIO || 0.03);
const RLUSD_MIN_CONVERSION_AOC = Number(process.env.RLUSD_MIN_CONVERSION_AOC || 1);
const RLUSD_QUOTE_TTL_SECONDS = Number(process.env.RLUSD_QUOTE_TTL_SECONDS || 300);

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

const roundAoc = (value) => Math.round(Number(value) * 100) / 100;
const roundRlusd = (value) => Math.round(Number(value) * 1_000_000) / 1_000_000;

function nowIso() {
  return new Date().toISOString();
}

function validatePositiveSourceAmount(sourceAmount) {
  const numericSourceAmount = Number(sourceAmount);

  if (!Number.isFinite(numericSourceAmount) || numericSourceAmount <= 0) {
    const error = new Error('Monto inválido. Debe ser mayor que 0.');
    error.status = 400;
    error.code = 'INVALID_SOURCE_AMOUNT';
    throw error;
  }

  if (numericSourceAmount < RLUSD_MIN_CONVERSION_AOC) {
    const error = new Error(`El monto mínimo para convertir es ${RLUSD_MIN_CONVERSION_AOC} AOCs`);
    error.status = 400;
    error.code = 'MIN_CONVERSION_NOT_MET';
    error.minAmount = RLUSD_MIN_CONVERSION_AOC;
    throw error;
  }

  return roundAoc(numericSourceAmount);
}

async function getUserBalance(userId) {
  const { data, error } = await supabase
    .from('user_balances')
    .select('user_id, aoc_balance, updated_at')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) throw error;

  return {
    user_id: userId,
    aoc_balance: Number(data?.aoc_balance || 0),
    updated_at: data?.updated_at || null
  };
}

async function upsertBalance(userId, amount) {
  const { data, error } = await supabase
    .from('user_balances')
    .upsert([
      {
        user_id: userId,
        aoc_balance: roundAoc(amount),
        updated_at: nowIso()
      }
    ], { onConflict: 'user_id' })
    .select('user_id, aoc_balance, updated_at')
    .single();

  if (error) throw error;
  return data;
}

function buildQuote(sourceAmount) {
  const quotedTargetAmount = roundRlusd(sourceAmount * AOC_RLUSD_RATE);
  const platformFeeAmount = roundRlusd(quotedTargetAmount * RLUSD_CONVERSION_FEE_RATIO);
  const netTargetAmount = roundRlusd(Math.max(0, quotedTargetAmount - platformFeeAmount));
  const quoteExpiresAt = new Date(Date.now() + RLUSD_QUOTE_TTL_SECONDS * 1000).toISOString();

  return {
    sourceCurrency: 'AOC',
    targetCurrency: 'RLUSD',
    sourceAmount,
    quotedRate: AOC_RLUSD_RATE,
    quotedTargetAmount,
    platformFeeAmount,
    netTargetAmount,
    quoteExpiresAt
  };
}

export async function getRlusdQuote({ userId, sourceAmount }) {
  const parsedSourceAmount = validatePositiveSourceAmount(sourceAmount);
  const quote = buildQuote(parsedSourceAmount);

  await logEvent({
    userId,
    eventType: 'rlusd_quote_requested',
    context: {
      sourceAmount: quote.sourceAmount,
      quotedRate: quote.quotedRate,
      netTargetAmount: quote.netTargetAmount
    },
    source: 'backend'
  });

  return quote;
}

async function createAocTransaction({ fromUserId, toUserId, amount, type, referenceId }) {
  const { data, error } = await supabase
    .from('aoc_transactions')
    .insert([{
      from_user_id: fromUserId,
      to_user_id: toUserId,
      amount: roundAoc(amount),
      type,
      reference_id: referenceId,
      created_at: nowIso()
    }])
    .select('*')
    .single();

  if (error) throw error;
  return data;
}

export async function createConversionRequest({ userId, sourceAmount, referenceNote = null, walletDestination = null }) {
  const parsedSourceAmount = validatePositiveSourceAmount(sourceAmount);
  const balance = await getUserBalance(userId);

  if (balance.aoc_balance < parsedSourceAmount) {
    const error = new Error('No tienes balance suficiente para convertir este monto.');
    error.status = 400;
    error.code = 'INSUFFICIENT_AOC_BALANCE';
    throw error;
  }

  const quote = buildQuote(parsedSourceAmount);

  await logEvent({
    userId,
    eventType: 'rlusd_conversion_requested',
    context: {
      sourceAmount: quote.sourceAmount,
      netTargetAmount: quote.netTargetAmount
    },
    source: 'backend'
  });

  const debitedBalance = await upsertBalance(userId, balance.aoc_balance - parsedSourceAmount);

  const { data: request, error: requestError } = await supabase
    .from('aoc_conversion_requests')
    .insert([{
      user_id: userId,
      source_currency: 'AOC',
      target_currency: 'RLUSD',
      source_amount: quote.sourceAmount,
      quoted_rate: quote.quotedRate,
      quoted_target_amount: quote.quotedTargetAmount,
      platform_fee_amount: quote.platformFeeAmount,
      net_target_amount: quote.netTargetAmount,
      status: 'pending',
      reference_note: referenceNote,
      quote_expires_at: quote.quoteExpiresAt,
      wallet_destination: walletDestination,
      created_at: nowIso(),
      updated_at: nowIso()
    }])
    .select('*')
    .single();

  if (requestError) {
    await upsertBalance(userId, balance.aoc_balance);

    await logEvent({
      userId,
      eventType: 'rlusd_conversion_failed',
      context: {
        sourceAmount: quote.sourceAmount,
        reason: requestError.message
      },
      source: 'backend'
    });

    throw requestError;
  }

  await createAocTransaction({
    fromUserId: userId,
    toUserId: PLATFORM_USER_ID,
    amount: parsedSourceAmount,
    type: 'conversion_out',
    referenceId: request.id
  });

  await logEvent({
    userId,
    eventType: 'rlusd_conversion_confirmed',
    context: {
      conversionRequestId: request.id,
      sourceAmount: quote.sourceAmount,
      netTargetAmount: quote.netTargetAmount
    },
    source: 'backend'
  });

  return {
    request,
    quote,
    balanceAfterDebit: Number(debitedBalance.aoc_balance)
  };
}

export async function listConversionRequests({ userId, limit = 20 }) {
  const safeLimit = Math.max(1, Math.min(Number(limit) || 20, 100));

  const { data, error } = await supabase
    .from('aoc_conversion_requests')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(safeLimit);

  if (error) throw error;
  return data || [];
}

export async function getConversionRequestById({ userId, conversionRequestId }) {
  const { data, error } = await supabase
    .from('aoc_conversion_requests')
    .select('*')
    .eq('id', conversionRequestId)
    .eq('user_id', userId)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function processPendingConversionRequest({ conversionRequestId, status = 'completed', failureReason = null }) {
  const isCompleted = status === 'completed';
  const { data, error } = await supabase
    .from('aoc_conversion_requests')
    .update({
      status,
      failure_reason: failureReason,
      completed_at: isCompleted ? nowIso() : null,
      updated_at: nowIso()
    })
    .eq('id', conversionRequestId)
    .select('*')
    .single();

  if (error) throw error;
  return data;
}

export async function cancelConversionRequest({ userId, conversionRequestId }) {
  const current = await getConversionRequestById({ userId, conversionRequestId });
  if (!current) {
    const error = new Error('Conversion request not found');
    error.status = 404;
    throw error;
  }

  if (current.status !== 'pending') {
    const error = new Error('Solo puedes cancelar solicitudes pendientes');
    error.status = 409;
    error.code = 'INVALID_STATUS_TRANSITION';
    throw error;
  }

  const balance = await getUserBalance(userId);
  await upsertBalance(userId, balance.aoc_balance + Number(current.source_amount));

  return processPendingConversionRequest({
    conversionRequestId,
    status: 'cancelled',
    failureReason: null
  });
}

export default {
  getRlusdQuote,
  createConversionRequest,
  listConversionRequests,
  getConversionRequestById,
  processPendingConversionRequest,
  cancelConversionRequest
};
