"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";

export default function TesteFinalizacaoMultiunidadePage() {
  const [mensagem, setMensagem] = useState("");
  const [pedidoCriado, setPedidoCriado] =
    useState<number | null>(null);
  const [carregando, setCarregando] =
    useState(false);

  async function finalizarTeste() {
    setMensagem("");
    setPedidoCriado(null);
    setCarregando(true);

    const {
      data: produtos,
      error: produtosError,
    } = await supabase
      .from("produtos")
      .select("id, nome, codigo")
      .in("codigo", [
        "SIL-PU-001",
        "BOX-180",
      ]);

    if (produtosError) {
      setMensagem(produtosError.message);
      setCarregando(false);
      return;
    }

    const silicone = produtos?.find(
      (produto) =>
        produto.codigo === "SIL-PU-001"
    );

    const box = produtos?.find(
      (produto) =>
        produto.codigo === "BOX-180"
    );

    if (!silicone || !box) {
      setMensagem(
        "Não foi possível localizar os dois produtos de teste."
      );

      setCarregando(false);
      return;
    }

    const { data, error } =
      await supabase.rpc(
        "finalizar_pedido_multiunidade",
        {
          p_itens: [
            {
              produto_id: silicone.id,
              quantidade: 23,
            },
            {
              produto_id: box.id,
              quantidade: 1,
            },
          ],
        }
      );

    if (error) {
      setMensagem(error.message);
      setCarregando(false);
      return;
    }

    setPedidoCriado(Number(data));

    setMensagem(
      `Pedido nº ${data} criado com sucesso com dois produtos.`
    );

    setCarregando(false);
  }

  return (
    <main className="min-h-screen bg-white p-10 text-black">
      <div className="mx-auto max-w-3xl">
        <h1 className="text-3xl font-bold">
          Teste multiunidade com 2 produtos
        </h1>

        <p className="mt-2 text-gray-500">
          Este teste cria um pedido real e baixa estoque.
        </p>

        <div className="mt-8 rounded-xl border border-gray-300 p-6">
          <p className="font-semibold">
            Carrinho de teste
          </p>

          <div className="mt-4 space-y-3">
            <div className="flex justify-between rounded-lg bg-gray-50 p-4">
              <span>
                Silicone PU
              </span>

              <strong>
                23
              </strong>
            </div>

            <div className="flex justify-between rounded-lg bg-gray-50 p-4">
              <span>
                Kit Box 1,80 m
              </span>

              <strong>
                1
              </strong>
            </div>
          </div>

          <button
            type="button"
            onClick={finalizarTeste}
            disabled={carregando}
            className="mt-5 w-full rounded-lg bg-black p-3 font-semibold text-white disabled:bg-gray-400"
          >
            {carregando
              ? "Criando pedido..."
              : "Criar pedido de teste"}
          </button>
        </div>

        {mensagem && (
          <div className="mt-6 rounded-xl border border-gray-300 p-5">
            {mensagem}
          </div>
        )}

        {pedidoCriado !== null && (
          <div className="mt-6">
            <a
              href={`/pedido/${pedidoCriado}`}
              className="inline-block rounded-lg border border-gray-300 px-5 py-3 font-semibold"
            >
              Abrir pedido criado
            </a>
          </div>
        )}
      </div>
    </main>
  );
}