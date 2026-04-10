type Props = {
  balance: number;
};

export default function AocWalletSummaryCard({ balance }: Props) {
  return (
    <div className="rounded-lg border bg-slate-50 p-4 shadow-sm">
      <p className="text-sm text-slate-600">Balance disponible</p>
      <p className="mt-2 text-3xl font-bold text-slate-900">{balance.toFixed(2)} AOCs</p>
      <p className="mt-1 text-xs text-slate-600">
        Este balance representa el valor recibido por accesos autorizados a tu perfil.
      </p>
    </div>
  );
}
