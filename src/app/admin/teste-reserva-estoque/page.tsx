"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";

type Distribuicao = {
  unidade_id: string;
  unidade_codigo: string;
  unidade_nome: string;
  cidade: string | null;
  estado: string | null;
  estoque_fisico: number;
  ja_reservado: number;
  disponivel_antes_reserva: number;
  quantidade_reservada: number;
};

type ProdutoReserva = {
  produto_id: string;
  codigo: string;
  produto: string;
  quantidade_solicitada: number;
  distribuicao: Distribuicao[];
};

type ResultadoReserva = {
  sucesso: boolean;
  reserva_id: string;
  status: string;
  tempo_reserva_minutos: number;
  reservado_em: string;
  expira_em: string;
  produtos: ProdutoReserva[];
};

export default function TesteReservaEstoquePage() {
  const [quantidade, setQuantidade] = useState(23);
  const [resultado, setResultado] =
    useState<ResultadoReserva | null>(null);
  const [mensagem, setMensagem] = useState("");
  const [carregando, setCarregando] = useState(false);

  async function criarReserva() {
    setMensagem("");
    setResultado(null);
    setCarregando(true);

    const {
      data: produto,
      error: produtoError,
    } = await supabase
      .from("produtos")
      .select("id, codigo")
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
      "criar_reserva_estoque",
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

    setResultado(data as ResultadoReserva);
    setCarregando(false);
  }

  return (
    <main className="min-h-screen bg-white p-10 text-black">
      <div className="mx-auto max-w-3xl">
        <h1 className="text-3xl font-bold">
          Teste de reserva de estoque
        </h1>

        <p className="mt-2 text-gray-500">
          Cria uma reserva temporária sem baixar o estoque físico.
        </p>

        <div className="mt-8 rounded-xl border border-gray-300 p-6">
          <label className="font-semibold">
            Quantidade de Silicone
          </label>

          <input
            type="number"
            min={1}
            value={quantidade}
            onChange={(event) =>
              setQuantidade(Number(event.target.value))
            }
            className="mt-3 w-full rounded-lg border border-gray-300 p-3"
          />

          <button
            type="button"
            onClick={criarReserva}
            disabled={carregando}
            className="mt-5 w-full rounded-lg bg-black p-4 font-semibold text-white disabled:bg-gray-400"
          >
            {carregando
              ? "Criando reserva..."
              : "Criar reserva temporária"}
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
                Reserva
              </p>

              <p className="mt-1 break-all font-bold">
                {resultado.reserva_id}
              </p>

              <p className="mt-3">
                Status: <strong>{resultado.status}</strong>
              </p>

              <p className="mt-1">
                Tempo:{" "}
                <strong>
                  {resultado.tempo_reserva_minutos} minutos
                </strong>
              </p>

              <p className="mt-1 text-sm text-gray-500">
                Expira em:{" "}
                {new Date(
                  resultado.expira_em
                ).toLocaleString("pt-BR")}
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
                  Solicitado: {produto.quantidade_solicitada}
                </p>

                <div className="mt-5 space-y-3">
                  {produto.distribuicao.map((item) => (
                    <div
                      key={item.unidade_id}
                      className="rounded-lg bg-gray-50 p-4"
                    >
                      <div className="flex items-center justify-between gap-4">
                        <div>
                          <p className="font-semibold">
                            {item.unidade_nome}
                          </p>

                          <p className="text-sm text-gray-500">
                            {item.unidade_codigo}
                          </p>
                        </div>

                        <p className="text-2xl font-bold">
                          {item.quantidade_reservada}
                        </p>
                      </div>

                      <div className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
                        <div>
                          <p className="text-gray-500">
                            Físico
                          </p>
                          <p className="font-semibold">
                            {item.estoque_fisico}
                          </p>
                        </div>

                        <div>
                          <p className="text-gray-500">
                            Já reservado
                          </p>
                          <p className="font-semibold">
                            {item.ja_reservado}
                          </p>
                        </div>

                        <div>
                          <p className="text-gray-500">
                            Disponível antes
                          </p>
                          <p className="font-semibold">
                            {item.disponivel_antes_reserva}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}