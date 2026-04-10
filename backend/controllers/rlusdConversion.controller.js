import logger from '../logger.js';
import {
  getRlusdQuote,
  createConversionRequest,
  listConversionRequests,
  completeConversionRequest,
  failConversionRequest,
  cancelConversionRequest
} from '../services/rlusdConversion.service.js';
import {
  getRlusdBalance,
  listRlusdTransactions
} from '../services/rlusdLedger.service.js';

export async function postRlusdQuote(req, res) {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ ok: false, error: 'UNAUTHORIZED', message: 'Authentication required' });
    }

    const { sourceAmount } = req.body || {};
    const quote = await getRlusdQuote({ userId, sourceAmount });

    return res.status(200).json({ ok: true, quote });
  } catch (error) {
    logger.warn('Failed to create RLUSD quote', {
      requestId: req.requestId,
      userId: req.user?.id,
      error: error.message,
      code: error.code
    });

    return res.status(error.status || 500).json({
      ok: false,
      error: error.code || 'RLUSD_QUOTE_FAILED',
      message: error.message || 'Failed to create quote'
    });
  }
}

export async function postConversionRequest(req, res) {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ ok: false, error: 'UNAUTHORIZED', message: 'Authentication required' });
    }

    const { sourceAmount, referenceNote, walletDestination } = req.body || {};

    const result = await createConversionRequest({
      userId,
      sourceAmount,
      referenceNote,
      walletDestination
    });

    return res.status(201).json({
      ok: true,
      conversionRequest: result.request,
      quote: result.quote,
      balanceAfterDebit: result.balanceAfterDebit
    });
  } catch (error) {
    logger.warn('Failed to create RLUSD conversion request', {
      requestId: req.requestId,
      userId: req.user?.id,
      error: error.message,
      code: error.code
    });

    return res.status(error.status || 500).json({
      ok: false,
      error: error.code || 'RLUSD_CONVERSION_REQUEST_FAILED',
      message: error.message || 'Failed to create conversion request'
    });
  }
}

export async function getConversionRequests(req, res) {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ ok: false, error: 'UNAUTHORIZED', message: 'Authentication required' });
    }

    const limit = req.query?.limit ? Number(req.query.limit) : 20;
    const requests = await listConversionRequests({ userId, limit });

    return res.status(200).json({ ok: true, requests });
  } catch (error) {
    logger.warn('Failed to list RLUSD conversion requests', {
      requestId: req.requestId,
      userId: req.user?.id,
      error: error.message
    });

    return res.status(error.status || 500).json({
      ok: false,
      error: 'RLUSD_CONVERSION_LIST_FAILED',
      message: error.message || 'Failed to list conversion requests'
    });
  }
}

function ensureAdminOrSuperadmin(req, res) {
  const role = req.user?.role;
  if (role === 'admin' || role === 'superadmin') return true;

  res.status(403).json({
    ok: false,
    error: 'FORBIDDEN',
    message: 'Admin access required'
  });
  return false;
}

export async function postCompleteConversionRequest(req, res) {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ ok: false, error: 'UNAUTHORIZED', message: 'Authentication required' });
    }
    if (!ensureAdminOrSuperadmin(req, res)) return;

    const conversionRequestId = req.params?.id;
    const result = await completeConversionRequest({ conversionRequestId });

    return res.status(200).json({ ok: true, ...result });
  } catch (error) {
    logger.warn('Failed to complete RLUSD conversion request', {
      requestId: req.requestId,
      userId: req.user?.id,
      conversionRequestId: req.params?.id,
      error: error.message
    });

    return res.status(error.status || 500).json({
      ok: false,
      error: error.code || 'RLUSD_CONVERSION_COMPLETE_FAILED',
      message: error.message || 'Failed to complete conversion request'
    });
  }
}

export async function postFailConversionRequest(req, res) {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ ok: false, error: 'UNAUTHORIZED', message: 'Authentication required' });
    }
    if (!ensureAdminOrSuperadmin(req, res)) return;

    const conversionRequestId = req.params?.id;
    const failureReason = req.body?.failureReason || null;
    const result = await failConversionRequest({ conversionRequestId, failureReason });

    return res.status(200).json({ ok: true, ...result });
  } catch (error) {
    logger.warn('Failed to fail RLUSD conversion request', {
      requestId: req.requestId,
      userId: req.user?.id,
      conversionRequestId: req.params?.id,
      error: error.message
    });

    return res.status(error.status || 500).json({
      ok: false,
      error: error.code || 'RLUSD_CONVERSION_FAIL_FAILED',
      message: error.message || 'Failed to fail conversion request'
    });
  }
}

export async function postCancelConversionRequest(req, res) {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ ok: false, error: 'UNAUTHORIZED', message: 'Authentication required' });
    }

    const conversionRequestId = req.params?.id;
    const result = await cancelConversionRequest({ userId, conversionRequestId });

    return res.status(200).json({ ok: true, ...result });
  } catch (error) {
    logger.warn('Failed to cancel RLUSD conversion request', {
      requestId: req.requestId,
      userId: req.user?.id,
      conversionRequestId: req.params?.id,
      error: error.message
    });

    return res.status(error.status || 500).json({
      ok: false,
      error: error.code || 'RLUSD_CONVERSION_CANCEL_FAILED',
      message: error.message || 'Failed to cancel conversion request'
    });
  }
}

export async function getMyRlusdBalance(req, res) {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ ok: false, error: 'UNAUTHORIZED', message: 'Authentication required' });
    }

    const balance = await getRlusdBalance(userId);
    return res.status(200).json({ ok: true, balance: Number(balance.rlusd_balance || 0) });
  } catch (error) {
    logger.warn('Failed to fetch RLUSD balance', {
      requestId: req.requestId,
      userId: req.user?.id,
      error: error.message
    });

    return res.status(500).json({
      ok: false,
      error: 'RLUSD_BALANCE_FAILED',
      message: error.message || 'Failed to fetch RLUSD balance'
    });
  }
}

export async function getMyRlusdTransactions(req, res) {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ ok: false, error: 'UNAUTHORIZED', message: 'Authentication required' });
    }

    const limit = req.query?.limit ? Number(req.query.limit) : 20;
    const transactions = await listRlusdTransactions({ userId, limit });
    return res.status(200).json({ ok: true, transactions });
  } catch (error) {
    logger.warn('Failed to list RLUSD transactions', {
      requestId: req.requestId,
      userId: req.user?.id,
      error: error.message
    });

    return res.status(500).json({
      ok: false,
      error: 'RLUSD_TRANSACTIONS_FAILED',
      message: error.message || 'Failed to list RLUSD transactions'
    });
  }
}

export default {
  postRlusdQuote,
  postConversionRequest,
  getConversionRequests,
  postCompleteConversionRequest,
  postFailConversionRequest,
  postCancelConversionRequest,
  getMyRlusdBalance,
  getMyRlusdTransactions
};
