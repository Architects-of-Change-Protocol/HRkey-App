import { createClient } from '@supabase/supabase-js';
import { logEvent } from './analytics/eventTracker.js';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://example.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || 'test-service-role-key';
const PLATFORM_USER_ID = process.env.AOC_PLATFORM_USER_ID || 'hrkey_platform';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

const roundAoc = (value) => Math.round(Number(value || 0) * 100) / 100;
const roundRlusd = (value) => Math.round(Number(value || 0) * 1_000_000) / 1_000_000;

function nowIso() {
  return new Date().toISOString();
}

async function getAocBalance(userId) {
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

async function upsertAocBalance(userId, amount) {
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

async function getConversionRequestById({ conversionRequestId, userId = null }) {
  let query = supabase
    .from('aoc_conversion_requests')
    .select('*')
    .eq('id', conversionRequestId);

  if (userId) {
    query = query.eq('user_id', userId);
  }

  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  return data;
}

async function updateConversionRequest({ conversionRequestId, updates }) {
  const { data, error } = await supabase
    .from('aoc_conversion_requests')
    .update({
      ...updates,
      updated_at: nowIso()
    })
    .eq('id', conversionRequestId)
    .select('*')
    .single();

  if (error) throw error;
  return data;
}

export async function getRlusdBalance(userId) {
  const { data, error } = await supabase
    .from('rlusd_balances')
    .select('user_id, rlusd_balance, updated_at')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) throw error;

  if (!data) {
    return {
      user_id: userId,
      rlusd_balance: 0,
      updated_at: null
    };
  }

  return {
    ...data,
    rlusd_balance: Number(data.rlusd_balance || 0)
  };
}

async function upsertRlusdBalance(userId, amount) {
  const { data, error } = await supabase
    .from('rlusd_balances')
    .upsert([
      {
        user_id: userId,
        rlusd_balance: roundRlusd(amount),
        updated_at: nowIso()
      }
    ], { onConflict: 'user_id' })
    .select('user_id, rlusd_balance, updated_at')
    .single();

  if (error) throw error;
  return {
    ...data,
    rlusd_balance: Number(data.rlusd_balance || 0)
  };
}

export async function creditRlusdBalance({ userId, amount, type = 'adjustment', referenceId = null }) {
  const safeAmount = roundRlusd(amount);
  if (safeAmount <= 0) {
    const error = new Error('Invalid RLUSD credit amount');
    error.status = 400;
    error.code = 'INVALID_RLUSD_AMOUNT';
    throw error;
  }

  const current = await getRlusdBalance(userId);
  const balance = await upsertRlusdBalance(userId, Number(current.rlusd_balance) + safeAmount);

  const { data: transaction, error } = await supabase
    .from('rlusd_transactions')
    .insert([{
      user_id: userId,
      amount: safeAmount,
      direction: 'credit',
      type,
      reference_id: referenceId,
      created_at: nowIso()
    }])
    .select('*')
    .single();

  if (error) throw error;

  return {
    balance,
    transaction
  };
}

export async function debitRlusdBalance({ userId, amount, type = 'adjustment', referenceId = null }) {
  const safeAmount = roundRlusd(amount);
  if (safeAmount <= 0) {
    const error = new Error('Invalid RLUSD debit amount');
    error.status = 400;
    error.code = 'INVALID_RLUSD_AMOUNT';
    throw error;
  }

  const current = await getRlusdBalance(userId);
  if (Number(current.rlusd_balance) < safeAmount) {
    const error = new Error('Saldo RLUSD insuficiente');
    error.status = 400;
    error.code = 'INSUFFICIENT_RLUSD_BALANCE';
    throw error;
  }

  const balance = await upsertRlusdBalance(userId, Number(current.rlusd_balance) - safeAmount);

  const { data: transaction, error } = await supabase
    .from('rlusd_transactions')
    .insert([{
      user_id: userId,
      amount: safeAmount,
      direction: 'debit',
      type,
      reference_id: referenceId,
      created_at: nowIso()
    }])
    .select('*')
    .single();

  if (error) throw error;

  return {
    balance,
    transaction
  };
}

export async function listRlusdTransactions({ userId, limit = 20 }) {
  const safeLimit = Math.max(1, Math.min(Number(limit) || 20, 100));

  const { data, error } = await supabase
    .from('rlusd_transactions')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(safeLimit);

  if (error) throw error;
  return data || [];
}

async function refundAocForConversion({ request }) {
  const aocBalance = await getAocBalance(request.user_id);
  const updatedAocBalance = await upsertAocBalance(request.user_id, Number(aocBalance.aoc_balance) + Number(request.source_amount));

  await createAocTransaction({
    fromUserId: PLATFORM_USER_ID,
    toUserId: request.user_id,
    amount: Number(request.source_amount),
    type: 'conversion_refund',
    referenceId: request.id
  });

  return Number(updatedAocBalance.aoc_balance || 0);
}

export async function completeConversionRequest({ conversionRequestId }) {
  const current = await getConversionRequestById({ conversionRequestId });

  if (!current) {
    const error = new Error('Conversion request not found');
    error.status = 404;
    throw error;
  }

  if (current.status === 'completed') {
    return { request: current, alreadyCompleted: true };
  }

  if (!['pending', 'processing'].includes(current.status)) {
    const error = new Error('La solicitud no puede completarse en su estado actual');
    error.status = 409;
    error.code = 'INVALID_STATUS_TRANSITION';
    throw error;
  }

  if (current.status === 'pending') {
    await updateConversionRequest({
      conversionRequestId,
      updates: { status: 'processing' }
    });
  }

  const credited = await creditRlusdBalance({
    userId: current.user_id,
    amount: Number(current.net_target_amount),
    type: 'conversion_credit',
    referenceId: current.id
  });

  const completedRequest = await updateConversionRequest({
    conversionRequestId,
    updates: {
      status: 'completed',
      failure_reason: null,
      completed_at: nowIso()
    }
  });

  await logEvent({
    userId: current.user_id,
    eventType: 'rlusd_conversion_completed',
    context: {
      conversionRequestId: current.id,
      sourceAmount: Number(current.source_amount),
      netTargetAmount: Number(current.net_target_amount)
    },
    source: 'backend'
  });

  return {
    request: completedRequest,
    rlusdBalance: Number(credited.balance.rlusd_balance || 0),
    alreadyCompleted: false
  };
}

export async function failConversionRequest({ conversionRequestId, failureReason = null }) {
  const current = await getConversionRequestById({ conversionRequestId });

  if (!current) {
    const error = new Error('Conversion request not found');
    error.status = 404;
    throw error;
  }

  if (current.status === 'completed') {
    const error = new Error('Una solicitud completada no puede marcarse como fallida');
    error.status = 409;
    error.code = 'INVALID_STATUS_TRANSITION';
    throw error;
  }

  if (!['pending', 'processing'].includes(current.status)) {
    const error = new Error('La solicitud no puede marcarse como fallida en su estado actual');
    error.status = 409;
    error.code = 'INVALID_STATUS_TRANSITION';
    throw error;
  }

  const balanceAfterRefund = await refundAocForConversion({ request: current });

  const failedRequest = await updateConversionRequest({
    conversionRequestId,
    updates: {
      status: 'failed',
      failure_reason: failureReason || 'Conversión fallida',
      completed_at: null
    }
  });

  await logEvent({
    userId: current.user_id,
    eventType: 'rlusd_conversion_failed',
    context: {
      conversionRequestId: current.id,
      sourceAmount: Number(current.source_amount),
      reason: failureReason || 'Conversión fallida'
    },
    source: 'backend'
  });

  return {
    request: failedRequest,
    balanceAfterRefund
  };
}

export async function cancelConversionRequest({ userId, conversionRequestId }) {
  const current = await getConversionRequestById({ conversionRequestId, userId });

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

  const balanceAfterRefund = await refundAocForConversion({ request: current });

  const cancelledRequest = await updateConversionRequest({
    conversionRequestId,
    updates: {
      status: 'cancelled',
      failure_reason: null,
      completed_at: null
    }
  });

  await logEvent({
    userId: current.user_id,
    eventType: 'rlusd_conversion_cancelled',
    context: {
      conversionRequestId: current.id,
      sourceAmount: Number(current.source_amount)
    },
    source: 'backend'
  });

  return {
    request: cancelledRequest,
    balanceAfterRefund
  };
}

export default {
  getRlusdBalance,
  creditRlusdBalance,
  debitRlusdBalance,
  listRlusdTransactions,
  completeConversionRequest,
  failConversionRequest,
  cancelConversionRequest
};
