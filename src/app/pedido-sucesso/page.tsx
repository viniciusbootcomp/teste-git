"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";

export default function PedidoSucessoPage() {
  const searchParams = useSearchParams();

  const numeroPedido = searchParams.get("numero");

  return (
    <main className="min-h-screen bg-white p-10 text-black">
      <div className="mx-auto max-w-2xl">
        <div className="rounded-xl border border-gray-300 p-8">
          <h1 className="text-3xl font-bold">
            Pedido realizado com sucesso
          </h1>

          <p className="mt-4 text-gray-600">
            Seu pedido foi registrado.
          </p>

          {numeroPedido && (
            <div className="mt-6 rounded-lg border border-gray-300 p-4">
              <p className="text-sm text-gray-500">
                Número do pedido
              </p>

              <p className="mt-1 text-2xl font-bold">
                Pedido nº {numeroPedido}
              </p>
            </div>
          )}

          <div className="mt-8 space-y-3">
            <Link
              href="/"
              className="block w-full rounded-lg bg-black p-3 text-center font-semibold text-white"
            >
              Voltar ao catálogo
            </Link>

            <Link
              href="/area-cliente"
              className="block w-full rounded-lg border border-gray-300 p-3 text-center font-semibold"
            >
              Ir para área do cliente
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}