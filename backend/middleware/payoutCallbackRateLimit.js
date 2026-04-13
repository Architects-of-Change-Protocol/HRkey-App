const buckets = new Map();

function getClientIp(req) {
  const forwardedFor = req.headers['x-forwarded-for'];
  if (typeof forwardedFor === 'string' && forwardedFor.trim().length > 0) {
    return forwardedFor.split(',')[0].trim();
  }
  return req.ip || 'unknown';
}

export function resetPayoutCallbackRateLimit() {
  buckets.clear();
}

export function payoutCallbackRateLimit(req, res, next) {
  if (String(process.env.PAYOUT_CALLBACK_RATE_LIMIT_ENABLED || 'true').toLowerCase() === 'false') {
    return next();
  }

  const windowMs = Number(process.env.PAYOUT_CALLBACK_RATE_LIMIT_WINDOW_MS || 60000);
  const max = Number(process.env.PAYOUT_CALLBACK_RATE_LIMIT_MAX || 60);
  const provider = String(req.headers['x-payout-provider'] || 'unknown').toLowerCase();
  const key = `${provider}:${getClientIp(req)}`;
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || now - bucket.start >= windowMs) {
    buckets.set(key, { start: now, count: 1 });
    return next();
  }

  if (bucket.count >= max) {
    return res.status(429).json({ ok: false, error: 'RATE_LIMITED', message: 'Too many callback attempts' });
  }

  bucket.count += 1;
  return next();
}

export default {
  payoutCallbackRateLimit,
  resetPayoutCallbackRateLimit
};
