import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import AocWalletSummaryCard from '@/components/aoc-wallet/AocWalletSummaryCard';
import AocTransactionList from '@/components/aoc-wallet/AocTransactionList';
import RlusdConversionCard from '@/components/aoc-wallet/RlusdConversionCard';

const mockApiPost = jest.fn();

jest.mock('@/lib/apiClient', () => ({
  apiPost: (...args: unknown[]) => mockApiPost(...args),
  apiGet: jest.fn(),
  ApiClientError: class ApiClientError extends Error {}
}));

const baseProps = {
  aocBalance: 120,
  rlusdAvailableBalance: 20,
  rlusdReservedBalance: 0,
  requests: [],
  withdrawalRequests: [],
  rlusdTransactions: [],
  onIntent: jest.fn(),
  onQuoteRequested: jest.fn(),
  onConversionRequested: jest.fn(),
  onConversionFailed: jest.fn(),
  onRequestCreated: jest.fn(),
  onRequestCancelled: jest.fn(),
  onRlusdBalanceViewed: jest.fn(),
  onWithdrawalCreated: jest.fn(),
  onWithdrawalCancelled: jest.fn(),
  onWithdrawalQuoteRequested: jest.fn(),
  onWithdrawalRequested: jest.fn(),
  onWithdrawalFailed: jest.fn(),
  onWithdrawalCancelledEvent: jest.fn(),
};

describe('AOC wallet UI components', () => {
  beforeEach(() => mockApiPost.mockReset());

  test('renderiza balance RLUSD disponible/reservado', () => {
    render(<RlusdConversionCard {...baseProps} rlusdAvailableBalance={9.7} rlusdReservedBalance={2.3} />);
    expect(screen.getByText(/Disponible: 9.700000 RLUSD/i)).toBeInTheDocument();
    expect(screen.getByText(/Reservado: 2.300000 RLUSD/i)).toBeInTheDocument();
  });

  test('renderiza quote de retiro', async () => {
    mockApiPost.mockResolvedValueOnce({ ok: true, quote: { amount: 10, feeAmount: 0.25, netAmount: 9.75, minWithdrawal: 5, availableBalance: 20 } });
    render(<RlusdConversionCard {...baseProps} />);

    fireEvent.change(screen.getByPlaceholderText('Ej. 10'), { target: { value: '10' } });
    fireEvent.click(screen.getAllByText(/Obtener quote/i)[1]);

    await waitFor(() => expect(screen.getByText(/Recibirás/i)).toBeInTheDocument());
    expect(screen.getByText(/9.750000/i)).toBeInTheDocument();
  });

  test('crear solicitud de retiro funciona', async () => {
    const onWithdrawalCreated = jest.fn();
    mockApiPost
      .mockResolvedValueOnce({ ok: true, quote: { amount: 10, feeAmount: 0.25, netAmount: 9.75, minWithdrawal: 5, availableBalance: 20 } })
      .mockResolvedValueOnce({ ok: true, withdrawalRequest: { id: 'wd-1', status: 'pending_review' }, balance: { availableBalance: 10, reservedBalance: 10 } });

    render(<RlusdConversionCard {...baseProps} onWithdrawalCreated={onWithdrawalCreated} />);

    fireEvent.change(screen.getByPlaceholderText('Ej. 10'), { target: { value: '10' } });
    fireEvent.click(screen.getAllByText(/Obtener quote/i)[1]);
    await screen.findByText(/Solicitar retiro/i);
    fireEvent.click(screen.getAllByText(/Solicitar retiro/i)[1]);

    await waitFor(() => expect(onWithdrawalCreated).toHaveBeenCalledTimes(1));
  });

  test('cancelar retiro actualiza UI', async () => {
    const onWithdrawalCancelled = jest.fn();
    mockApiPost.mockResolvedValueOnce({ ok: true, request: { id: 'wd-2', status: 'cancelled' }, balance: { availableBalance: 20, reservedBalance: 0 } });

    render(<RlusdConversionCard {...baseProps} withdrawalRequests={[{ id: 'wd-2', amount: 10, fee_amount: 0.25, net_amount: 9.75, status: 'pending_review', destination_type: 'wallet', created_at: '2026-03-15T10:00:00.000Z', updated_at: '2026-03-15T10:00:00.000Z' } as any]} onWithdrawalCancelled={onWithdrawalCancelled} />);

    fireEvent.click(screen.getByText(/Cancelar solicitud/i));
    await waitFor(() => expect(onWithdrawalCancelled).toHaveBeenCalledTimes(1));
  });

  test('historial vacío no rompe', () => {
    render(<RlusdConversionCard {...baseProps} requests={[]} withdrawalRequests={[]} rlusdTransactions={[]} />);
    expect(screen.getByText(/Todavía no tienes solicitudes de retiro/i)).toBeInTheDocument();
  });

  test('historial con retiros renderiza bien', () => {
    render(<RlusdConversionCard {...baseProps} withdrawalRequests={[{ id: 'wd-3', amount: 5, fee_amount: 0.1, net_amount: 4.9, status: 'processing', destination_type: 'bank', destination_ref: 'IBAN 123', created_at: '2026-03-15T10:00:00.000Z', updated_at: '2026-03-15T10:00:00.000Z' } as any]} />);
    expect(screen.getByText(/Destino: bank - IBAN 123/i)).toBeInTheDocument();
  });

  test('componentes AOC base renderizan', () => {
    render(<AocWalletSummaryCard balance={12.5} />);
    render(<AocTransactionList userId="candidate-1" transactions={[]} />);
    expect(screen.getByText('12.50 AOCs')).toBeInTheDocument();
  });
});
