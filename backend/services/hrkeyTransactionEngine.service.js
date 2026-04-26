import { createClient } from '@supabase/supabase-js';
import logger from '../logger.js';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://example.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || 'test-service-role-key';

const PLATFORM_USER_ID = process.env.HRKEY_PLATFORM_USER_ID || 'hrkey_platform';
const DEFAULT_CURRENCY = 'HRKCR';
const DEFAULT_PRICE = Number(process.env.HRKEY_DEFAULT_REFERENCE_PRICE || 50);
const DEFAULT_REFEREE_SHARE_RATIO = Number(process.env.HRKEY_REFEREE_SHARE_RATIO || 0.8);

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

function nowIso() {
  return new Date().toISOString();
}

function roundAmount(value) {
  return Math.round(Number(value) * 100) / 100;
}

function validatePositiveAmount(amount, fieldName = 'amount') {
  const numericAmount = Number(amount);
  if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
    const error = new Error(`${fieldName} must be a positive number`);
    error.status = 400;
    throw error;
  }
  return roundAmount(numericAmount);
}

export function computeRevenueSplit(totalAmount, refereeShareRatio = DEFAULT_REFEREE_SHARE_RATIO) {
  const amount = validatePositiveAmount(totalAmount, 'totalAmount');
  const safeRatio = Math.max(0, Math.min(Number(refereeShareRatio), 1));
  const refereeAmount = roundAmount(amount * safeRatio);
  const hrkeyAmount = roundAmount(amount - refereeAmount);

  return {
    totalAmount: amount,
    refereeShareRatio: safeRatio,
    refereeAmount,
    hrkeyAmount
  };
}

async function fetchWallet(userId) {
  const { data, error } = await supabase
    .from('hrkey_wallets')
    .select('user_id, balance, currency, updated_at')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) throw error;
  return data || null;
}

async function upsertWalletBalance(userId, balanceDelta, { currency = DEFAULT_CURRENCY } = {}) {
  const current = await getWalletBalance(userId);
  const nextBalance = roundAmount(current.balance + balanceDelta);

  if (nextBalance < 0) {
    const error = new Error('Insufficient wallet balance');
    error.status = 402;
    error.code = 'INSUFFICIENT_FUNDS';
    throw error;
  }

  const { data, error } = await supabase
    .from('hrkey_wallets')
    .upsert([
      {
        user_id: userId,
        balance: nextBalance,
        currency: current.currency || currency,
        updated_at: nowIso()
      }
    ], { onConflict: 'user_id' })
    .select('user_id, balance, currency, updated_at')
    .single();

  if (error) throw error;
  return {
    ...data,
    balance: Number(data.balance)
  };
}

async function writeLedgerEntry({
  userId,
  amount,
  entryType,
  direction,
  purchaseId = null,
  metadata = {}
}) {
  const { data, error } = await supabase
    .from('hrkey_credit_ledger')
    .insert([
      {
        user_id: userId,
        amount: roundAmount(amount),
        entry_type: entryType,
        direction,
        purchase_id: purchaseId,
        metadata,
        created_at: nowIso()
      }
    ])
    .select('*')
    .single();

  if (error) throw error;
  return data;
}

export async function getWalletBalance(userId) {
  if (!userId) {
    const error = new Error('userId is required');
    error.status = 400;
    throw error;
  }

  const wallet = await fetchWallet(userId);
  return {
    user_id: userId,
    balance: Number(wallet?.balance || 0),
    currency: wallet?.currency || DEFAULT_CURRENCY,
    updated_at: wallet?.updated_at || null
  };
}

export async function topupWalletMock({ userId, amount, source = 'mock_topup' }) {
  const normalizedAmount = validatePositiveAmount(amount);
  const wallet = await upsertWalletBalance(userId, normalizedAmount);

  await writeLedgerEntry({
    userId,
    amount: normalizedAmount,
    entryType: 'topup',
    direction: 'credit',
    metadata: { source, mock: true }
  });

  return wallet;
}

async function ensurePurchaseAccess(purchaseId, companyId, refereeUserId, referencePackageUrl) {
  const { data, error } = await supabase
    .from('hrkey_purchase_access')
    .upsert([
      {
        purchase_id: purchaseId,
        company_id: companyId,
        referee_user_id: refereeUserId,
        reference_package_url: referencePackageUrl,
        unlock_status: 'unlocked',
        unlocked_at: nowIso(),
        created_at: nowIso()
      }
    ], { onConflict: 'purchase_id' })
    .select('*')
    .single();

  if (error) throw error;
  return data;
}

export async function createPurchase({
  buyerUserId,
  companyId,
  refereeUserId,
  productCode = 'reference_pack',
  amount = DEFAULT_PRICE,
  refereeShareRatio = DEFAULT_REFEREE_SHARE_RATIO,
  referencePackageUrl
}) {
  const split = computeRevenueSplit(amount, refereeShareRatio);
  const buyerWallet = await getWalletBalance(buyerUserId);

  if (buyerWallet.balance < split.totalAmount) {
    const error = new Error('Insufficient credits to complete purchase');
    error.status = 402;
    error.code = 'INSUFFICIENT_FUNDS';
    throw error;
  }

  const { data: purchase, error: purchaseError } = await supabase
    .from('hrkey_purchases')
    .insert([
      {
        buyer_user_id: buyerUserId,
        company_id: companyId,
        referee_user_id: refereeUserId,
        product_code: productCode,
        amount_total: split.totalAmount,
        referee_share_amount: split.refereeAmount,
        hrkey_share_amount: split.hrkeyAmount,
        referee_share_ratio: split.refereeShareRatio,
        status: 'completed',
        created_at: nowIso(),
        updated_at: nowIso()
      }
    ])
    .select('*')
    .single();

  if (purchaseError) throw purchaseError;

  await upsertWalletBalance(buyerUserId, -split.totalAmount);
  await upsertWalletBalance(refereeUserId, split.refereeAmount);
  await upsertWalletBalance(PLATFORM_USER_ID, split.hrkeyAmount);

  await Promise.all([
    writeLedgerEntry({
      userId: buyerUserId,
      amount: split.totalAmount,
      entryType: 'purchase',
      direction: 'debit',
      purchaseId: purchase.id,
      metadata: { companyId, refereeUserId, productCode }
    }),
    writeLedgerEntry({
      userId: refereeUserId,
      amount: split.refereeAmount,
      entryType: 'revenue_share_referee',
      direction: 'credit',
      purchaseId: purchase.id,
      metadata: { buyerUserId, companyId, productCode }
    }),
    writeLedgerEntry({
      userId: PLATFORM_USER_ID,
      amount: split.hrkeyAmount,
      entryType: 'revenue_share_hrkey',
      direction: 'credit',
      purchaseId: purchase.id,
      metadata: { buyerUserId, companyId, productCode }
    })
  ]);

  const access = await ensurePurchaseAccess(purchase.id, companyId, refereeUserId, referencePackageUrl || null);

  return {
    purchase,
    split,
    access
  };
}

export async function listPurchaseHistory({ userId, companyId, limit = 50 }) {
  const safeLimit = Math.max(1, Math.min(Number(limit) || 50, 200));
  let query = supabase
    .from('hrkey_purchases')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(safeLimit);

  if (companyId) {
    query = query.eq('company_id', companyId);
  }

  if (userId) {
    query = query.eq('buyer_user_id', userId);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

export async function requestRefund({ purchaseId, requesterUserId, reason }) {
  const { data: purchase, error: purchaseError } = await supabase
    .from('hrkey_purchases')
    .select('*')
    .eq('id', purchaseId)
    .single();

  if (purchaseError) throw purchaseError;

  if (purchase.buyer_user_id !== requesterUserId) {
    const error = new Error('Only purchase owner can request refund');
    error.status = 403;
    throw error;
  }

  const { data, error } = await supabase
    .from('hrkey_refund_disputes')
    .insert([
      {
        purchase_id: purchaseId,
        requester_user_id: requesterUserId,
        reason: reason || 'unspecified',
        status: 'open',
        created_at: nowIso(),
        updated_at: nowIso()
      }
    ])
    .select('*')
    .single();

  if (error) throw error;

  await supabase
    .from('hrkey_purchases')
    .update({ status: 'refund_requested', updated_at: nowIso() })
    .eq('id', purchaseId);

  return data;
}

export async function resolveRefund({ refundId, resolution, resolverUserId }) {
  const { data: refund, error: refundError } = await supabase
    .from('hrkey_refund_disputes')
    .select('*, hrkey_purchases(*)')
    .eq('id', refundId)
    .single();

  if (refundError) throw refundError;

  const normalizedResolution = resolution === 'approved' ? 'approved' : 'rejected';
  const updatedAt = nowIso();

  const { data: updatedRefund, error: updateError } = await supabase
    .from('hrkey_refund_disputes')
    .update({
      status: normalizedResolution,
      resolved_by_user_id: resolverUserId,
      resolved_at: updatedAt,
      updated_at: updatedAt
    })
    .eq('id', refundId)
    .select('*')
    .single();

  if (updateError) throw updateError;

  if (normalizedResolution === 'approved') {
    const purchase = refund.hrkey_purchases;
    await upsertWalletBalance(purchase.buyer_user_id, Number(purchase.amount_total));
    await upsertWalletBalance(purchase.referee_user_id, -Number(purchase.referee_share_amount));
    await upsertWalletBalance(PLATFORM_USER_ID, -Number(purchase.hrkey_share_amount));

    await Promise.all([
      writeLedgerEntry({
        userId: purchase.buyer_user_id,
        amount: Number(purchase.amount_total),
        entryType: 'refund_credit',
        direction: 'credit',
        purchaseId: purchase.id,
        metadata: { refundId }
      }),
      writeLedgerEntry({
        userId: purchase.referee_user_id,
        amount: Number(purchase.referee_share_amount),
        entryType: 'refund_reversal_referee',
        direction: 'debit',
        purchaseId: purchase.id,
        metadata: { refundId }
      }),
      writeLedgerEntry({
        userId: PLATFORM_USER_ID,
        amount: Number(purchase.hrkey_share_amount),
        entryType: 'refund_reversal_hrkey',
        direction: 'debit',
        purchaseId: purchase.id,
        metadata: { refundId }
      })
    ]);

    await supabase
      .from('hrkey_purchases')
      .update({ status: 'refunded', updated_at: updatedAt })
      .eq('id', purchase.id);
  } else {
    await supabase
      .from('hrkey_purchases')
      .update({ status: 'refund_rejected', updated_at: updatedAt })
      .eq('id', refund.purchase_id);
  }

  return updatedRefund;
}

export async function upsertFavoriteReferee({ companyId, refereeUserId, createdByUserId }) {
  const { data, error } = await supabase
    .from('hrkey_company_favorites')
    .upsert([
      {
        company_id: companyId,
        referee_user_id: refereeUserId,
        created_by_user_id: createdByUserId,
        created_at: nowIso()
      }
    ], { onConflict: 'company_id,referee_user_id' })
    .select('*')
    .single();

  if (error) throw error;
  return data;
}

export async function removeFavoriteReferee({ companyId, refereeUserId }) {
  const { error } = await supabase
    .from('hrkey_company_favorites')
    .delete()
    .eq('company_id', companyId)
    .eq('referee_user_id', refereeUserId);

  if (error) throw error;
  return { ok: true };
}

export async function listFavoriteReferees(companyId) {
  const { data, error } = await supabase
    .from('hrkey_company_favorites')
    .select('*')
    .eq('company_id', companyId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data || [];
}

export async function repeatBuy({ purchaseId, buyerUserId }) {
  const { data: previous, error } = await supabase
    .from('hrkey_purchases')
    .select('*')
    .eq('id', purchaseId)
    .single();

  if (error) throw error;
  if (previous.buyer_user_id !== buyerUserId) {
    const authError = new Error('Only purchase owner can repeat buy');
    authError.status = 403;
    throw authError;
  }

  return createPurchase({
    buyerUserId,
    companyId: previous.company_id,
    refereeUserId: previous.referee_user_id,
    productCode: previous.product_code,
    amount: Number(previous.amount_total),
    refereeShareRatio: Number(previous.referee_share_ratio || DEFAULT_REFEREE_SHARE_RATIO)
  });
}

export async function getAccessDelivery(purchaseId, requesterUserId) {
  const { data: purchase, error: purchaseError } = await supabase
    .from('hrkey_purchases')
    .select('*')
    .eq('id', purchaseId)
    .single();

  if (purchaseError) throw purchaseError;

  if (purchase.buyer_user_id !== requesterUserId) {
    const error = new Error('You do not have access to this purchase');
    error.status = 403;
    throw error;
  }

  const { data: access, error } = await supabase
    .from('hrkey_purchase_access')
    .select('*')
    .eq('purchase_id', purchaseId)
    .single();

  if (error) throw error;
  return access;
}

export async function getMarketplaceAnalytics({ companyId = null, days = 30 }) {
  const lookbackDays = Math.max(1, Math.min(Number(days) || 30, 365));
  const from = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000).toISOString();

  let purchaseQuery = supabase
    .from('hrkey_purchases')
    .select('id, amount_total, referee_share_amount, hrkey_share_amount, status, created_at')
    .gte('created_at', from);

  if (companyId) {
    purchaseQuery = purchaseQuery.eq('company_id', companyId);
  }

  const { data: purchases, error } = await purchaseQuery;
  if (error) throw error;

  const safePurchases = purchases || [];
  const refunds = safePurchases.filter((p) => p.status === 'refunded').length;
  const completed = safePurchases.filter((p) => p.status === 'completed').length;

  return {
    periodDays: lookbackDays,
    purchases: safePurchases.length,
    completedPurchases: completed,
    refundedPurchases: refunds,
    grossRevenue: roundAmount(safePurchases.reduce((acc, p) => acc + Number(p.amount_total || 0), 0)),
    refereePayouts: roundAmount(safePurchases.reduce((acc, p) => acc + Number(p.referee_share_amount || 0), 0)),
    hrkeyRevenue: roundAmount(safePurchases.reduce((acc, p) => acc + Number(p.hrkey_share_amount || 0), 0))
  };
}

export default {
  computeRevenueSplit,
  getWalletBalance,
  topupWalletMock,
  createPurchase,
  listPurchaseHistory,
  requestRefund,
  resolveRefund,
  upsertFavoriteReferee,
  removeFavoriteReferee,
  listFavoriteReferees,
  repeatBuy,
  getAccessDelivery,
  getMarketplaceAnalytics
};
