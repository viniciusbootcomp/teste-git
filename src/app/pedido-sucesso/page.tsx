import { Suspense } from "react";
import PedidoSucessoClient from "./PedidoSucessoClient";

function PedidoSucessoFallback() {
  return (
    <main className="min-h-screen bg-white p-10 text-black">
      <div className="mx-auto max-w-2xl">
        <p>Carregando pedido...</p>
      </div>
    </main>
  );
}

export default function PedidoSucessoPage() {
  return (
    <Suspense fallback={<PedidoSucessoFallback />}>
      <PedidoSucessoClient />
    </Suspense>
  );
}
