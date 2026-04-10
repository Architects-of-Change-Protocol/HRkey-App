import { jest } from '@jest/globals';

process.env.SUPABASE_URL = 'https://test.supabase.co';
process.env.SUPABASE_SERVICE_KEY = 'test-service-key';
process.env.AOC_ACCESS_PRICE_BASE = '10';

const fromMock = jest.fn();
const mockSupabaseClient = { from: fromMock };

jest.unstable_mockModule('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => mockSupabaseClient)
}));

const { processAccessPayment, getUserBalance } = await import('../../services/aocPayment.service.js');

function createTableBuilder(tableState) {
  const state = {
    mode: null,
    payload: null,
    filters: {}
  };

  const builder = {
    select: jest.fn(() => {
      if (!state.mode) state.mode = 'select';
      return builder;
    }),
    upsert: jest.fn((payload) => {
      state.mode = 'upsert';
      state.payload = payload;
      const row = payload[0];
      tableState[row.user_id] = { ...row };
      return builder;
    }),
    insert: jest.fn((payload) => {
      state.mode = 'insert';
      state.payload = payload;
      payload.forEach((row, idx) => tableState.push({ id: `tx-${tableState.length + idx + 1}`, ...row }));
      return builder;
    }),
    eq: jest.fn((field, value) => {
      state.filters[field] = value;
      return builder;
    }),
    maybeSingle: jest.fn(async () => {
      const row = tableState[state.filters.user_id] || null;
      return { data: row, error: null };
    }),
    single: jest.fn(async () => {
      if (state.mode === 'upsert') {
        const row = state.payload[0];
        return { data: tableState[row.user_id], error: null };
      }
      if (state.mode === 'insert') {
        return { data: tableState[tableState.length - 1], error: null };
      }
      return { data: null, error: null };
    })
  };

  return builder;
}

describe('aocPayment.service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('acceso con balance suficiente descuenta y registra transacciones', async () => {
    const balances = {
      'recruiter-1': { user_id: 'recruiter-1', aoc_balance: 25, updated_at: new Date().toISOString() },
      'candidate-1': { user_id: 'candidate-1', aoc_balance: 0, updated_at: new Date().toISOString() },
      hrkey_platform: { user_id: 'hrkey_platform', aoc_balance: 0, updated_at: new Date().toISOString() }
    };
    const txs = [];

    fromMock.mockImplementation((table) => {
      if (table === 'user_balances') return createTableBuilder(balances);
      if (table === 'aoc_transactions') return createTableBuilder(txs);
      throw new Error(`Unexpected table ${table}`);
    });

    const result = await processAccessPayment({ recruiterUserId: 'recruiter-1', candidateUserId: 'candidate-1', referenceId: 'candidate-1' });

    expect(result.balances.recruiter).toBe(15);
    expect(result.distribution.candidateAmount).toBe(8);
    expect(result.distribution.platformFee).toBe(2);
    expect(txs).toHaveLength(2);
  });

  test('acceso sin balance devuelve PAYMENT_REQUIRED', async () => {
    const balances = {
      'recruiter-1': { user_id: 'recruiter-1', aoc_balance: 4, updated_at: new Date().toISOString() },
      'candidate-1': { user_id: 'candidate-1', aoc_balance: 0, updated_at: new Date().toISOString() },
      hrkey_platform: { user_id: 'hrkey_platform', aoc_balance: 0, updated_at: new Date().toISOString() }
    };

    fromMock.mockImplementation((table) => {
      if (table === 'user_balances') return createTableBuilder(balances);
      if (table === 'aoc_transactions') return createTableBuilder([]);
      throw new Error(`Unexpected table ${table}`);
    });

    await expect(processAccessPayment({ recruiterUserId: 'recruiter-1', candidateUserId: 'candidate-1', referenceId: 'candidate-1' }))
      .rejects.toMatchObject({ code: 'PAYMENT_REQUIRED', status: 402 });
  });

  test('consulta de balance devuelve cero cuando no existe fila', async () => {
    fromMock.mockImplementation((table) => {
      if (table === 'user_balances') return createTableBuilder({});
      throw new Error(`Unexpected table ${table}`);
    });

    const balance = await getUserBalance('new-user');
    expect(balance.aoc_balance).toBe(0);
  });
});
