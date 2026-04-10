type Props = {
  onIntent: () => void;
};

export default function RlusdConversionCard({ onIntent }: Props) {
  return (
    <div className="rounded-lg border border-indigo-200 bg-indigo-50/50 p-4 shadow-sm space-y-2">
      <h3 className="text-base font-semibold text-slate-900">Conversión a RLUSD próximamente</h3>
      <p className="text-sm text-slate-700">
        Próximamente podrás convertir tus AOCs a RLUSD desde tu wallet.
      </p>
      <button
        type="button"
        aria-disabled="true"
        onClick={onIntent}
        className="rounded-lg border border-indigo-300 bg-white px-3 py-2 text-sm font-medium text-indigo-700"
      >
        Convertir a RLUSD (próximamente)
      </button>
    </div>
  );
}
