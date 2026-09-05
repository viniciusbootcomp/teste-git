"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";

type Distribuicao = {
  unidade_id: string;
  unidade_codigo: string;
  unidade_nome: string;
  cidade: string | null;
  estado: string | null;
  estoque_disponivel: number;
  quantidade_alocada: number;
};

type ProdutoResultado = {
  produto_id: string;
  codigo: string;
  produto: string;
  quantidade_solicitada: number;
  distribuicao: Distribuicao[];
};

type ResultadoSimulacao = {
  sucesso: boolean;
  quantidade_unidades_retirada: number;
  retirada_unica: boolean;
  produtos: ProdutoResultado[];
};

export default function TesteDistribuicaoPage() {
  const [quantidade, setQuantidade] = useState(23);
  const [resultado, setResultado] =
    useState<ResultadoSimulacao | null>(null);

  const [mensagem, setMensagem] = useState("");
  const [carregando, setCarregando] = useState(false);

  async function testar() {
    setMensagem("");
    setResultado(null);
    setCarregando(true);

    const {
      data: produto,
      error: produtoError,
    } = await supabase
      .from("produtos")
      .select("id")
      .eq("codigo", "SIL-PU-001")
      .maybeSingle();

    if (produtoError || !produto) {
      setMensagem(
        produtoError?.message ??
          "Produto SIL-PU-001 não encontrado."
      );

      setCarregando(false);
      return;
    }

    const { data, error } = await supabase.rpc(
      "simular_distribuicao_pedido",
      {
        p_itens: [
          {
            produto_id: produto.id,
            quantidade,
          },
        ],
      }
    );

    if (error) {
      setMensagem(error.message);
      setCarregando(false);
      return;
    }

    setResultado(data as ResultadoSimulacao);
    setCarregando(false);
  }

  return (
    <main className="min-h-screen bg-white p-10 text-black">
      <div className="mx-auto max-w-3xl">
        <h1 className="text-3xl font-bold">
          Teste de distribuição
        </h1>

        <p className="mt-2 text-gray-500">
          Simulação oficial calculada pelo banco de dados.
        </p>

        <div className="mt-8 rounded-xl border border-gray-300 p-6">
          <label className="font-semibold">
            Quantidade de silicone
          </label>

          <input
            type="number"
            min={1}
            value={quantidade}
            onChange={(event) =>
              setQuantidade(
                Number(event.target.value)
              )
            }
            className="mt-3 w-full rounded-lg border border-gray-300 p-3"
          />

          <button
            onClick={testar}
            disabled={carregando}
            className="mt-4 w-full rounded-lg bg-black p-3 font-semibold text-white disabled:bg-gray-400"
          >
            {carregando
              ? "Calculando..."
              : "Simular distribuição"}
          </button>
        </div>

        {mensagem && (
          <div className="mt-6 rounded-xl border border-red-300 bg-red-50 p-5">
            {mensagem}
          </div>
        )}

        {resultado && (
          <div className="mt-8 space-y-6">
            <div className="rounded-xl border border-gray-300 p-5">
              <p className="text-sm text-gray-500">
                Quantidade de unidades de retirada
              </p>

              <p className="mt-1 text-2xl font-bold">
                {
                  resultado.quantidade_unidades_retirada
                }
              </p>
            </div>

            {resultado.produtos.map((produto) => (
              <div
                key={produto.produto_id}
                className="rounded-xl border border-gray-300 p-6"
              >
                <h2 className="text-xl font-bold">
                  {produto.produto}
                </h2>

                <p className="mt-1 text-sm text-gray-500">
                  Solicitado:{" "}
                  {produto.quantidade_solicitada}
                </p>

                <div className="mt-5 space-y-3">
                  {produto.distribuicao.map(
                    (item) => (
                      <div
                        key={item.unidade_id}
                        className="flex items-center justify-between rounded-lg bg-gray-50 p-4"
                      >
                        <div>
                          <p className="font-semibold">
                            {item.unidade_nome}
                          </p>

                          <p className="text-sm text-gray-500">
                            {item.cidade}
                            {item.estado
                              ? ` - ${item.estado}`
                              : ""}
                          </p>
                        </div>

                        <div className="text-right">
                          <p className="text-xl font-bold">
                            {
                              item.quantidade_alocada
                            }
                          </p>

                          <p className="text-xs text-gray-500">
                            estoque local:{" "}
                            {
                              item.estoque_disponivel
                            }
                          </p>
                        </div>
                      </div>
                    )
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}