export const WITHDRAWAL_STATUSES = {
  REQUESTED: 'requested',
  PENDING_REVIEW: 'pending_review',
  PROCESSING: 'processing',
  COMPLETED: 'completed',
  FAILED: 'failed',
  CANCELLED: 'cancelled'
};

const ALLOWED_TRANSITIONS = {
  [WITHDRAWAL_STATUSES.REQUESTED]: [WITHDRAWAL_STATUSES.PENDING_REVIEW, WITHDRAWAL_STATUSES.PROCESSING, WITHDRAWAL_STATUSES.CANCELLED],
  [WITHDRAWAL_STATUSES.PENDING_REVIEW]: [WITHDRAWAL_STATUSES.PROCESSING, WITHDRAWAL_STATUSES.CANCELLED],
  [WITHDRAWAL_STATUSES.PROCESSING]: [WITHDRAWAL_STATUSES.COMPLETED, WITHDRAWAL_STATUSES.FAILED],
  [WITHDRAWAL_STATUSES.COMPLETED]: [],
  [WITHDRAWAL_STATUSES.FAILED]: [],
  [WITHDRAWAL_STATUSES.CANCELLED]: []
};

export function assertValidWithdrawalTransition(currentStatus, nextStatus) {
  const allowed = ALLOWED_TRANSITIONS[currentStatus] || [];
  if (!allowed.includes(nextStatus)) {
    const error = new Error(`Transición inválida: ${currentStatus} -> ${nextStatus}`);
    error.status = 409;
    error.code = 'INVALID_STATUS_TRANSITION';
    throw error;
  }
}
