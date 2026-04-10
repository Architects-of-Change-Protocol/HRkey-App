import logger from '../logger.js';
import { getAccessPrice, getUserBalance, topupBalance } from '../services/aocPayment.service.js';

export async function getMyAocBalance(req, res) {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ ok: false, error: 'UNAUTHORIZED', message: 'Authentication required' });
    }

    const candidateId = req.query?.candidateId || null;
    const balance = await getUserBalance(userId);
    const price = await getAccessPrice(candidateId);

    return res.status(200).json({
      ok: true,
      balance: balance.aoc_balance,
      currency: 'AOC',
      accessPrice: price.amount,
      hasSufficientBalance: balance.aoc_balance >= price.amount
    });
  } catch (error) {
    logger.warn('Failed to fetch AOC balance', {
      requestId: req.requestId,
      userId: req.user?.id,
      error: error.message
    });

    return res.status(error.status || 500).json({
      ok: false,
      error: 'AOC_BALANCE_FAILED',
      message: error.message || 'Failed to load AOC balance'
    });
  }
}

export async function topupMyAocBalance(req, res) {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ ok: false, error: 'UNAUTHORIZED', message: 'Authentication required' });
    }

    if (process.env.NODE_ENV === 'production') {
      return res.status(403).json({ ok: false, error: 'FORBIDDEN', message: 'Topup is only available in dev/test' });
    }

    const { amount } = req.body || {};
    const updated = await topupBalance({ userId, amount });

    return res.status(200).json({
      ok: true,
      balance: Number(updated.aoc_balance),
      currency: 'AOC'
    });
  } catch (error) {
    logger.warn('Failed to topup AOC balance', {
      requestId: req.requestId,
      userId: req.user?.id,
      error: error.message
    });

    return res.status(error.status || 500).json({
      ok: false,
      error: 'AOC_TOPUP_FAILED',
      message: error.message || 'Failed to topup AOC balance'
    });
  }
}

export default {
  getMyAocBalance,
  topupMyAocBalance
};
