import { jest } from '@jest/globals';
import request from 'supertest';
import { createSupabaseMock, mockSuccess } from '../utils/supabase-mock';

process.env.ALLOW_TEST_AUTH_BYPASS = 'true';

const { supabase, setTableResponses } = createSupabaseMock();

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
  const authHeaders = {
    'x-test-user-id': '00000000-0000-4000-8000-000000000001',
    'x-test-user-email': 'candidate@example.com',
    'x-test-user-role': 'user'
  };

  const adminHeaders = {
    ...authHeaders,
    'x-test-user-role': 'admin'
  };

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
      .send({});

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
        updated_at: '2026-04-03T00:00:00.000Z'
      })]
    });

    const response = await request(app)
      .get('/api/rlusd/balance')
      .set(authHeaders);

    expect(response.status).toBe(200);
    expect(response.body.ok).toBe(true);
    expect(response.body.balance).toBe(12.34);
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
