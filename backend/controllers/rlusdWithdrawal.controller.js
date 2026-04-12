import logger from '../logger.js';
import {
  assertWithdrawalsFeatureEnabled,
  cancelWithdrawalRequest,
  completeWithdrawalRequest,
  createWithdrawalRequest,
  failWithdrawalRequest,
  getWithdrawalQuote,
  listWithdrawalRequests,
  markWithdrawalProcessing
} from '../services/rlusdWithdrawal.service.js';

function ensureAdminOrSuperadmin(req, res) {
  const role = req.user?.role;
  if (role === 'admin' || role === 'superadmin') return true;

  res.status(403).json({ ok: false, error: 'FORBIDDEN', message: 'Admin access required' });
  return false;
}

function errorResponse(req, res, action, error, extra = {}) {
  logger.warn(`Withdrawal action failed: ${action}`, {
    requestId: req.requestId,
    userId: req.user?.id,
    withdrawalRequestId: req.params?.id || null,
    idempotencyKey: req.get('Idempotency-Key') || null,
    action,
    ...extra,
    error: error.message,
    code: error.code
  });

  return res.status(error.status || 500).json({
    ok: false,
    error: error.code || 'RLUSD_WITHDRAWAL_OPERATION_FAILED',
    message: error.message || 'Withdrawal operation failed'
  });
}

export async function postWithdrawalQuote(req, res) {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ ok: false, error: 'UNAUTHORIZED', message: 'Authentication required' });

    const quote = await getWithdrawalQuote({ userId, amount: req.body?.amount });
    return res.status(200).json({ ok: true, quote });
  } catch (error) {
    return errorResponse(req, res, 'quote', error);
  }
}

export async function postWithdrawalRequest(req, res) {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ ok: false, error: 'UNAUTHORIZED', message: 'Authentication required' });

    assertWithdrawalsFeatureEnabled();

    const idempotencyKey = req.get('Idempotency-Key');
    if (!idempotencyKey || !idempotencyKey.trim()) {
      return res.status(400).json({ ok: false, error: 'IDEMPOTENCY_KEY_REQUIRED', message: 'Idempotency-Key header is required' });
    }

    const result = await createWithdrawalRequest({
      userId,
      idempotencyKey,
      amount: req.body?.amount,
      destinationType: req.body?.destinationType,
      destinationLabel: req.body?.destinationLabel,
      destinationRef: req.body?.destinationRef,
      referenceNote: req.body?.referenceNote
    });

    return res.status(result.idempotentReplay ? 200 : 201).json({
      ok: true,
      idempotentReplay: Boolean(result.idempotentReplay),
      withdrawalRequest: result.request,
      quote: result.quote,
      balance: result.balance
    });
  } catch (error) {
    return errorResponse(req, res, 'create', error);
  }
}

export async function getWithdrawalRequests(req, res) {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ ok: false, error: 'UNAUTHORIZED', message: 'Authentication required' });

    const requests = await listWithdrawalRequests({ userId, limit: Number(req.query?.limit || 20) });
    return res.status(200).json({ ok: true, requests });
  } catch (error) {
    return errorResponse(req, res, 'list', error);
  }
}

export async function postCancelWithdrawalRequest(req, res) {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ ok: false, error: 'UNAUTHORIZED', message: 'Authentication required' });

    assertWithdrawalsFeatureEnabled();

    const result = await cancelWithdrawalRequest({ userId, withdrawalRequestId: req.params?.id });
    return res.status(200).json({ ok: true, ...result });
  } catch (error) {
    return errorResponse(req, res, 'cancel', error);
  }
}

export async function postProcessWithdrawalRequest(req, res) {
  try {
    if (!ensureAdminOrSuperadmin(req, res)) return;
    assertWithdrawalsFeatureEnabled();
    const result = await markWithdrawalProcessing({ withdrawalRequestId: req.params?.id });
    return res.status(200).json({ ok: true, ...result });
  } catch (error) {
    return errorResponse(req, res, 'process', error);
  }
}

export async function postCompleteWithdrawalRequest(req, res) {
  try {
    if (!ensureAdminOrSuperadmin(req, res)) return;
    assertWithdrawalsFeatureEnabled();
    const result = await completeWithdrawalRequest({ withdrawalRequestId: req.params?.id });
    return res.status(200).json({ ok: true, ...result });
  } catch (error) {
    return errorResponse(req, res, 'complete', error);
  }
}

export async function postFailWithdrawalRequest(req, res) {
  try {
    if (!ensureAdminOrSuperadmin(req, res)) return;
    assertWithdrawalsFeatureEnabled();
    const result = await failWithdrawalRequest({ withdrawalRequestId: req.params?.id, failureReason: req.body?.failureReason || null });
    return res.status(200).json({ ok: true, ...result });
  } catch (error) {
    return errorResponse(req, res, 'fail', error);
  }
}

export default {
  postWithdrawalQuote,
  postWithdrawalRequest,
  getWithdrawalRequests,
  postCancelWithdrawalRequest,
  postProcessWithdrawalRequest,
  postCompleteWithdrawalRequest,
  postFailWithdrawalRequest
};
