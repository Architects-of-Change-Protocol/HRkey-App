import { createHash } from 'crypto';

export const WITHDRAWAL_DESTINATION_TYPES = ['wallet', 'bank', 'sinpe', 'sinpe_mobile', 'other'];

export function roundRlusd(value) {
  return Math.round(Number(value || 0) * 1_000_000) / 1_000_000;
}

function normalizeOptionalString(value, { max = 180 } = {}) {
  if (value === undefined || value === null) return null;
  const normalized = String(value).trim();
  if (!normalized) return null;
  return normalized.slice(0, max);
}

export function sanitizeSinpeMobileNumber(value) {
  const raw = String(value ?? '').trim();
  if (!raw) {
    const error = new Error('El número SINPE Móvil es obligatorio');
    error.status = 400;
    error.code = 'INVALID_SINPE_MOBILE_NUMBER';
    throw error;
  }

  const compact = raw.replace(/[\s-()]/g, '');
  const plusPrefix = compact.startsWith('+');
  const digits = compact.replace(/\D/g, '');

  if (!digits) {
    const error = new Error('Formato de SINPE Móvil inválido');
    error.status = 400;
    error.code = 'INVALID_SINPE_MOBILE_NUMBER';
    throw error;
  }

  if (plusPrefix && !compact.startsWith('+506')) {
    const error = new Error('SINPE Móvil debe usar prefijo +506');
    error.status = 400;
    error.code = 'INVALID_SINPE_MOBILE_NUMBER';
    throw error;
  }

  if (!plusPrefix && digits.length !== 8 && digits.length !== 11) {
    const error = new Error('SINPE Móvil debe tener 8 dígitos CR o prefijo 506');
    error.status = 400;
    error.code = 'INVALID_SINPE_MOBILE_NUMBER';
    throw error;
  }

  let localDigits = digits;
  if (digits.length === 11) {
    if (!digits.startsWith('506')) {
      const error = new Error('Prefijo de SINPE Móvil inválido');
      error.status = 400;
      error.code = 'INVALID_SINPE_MOBILE_NUMBER';
      throw error;
    }
    localDigits = digits.slice(3);
  }

  if (localDigits.length !== 8 || !/^[2678]\d{7}$/.test(localDigits)) {
    const error = new Error('Número SINPE Móvil de Costa Rica inválido');
    error.status = 400;
    error.code = 'INVALID_SINPE_MOBILE_NUMBER';
    throw error;
  }

  return `+506${localDigits}`;
}

export function sanitizeWithdrawalInput(input = {}) {
  const amount = roundRlusd(input.amount);
  const requestedDestinationType = String(input.destinationType || '').trim().toLowerCase();
  const destinationType = requestedDestinationType === 'sinpe' ? 'sinpe_mobile' : requestedDestinationType;
  const destinationRef = normalizeOptionalString(input.destinationRef, { max: 180 });

  return {
    amount,
    destinationType,
    destinationLabel: normalizeOptionalString(input.destinationLabel, { max: 120 }),
    destinationRef: destinationType === 'sinpe_mobile' ? sanitizeSinpeMobileNumber(destinationRef) : destinationRef,
    destinationRefRaw: destinationRef,
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
