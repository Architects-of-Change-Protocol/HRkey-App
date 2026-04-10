import { fireEvent, render, screen } from '@testing-library/react';
import AocWalletSummaryCard from '@/components/aoc-wallet/AocWalletSummaryCard';
import AocTransactionList from '@/components/aoc-wallet/AocTransactionList';
import RlusdConversionCard from '@/components/aoc-wallet/RlusdConversionCard';

describe('AOC wallet UI components', () => {
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

  test('muestra placeholder de RLUSD y trackea intención de click', () => {
    const onIntent = jest.fn();
    render(<RlusdConversionCard onIntent={onIntent} />);

    const cta = screen.getByText(/Convertir a RLUSD/i);
    fireEvent.click(cta);

    expect(screen.getByText(/Conversión a RLUSD próximamente/i)).toBeInTheDocument();
    expect(onIntent).toHaveBeenCalledTimes(1);
  });

  test('no rompe con estado vacío de transacciones', () => {
    render(<AocTransactionList userId="candidate-1" transactions={[]} />);
    expect(screen.getByText(/Todavía no tienes transacciones/i)).toBeInTheDocument();
  });
});
