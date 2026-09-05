"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";

import { supabase } from "@/lib/supabase";

type Pedido = {
  id: string;
  numero_pedido: number;
  created_at: string;
  status_pagamento: string;
  total: number;
};

type ItemRetirada = {
  id: string;
  retirada_id: string;
  quantidade: number;

  itens_pedido: {
    nome_produto: string;
    codigo_produto: string;
  } | null;
};

type Retirada = {
  id: string;
  sequencia: number;
  status: string;
  checkin_em: string | null;
  entregue_em: string | null;

  unidades: {
    id: string;
    codigo: string;
    nome: string;
    cidade: string | null;
    estado: string | null;
  } | null;
};

export default function AdminPedidoDetalhePage() {
  const params = useParams();
  const router = useRouter();

  const numero = Number(params.numero);

  const [pedido, setPedido] =
    useState<Pedido | null>(null);

  const [retiradas, setRetiradas] =
    useState<Retirada[]>([]);

  const [itensRetirada, setItensRetirada] =
    useState<ItemRetirada[]>([]);

  const [mensagem, setMensagem] =
    useState("");

  const [carregando, setCarregando] =
    useState(true);

  const carregarPedido =
    useCallback(async () => {
      setCarregando(true);
      setMensagem("");

      /*
       * ================================================
       * AUTENTICAÇÃO
       * ================================================
       */

      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        router.push("/login");
        return;
      }

      /*
       * ================================================
       * ACESSO ADMIN
       * ================================================
       */

      const {
        data: perfil,
        error: perfilError,
      } = await supabase
        .from("perfil_cliente")
        .select("tipo_usuario")
        .eq("user_id", user.id)
        .maybeSingle();

      if (perfilError) {
        setMensagem(
          `Erro ao verificar acesso: ${perfilError.message}`
        );

        setCarregando(false);
        return;
      }

      if (
        !perfil ||
        perfil.tipo_usuario !== "admin"
      ) {
        router.push("/area-cliente");
        return;
      }

      /*
       * ================================================
       * PEDIDO COMERCIAL
       * ================================================
       */

      const {
        data: pedidoData,
        error: pedidoError,
      } = await supabase
        .from("pedidos")
        .select(`
          id,
          numero_pedido,
          created_at,
          status_pagamento,
          total
        `)
        .eq("numero_pedido", numero)
        .maybeSingle();

      if (pedidoError) {
        setMensagem(
          `Erro ao carregar pedido: ${pedidoError.message}`
        );

        setCarregando(false);
        return;
      }

      if (!pedidoData) {
        setMensagem(
          "Pedido não encontrado."
        );

        setCarregando(false);
        return;
      }

      setPedido(pedidoData);

      /*
       * ================================================
       * TODAS AS RETIRADAS DO PEDIDO
       * ================================================
       */

      const {
        data: retiradasData,
        error: retiradasError,
      } = await supabase
        .from("retiradas_pedido")
        .select(`
          id,
          sequencia,
          status,
          checkin_em,
          entregue_em,

          unidades (
            id,
            codigo,
            nome,
            cidade,
            estado
          )
        `)
        .eq(
          "pedido_id",
          pedidoData.id
        )
        .order("sequencia", {
          ascending: true,
        });

      if (retiradasError) {
        setMensagem(
          `Erro ao carregar retiradas: ${retiradasError.message}`
        );

        setCarregando(false);
        return;
      }

      const retiradasCarregadas =
        (retiradasData ??
          []) as unknown as Retirada[];

      setRetiradas(
        retiradasCarregadas
      );

      /*
       * ================================================
       * ITENS DAS RETIRADAS
       * ================================================
       */

      if (
        retiradasCarregadas.length >
        0
      ) {
        const idsRetiradas =
          retiradasCarregadas.map(
            (retirada) =>
              retirada.id
          );

        const {
          data: itensData,
          error: itensError,
        } = await supabase
          .from("itens_retirada")
          .select(`
            id,
            retirada_id,
            quantidade,

            itens_pedido (
              nome_produto,
              codigo_produto
            )
          `)
          .in(
            "retirada_id",
            idsRetiradas
          )
          .order("created_at", {
            ascending: true,
          });

        if (itensError) {
          setMensagem(
            `Erro ao carregar itens das retiradas: ${itensError.message}`
          );

          setCarregando(false);
          return;
        }

        setItensRetirada(
          (itensData ??
            []) as unknown as ItemRetirada[]
        );
      } else {
        setItensRetirada([]);
      }

      setCarregando(false);
    }, [numero, router]);

  useEffect(() => {
    const timer =
      window.setTimeout(() => {
        carregarPedido();
      }, 0);

    return () => {
      window.clearTimeout(timer);
    };
  }, [carregarPedido]);

  function formatarValor(
    valor: number
  ) {
    return Number(
      valor
    ).toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL",
    });
  }

  function formatarData(
    data: string
  ) {
    return new Date(
      data
    ).toLocaleString("pt-BR");
  }

  function traduzirStatusRetirada(
    status: string
  ) {
    switch (status) {
      case "recebido":
        return "Recebido";

      case "em_separacao":
        return "Em separação";

      case "pronto_retirada":
        return "Pronto para retirada";

      case "cliente_no_local":
        return "Cliente no local";

      case "entregue":
        return "Entregue";

      case "cancelado":
        return "Cancelado";

      default:
        return status;
    }
  }

  function traduzirPagamento(
    status: string
  ) {
    switch (status) {
      case "pendente":
        return "Pendente";

      case "aprovado":
        return "Aprovado";

      case "recusado":
        return "Recusado";

      case "cancelado":
        return "Cancelado";

      case "estornado":
        return "Estornado";

      default:
        return status;
    }
  }

  if (carregando) {
    return (
      <main className="min-h-screen bg-white p-10 text-black">
        <p>
          Carregando pedido...
        </p>
      </main>
    );
  }

  if (!pedido) {
    return (
      <main className="min-h-screen bg-white p-10 text-black">
        <div className="mx-auto max-w-5xl">
          <div className="rounded-xl border border-gray-300 p-6">
            <p>
              {mensagem ||
                "Pedido não encontrado."}
            </p>

            <button
              type="button"
              onClick={() =>
                router.push(
                  "/admin/pedidos"
                )
              }
              className="mt-5 rounded-lg bg-black px-5 py-3 font-semibold text-white"
            >
              Voltar para pedidos
            </button>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-white p-10 text-black">
      <div className="mx-auto max-w-5xl">
        {/* =============================================
            CABEÇALHO
        ============================================== */}

        <div className="mb-8 flex flex-col justify-between gap-5 md:flex-row md:items-start">
          <div>
            <p className="text-sm text-gray-500">
              Pedido comercial
            </p>

            <h1 className="text-3xl font-bold">
              Pedido nº{" "}
              {pedido.numero_pedido}
            </h1>

            <p className="mt-2 text-sm text-gray-500">
              {formatarData(
                pedido.created_at
              )}
            </p>
          </div>

          <div className="space-y-2 md:text-right">
            <p className="text-sm text-gray-500">
              Pagamento
            </p>

            <p className="text-lg font-bold">
              {traduzirPagamento(
                pedido.status_pagamento
              )}
            </p>

            <p className="text-xl font-bold">
              {formatarValor(
                pedido.total
              )}
            </p>
          </div>
        </div>

        {mensagem && (
          <div className="mb-6 rounded-xl border border-red-300 bg-red-50 p-5">
            {mensagem}
          </div>
        )}

        {/* =============================================
            EXPLICAÇÃO
        ============================================== */}

        <div className="mb-8 rounded-xl border border-gray-300 bg-gray-50 p-5">
          <p className="font-bold">
            Operação por retirada
          </p>

          <p className="mt-2 text-gray-600">
            Este pedido possui{" "}
            {retiradas.length}{" "}
            {retiradas.length === 1
              ? "retirada."
              : "retiradas."}{" "}
            Cada unidade opera somente os
            produtos destinados a ela.
          </p>
        </div>

        {/* =============================================
            RETIRADAS
        ============================================== */}

        {retiradas.length ===
          0 ? (
          <div className="rounded-xl border border-orange-300 bg-orange-50 p-6">
            Este pedido ainda não possui
            retirada cadastrada.
          </div>
        ) : (
          <div className="space-y-6">
            {retiradas.map(
              (retirada) => {
                const unidade =
                  retirada.unidades;

                const produtos =
                  itensRetirada.filter(
                    (item) =>
                      item.retirada_id ===
                      retirada.id
                  );

                return (
                  <div
                    key={retirada.id}
                    className="rounded-2xl border border-gray-300 p-6"
                  >
                    <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
                      <div>
                        <p className="text-sm text-gray-500">
                          Retirada{" "}
                          {
                            retirada.sequencia
                          }
                        </p>

                        <h2 className="mt-1 text-2xl font-bold">
                          {unidade?.nome ??
                            "Unidade O Box Driver"}
                        </h2>

                        {unidade?.cidade && (
                          <p className="mt-1 text-gray-500">
                            {
                              unidade.cidade
                            }
                            {unidade.estado
                              ? ` - ${unidade.estado}`
                              : ""}
                          </p>
                        )}

                        {unidade?.codigo && (
                          <p className="mt-1 text-sm text-gray-400">
                            {
                              unidade.codigo
                            }
                          </p>
                        )}
                      </div>

                      <span className="w-fit rounded-full border border-gray-300 px-4 py-2 font-semibold">
                        {traduzirStatusRetirada(
                          retirada.status
                        )}
                      </span>
                    </div>

                    {/* PRODUTOS */}

                    <div className="mt-5 rounded-xl bg-gray-50 p-5">
                      <p className="text-sm font-semibold text-gray-500">
                        Produtos desta
                        retirada
                      </p>

                      <div className="mt-3 space-y-2">
                        {produtos.map(
                          (item) => (
                            <div
                              key={
                                item.id
                              }
                              className="flex items-center justify-between rounded-lg bg-white p-3"
                            >
                              <div>
                                <p className="font-semibold">
                                  {item
                                    .itens_pedido
                                    ?.nome_produto ??
                                    "Produto"}
                                </p>

                                <p className="text-sm text-gray-500">
                                  {item
                                    .itens_pedido
                                    ?.codigo_produto ??
                                    "-"}
                                </p>
                              </div>

                              <p className="text-xl font-bold">
                                {
                                  item.quantidade
                                }
                              </p>
                            </div>
                          )
                        )}
                      </div>
                    </div>

                    {/* OPERAÇÃO */}

                    <button
                      type="button"
                      onClick={() =>
                        router.push(
                          `/admin/retiradas/${retirada.id}`
                        )
                      }
                      className="mt-6 w-full rounded-xl bg-black p-4 text-lg font-semibold text-white"
                    >
                      Operar Retirada{" "}
                      {
                        retirada.sequencia
                      }
                    </button>
                  </div>
                );
              }
            )}
          </div>
        )}

        <button
          type="button"
          onClick={() =>
            router.push(
              "/admin/pedidos"
            )
          }
          className="mt-8 w-full rounded-lg border border-gray-300 p-3 font-semibold"
        >
          Voltar para pedidos
        </button>
      </div>
    </main>
  );
}