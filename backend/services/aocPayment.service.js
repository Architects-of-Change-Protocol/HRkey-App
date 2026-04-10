import { createClient } from '@supabase/supabase-js';
import logger from '../logger.js';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://example.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || 'test-service-role-key';

const PLATFORM_USER_ID = process.env.AOC_PLATFORM_USER_ID || 'hrkey_platform';
const BASE_ACCESS_PRICE_AOC = Number(process.env.AOC_ACCESS_PRICE_BASE || 10);
const PLATFORM_FEE_RATIO = Number(process.env.AOC_PLATFORM_FEE_RATIO || 0.2);

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

function nowIso() {
  return new Date().toISOString();
}

function roundAmount(value) {
  return Math.round(Number(value) * 100) / 100;
}

async function fetchBalanceRow(userId) {
  const { data, error } = await supabase
    .from('user_balances')
    .select('user_id, aoc_balance, updated_at')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) throw error;
  return data || null;
}

async function upsertBalance(userId, amount) {
  const { data, error } = await supabase
    .from('user_balances')
    .upsert([
      {
        user_id: userId,
        aoc_balance: roundAmount(amount),
        updated_at: nowIso()
      }
    ], { onConflict: 'user_id' })
    .select('user_id, aoc_balance, updated_at')
    .single();

  if (error) throw error;
  return data;
}

export async function getAccessPrice(_candidateId) {
  return { amount: BASE_ACCESS_PRICE_AOC, currency: 'AOC' };
}

export async function getUserBalance(userId) {
  if (!userId) {
    const error = new Error('User ID is required');
    error.status = 400;
    throw error;
  }

  const row = await fetchBalanceRow(userId);
  return {
    user_id: userId,
    aoc_balance: Number(row?.aoc_balance || 0),
    updated_at: row?.updated_at || null
  };
}

export async function topupBalance({ userId, amount }) {
  if (!userId) {
    const error = new Error('User ID is required');
    error.status = 400;
    throw error;
  }

  const numericAmount = Number(amount);
  if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
    const error = new Error('Topup amount must be a positive number');
    error.status = 400;
    throw error;
  }

  const current = await getUserBalance(userId);
  const updated = await upsertBalance(userId, current.aoc_balance + numericAmount);
  return { ...updated, aoc_balance: Number(updated.aoc_balance) };
}

export async function listUserTransactions(userId, { limit = 25 } = {}) {
  if (!userId) {
    const error = new Error('User ID is required');
    error.status = 400;
    throw error;
  }

  const safeLimit = Math.max(1, Math.min(Number(limit) || 25, 100));
  const { data, error } = await supabase
    .from('aoc_transactions')
    .select('id, from_user_id, to_user_id, amount, type, reference_id, created_at')
    .or(`from_user_id.eq.${userId},to_user_id.eq.${userId}`)
    .order('created_at', { ascending: false })
    .limit(safeLimit);

  if (error) throw error;
  return (data || []).map((row) => ({
    ...row,
    amount: Number(row.amount || 0)
  }));
}

export async function getUserEarningsSummary(userId, { days = 30 } = {}) {
  const transactions = await listUserTransactions(userId, { limit: 200 });
  const lookbackDays = Math.max(1, Math.min(Number(days) || 30, 365));
  const lookbackStartMs = Date.now() - lookbackDays * 24 * 60 * 60 * 1000;

  const incoming = transactions.filter((tx) => tx.to_user_id === userId);
  const recentIncoming = incoming.filter((tx) => {
    const createdAtMs = tx.created_at ? new Date(tx.created_at).getTime() : 0;
    return Number.isFinite(createdAtMs) && createdAtMs >= lookbackStartMs;
  });

  const totalEarnedRecent = recentIncoming.reduce((acc, tx) => acc + Number(tx.amount || 0), 0);
  const paidAccessCount = recentIncoming.filter((tx) => tx.type === 'access_payment').length;

  return {
    periodDays: lookbackDays,
    totalEarnedRecent: roundAmount(totalEarnedRecent),
    paidAccessCount,
    averagePerAccess: paidAccessCount > 0 ? roundAmount(totalEarnedRecent / paidAccessCount) : 0,
    totalEarnedHistorical: roundAmount(incoming.reduce((acc, tx) => acc + Number(tx.amount || 0), 0)),
    incomingTransactionCount: incoming.length
  };
}

async function createTransaction({ fromUserId, toUserId, amount, referenceId }) {
  const { data, error } = await supabase
    .from('aoc_transactions')
    .insert([{
      from_user_id: fromUserId,
      to_user_id: toUserId,
      amount: roundAmount(amount),
      type: 'access_payment',
      reference_id: referenceId,
      created_at: nowIso()
    }])
    .select('*')
    .single();

  if (error) throw error;
  return data;
}

export async function processAccessPayment({ recruiterUserId, candidateUserId, referenceId }) {
  const price = await getAccessPrice(candidateUserId);

  logger.info('AOC payment intent', {
    recruiterUserId,
    candidateUserId,
    referenceId,
    amount: price.amount,
    type: 'access_payment'
  });

  const recruiterBalance = await getUserBalance(recruiterUserId);
  if (recruiterBalance.aoc_balance < price.amount) {
    const error = new Error('Necesitas AOCs para acceder a este perfil');
    error.status = 402;
    error.code = 'PAYMENT_REQUIRED';
    error.reason_code = 'PAYMENT_REQUIRED';
    throw error;
  }

  const platformFee = roundAmount(price.amount * PLATFORM_FEE_RATIO);
  const candidateAmount = roundAmount(price.amount - platformFee);

  const candidateBalance = await getUserBalance(candidateUserId);
  const platformBalance = await getUserBalance(PLATFORM_USER_ID);

  const recruiterAfter = await upsertBalance(recruiterUserId, recruiterBalance.aoc_balance - price.amount);
  const candidateAfter = await upsertBalance(candidateUserId, candidateBalance.aoc_balance + candidateAmount);
  const platformAfter = await upsertBalance(PLATFORM_USER_ID, platformBalance.aoc_balance + platformFee);

  const candidateTx = await createTransaction({
    fromUserId: recruiterUserId,
    toUserId: candidateUserId,
    amount: candidateAmount,
    referenceId
  });

  const platformTx = await createTransaction({
    fromUserId: recruiterUserId,
    toUserId: PLATFORM_USER_ID,
    amount: platformFee,
    referenceId
  });

  logger.info('AOC payment success', {
    recruiterUserId,
    candidateUserId,
    referenceId,
    amount: price.amount,
    recruiterBalanceAfter: Number(recruiterAfter.aoc_balance)
  });

  logger.info('AOC payment distribution', {
    candidateAmount,
    platformFee,
    candidateTxId: candidateTx.id,
    platformTxId: platformTx.id,
    candidateBalanceAfter: Number(candidateAfter.aoc_balance),
    platformBalanceAfter: Number(platformAfter.aoc_balance)
  });

  return {
    price,
    distribution: {
      candidateAmount,
      platformFee
    },
    transactions: [candidateTx, platformTx],
    balances: {
      recruiter: Number(recruiterAfter.aoc_balance),
      candidate: Number(candidateAfter.aoc_balance),
      platform: Number(platformAfter.aoc_balance)
    }
  };
}

export default {
  getAccessPrice,
  getUserBalance,
  topupBalance,
  listUserTransactions,
  getUserEarningsSummary,
  processAccessPayment
};
