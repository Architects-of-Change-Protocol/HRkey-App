import {
  sanitizeSinpeMobileNumber,
  sanitizeWithdrawalInput
} from '../../services/rlusdWithdrawal.utils.js';

describe('rlusdWithdrawal.utils', () => {
  test('normaliza SINPE móvil en formatos válidos', () => {
    expect(sanitizeSinpeMobileNumber('88887777')).toBe('+50688887777');
    expect(sanitizeSinpeMobileNumber('50688887777')).toBe('+50688887777');
    expect(sanitizeSinpeMobileNumber('+506 8888-7777')).toBe('+50688887777');
  });

  test('rechaza SINPE móvil inválido', () => {
    expect(() => sanitizeSinpeMobileNumber('123')).toThrow('SINPE Móvil');
    expect(() => sanitizeSinpeMobileNumber('50788887777')).toThrow('Prefijo');
    expect(() => sanitizeSinpeMobileNumber('')).toThrow('obligatorio');
  });

  test('sanitizeWithdrawalInput mapea sinpe -> sinpe_mobile y normaliza destino', () => {
    const result = sanitizeWithdrawalInput({
      amount: 10,
      destinationType: 'sinpe',
      destinationRef: '88887777'
    });

    expect(result.destinationType).toBe('sinpe_mobile');
    expect(result.destinationRef).toBe('+50688887777');
  });
});
