import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import AocWalletSummaryCard from '@/components/aoc-wallet/AocWalletSummaryCard';
import AocTransactionList from '@/components/aoc-wallet/AocTransactionList';
import RlusdConversionCard from '@/components/aoc-wallet/RlusdConversionCard';

const mockApiPost = jest.fn();
const mockApiGet = jest.fn();

jest.mock('@/lib/apiClient', () => ({
  apiPost: (...args: unknown[]) => mockApiPost(...args),
  apiGet: (...args: unknown[]) => mockApiGet(...args),
  ApiClientError: class ApiClientError extends Error {
    status: number;
    details?: unknown;

    constructor(message: string, status: number, details?: unknown) {
      super(message);
      this.status = status;
      this.details = details;
    }
  }
}));

describe('AOC wallet UI components', () => {
  beforeEach(() => {
    mockApiPost.mockReset();
    mockApiGet.mockReset();
  });

  test('renderiza balance disponible', () => {
    render(<AocWalletSummaryCard balance={12.5} />);
    expect(screen.getByText('Balance disponible')).toBeInTheDocument();
    expect(screen.getByText('12.50 AOCs')).toBeInTheDocument();
  });

  test('renderiza transacciones en timeline simple', () => {
    render(
      <AocTransactionList
        userId="candidate-1"
        transactions={[
          {
            id: 'tx-1',
            from_user_id: 'recruiter-1',
            to_user_id: 'candidate-1',
            amount: 8,
            type: 'access_payment',
            reference_id: 'candidate-1',
            created_at: '2026-03-20T10:00:00.000Z'
          }
        ]}
      />
    );

    expect(screen.getByText(/Recibiste 8.00 AOCs/i)).toBeInTheDocument();
    expect(screen.getByText(/Referencia: candidate-1/i)).toBeInTheDocument();
  });

  test('renderiza tarjeta de conversión y quote', async () => {
    mockApiPost.mockResolvedValueOnce({
      ok: true,
      quote: {
        sourceAmount: 100,
        quotedRate: 0.1,
        platformFeeAmount: 0.3,
        netTargetAmount: 9.7,
      },
    });

    render(
      <RlusdConversionCard
        aocBalance={120}
        rlusdBalance={0}
        requests={[]}
        rlusdTransactions={[]}
        onIntent={jest.fn()}
        onQuoteRequested={jest.fn()}
        onConversionRequested={jest.fn()}
        onConversionFailed={jest.fn()}
        onRequestCreated={jest.fn()}
        onRequestCancelled={jest.fn()}
        onRlusdBalanceViewed={jest.fn()}
      />
    );

    fireEvent.change(screen.getByPlaceholderText(/Ej. 100/i), { target: { value: '100' } });
    fireEvent.click(screen.getByText(/Obtener quote/i));

    await waitFor(() => {
      expect(screen.getByText(/Comisión/i)).toBeInTheDocument();
      expect(screen.getByText(/9.700000 RLUSD/i)).toBeInTheDocument();
    });
  });

  test('confirmación crea request', async () => {
    const onRequestCreated = jest.fn();
    mockApiPost
      .mockResolvedValueOnce({
        ok: true,
        quote: {
          sourceAmount: 100,
          quotedRate: 0.1,
          platformFeeAmount: 0.3,
          netTargetAmount: 9.7,
        },
      })
      .mockResolvedValueOnce({
        ok: true,
        conversionRequest: {
          id: 'conv-1',
          source_amount: 100,
          net_target_amount: 9.7,
          status: 'pending',
          created_at: '2026-04-01T00:00:00.000Z',
        },
        balanceAfterDebit: 20,
      });

    render(
      <RlusdConversionCard
        aocBalance={120}
        rlusdBalance={0}
        requests={[]}
        rlusdTransactions={[]}
        onIntent={jest.fn()}
        onQuoteRequested={jest.fn()}
        onConversionRequested={jest.fn()}
        onConversionFailed={jest.fn()}
        onRequestCreated={onRequestCreated}
        onRequestCancelled={jest.fn()}
        onRlusdBalanceViewed={jest.fn()}
      />
    );

    fireEvent.change(screen.getByPlaceholderText(/Ej. 100/i), { target: { value: '100' } });
    fireEvent.click(screen.getByText(/Obtener quote/i));
    await screen.findByText(/Confirmar conversión/i);

    fireEvent.click(screen.getByText(/Confirmar conversión/i));

    await waitFor(() => {
      expect(onRequestCreated).toHaveBeenCalledTimes(1);
      expect(screen.getByText(/Solicitud enviada/i)).toBeInTheDocument();
    });
  });

  test('render de historial vacío', () => {
    render(
      <RlusdConversionCard
        aocBalance={50}
        rlusdBalance={0}
        requests={[]}
        rlusdTransactions={[]}
        onIntent={jest.fn()}
        onQuoteRequested={jest.fn()}
        onConversionRequested={jest.fn()}
        onConversionFailed={jest.fn()}
        onRequestCreated={jest.fn()}
        onRequestCancelled={jest.fn()}
        onRlusdBalanceViewed={jest.fn()}
      />
    );

    expect(screen.getByText(/Todavía no tienes solicitudes de conversión/i)).toBeInTheDocument();
    expect(screen.getByText(/Todavía no tienes movimientos RLUSD/i)).toBeInTheDocument();
  });

  test('request completed aparece correctamente', () => {
    render(
      <RlusdConversionCard
        aocBalance={50}
        rlusdBalance={9.7}
        requests={[
          {
            id: 'req-1',
            source_amount: 80,
            net_target_amount: 7.76,
            status: 'completed',
            created_at: '2026-03-15T10:00:00.000Z',
          } as any,
        ]}
        rlusdTransactions={[]}
        onIntent={jest.fn()}
        onQuoteRequested={jest.fn()}
        onConversionRequested={jest.fn()}
        onConversionFailed={jest.fn()}
        onRequestCreated={jest.fn()}
        onRequestCancelled={jest.fn()}
        onRlusdBalanceViewed={jest.fn()}
      />
    );

    expect(screen.getByText(/80.00 AOC → 7.760000 RLUSD/i)).toBeInTheDocument();
    expect(screen.getByText('completed')).toBeInTheDocument();
    expect(screen.getByText(/acreditado a tu saldo RLUSD/i)).toBeInTheDocument();
  });

  test('cancelar request actualiza UI', async () => {
    const onRequestCancelled = jest.fn();
    mockApiPost.mockResolvedValueOnce({
      ok: true,
      request: {
        id: 'req-2',
        source_amount: 40,
        net_target_amount: 3.88,
        status: 'cancelled',
        created_at: '2026-03-15T10:00:00.000Z',
      },
      balanceAfterRefund: 90
    });

    render(
      <RlusdConversionCard
        aocBalance={50}
        rlusdBalance={0}
        requests={[
          {
            id: 'req-2',
            source_amount: 40,
            net_target_amount: 3.88,
            status: 'pending',
            created_at: '2026-03-15T10:00:00.000Z',
          } as any,
        ]}
        rlusdTransactions={[]}
        onIntent={jest.fn()}
        onQuoteRequested={jest.fn()}
        onConversionRequested={jest.fn()}
        onConversionFailed={jest.fn()}
        onRequestCreated={jest.fn()}
        onRequestCancelled={onRequestCancelled}
        onRlusdBalanceViewed={jest.fn()}
      />
    );

    fireEvent.click(screen.getByText(/Cancelar solicitud/i));
    await waitFor(() => {
      expect(onRequestCancelled).toHaveBeenCalledTimes(1);
      expect(screen.getByText(/Solicitud cancelada/i)).toBeInTheDocument();
    });
  });

  test('historial RLUSD con datos renderiza', () => {
    render(
      <RlusdConversionCard
        aocBalance={50}
        rlusdBalance={9.7}
        requests={[]}
        rlusdTransactions={[
          {
            id: 'rlusd-1',
            user_id: 'candidate-1',
            amount: 9.7,
            direction: 'credit',
            type: 'conversion_credit',
            reference_id: 'req-1',
            created_at: '2026-03-20T10:00:00.000Z'
          },
        ]}
        onIntent={jest.fn()}
        onQuoteRequested={jest.fn()}
        onConversionRequested={jest.fn()}
        onConversionFailed={jest.fn()}
        onRequestCreated={jest.fn()}
        onRequestCancelled={jest.fn()}
        onRlusdBalanceViewed={jest.fn()}
      />
    );

    expect(screen.getByText(/Recibiste 9.700000 RLUSD por conversión/i)).toBeInTheDocument();
    expect(screen.getByText(/Referencia: req-1/i)).toBeInTheDocument();
  });

  test('no rompe con estado vacío de transacciones', () => {
    render(<AocTransactionList userId="candidate-1" transactions={[]} />);
    expect(screen.getByText(/Todavía no tienes transacciones/i)).toBeInTheDocument();
  });
});
