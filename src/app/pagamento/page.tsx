import { Suspense } from "react";
import PagamentoClient from "./PagamentoClient";

function PagamentoFallback() {
  return (
    <main className="min-h-screen bg-white p-10 text-black">
      <div className="mx-auto max-w-4xl">
        <p>Carregando pagamento...</p>
      </div>
    </main>
  );
}

export default function PagamentoPage() {
  return (
    <Suspense fallback={<PagamentoFallback />}>
      <PagamentoClient />
    </Suspense>
  );
}
