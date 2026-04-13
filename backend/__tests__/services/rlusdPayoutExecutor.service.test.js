import { executeWithdrawalPayout, resolvePayoutAdapter } from '../../services/rlusdPayoutExecutor.service.js';

describe('rlusdPayoutExecutor.service', () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalAllow = process.env.PAYOUT_ALLOW_NON_PROD_ADAPTERS;

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
    process.env.PAYOUT_ALLOW_NON_PROD_ADAPTERS = originalAllow;
  });

  test('resuelve provider SINPE manual por default', async () => {
    const request = {
      id: 'wd-sinpe-1',
      destination_type: 'sinpe_mobile',
      destination_ref: '+50688887777'
    };

    const resolved = resolvePayoutAdapter(request, {});
    expect(resolved.payoutRail).toBe('sinpe_mobile');
    expect(resolved.payoutProvider).toBe('manual_sinpe_cr');

    const result = await executeWithdrawalPayout(request, {});
    expect(result.provider).toBe('manual_sinpe_cr');
    expect(result.rail).toBe('sinpe_mobile');
  });

  test('bloquea adapter mock en producción', async () => {
    process.env.NODE_ENV = 'production';
    process.env.PAYOUT_ALLOW_NON_PROD_ADAPTERS = 'true';

    await expect(executeWithdrawalPayout({ id: 'wd-bank-1', destination_type: 'bank' }, {
      payoutRail: 'bank',
      payoutProvider: 'mock_global_fiat'
    })).rejects.toMatchObject({ code: 'PAYOUT_ADAPTER_ENV_BLOCKED' });
  });

  test('bloquea adapter mock en dev sin opt-in', async () => {
    process.env.NODE_ENV = 'development';
    process.env.PAYOUT_ALLOW_NON_PROD_ADAPTERS = 'false';

    await expect(executeWithdrawalPayout({ id: 'wd-bank-1', destination_type: 'bank' }, {
      payoutRail: 'bank',
      payoutProvider: 'mock_global_fiat'
    })).rejects.toMatchObject({ code: 'PAYOUT_ADAPTER_NOT_EXPLICITLY_ENABLED' });
  });

  test('permite adapter mock en dev con opt-in explícito', async () => {
    process.env.NODE_ENV = 'development';
    process.env.PAYOUT_ALLOW_NON_PROD_ADAPTERS = 'true';

    const result = await executeWithdrawalPayout({ id: 'wd-bank-1', destination_type: 'bank', destination_ref: 'CR1234' }, {
      payoutRail: 'bank',
      payoutProvider: 'mock_global_fiat'
    });

    expect(result.provider).toBe('mock_global_fiat');
    expect(result.status).toBe('provider_pending');
  });

  test('rechaza route inválida', async () => {
    await expect(executeWithdrawalPayout({ id: 'wd-unsupported', destination_type: 'wallet' }, {}))
      .rejects.toMatchObject({ code: 'UNSUPPORTED_PAYOUT_ROUTE' });
  });
});
