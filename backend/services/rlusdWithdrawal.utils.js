import { createHash } from 'crypto';

export const WITHDRAWAL_DESTINATION_TYPES = ['wallet', 'bank', 'sinpe', 'other'];

export function roundRlusd(value) {
  return Math.round(Number(value || 0) * 1_000_000) / 1_000_000;
}

function normalizeOptionalString(value, { max = 180 } = {}) {
  if (value === undefined || value === null) return null;
  const normalized = String(value).trim();
  if (!normalized) return null;
  return normalized.slice(0, max);
}

export function sanitizeWithdrawalInput(input = {}) {
  const amount = roundRlusd(input.amount);
  const destinationType = String(input.destinationType || '').trim().toLowerCase();

  return {
    amount,
    destinationType,
    destinationLabel: normalizeOptionalString(input.destinationLabel, { max: 120 }),
    destinationRef: normalizeOptionalString(input.destinationRef, { max: 180 }),
    referenceNote: normalizeOptionalString(input.referenceNote, { max: 300 })
  };
}

export function assertValidDecimalAmount(amount) {
  if (!Number.isFinite(amount) || amount <= 0) {
    const error = new Error('Monto inválido. Debe ser un decimal positivo.');
    error.status = 400;
    error.code = 'INVALID_WITHDRAWAL_AMOUNT';
    throw error;
  }
  return amount;
}

export function assertValidDestinationType(destinationType) {
  if (!WITHDRAWAL_DESTINATION_TYPES.includes(destinationType)) {
    const error = new Error('Tipo de destino inválido');
    error.status = 400;
    error.code = 'INVALID_DESTINATION_TYPE';
    throw error;
  }
}

export function buildWithdrawalPayloadFingerprint({ amount, destinationType, destinationLabel, destinationRef, referenceNote }) {
  const canonical = JSON.stringify({
    amount: roundRlusd(amount),
    destinationType,
    destinationLabel: destinationLabel || null,
    destinationRef: destinationRef || null,
    referenceNote: referenceNote || null
  });

  return createHash('sha256').update(canonical).digest('hex');
}
