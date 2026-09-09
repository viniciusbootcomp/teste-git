"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import { supabase } from "@/lib/supabase";

type ItemCarrinho = {
  id: string;
  nome: string;
  preco: number;
  codigo: string;
  quantidade: number;
  estoque: number;
};

type UnidadeEstoque = {
  quantidade: number;

  unidades: {
    id: string;
    codigo: string;
    ativo: boolean;
  } | null;
};

type ProdutoBanco = {
  id: string;
  estoque_unidade: UnidadeEstoque[];
};

type ReservaLocal = {
  reserva_id: string;
  expira_em?: string;
  tempo_reserva_minutos?: number;
};

type ReservaBanco = {
  id: string;
  status: string;
  expira_em: string;
  user_id: string;
};

type ItemReservaBanco = {
  produto_id: string;
  quantidade: number;
};

export default function CarrinhoPage() {
  const [itens, setItens] =
    useState<ItemCarrinho[]>([]);

  const [carregando, setCarregando] =
    useState(true);

  const [
    validandoEstoque,
    setValidandoEstoque,
  ] = useState(false);

  const [
    alterandoCarrinho,
    setAlterandoCarrinho,
  ] = useState(false);

  const [
    erroValidacao,
    setErroValidacao,
  ] = useState("");

  const [
    reservaPropriaAtiva,
    setReservaPropriaAtiva,
  ] = useState<string | null>(
    null
  );

  /*
   * =====================================================
   * BUSCA RESERVA ATIVA DO PRÓPRIO CLIENTE
   * =====================================================
   */

  async function carregarPropriaReserva(): Promise<
    Map<string, number>
  > {
    const resultado =
      new Map<string, number>();

    setReservaPropriaAtiva(
      null
    );

    const reservaSalva =
      localStorage.getItem(
        "reserva_pagamento"
      );

    if (!reservaSalva) {
      return resultado;
    }

    let reservaLocal:
      | ReservaLocal
      | null = null;

    try {
      reservaLocal =
        JSON.parse(
          reservaSalva
        ) as ReservaLocal;
    } catch {
      localStorage.removeItem(
        "reserva_pagamento"
      );

      return resultado;
    }

    if (
      !reservaLocal?.reserva_id
    ) {
      return resultado;
    }

    const {
      data: { user },
      error: userError,
    } =
      await supabase.auth.getUser();

    if (
      userError ||
      !user
    ) {
      return resultado;
    }

    const {
      data: reservaData,
      error: reservaError,
    } = await supabase
      .from(
        "reservas_estoque"
      )
      .select(`
        id,
        status,
        expira_em,
        user_id
      `)
      .eq(
        "id",
        reservaLocal.reserva_id
      )
      .maybeSingle();

    if (
      reservaError ||
      !reservaData
    ) {
      return resultado;
    }

    const reserva =
      reservaData as ReservaBanco;

    if (
      reserva.user_id !==
      user.id
    ) {
      return resultado;
    }

    if (
      reserva.status !==
      "ativa"
    ) {
      localStorage.removeItem(
        "reserva_pagamento"
      );

      return resultado;
    }

    const expiraEm =
      new Date(
        reserva.expira_em
      ).getTime();

    if (
      !Number.isFinite(
        expiraEm
      ) ||
      expiraEm <= Date.now()
    ) {
      localStorage.removeItem(
        "reserva_pagamento"
      );

      return resultado;
    }

    setReservaPropriaAtiva(
      reserva.id
    );

    const {
      data: itensReserva,
      error:
        itensReservaError,
    } = await supabase
      .from(
        "itens_reserva_estoque"
      )
      .select(`
        produto_id,
        quantidade
      `)
      .eq(
        "reserva_id",
        reserva.id
      );

    if (
      itensReservaError
    ) {
      return resultado;
    }

    for (
      const item of
      (itensReserva ??
        []) as ItemReservaBanco[]
    ) {
      const quantidadeAtual =
        resultado.get(
          item.produto_id
        ) ?? 0;

      resultado.set(
        item.produto_id,
        quantidadeAtual +
          Number(
            item.quantidade
          )
      );
    }

    return resultado;
  }

  /*
   * =====================================================
   * CANCELA RESERVA ATIVA ANTES DE ALTERAR CARRINHO
   * =====================================================
   */

  async function cancelarReservaAntesDeAlterar(): Promise<boolean> {
    if (
      !reservaPropriaAtiva
    ) {
      return true;
    }

    setAlterandoCarrinho(
      true
    );

    setErroValidacao(
      ""
    );

    const {
      data,
      error,
    } = await supabase.rpc(
      "cancelar_reserva_estoque",
      {
        p_reserva_id:
          reservaPropriaAtiva,
      }
    );

    if (error) {
      setErroValidacao(
        `Não foi possível liberar a reserva anterior: ${error.message}`
      );

      setAlterandoCarrinho(
        false
      );

      return false;
    }

    if (data !== true) {
      setErroValidacao(
        "A reserva anterior não pôde ser cancelada."
      );

      setAlterandoCarrinho(
        false
      );

      return false;
    }

    /*
     * A reserva antiga não representa mais o carrinho.
     */
    localStorage.removeItem(
      "reserva_pagamento"
    );

    setReservaPropriaAtiva(
      null
    );

    setAlterandoCarrinho(
      false
    );

    return true;
  }

  /*
   * =====================================================
   * CONSULTA DISPONIBILIDADE REAL
   * =====================================================
   */

  const validarDisponibilidade =
    useCallback(
      async (
        itensBase: ItemCarrinho[]
      ) => {
        if (
          itensBase.length === 0
        ) {
          setItens([]);
          setCarregando(false);
          return;
        }

        setValidandoEstoque(
          true
        );

        setErroValidacao(
          ""
        );

        const quantidadesPropriaReserva =
          await carregarPropriaReserva();

        const idsProdutos =
          itensBase.map(
            (item) =>
              item.id
          );

        const {
          data: produtosData,
          error:
            produtosError,
        } = await supabase
          .from(
            "produtos"
          )
          .select(`
            id,

            estoque_unidade (
              quantidade,

              unidades (
                id,
                codigo,
                ativo
              )
            )
          `)
          .in(
            "id",
            idsProdutos
          )
          .eq(
            "ativo",
            true
          );

        if (
          produtosError
        ) {
          setErroValidacao(
            `Não foi possível atualizar o estoque: ${produtosError.message}`
          );

          setItens(
            itensBase
          );

          setValidandoEstoque(
            false
          );

          setCarregando(
            false
          );

          return;
        }

        const produtos =
          (produtosData ??
            []) as unknown as ProdutoBanco[];

        const itensAtualizados =
          await Promise.all(
            itensBase.map(
              async (
                item
              ): Promise<ItemCarrinho> => {
                const produto =
                  produtos.find(
                    (
                      produtoAtual
                    ) =>
                      produtoAtual.id ===
                      item.id
                  );

                if (!produto) {
                  return {
                    ...item,
                    estoque: 0,
                  };
                }

                const estoquesAtivos =
                  produto.estoque_unidade.filter(
                    (
                      estoque
                    ) =>
                      estoque.unidades
                        ?.ativo ===
                      true
                  );

                const disponibilidades =
                  await Promise.all(
                    estoquesAtivos.map(
                      async (
                        estoque
                      ) => {
                        const unidade =
                          estoque.unidades;

                        if (
                          !unidade
                        ) {
                          return 0;
                        }

                        const {
                          data:
                            quantidadeDisponivel,
                          error:
                            disponibilidadeError,
                        } =
                          await supabase.rpc(
                            "estoque_disponivel_unidade",
                            {
                              p_produto_id:
                                item.id,

                              p_unidade_id:
                                unidade.id,
                            }
                          );

                        if (
                          disponibilidadeError
                        ) {
                          console.error(
                            `Erro ao consultar estoque do produto ${item.codigo} na unidade ${unidade.codigo}:`,
                            disponibilidadeError.message
                          );

                          return 0;
                        }

                        return Math.max(
                          0,
                          Number(
                            quantidadeDisponivel ??
                              0
                          )
                        );
                      }
                    )
                  );

                const disponibilidadeGeral =
                  disponibilidades.reduce(
                    (
                      total,
                      quantidade
                    ) =>
                      total +
                      quantidade,
                    0
                  );

                const quantidadePropriaReserva =
                  quantidadesPropriaReserva.get(
                    item.id
                  ) ?? 0;

                return {
                  ...item,

                  estoque:
                    disponibilidadeGeral +
                    quantidadePropriaReserva,
                };
              }
            )
          );

        setItens(
          itensAtualizados
        );

        localStorage.setItem(
          "carrinho",
          JSON.stringify(
            itensAtualizados
          )
        );

        setValidandoEstoque(
          false
        );

        setCarregando(
          false
        );
      },
      []
    );

  /*
   * =====================================================
   * CARREGA CARRINHO
   * =====================================================
   */

  useEffect(() => {
    const carregarCarrinho =
      window.setTimeout(
        async () => {
          const carrinhoSalvo =
            localStorage.getItem(
              "carrinho"
            );

          if (
            !carrinhoSalvo
          ) {
            setCarregando(
              false
            );

            return;
          }

          try {
            const carrinho =
              JSON.parse(
                carrinhoSalvo
              ) as ItemCarrinho[];

            await validarDisponibilidade(
              carrinho
            );
          } catch {
            localStorage.removeItem(
              "carrinho"
            );

            setItens([]);

            setCarregando(
              false
            );
          }
        },
        0
      );

    return () => {
      window.clearTimeout(
        carregarCarrinho
      );
    };
  }, [
    validarDisponibilidade,
  ]);

  /*
   * =====================================================
   * REVALIDA AO VOLTAR PARA ABA
   * =====================================================
   */

  useEffect(() => {
    function verificarRetornoAba() {
      if (
        document.visibilityState !==
        "visible"
      ) {
        return;
      }

      const carrinhoSalvo =
        localStorage.getItem(
          "carrinho"
        );

      if (
        !carrinhoSalvo
      ) {
        return;
      }

      try {
        const carrinho =
          JSON.parse(
            carrinhoSalvo
          ) as ItemCarrinho[];

        void validarDisponibilidade(
          carrinho
        );
      } catch {
        // Ignora aqui.
      }
    }

    document.addEventListener(
      "visibilitychange",
      verificarRetornoAba
    );

    return () => {
      document.removeEventListener(
        "visibilitychange",
        verificarRetornoAba
      );
    };
  }, [
    validarDisponibilidade,
  ]);

  function salvarCarrinho(
    novosItens: ItemCarrinho[]
  ) {
    setItens(
      novosItens
    );

    localStorage.setItem(
      "carrinho",
      JSON.stringify(
        novosItens
      )
    );
  }

  /*
   * =====================================================
   * ALTERAÇÕES DE CARRINHO
   * =====================================================
   */

  async function aumentarQuantidade(
    id: string
  ) {
    const item =
      itens.find(
        (produto) =>
          produto.id === id
      );

    if (!item) {
      return;
    }

    if (
      item.quantidade >=
      item.estoque
    ) {
      return;
    }

    const podeAlterar =
      await cancelarReservaAntesDeAlterar();

    if (!podeAlterar) {
      return;
    }

    const novosItens =
      itens.map(
        (produto) =>
          produto.id === id
            ? {
                ...produto,

                quantidade:
                  produto.quantidade +
                  1,
              }
            : produto
      );

    salvarCarrinho(
      novosItens
    );

    await validarDisponibilidade(
      novosItens
    );
  }

  async function diminuirQuantidade(
    id: string
  ) {
    const podeAlterar =
      await cancelarReservaAntesDeAlterar();

    if (!podeAlterar) {
      return;
    }

    const novosItens =
      itens
        .map(
          (item) =>
            item.id ===
            id
              ? {
                  ...item,

                  quantidade:
                    item.quantidade -
                    1,
                }
              : item
        )
        .filter(
          (item) =>
            item.quantidade >
            0
        );

    salvarCarrinho(
      novosItens
    );

    await validarDisponibilidade(
      novosItens
    );
  }

  async function ajustarParaDisponivel(
    id: string
  ) {
    const podeAlterar =
      await cancelarReservaAntesDeAlterar();

    if (!podeAlterar) {
      return;
    }

    const novosItens =
      itens
        .map(
          (item) => {
            if (
              item.id !==
              id
            ) {
              return item;
            }

            return {
              ...item,

              quantidade:
                Math.max(
                  0,
                  item.estoque
                ),
            };
          }
        )
        .filter(
          (item) =>
            item.quantidade >
            0
        );

    salvarCarrinho(
      novosItens
    );

    await validarDisponibilidade(
      novosItens
    );
  }

  async function removerItem(
    id: string
  ) {
    const podeAlterar =
      await cancelarReservaAntesDeAlterar();

    if (!podeAlterar) {
      return;
    }

    const novosItens =
      itens.filter(
        (item) =>
          item.id !== id
      );

    salvarCarrinho(
      novosItens
    );

    await validarDisponibilidade(
      novosItens
    );
  }

  async function limparCarrinho() {
    if (alterandoCarrinho) {
      return;
    }

    const confirmou = window.confirm(
      reservaPropriaAtiva
        ? "Tem certeza que deseja limpar o carrinho? A reserva de estoque atual será cancelada e os produtos voltarão a ficar disponíveis."
        : "Tem certeza que deseja limpar o carrinho?"
    );

    if (!confirmou) {
      return;
    }

    setErroValidacao("");

    const podeAlterar =
      await cancelarReservaAntesDeAlterar();

    if (!podeAlterar) {
      return;
    }

    /*
     * Limpa qualquer referência local antiga da reserva,
     * inclusive nos casos em que ela já expirou no banco.
     */
    localStorage.removeItem(
      "reserva_pagamento"
    );

    setReservaPropriaAtiva(
      null
    );

    salvarCarrinho([]);
  }

  /*
   * =====================================================
   * VALIDAÇÕES
   * =====================================================
   */

  const possuiItemIndisponivel =
    useMemo(() => {
      return itens.some(
        (item) =>
          item.estoque <=
            0 ||
          item.quantidade >
            item.estoque
      );
    }, [itens]);

  const total =
    useMemo(() => {
      return itens.reduce(
        (
          soma,
          item
        ) =>
          soma +
          Number(
            item.preco
          ) *
            Number(
              item.quantidade
            ),
        0
      );
    }, [itens]);

  if (carregando) {
    return (
      <main className="min-h-screen bg-white p-10 text-black">
        <div className="mx-auto max-w-4xl">
          <p>
            Atualizando disponibilidade...
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-white p-10 text-black">
      <div className="mx-auto max-w-4xl">
        <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold">
              Carrinho
            </h1>

            <p className="mt-2 text-sm text-gray-500">
              O estoque é atualizado com base na
              disponibilidade atual da rede.
            </p>
          </div>

          {itens.length > 0 && (
            <button
              type="button"
              onClick={() =>
                validarDisponibilidade(
                  itens
                )
              }
              disabled={
                validandoEstoque ||
                alterandoCarrinho
              }
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold disabled:opacity-50"
            >
              {validandoEstoque
                ? "Atualizando..."
                : "Atualizar disponibilidade"}
            </button>
          )}
        </div>

        {reservaPropriaAtiva && (
          <div className="mb-6 rounded-xl border border-green-300 bg-green-50 p-5">
            <p className="font-bold text-green-800">
              Você possui uma reserva de estoque ativa
            </p>

            <p className="mt-1 text-sm text-gray-600">
              Se você alterar o carrinho, essa reserva
              será liberada e uma nova reserva será criada
              quando você voltar ao pagamento.
            </p>

            <Link
              href={`/pagamento?reserva=${reservaPropriaAtiva}`}
              className="mt-4 inline-block rounded-lg bg-black px-4 py-2 text-sm font-semibold text-white"
            >
              Voltar para o pagamento
            </Link>
          </div>
        )}

        {alterandoCarrinho && (
          <div className="mb-6 rounded-xl border border-blue-300 bg-blue-50 p-4">
            Liberando reserva anterior e atualizando
            carrinho...
          </div>
        )}

        {erroValidacao && (
          <div className="mb-6 rounded-xl border border-red-300 bg-red-50 p-4">
            <p className="font-semibold">
              Não foi possível concluir a operação.
            </p>

            <p className="mt-1 text-sm">
              {erroValidacao}
            </p>
          </div>
        )}

        {itens.length === 0 ? (
          <div className="rounded-xl border border-gray-300 p-6">
            <p className="mb-4">
              Seu carrinho está vazio.
            </p>

            <Link
              href="/"
              className="inline-block rounded-lg bg-black px-5 py-3 font-semibold text-white"
            >
              Voltar ao catálogo
            </Link>
          </div>
        ) : (
          <>
            <div className="space-y-4">
              {itens.map(
                (item) => {
                  const subtotal =
                    Number(
                      item.preco
                    ) *
                    Number(
                      item.quantidade
                    );

                  const semEstoque =
                    item.estoque <=
                    0;

                  const quantidadeMaiorQueEstoque =
                    item.quantidade >
                    item.estoque;

                  const estoqueMaximo =
                    item.quantidade >=
                    item.estoque;

                  const possuiProblema =
                    semEstoque ||
                    quantidadeMaiorQueEstoque;

                  return (
                    <div
                      key={item.id}
                      className={`rounded-xl border p-5 ${
                        possuiProblema
                          ? "border-red-300 bg-red-50"
                          : "border-gray-300"
                      }`}
                    >
                      <div className="flex flex-col justify-between gap-4 md:flex-row">
                        <div>
                          <h2 className="text-xl font-bold">
                            {item.nome}
                          </h2>

                          <p className="text-sm text-gray-500">
                            Código: {item.codigo}
                          </p>

                          <p className="mt-2 text-sm">
                            Disponível para você:{" "}
                            <strong>
                              {item.estoque}
                            </strong>
                          </p>

                          <p className="mt-2 font-semibold">
                            {Number(
                              item.preco
                            ).toLocaleString(
                              "pt-BR",
                              {
                                style:
                                  "currency",
                                currency:
                                  "BRL",
                              }
                            )}
                          </p>
                        </div>

                        <div>
                          <div className="flex items-center gap-3">
                            <button
                              type="button"
                              onClick={() =>
                                void diminuirQuantidade(
                                  item.id
                                )
                              }
                              disabled={
                                alterandoCarrinho
                              }
                              className="h-10 w-10 rounded-lg border border-gray-300 bg-white text-xl font-bold disabled:opacity-40"
                            >
                              -
                            </button>

                            <span className="min-w-8 text-center font-bold">
                              {item.quantidade}
                            </span>

                            <button
                              type="button"
                              onClick={() =>
                                void aumentarQuantidade(
                                  item.id
                                )
                              }
                              disabled={
                                alterandoCarrinho ||
                                item.quantidade >=
                                  item.estoque
                              }
                              className="h-10 w-10 rounded-lg border border-gray-300 bg-white text-xl font-bold disabled:opacity-40"
                            >
                              +
                            </button>
                          </div>

                          {!possuiProblema &&
                            estoqueMaximo && (
                              <div className="mt-3 max-w-xs rounded-lg border border-orange-300 bg-orange-50 p-3 text-sm">
                                Limite de disponibilidade
                                atingido. Disponível para
                                você:{" "}
                                <strong>
                                  {item.estoque}
                                </strong>
                                .
                              </div>
                            )}
                        </div>
                      </div>

                      {semEstoque && (
                        <div className="mt-4 rounded-xl border border-red-300 bg-white p-4">
                          <p className="font-bold text-red-600">
                            Produto indisponível no momento
                          </p>

                          <button
                            type="button"
                            onClick={() =>
                              void removerItem(
                                item.id
                              )
                            }
                            disabled={
                              alterandoCarrinho
                            }
                            className="mt-3 rounded-lg bg-black px-4 py-2 text-sm font-semibold text-white disabled:bg-gray-400"
                          >
                            Remover do carrinho
                          </button>
                        </div>
                      )}

                      {!semEstoque &&
                        quantidadeMaiorQueEstoque && (
                          <div className="mt-4 rounded-xl border border-orange-300 bg-orange-50 p-4">
                            <p className="font-bold">
                              A disponibilidade mudou
                            </p>

                            <p className="mt-1 text-sm text-gray-600">
                              Você deseja{" "}
                              <strong>
                                {item.quantidade}
                              </strong>{" "}
                              unidade(s), mas existem apenas{" "}
                              <strong>
                                {item.estoque}
                              </strong>{" "}
                              disponíveis.
                            </p>

                            <button
                              type="button"
                              onClick={() =>
                                void ajustarParaDisponivel(
                                  item.id
                                )
                              }
                              disabled={
                                alterandoCarrinho
                              }
                              className="mt-3 rounded-lg bg-black px-4 py-2 text-sm font-semibold text-white disabled:bg-gray-400"
                            >
                              Ajustar para {item.estoque}
                            </button>
                          </div>
                        )}

                      <div className="mt-4 flex flex-wrap items-center justify-between gap-4 border-t border-gray-200 pt-4">
                        <p className="font-bold">
                          Subtotal:{" "}
                          {subtotal.toLocaleString(
                            "pt-BR",
                            {
                              style:
                                "currency",
                              currency:
                                "BRL",
                            }
                          )}
                        </p>

                        <button
                          type="button"
                          onClick={() =>
                            void removerItem(
                              item.id
                            )
                          }
                          disabled={
                            alterandoCarrinho
                          }
                          className="text-sm font-semibold underline disabled:opacity-40"
                        >
                          Remover
                        </button>
                      </div>
                    </div>
                  );
                }
              )}
            </div>

            <div className="mt-8 rounded-xl border border-gray-300 p-6">
              <p className="text-sm text-gray-500">
                Total estimado
              </p>

              <p className="mt-1 text-3xl font-bold">
                {total.toLocaleString(
                  "pt-BR",
                  {
                    style:
                      "currency",
                    currency:
                      "BRL",
                  }
                )}
              </p>

              {possuiItemIndisponivel ? (
                <div className="mt-6">
                  <div className="rounded-xl border border-orange-300 bg-orange-50 p-4">
                    <p className="font-bold">
                      Ajuste o carrinho para continuar
                    </p>
                  </div>

                  <button
                    type="button"
                    disabled
                    className="mt-4 w-full cursor-not-allowed rounded-lg bg-gray-400 p-3 font-semibold text-white"
                  >
                    Continuar para checkout
                  </button>
                </div>
              ) : reservaPropriaAtiva ? (
                <Link
                  href={`/pagamento?reserva=${reservaPropriaAtiva}`}
                  className="mt-6 block w-full rounded-lg bg-black p-3 text-center font-semibold text-white"
                >
                  Continuar pagamento
                </Link>
              ) : (
                <Link
                  href="/checkout"
                  className="mt-6 block w-full rounded-lg bg-black p-3 text-center font-semibold text-white"
                >
                  Continuar para checkout
                </Link>
              )}

              <button
                type="button"
                onClick={() =>
                  void limparCarrinho()
                }
                disabled={
                  alterandoCarrinho
                }
                className="mt-3 w-full rounded-lg border border-gray-300 p-3 font-semibold disabled:opacity-40"
              >
                {alterandoCarrinho
                  ? "Limpando carrinho..."
                  : "Limpar carrinho"}
              </button>

              <Link
                href="/"
                className="mt-3 block text-center text-sm font-semibold underline"
              >
                Continuar comprando
              </Link>
            </div>
          </>
        )}
      </div>
    </main>
  );
}