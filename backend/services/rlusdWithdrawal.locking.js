import { Pool } from 'pg';

const DATABASE_URL = process.env.DATABASE_URL || null;
const pool = DATABASE_URL ? new Pool({ connectionString: DATABASE_URL }) : null;
const lockMap = new Map();

async function withProcessLock(userId, fn) {
  const previous = lockMap.get(userId) || Promise.resolve();
  let release;
  const current = new Promise((resolve) => { release = resolve; });
  lockMap.set(userId, previous.finally(() => current));

  await previous;
  try {
    return await fn();
  } finally {
    release();
    if (lockMap.get(userId) === current) lockMap.delete(userId);
  }
}

export async function withWithdrawalBalanceLock({ userId, handler }) {
  if (!pool) {
    // Fallback lock for environments without transactional DB access.
    return withProcessLock(userId, handler);
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `INSERT INTO rlusd_balances (user_id, rlusd_balance, rlusd_reserved_balance, updated_at)
       VALUES ($1, 0, 0, NOW())
       ON CONFLICT (user_id) DO NOTHING`,
      [userId]
    );

    const lockResult = await client.query(
      `SELECT user_id, rlusd_balance, rlusd_reserved_balance
       FROM rlusd_balances
       WHERE user_id = $1
       FOR UPDATE`,
      [userId]
    );

    const result = await handler({ client, lockedBalance: lockResult.rows[0] || null });
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
