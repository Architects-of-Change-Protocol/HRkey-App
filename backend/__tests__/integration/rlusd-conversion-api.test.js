import { jest } from '@jest/globals';
import request from 'supertest';
import { createSupabaseMock, mockSuccess } from '../utils/supabase-mock';
import { buildWithdrawalPayloadFingerprint } from '../../services/rlusdWithdrawal.utils.js';
import { buildPayoutCallbackSignature } from '../../services/payoutCallbacks.security.js';
import { resetPayoutCallbackRateLimit } from '../../middleware/payoutCallbackRateLimit.js';

process.env.ALLOW_TEST_AUTH_BYPASS = 'true';
process.env.PAYOUT_CALLBACK_SECRET_MOCK_GLOBAL_FIAT = 'test-callback-secret';
process.env.PAYOUT_ALLOW_NON_PROD_ADAPTERS = 'true';

const { supabase, tables, setTableResponses } = createSupabaseMock();

jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => supabase)
}));

jest.mock('../../services/analytics/eventTracker.js', () => ({
  logEvent: jest.fn(async () => null)
}));

let app;

describe('RLUSD conversion API', () => {
  beforeAll(async () => {
    ({ app } = await import('../../app.js'));
  });

  beforeEach(() => {
    resetPayoutCallbackRateLimit();
    process.env.PAYOUT_CALLBACK_RATE_LIMIT_MAX = '60';
    process.env.PAYOUT_CALLBACK_RATE_LIMIT_WINDOW_MS = '60000';
  });
  const authHeaders = {
    'x-test-user-id': '00000000-0000-4000-8000-000000000001',
    'x-test-user-email': 'candidate@example.com',
    'x-test-user-role': 'user'
  };

  const adminHeaders = {
    ...authHeaders,
    'x-test-user-role': 'admin'
  };

  function signedCallbackHeaders(payload, overrides = {}) {
    const timestamp = overrides.timestamp ?? Math.floor(Date.now() / 1000);
    const provider = overrides.provider || 'mock_global_fiat';
    const eventId = overrides.eventId || 'evt-test-1';
    const signature = buildPayoutCallbackSignature({
      provider,
      timestamp,
      eventId,
      payload,
      secret: process.env.PAYOUT_CALLBACK_SECRET_MOCK_GLOBAL_FIAT
    });

    return {
      'x-payout-provider': provider,
      'x-payout-event-id': eventId,
      'x-payout-timestamp': String(timestamp),
      'x-payout-signature': signature,
      ...overrides.headers
    };
  }

  test('quote válido', async () => {
    const response = await request(app)
      .post('/api/aoc/convert/quote')
      .set(authHeaders)
      .send({ sourceAmount: 100 });

    expect(response.status).toBe(200);
    expect(response.body.ok).toBe(true);
    expect(response.body.quote.sourceAmount).toBe(100);
    expect(response.body.quote.quotedRate).toBeGreaterThan(0);
    expect(response.body.quote.netTargetAmount).toBeGreaterThan(0);
  });

  test('quote falla por monto inválido', async () => {
    const response = await request(app)
      .post('/api/aoc/convert/quote')
      .set(authHeaders)
      .send({ sourceAmount: 0 });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('INVALID_SOURCE_AMOUNT');
  });

  test('request falla por saldo insuficiente', async () => {
    setTableResponses('user_balances', {
      maybeSingleResponses: [mockSuccess({ user_id: authHeaders['x-test-user-id'], aoc_balance: 5, updated_at: '2026-04-01T00:00:00.000Z' })]
    });

    const response = await request(app)
      .post('/api/aoc/convert/requests')
      .set(authHeaders)
      .send({ sourceAmount: 10 });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('INSUFFICIENT_AOC_BALANCE');
  });

  test('request crea conversión correctamente y debita balance', async () => {
    setTableResponses('user_balances', {
      maybeSingleResponses: [mockSuccess({ user_id: authHeaders['x-test-user-id'], aoc_balance: 120, updated_at: '2026-04-01T00:00:00.000Z' })],
      singleResponses: [mockSuccess({ user_id: authHeaders['x-test-user-id'], aoc_balance: 20, updated_at: '2026-04-02T00:00:00.000Z' })],
      upsertResponses: [mockSuccess({ user_id: authHeaders['x-test-user-id'], aoc_balance: 20, updated_at: '2026-04-02T00:00:00.000Z' })]
    });

    setTableResponses('aoc_conversion_requests', {
      singleResponses: [mockSuccess({
        id: 'conv-1',
        user_id: authHeaders['x-test-user-id'],
        source_amount: 100,
        quoted_rate: 0.1,
        quoted_target_amount: 10,
        platform_fee_amount: 0.3,
        net_target_amount: 9.7,
        status: 'pending',
        created_at: '2026-04-02T00:00:00.000Z',
        updated_at: '2026-04-02T00:00:00.000Z'
      })]
    });

    setTableResponses('aoc_transactions', {
      singleResponses: [mockSuccess({
        id: 'tx-conv-1',
        from_user_id: authHeaders['x-test-user-id'],
        to_user_id: 'hrkey_platform',
        amount: 100,
        type: 'conversion_out',
        reference_id: 'conv-1',
        created_at: '2026-04-02T00:00:00.000Z'
      })]
    });

    const response = await request(app)
      .post('/api/aoc/convert/requests')
      .set(authHeaders)
      .send({ sourceAmount: 100 });

    expect(response.status).toBe(201);
    expect(response.body.ok).toBe(true);
    expect(response.body.conversionRequest.status).toBe('pending');
    expect(response.body.balanceAfterDebit).toBe(20);
  });

  test('list conversion requests funciona', async () => {
    setTableResponses('aoc_conversion_requests', {
      selectResponses: [mockSuccess([
        {
          id: 'conv-list-1',
          user_id: authHeaders['x-test-user-id'],
          source_amount: 45,
          net_target_amount: 4.365,
          status: 'pending',
          created_at: '2026-04-03T00:00:00.000Z',
          updated_at: '2026-04-03T00:00:00.000Z'
        }
      ])]
    });

    const response = await request(app)
      .get('/api/aoc/convert/requests')
      .set(authHeaders);

    expect(response.status).toBe(200);
    expect(response.body.ok).toBe(true);
    expect(Array.isArray(response.body.requests)).toBe(true);
    expect(response.body.requests[0].id).toBe('conv-list-1');
  });

  test('complete conversion acredita RLUSD y evita doble complete', async () => {
    setTableResponses('aoc_conversion_requests', {
      maybeSingleResponses: [
        mockSuccess({
          id: 'conv-complete-1',
          user_id: authHeaders['x-test-user-id'],
          source_amount: 100,
          net_target_amount: 9.7,
          status: 'pending'
        }),
        mockSuccess({
          id: 'conv-complete-1',
          user_id: authHeaders['x-test-user-id'],
          source_amount: 100,
          net_target_amount: 9.7,
          status: 'completed',
          completed_at: '2026-04-03T10:00:00.000Z'
        })
      ],
      singleResponses: [
        mockSuccess({ id: 'conv-complete-1', status: 'processing' }),
        mockSuccess({ id: 'conv-complete-1', status: 'completed', completed_at: '2026-04-03T10:00:00.000Z' })
      ]
    });

    setTableResponses('rlusd_balances', {
      maybeSingleResponses: [mockSuccess(null)],
      singleResponses: [mockSuccess({ user_id: authHeaders['x-test-user-id'], rlusd_balance: 9.7, updated_at: '2026-04-03T10:00:00.000Z' })],
      upsertResponses: [mockSuccess({ user_id: authHeaders['x-test-user-id'], rlusd_balance: 9.7, updated_at: '2026-04-03T10:00:00.000Z' })]
    });

    setTableResponses('rlusd_transactions', {
      singleResponses: [mockSuccess({
        id: 'rtx-1',
        user_id: authHeaders['x-test-user-id'],
        amount: 9.7,
        direction: 'credit',
        type: 'conversion_credit',
        reference_id: 'conv-complete-1',
        created_at: '2026-04-03T10:00:00.000Z'
      })]
    });

    const completeResponse = await request(app)
      .post('/api/aoc/convert/requests/conv-complete-1/complete')
      .set(adminHeaders)
      .send({});

    expect(completeResponse.status).toBe(200);
    expect(completeResponse.body.ok).toBe(true);
    expect(completeResponse.body.request.status).toBe('completed');
    expect(completeResponse.body.rlusdBalance).toBe(9.7);

    const secondCompleteResponse = await request(app)
      .post('/api/aoc/convert/requests/conv-complete-1/complete')
      .set(adminHeaders)
      .send({});

    expect(secondCompleteResponse.status).toBe(200);
    expect(secondCompleteResponse.body.alreadyCompleted).toBe(true);
  });

  test('cancel pending request devuelve AOCs', async () => {
    setTableResponses('aoc_conversion_requests', {
      maybeSingleResponses: [mockSuccess({
        id: 'conv-cancel-1',
        user_id: authHeaders['x-test-user-id'],
        source_amount: 25,
        status: 'pending'
      })],
      singleResponses: [mockSuccess({ id: 'conv-cancel-1', status: 'cancelled' })]
    });

    setTableResponses('user_balances', {
      maybeSingleResponses: [mockSuccess({ user_id: authHeaders['x-test-user-id'], aoc_balance: 10, updated_at: '2026-04-03T00:00:00.000Z' })],
      singleResponses: [mockSuccess({ user_id: authHeaders['x-test-user-id'], aoc_balance: 35, updated_at: '2026-04-03T00:01:00.000Z' })],
      upsertResponses: [mockSuccess({ user_id: authHeaders['x-test-user-id'], aoc_balance: 35, updated_at: '2026-04-03T00:01:00.000Z' })]
    });

    setTableResponses('aoc_transactions', {
      singleResponses: [mockSuccess({ id: 'aoc-refund-1', type: 'conversion_refund' })]
    });

    const response = await request(app)
      .post('/api/aoc/convert/requests/conv-cancel-1/cancel')
      .set(authHeaders)
      .send({ payoutReference: 'sinpe-ref-123', externalId: 'bank-op-1' });

    expect(response.status).toBe(200);
    expect(response.body.request.status).toBe('cancelled');
    expect(response.body.balanceAfterRefund).toBe(35);
  });

  test('fail pending request devuelve AOCs', async () => {
    setTableResponses('aoc_conversion_requests', {
      maybeSingleResponses: [mockSuccess({
        id: 'conv-fail-1',
        user_id: authHeaders['x-test-user-id'],
        source_amount: 30,
        status: 'pending'
      })],
      singleResponses: [mockSuccess({ id: 'conv-fail-1', status: 'failed', failure_reason: 'processor timeout' })]
    });

    setTableResponses('user_balances', {
      maybeSingleResponses: [mockSuccess({ user_id: authHeaders['x-test-user-id'], aoc_balance: 5, updated_at: '2026-04-03T00:00:00.000Z' })],
      singleResponses: [mockSuccess({ user_id: authHeaders['x-test-user-id'], aoc_balance: 35, updated_at: '2026-04-03T00:01:00.000Z' })],
      upsertResponses: [mockSuccess({ user_id: authHeaders['x-test-user-id'], aoc_balance: 35, updated_at: '2026-04-03T00:01:00.000Z' })]
    });

    setTableResponses('aoc_transactions', {
      singleResponses: [mockSuccess({ id: 'aoc-refund-2', type: 'conversion_refund' })]
    });

    const response = await request(app)
      .post('/api/aoc/convert/requests/conv-fail-1/fail')
      .set(adminHeaders)
      .send({ failureReason: 'processor timeout' });

    expect(response.status).toBe(200);
    expect(response.body.request.status).toBe('failed');
    expect(response.body.balanceAfterRefund).toBe(35);
  });

  test('RLUSD balance endpoint funciona', async () => {
    setTableResponses('rlusd_balances', {
      maybeSingleResponses: [mockSuccess({
        user_id: authHeaders['x-test-user-id'],
        rlusd_balance: 12.34,
        rlusd_reserved_balance: 2,
        updated_at: '2026-04-03T00:00:00.000Z'
      })]
    });

    const response = await request(app)
      .get('/api/rlusd/balance')
      .set(authHeaders);

    expect(response.status).toBe(200);
    expect(response.body.ok).toBe(true);
    expect(response.body.balance).toBe(12.34);
    expect(response.body.availableBalance).toBe(12.34);
    expect(response.body.reservedBalance).toBe(2);
    expect(response.body.totalBalance).toBe(14.34);
  });



  test('quote de retiro válido', async () => {
    setTableResponses('rlusd_balances', {
      maybeSingleResponses: [mockSuccess({
        user_id: authHeaders['x-test-user-id'],
        rlusd_balance: 10,
        rlusd_reserved_balance: 0,
        updated_at: '2026-04-03T00:00:00.000Z'
      })]
    });

    const response = await request(app)
      .post('/api/rlusd/withdrawals/quote')
      .set(authHeaders)
      .send({ amount: 10 });

    expect(response.status).toBe(200);
    expect(response.body.ok).toBe(true);
    expect(response.body.quote.netAmount).toBeGreaterThanOrEqual(0);
  });

  test('quote de retiro falla por monto inválido', async () => {
    const response = await request(app)
      .post('/api/rlusd/withdrawals/quote')
      .set(authHeaders)
      .send({ amount: 0 });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('INVALID_WITHDRAWAL_AMOUNT');
  });

  test('create withdrawal reserva balance RLUSD', async () => {
    setTableResponses('rlusd_balances', {
      maybeSingleResponses: [mockSuccess({ user_id: authHeaders['x-test-user-id'], rlusd_balance: 10, rlusd_reserved_balance: 0 }), mockSuccess({ user_id: authHeaders['x-test-user-id'], rlusd_balance: 10, rlusd_reserved_balance: 0 })],
      singleResponses: [mockSuccess({ user_id: authHeaders['x-test-user-id'], rlusd_balance: 0, rlusd_reserved_balance: 10 })],
      upsertResponses: [mockSuccess({ user_id: authHeaders['x-test-user-id'], rlusd_balance: 0, rlusd_reserved_balance: 10 })]
    });
    setTableResponses('rlusd_withdrawal_requests', {
      singleResponses: [mockSuccess({ id: 'wd-1', user_id: authHeaders['x-test-user-id'], amount: 10, fee_amount: 0, net_amount: 10, status: 'pending_review', destination_type: 'sinpe_mobile', destination_ref: '+50688887777', payout_rail: 'sinpe_mobile', payout_provider: 'manual_sinpe_cr', created_at: '2026-04-03T00:00:00.000Z' })]
    });
    setTableResponses('rlusd_transactions', {
      singleResponses: [mockSuccess({ id: 'rltx-hold-1', type: 'withdrawal_hold' })]
    });

    const response = await request(app)
      .post('/api/rlusd/withdrawals')
      .set(authHeaders)
      .set('Idempotency-Key', 'idem-create-1')
      .send({ amount: 10, destinationType: 'sinpe_mobile', destinationRef: '88887777' });

    expect(response.status).toBe(201);
    expect(response.body.withdrawalRequest.status).toBe('pending_review');
    expect(response.body.balance.availableBalance).toBe(0);
    expect(response.body.balance.reservedBalance).toBe(10);
  });




  test('create withdrawal rechaza SINPE inválido', async () => {
    const response = await request(app)
      .post('/api/rlusd/withdrawals')
      .set(authHeaders)
      .set('Idempotency-Key', 'idem-sinpe-bad')
      .send({ amount: 10, destinationType: 'sinpe_mobile', destinationRef: '1234' });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('INVALID_SINPE_MOBILE_NUMBER');
  });

  test('create withdrawal requiere Idempotency-Key', async () => {
    const response = await request(app)
      .post('/api/rlusd/withdrawals')
      .set(authHeaders)
      .send({ amount: 10, destinationType: 'wallet' });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('IDEMPOTENCY_KEY_REQUIRED');
  });

  test('idempotency retry idéntico devuelve misma solicitud sin duplicar hold', async () => {
    setTableResponses('rlusd_withdrawal_requests', {
      maybeSingleResponses: [
        mockSuccess(null),
        mockSuccess({ id: 'wd-idem-1', user_id: authHeaders['x-test-user-id'], amount: 10, payload_fingerprint: buildWithdrawalPayloadFingerprint({ amount: 10, destinationType: 'wallet', destinationLabel: null, destinationRef: null, referenceNote: null }), idempotency_key: 'idem-dup', status: 'pending_review' }),
      ],
      singleResponses: [mockSuccess({ id: 'wd-idem-1', user_id: authHeaders['x-test-user-id'], amount: 10, fee_amount: 0, net_amount: 10, status: 'pending_review', payload_fingerprint: buildWithdrawalPayloadFingerprint({ amount: 10, destinationType: 'wallet', destinationLabel: null, destinationRef: null, referenceNote: null }), idempotency_key: 'idem-dup', destination_type: 'wallet' })]
    });
    setTableResponses('rlusd_balances', {
      maybeSingleResponses: [
        mockSuccess({ user_id: authHeaders['x-test-user-id'], rlusd_balance: 20, rlusd_reserved_balance: 0 }),
        mockSuccess({ user_id: authHeaders['x-test-user-id'], rlusd_balance: 20, rlusd_reserved_balance: 0 }),
        mockSuccess({ user_id: authHeaders['x-test-user-id'], rlusd_balance: 10, rlusd_reserved_balance: 10 })
      ],
      singleResponses: [mockSuccess({ user_id: authHeaders['x-test-user-id'], rlusd_balance: 10, rlusd_reserved_balance: 10 })],
      upsertResponses: [mockSuccess({ user_id: authHeaders['x-test-user-id'], rlusd_balance: 10, rlusd_reserved_balance: 10 })]
    });
    setTableResponses('rlusd_transactions', { singleResponses: [mockSuccess({ id: 'hold-idem-1', type: 'withdrawal_hold' })] });

    const first = await request(app)
      .post('/api/rlusd/withdrawals')
      .set(authHeaders)
      .set('Idempotency-Key', 'idem-dup')
      .send({ amount: 10, destinationType: 'wallet' });

    expect(first.status).toBe(201);

    const second = await request(app)
      .post('/api/rlusd/withdrawals')
      .set(authHeaders)
      .set('Idempotency-Key', 'idem-dup')
      .send({ amount: 10, destinationType: 'wallet' });

    expect(second.status).toBe(200);
    expect(second.body.idempotentReplay).toBe(true);
    expect(second.body.withdrawalRequest.id).toBe('wd-idem-1');
  });

  test('idempotency retry con payload distinto responde 409', async () => {
    setTableResponses('rlusd_withdrawal_requests', {
      maybeSingleResponses: [mockSuccess({ id: 'wd-idem-2', user_id: authHeaders['x-test-user-id'], amount: 10, payload_fingerprint: 'different-fingerprint', idempotency_key: 'idem-conflict' })]
    });

    const response = await request(app)
      .post('/api/rlusd/withdrawals')
      .set(authHeaders)
      .set('Idempotency-Key', 'idem-conflict')
      .send({ amount: 10, destinationType: 'wallet' });

    expect(response.status).toBe(409);
    expect(response.body.error).toBe('IDEMPOTENCY_KEY_PAYLOAD_MISMATCH');
  });

  test('cancel withdrawal devuelve reserved -> available', async () => {
    setTableResponses('rlusd_withdrawal_requests', {
      maybeSingleResponses: [mockSuccess({ id: 'wd-cancel-1', user_id: authHeaders['x-test-user-id'], amount: 7, status: 'pending_review' })],
      singleResponses: [mockSuccess({ id: 'wd-cancel-1', status: 'cancelled' })]
    });
    setTableResponses('rlusd_balances', {
      maybeSingleResponses: [mockSuccess({ user_id: authHeaders['x-test-user-id'], rlusd_balance: 2, rlusd_reserved_balance: 7 })],
      singleResponses: [mockSuccess({ user_id: authHeaders['x-test-user-id'], rlusd_balance: 9, rlusd_reserved_balance: 0 })],
      upsertResponses: [mockSuccess({ user_id: authHeaders['x-test-user-id'], rlusd_balance: 9, rlusd_reserved_balance: 0 })]
    });
    setTableResponses('rlusd_transactions', { singleResponses: [mockSuccess({ id: 'rltx-release-1', type: 'withdrawal_release' })] });

    const response = await request(app)
      .post('/api/rlusd/withdrawals/wd-cancel-1/cancel')
      .set(authHeaders)
      .send({});

    expect(response.status).toBe(200);
    expect(response.body.request.status).toBe('cancelled');
    expect(response.body.balance.availableBalance).toBe(9);
  });


  test('process withdrawal SINPE manual registra rail/provider y referencia', async () => {
    setTableResponses('rlusd_withdrawal_requests', {
      maybeSingleResponses: [mockSuccess({ id: 'wd-process-1', user_id: authHeaders['x-test-user-id'], amount: 8, status: 'pending_review', destination_type: 'sinpe_mobile', destination_ref: '+50688887777' })],
      singleResponses: [
        mockSuccess({ id: 'wd-process-1', user_id: authHeaders['x-test-user-id'], amount: 8, status: 'processing', destination_type: 'sinpe_mobile', destination_ref: '+50688887777', payout_rail: 'sinpe_mobile', payout_provider: 'manual_sinpe_cr' }),
        mockSuccess({ id: 'wd-process-1', user_id: authHeaders['x-test-user-id'], amount: 8, status: 'processing', destination_type: 'sinpe_mobile', destination_ref: '+50688887777', payout_rail: 'sinpe_mobile', payout_provider: 'manual_sinpe_cr', payout_status: 'pending_manual_execution', payout_reference: 'sinpe-manual-wd-process-1-1' })
      ]
    });

    const response = await request(app)
      .post('/api/rlusd/withdrawals/wd-process-1/process')
      .set(adminHeaders)
      .send({ operatorNote: 'Validado manual' });

    expect(response.status).toBe(200);
    expect(response.body.request.status).toBe('processing');
    expect(response.body.request.payout_status).toBe('pending_manual_execution');
    expect(response.body.request.payout_provider).toBe('manual_sinpe_cr');
  });



  test('fail withdrawal devuelve reserved -> available', async () => {
    setTableResponses('rlusd_withdrawal_requests', {
      maybeSingleResponses: [mockSuccess({ id: 'wd-fail-1', user_id: authHeaders['x-test-user-id'], amount: 8, status: 'processing' }), mockSuccess({ id: 'wd-fail-1', user_id: authHeaders['x-test-user-id'], amount: 8, status: 'processing' })],
      singleResponses: [mockSuccess({ id: 'wd-fail-1', status: 'failed', failure_reason: 'processor' })]
    });
    setTableResponses('rlusd_balances', {
      maybeSingleResponses: [mockSuccess({ user_id: authHeaders['x-test-user-id'], rlusd_balance: 1, rlusd_reserved_balance: 8 })],
      singleResponses: [mockSuccess({ user_id: authHeaders['x-test-user-id'], rlusd_balance: 9, rlusd_reserved_balance: 0 })],
      upsertResponses: [mockSuccess({ user_id: authHeaders['x-test-user-id'], rlusd_balance: 9, rlusd_reserved_balance: 0 })]
    });
    setTableResponses('rlusd_transactions', { singleResponses: [mockSuccess({ id: 'rltx-release-2', type: 'withdrawal_release' })] });

    const response = await request(app)
      .post('/api/rlusd/withdrawals/wd-fail-1/fail')
      .set(adminHeaders)
      .send({ failureReason: 'processor' });

    expect(response.status).toBe(200);
    expect(response.body.request.status).toBe('failed');
  });

  test('complete withdrawal consume reserved', async () => {
    setTableResponses('rlusd_withdrawal_requests', {
      maybeSingleResponses: [mockSuccess({ id: 'wd-complete-1', user_id: authHeaders['x-test-user-id'], amount: 5, status: 'processing' }), mockSuccess({ id: 'wd-complete-1', user_id: authHeaders['x-test-user-id'], amount: 5, status: 'processing' })],
      singleResponses: [mockSuccess({ id: 'wd-complete-1', status: 'completed', completed_at: '2026-04-03T00:00:00.000Z' })]
    });
    setTableResponses('rlusd_balances', {
      maybeSingleResponses: [mockSuccess({ user_id: authHeaders['x-test-user-id'], rlusd_balance: 0, rlusd_reserved_balance: 5 })],
      singleResponses: [mockSuccess({ user_id: authHeaders['x-test-user-id'], rlusd_balance: 0, rlusd_reserved_balance: 0 })],
      upsertResponses: [mockSuccess({ user_id: authHeaders['x-test-user-id'], rlusd_balance: 0, rlusd_reserved_balance: 0 })]
    });
    setTableResponses('rlusd_transactions', { singleResponses: [mockSuccess({ id: 'rltx-complete-1', type: 'withdrawal_complete' })] });

    const response = await request(app)
      .post('/api/rlusd/withdrawals/wd-complete-1/complete')
      .set(adminHeaders)
      .send({ payoutReference: 'sinpe-ref-123', externalId: 'bank-op-1' });

    expect(response.status).toBe(200);
    expect(response.body.request.status).toBe('completed');
    expect(response.body.balance.reservedBalance).toBe(0);
  });



  test('provider callback completa retiro e ignora callback duplicado', async () => {
    setTableResponses('rlusd_withdrawal_requests', {
      maybeSingleResponses: [
        mockSuccess({ id: 'wd-cb-1', user_id: authHeaders['x-test-user-id'], amount: 5, status: 'processing', payout_provider: 'mock_global_fiat', payout_external_id: 'ext-cb-1' }),
        mockSuccess({ id: 'wd-cb-1', user_id: authHeaders['x-test-user-id'], amount: 5, status: 'processing', payout_provider: 'mock_global_fiat', payout_external_id: 'ext-cb-1' }),
        mockSuccess({ id: 'wd-cb-1', user_id: authHeaders['x-test-user-id'], amount: 5, status: 'processing', payout_provider: 'mock_global_fiat', payout_external_id: 'ext-cb-1' }),
        mockSuccess({ id: 'wd-cb-1', user_id: authHeaders['x-test-user-id'], amount: 5, status: 'completed', payout_provider: 'mock_global_fiat', payout_external_id: 'ext-cb-1' })
      ],
      singleResponses: [
        mockSuccess({ id: 'wd-cb-1', user_id: authHeaders['x-test-user-id'], amount: 5, status: 'completed', payout_provider: 'mock_global_fiat', payout_external_id: 'ext-cb-1' })
      ]
    });

    setTableResponses('rlusd_balances', {
      maybeSingleResponses: [mockSuccess({ user_id: authHeaders['x-test-user-id'], rlusd_balance: 0, rlusd_reserved_balance: 5 }), mockSuccess({ user_id: authHeaders['x-test-user-id'], rlusd_balance: 0, rlusd_reserved_balance: 0 })],
      singleResponses: [mockSuccess({ user_id: authHeaders['x-test-user-id'], rlusd_balance: 0, rlusd_reserved_balance: 0 })],
      upsertResponses: [mockSuccess({ user_id: authHeaders['x-test-user-id'], rlusd_balance: 0, rlusd_reserved_balance: 0 })]
    });

    setTableResponses('rlusd_transactions', {
      singleResponses: [mockSuccess({ id: 'rltx-cb-complete-1', type: 'withdrawal_complete' })]
    });

    const callbackPayload = { provider: 'mock_global_fiat', externalId: 'ext-cb-1', status: 'completed', payoutReference: 'provider-ref-1' };
    const first = await request(app)
      .post('/api/internal/rlusd/withdrawals/provider-callback')
      .set(signedCallbackHeaders(callbackPayload, { eventId: 'evt-cb-1' }))
      .send(callbackPayload);

    expect(first.status).toBe(200);
    expect(first.body.action).toBe('completed');

    const second = await request(app)
      .post('/api/internal/rlusd/withdrawals/provider-callback')
      .set(signedCallbackHeaders(callbackPayload, { eventId: 'evt-cb-1' }))
      .send(callbackPayload);

    expect(second.status).toBe(200);
    expect(second.body.duplicate).toBe(true);

    expect(tables.rlusd_transactions.api.single).toHaveBeenCalledTimes(1);
  });



  test('callback con firma inválida es rechazado', async () => {
    const payload = { provider: 'mock_global_fiat', externalId: 'ext-cb-2', status: 'completed' };
    const response = await request(app)
      .post('/api/internal/rlusd/withdrawals/provider-callback')
      .set({
        ...signedCallbackHeaders(payload, { eventId: 'evt-cb-invalid-sign' }),
        'x-payout-signature': 'deadbeef'
      })
      .send(payload);

    expect(response.status).toBe(401);
    expect(response.body.error).toBe('PAYOUT_SIGNATURE_INVALID');
  });

  test('callback con timestamp expirado es rechazado', async () => {
    const payload = { provider: 'mock_global_fiat', externalId: 'ext-cb-3', status: 'completed' };
    const oldTimestamp = Math.floor(Date.now() / 1000) - 3600;
    const response = await request(app)
      .post('/api/internal/rlusd/withdrawals/provider-callback')
      .set(signedCallbackHeaders(payload, { eventId: 'evt-cb-expired', timestamp: oldTimestamp }))
      .send(payload);

    expect(response.status).toBe(401);
    expect(response.body.error).toBe('PAYOUT_TIMESTAMP_EXPIRED');
  });

  test('callback con provider desconocido es rechazado', async () => {
    const payload = { provider: 'unknown_provider', externalId: 'ext-cb-4', status: 'completed' };
    const response = await request(app)
      .post('/api/internal/rlusd/withdrawals/provider-callback')
      .set({
        'x-payout-provider': 'unknown_provider',
        'x-payout-event-id': 'evt-cb-unknown',
        'x-payout-timestamp': String(Math.floor(Date.now() / 1000)),
        'x-payout-signature': 'bead'
      })
      .send(payload);

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('UNKNOWN_PAYOUT_PROVIDER');
  });

  test('callback replay conflictivo es rechazado', async () => {
    setTableResponses('rlusd_withdrawal_requests', {
      maybeSingleResponses: [mockSuccess({ id: 'wd-cb-5', user_id: authHeaders['x-test-user-id'], amount: 2, status: 'completed', payout_provider: 'mock_global_fiat', payout_external_id: 'ext-cb-5' })]
    });
    setTableResponses('rlusd_payout_events', {
      maybeSingleResponses: [mockSuccess({ id: 'evt-row-1', payout_request_id: 'wd-cb-5', payload_hash: 'not-the-same' })],
      updateResponses: [mockSuccess({ id: 'evt-row-1' })]
    });

    const payload = { provider: 'mock_global_fiat', externalId: 'ext-cb-5', status: 'completed' };
    const response = await request(app)
      .post('/api/internal/rlusd/withdrawals/provider-callback')
      .set(signedCallbackHeaders(payload, { eventId: 'evt-cb-conflict' }))
      .send(payload);

    expect(response.status).toBe(409);
    expect(response.body.error).toBe('PAYOUT_CALLBACK_REPLAY_CONFLICT');
  });



  test('rate limit básico en callback endpoint', async () => {
    process.env.PAYOUT_CALLBACK_RATE_LIMIT_WINDOW_MS = '60000';
    process.env.PAYOUT_CALLBACK_RATE_LIMIT_MAX = '1';

    const payload = { provider: 'mock_global_fiat', externalId: 'ext-rate-1', status: 'completed' };

    await request(app)
      .post('/api/internal/rlusd/withdrawals/provider-callback')
      .set(signedCallbackHeaders(payload, { eventId: 'evt-rate-1' }))
      .send(payload);

    const second = await request(app)
      .post('/api/internal/rlusd/withdrawals/provider-callback')
      .set(signedCallbackHeaders(payload, { eventId: 'evt-rate-2' }))
      .send(payload);

    expect(second.status).toBe(429);
    expect(second.body.error).toBe('RATE_LIMITED');

    process.env.PAYOUT_CALLBACK_RATE_LIMIT_MAX = '60';
  });

  test('callback provider sin secret configurado falla cerrado', async () => {
    const prev = process.env.PAYOUT_CALLBACK_SECRET_MOCK_GLOBAL_FIAT;
    delete process.env.PAYOUT_CALLBACK_SECRET_MOCK_GLOBAL_FIAT;

    const payload = { provider: 'mock_global_fiat', externalId: 'ext-cb-6', status: 'completed' };
    const response = await request(app)
      .post('/api/internal/rlusd/withdrawals/provider-callback')
      .set({
        'x-payout-provider': 'mock_global_fiat',
        'x-payout-event-id': 'evt-cb-nosecret',
        'x-payout-timestamp': String(Math.floor(Date.now() / 1000)),
        'x-payout-signature': 'bead'
      })
      .send(payload);

    expect(response.status).toBe(503);
    expect(response.body.error).toBe('PAYOUT_CALLBACK_SECRET_NOT_CONFIGURED');
    process.env.PAYOUT_CALLBACK_SECRET_MOCK_GLOBAL_FIAT = prev;
  });

  test('rechaza transición inválida fail luego de completed', async () => {
    setTableResponses('rlusd_withdrawal_requests', {
      maybeSingleResponses: [
        mockSuccess({ id: 'wd-invalid-1', user_id: authHeaders['x-test-user-id'], amount: 5, status: 'completed' }),
        mockSuccess({ id: 'wd-invalid-1', user_id: authHeaders['x-test-user-id'], amount: 5, status: 'completed' })
      ]
    });

    const response = await request(app)
      .post('/api/rlusd/withdrawals/wd-invalid-1/fail')
      .set(adminHeaders)
      .send({ failureReason: 'should not fail after completed' });

    expect(response.status).toBe(409);
    expect(response.body.error).toBe('INVALID_STATUS_TRANSITION');
  });

  test('list withdrawals funciona', async () => {
    setTableResponses('rlusd_withdrawal_requests', {
      selectResponses: [mockSuccess([{ id: 'wd-list-1', user_id: authHeaders['x-test-user-id'], amount: 5, fee_amount: 0, net_amount: 5, status: 'pending_review', destination_type: 'wallet', created_at: '2026-04-03T00:00:00.000Z', updated_at: '2026-04-03T00:00:00.000Z' }])]
    });

    const response = await request(app)
      .get('/api/rlusd/withdrawals')
      .set(authHeaders);

    expect(response.status).toBe(200);
    expect(Array.isArray(response.body.requests)).toBe(true);
    expect(response.body.requests[0].id).toBe('wd-list-1');
  });



  test('feature flag off bloquea create withdrawal', async () => {
    process.env.RLUSD_WITHDRAWALS_ENABLED = 'false';
    const response = await request(app)
      .post('/api/rlusd/withdrawals')
      .set(authHeaders)
      .set('Idempotency-Key', 'idem-off')
      .send({ amount: 10, destinationType: 'wallet' });

    expect(response.status).toBe(503);
    expect(response.body.error).toBe('RLUSD_WITHDRAWALS_DISABLED');
    process.env.RLUSD_WITHDRAWALS_ENABLED = 'true';
  });



  test('feature flag SINPE off bloquea create SINPE withdrawal', async () => {
    process.env.RLUSD_SINPE_MOBILE_ENABLED = 'false';

    const response = await request(app)
      .post('/api/rlusd/withdrawals')
      .set(authHeaders)
      .set('Idempotency-Key', 'idem-sinpe-off')
      .send({ amount: 10, destinationType: 'sinpe_mobile', destinationRef: '88887777' });

    expect(response.status).toBe(503);
    expect(response.body.error).toBe('RLUSD_SINPE_MOBILE_DISABLED');
    process.env.RLUSD_SINPE_MOBILE_ENABLED = 'true';
  });

  test('transición inválida fail desde pending_review devuelve 409', async () => {
    setTableResponses('rlusd_withdrawal_requests', {
      maybeSingleResponses: [mockSuccess({ id: 'wd-invalid-1', user_id: authHeaders['x-test-user-id'], amount: 10, status: 'pending_review' }), mockSuccess({ id: 'wd-invalid-1', user_id: authHeaders['x-test-user-id'], amount: 10, status: 'pending_review' })]
    });

    const response = await request(app)
      .post('/api/rlusd/withdrawals/wd-invalid-1/fail')
      .set(adminHeaders)
      .send({ failureReason: 'x' });

    expect(response.status).toBe(409);
    expect(response.body.error).toBe('INVALID_STATUS_TRANSITION');
  });

  test('RLUSD transactions endpoint funciona', async () => {
    setTableResponses('rlusd_transactions', {
      selectResponses: [mockSuccess([
        {
          id: 'rlusd-tx-1',
          user_id: authHeaders['x-test-user-id'],
          amount: 9.7,
          direction: 'credit',
          type: 'conversion_credit',
          reference_id: 'conv-1',
          created_at: '2026-04-03T00:00:00.000Z'
        }
      ])]
    });

    const response = await request(app)
      .get('/api/rlusd/transactions')
      .set(authHeaders);

    expect(response.status).toBe(200);
    expect(response.body.ok).toBe(true);
    expect(response.body.transactions[0].id).toBe('rlusd-tx-1');
  });
});
