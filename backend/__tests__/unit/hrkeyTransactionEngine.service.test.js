process.env.NODE_ENV = 'test';

import { computeRevenueSplit } from '../../services/hrkeyTransactionEngine.service.js';

describe('hrkeyTransactionEngine.service', () => {
  it('computes referee and HRKey revenue split', () => {
    const split = computeRevenueSplit(100, 0.75);

    expect(split).toEqual({
      totalAmount: 100,
      refereeShareRatio: 0.75,
      refereeAmount: 75,
      hrkeyAmount: 25
    });
  });

  it('clamps share ratio into 0..1 range', () => {
    const upper = computeRevenueSplit(50, 5);
    const lower = computeRevenueSplit(50, -1);

    expect(upper.refereeShareRatio).toBe(1);
    expect(upper.hrkeyAmount).toBe(0);
    expect(lower.refereeShareRatio).toBe(0);
    expect(lower.refereeAmount).toBe(0);
  });

  it('rejects invalid total amount', () => {
    expect(() => computeRevenueSplit(0, 0.5)).toThrow(/positive number/i);
  });
});
