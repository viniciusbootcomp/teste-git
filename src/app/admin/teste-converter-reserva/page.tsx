"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";

export default function TesteConverterReservaPage() {
  const [reservaId, setReservaId] = useState("");
  const [mensagem, setMensagem] = useState("");
  const [pedidoCriado, setPedidoCriado] =
    useState<number | null>(null);
  const [processando, setProcessando] =
    useState(false);

  async function converterReserva() {
    setMensagem("");
    setPedidoCriado(null);

    const id = reservaId.trim();

    if (!id) {
      setMensagem("Informe o ID da reserva.");
      return;
    }

    setProcessando(true);

    const { data, error } = await supabase.rpc(
      "converter_reserva_em_pedido",
      {
        p_reserva_id: id,
      }
    );

    if (error) {
      setMensagem(
        `Não foi possível converter a reserva: ${error.message}`
      );

      setProcessando(false);
      return;
    }

    setPedidoCriado(Number(data));

    setMensagem(
      `Reserva convertida com sucesso. Pedido nº ${data} criado e aprovado.`
    );

    setProcessando(false);
  }

  return (
    <main className="min-h-screen bg-white p-10 text-black">
      <div className="mx-auto max-w-3xl">
        <h1 className="text-3xl font-bold">
          Teste de conversão da reserva
        </h1>

        <p className="mt-2 text-gray-500">
          Simula a confirmação de pagamento aprovado.
        </p>

        <div className="mt-8 rounded-xl border border-gray-300 p-6">
          <label className="font-semibold">
            ID da reserva
          </label>

          <input
            type="text"
            value={reservaId}
            onChange={(event) =>
              setReservaId(event.target.value)
            }
            placeholder="UUID da reserva"
            className="mt-3 w-full rounded-lg border border-gray-300 p-3"
          />

          <button
            type="button"
            onClick={converterReserva}
            disabled={processando}
            className="mt-5 w-full rounded-lg bg-black p-4 font-semibold text-white disabled:bg-gray-400"
          >
            {processando
              ? "Convertendo..."
              : "Simular pagamento aprovado"}
          </button>
        </div>

        {mensagem && (
          <div className="mt-6 rounded-xl border border-gray-300 p-5">
            {mensagem}
          </div>
        )}

        {pedidoCriado !== null && (
          <a
            href={`/pedido/${pedidoCriado}`}
            className="mt-6 inline-block rounded-lg border border-gray-300 px-5 py-3 font-semibold"
          >
            Abrir pedido criado
          </a>
        )}
      </div>
    </main>
  );
}