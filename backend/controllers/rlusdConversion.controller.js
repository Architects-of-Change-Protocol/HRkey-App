import logger from '../logger.js';
import {
  getRlusdQuote,
  createConversionRequest,
  listConversionRequests
} from '../services/rlusdConversion.service.js';

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

export default {
  postRlusdQuote,
  postConversionRequest,
  getConversionRequests
};
