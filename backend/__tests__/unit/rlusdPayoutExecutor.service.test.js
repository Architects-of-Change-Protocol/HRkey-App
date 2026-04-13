import { jest } from '@jest/globals';

const executePayoutMock = jest.fn();
const executeSinpeMock = jest.fn();

jest.unstable_mockModule('../services/aocRuntimeClient.js', () => ({
  executePayout: executePayoutMock
}));

jest.unstable_mockModule('../services/payoutAdapters/sinpeMobileManual.adapter.js', () => ({
  executeSinpeMobileManualPayout: executeSinpeMock
}));

jest.unstable_mockModule('../logger.js', () => ({
  default: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    withRequest: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() })
  }
}));

const { executeWithdrawalPayout } = await import('../../services/rlusdPayoutExecutor.service.js');

describe('rlusdPayoutExecutor.service AOC runtime pre-check', () => {
  beforeEach(() => {
    executePayoutMock.mockReset();
    executeSinpeMock.mockReset();
  });

  test('uses AOC runtime executePayout pre-check before local adapter execution', async () => {
    executePayoutMock.mockResolvedValue({ approved: true });
    executeSinpeMock.mockResolvedValue({ status: 'processing', rail: 'sinpe_mobile', provider: 'manual_sinpe_cr' });

    await executeWithdrawalPayout({
      id: 'wd-1',
      user_id: 'user-1',
      amount_rlusd: '12.50',
      payout_rail: 'sinpe_mobile'
    });

    expect(executePayoutMock).toHaveBeenCalledWith(expect.objectContaining({
      withdrawalRequestId: 'wd-1',
      userId: 'user-1',
      payoutRail: 'sinpe_mobile'
    }));
    expect(executeSinpeMock).toHaveBeenCalledTimes(1);
  });

  test('fails closed when runtime denies payout execution', async () => {
    executePayoutMock.mockResolvedValue({ approved: false, reason_code: 'AOC_POLICY_DENY', message: 'blocked' });

    await expect(executeWithdrawalPayout({
      id: 'wd-2',
      user_id: 'user-2',
      amount_rlusd: '40',
      payout_rail: 'sinpe_mobile'
    })).rejects.toMatchObject({
      code: 'AOC_POLICY_DENY',
      message: 'blocked'
    });

    expect(executeSinpeMock).not.toHaveBeenCalled();
  });
});
