"use client";

import Link from "next/link";
import {
  useEffect,
  useMemo,
  useState,
} from "react";
import { useRouter } from "next/navigation";

import { supabase } from "@/lib/supabase";

type ItemCarrinho = {
  id: string;
  nome: string;
  preco: number;
  codigo: string;
  quantidade: number;
  estoque: number;
};

type ResultadoReserva = {
  sucesso: boolean;
  reserva_id: string;
  status: string;
  tempo_reserva_minutos: number;
  reservado_em: string;
  expira_em: string;
};

type ReservaBanco = {
  id: string;
  status: string;
  expira_em: string;
  reservado_em: string;
};

type ItemReservaBanco = {
  reserva_id: string;
  produto_id: string;
  quantidade: number;
};

type ReservaEncontrada = {
  id: string;
  expira_em: string;
  reservado_em: string;
};

export default function CheckoutPage() {
  const router = useRouter();

  const [itens, setItens] =
    useState<ItemCarrinho[]>([]);

  const [nome, setNome] =
    useState("");

  const [telefone, setTelefone] =
    useState("");

  const [email, setEmail] =
    useState("");

  const [carregando, setCarregando] =
    useState(true);

  const [finalizando, setFinalizando] =
    useState(false);

  const [mensagem, setMensagem] =
    useState("");

  /*
   * =====================================================
   * CARREGA CHECKOUT
   * =====================================================
   */

  useEffect(() => {
    const carregarCheckout =
      window.setTimeout(async () => {
        const carrinhoSalvo =
          localStorage.getItem(
            "carrinho"
          );

        if (carrinhoSalvo) {
          try {
            const carrinho =
              JSON.parse(
                carrinhoSalvo
              ) as ItemCarrinho[];

            setItens(carrinho);
          } catch {
            localStorage.removeItem(
              "carrinho"
            );
          }
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
          router.push(
            "/login"
          );

          return;
        }

        setEmail(
          user.email ?? ""
        );

        const {
          data: perfil,
          error: perfilError,
        } = await supabase
          .from(
            "perfil_cliente"
          )
          .select(
            "nome, telefone"
          )
          .eq(
            "user_id",
            user.id
          )
          .maybeSingle();

        if (
          perfilError
        ) {
          setMensagem(
            `Erro ao carregar perfil: ${perfilError.message}`
          );
        }

        if (perfil) {
          setNome(
            perfil.nome ?? ""
          );

          setTelefone(
            perfil.telefone ?? ""
          );
        }

        setCarregando(
          false
        );
      }, 0);

    return () => {
      window.clearTimeout(
        carregarCheckout
      );
    };
  }, [router]);

  /*
   * =====================================================
   * TOTAL VISUAL
   *
   * Continua sendo estimativo.
   * O preço oficial da reserva vem do banco.
   * =====================================================
   */

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

  /*
   * =====================================================
   * AGRUPA CARRINHO POR PRODUTO
   * =====================================================
   *
   * Isso também protege contra eventual produto duplicado
   * no localStorage.
   * =====================================================
   */

  function montarMapaCarrinho() {
    const mapa =
      new Map<
        string,
        number
      >();

    for (
      const item of itens
    ) {
      const quantidadeAtual =
        mapa.get(
          item.id
        ) ?? 0;

      mapa.set(
        item.id,
        quantidadeAtual +
          Number(
            item.quantidade
          )
      );
    }

    return mapa;
  }

  /*
   * =====================================================
   * COMPARA RESERVA COM O CARRINHO
   * =====================================================
   *
   * A reserva só pode ser reutilizada se possuir
   * EXATAMENTE:
   *
   * - os mesmos produtos;
   * - as mesmas quantidades totais.
   *
   * A distribuição entre Mogi/Suzano pode ter mais de uma
   * linha para o mesmo produto, por isso agrupamos.
   * =====================================================
   */

  function reservaCombinaComCarrinho(
    itensReserva: ItemReservaBanco[]
  ) {
    const carrinho =
      montarMapaCarrinho();

    const reserva =
      new Map<
        string,
        number
      >();

    for (
      const item of itensReserva
    ) {
      const quantidadeAtual =
        reserva.get(
          item.produto_id
        ) ?? 0;

      reserva.set(
        item.produto_id,
        quantidadeAtual +
          Number(
            item.quantidade
          )
      );
    }

    if (
      carrinho.size !==
      reserva.size
    ) {
      return false;
    }

    for (
      const [
        produtoId,
        quantidade,
      ] of carrinho
    ) {
      if (
        reserva.get(
          produtoId
        ) !== quantidade
      ) {
        return false;
      }
    }

    return true;
  }

  /*
   * =====================================================
   * PROCURA RESERVA ATIVA COMPATÍVEL
   * =====================================================
   *
   * Esse é o mecanismo de recuperação.
   *
   * Não confiamos apenas no localStorage.
   *
   * Se:
   *
   * criar_reserva_estoque()
   *
   * tiver funcionado no PostgreSQL mas a resposta se perder
   * por refresh/rede/navegador, esta função encontra a
   * reserva diretamente no banco.
   * =====================================================
   */

  async function procurarReservaAtivaDoCarrinho():
    Promise<ReservaEncontrada | null> {
    if (
      itens.length === 0
    ) {
      return null;
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
      return null;
    }

    const agora =
      new Date().toISOString();

    /*
     * RLS garante que o cliente visualize apenas
     * as próprias reservas.
     *
     * Também filtramos user_id explicitamente para
     * deixar a intenção clara.
     */
    const {
      data:
        reservasData,
      error:
        reservasError,
    } = await supabase
      .from(
        "reservas_estoque"
      )
      .select(`
        id,
        status,
        expira_em,
        reservado_em
      `)
      .eq(
        "user_id",
        user.id
      )
      .eq(
        "status",
        "ativa"
      )
      .gt(
        "expira_em",
        agora
      )
      .order(
        "created_at",
        {
          ascending: false,
        }
      )
      .limit(20);

    if (
      reservasError
    ) {
      console.error(
        "Erro ao procurar reservas ativas:",
        reservasError.message
      );

      return null;
    }

    const reservas =
      (reservasData ??
        []) as ReservaBanco[];

    if (
      reservas.length === 0
    ) {
      return null;
    }

    /*
     * Buscamos os itens das reservas ativas em uma única
     * consulta.
     */
    const idsReservas =
      reservas.map(
        (reserva) =>
          reserva.id
      );

    const {
      data:
        itensReservaData,
      error:
        itensReservaError,
    } = await supabase
      .from(
        "itens_reserva_estoque"
      )
      .select(`
        reserva_id,
        produto_id,
        quantidade
      `)
      .in(
        "reserva_id",
        idsReservas
      );

    if (
      itensReservaError
    ) {
      console.error(
        "Erro ao carregar itens das reservas:",
        itensReservaError.message
      );

      return null;
    }

    const todosItens =
      (itensReservaData ??
        []) as ItemReservaBanco[];

    /*
     * As reservas já vieram da mais nova para a mais antiga.
     *
     * A primeira que bater exatamente com o carrinho
     * será reaproveitada.
     */
    for (
      const reserva of reservas
    ) {
      const itensDaReserva =
        todosItens.filter(
          (item) =>
            item.reserva_id ===
            reserva.id
        );

      if (
        reservaCombinaComCarrinho(
          itensDaReserva
        )
      ) {
        return {
          id:
            reserva.id,

          expira_em:
            reserva.expira_em,

          reservado_em:
            reserva.reservado_em,
        };
      }
    }

    return null;
  }

  /*
   * =====================================================
   * SALVA REFERÊNCIA LOCAL E ABRE PAGAMENTO
   * =====================================================
   */

  function abrirReserva(
    reserva: ReservaEncontrada
  ) {
    localStorage.setItem(
      "reserva_pagamento",
      JSON.stringify({
        reserva_id:
          reserva.id,

        expira_em:
          reserva.expira_em,
      })
    );

    router.push(
      `/pagamento?reserva=${reserva.id}`
    );
  }

  /*
   * =====================================================
   * IR PARA PAGAMENTO
   * =====================================================
   */

  async function irParaPagamento() {
    /*
     * Proteção adicional contra clique repetido.
     *
     * O disabled do botão já protege a interface,
     * mas fazemos a validação também na função.
     */
    if (
      finalizando
    ) {
      return;
    }

    setMensagem(
      ""
    );

    if (
      itens.length === 0
    ) {
      setMensagem(
        "O carrinho está vazio."
      );

      return;
    }

    const possuiQuantidadeInvalida =
      itens.some(
        (item) =>
          !Number.isInteger(
            Number(
              item.quantidade
            )
          ) ||
          Number(
            item.quantidade
          ) <= 0
      );

    if (
      possuiQuantidadeInvalida
    ) {
      setMensagem(
        "Existe um item com quantidade inválida no carrinho."
      );

      return;
    }

    setFinalizando(
      true
    );

    /*
     * ===================================================
     * PASSO 1
     *
     * Antes de reservar qualquer coisa, verificamos se
     * este carrinho JÁ possui uma reserva válida.
     * ===================================================
     */

    const reservaExistente =
      await procurarReservaAtivaDoCarrinho();

    if (
      reservaExistente
    ) {
      setMensagem(
        "Reserva existente encontrada. Retomando pagamento..."
      );

      abrirReserva(
        reservaExistente
      );

      return;
    }

    /*
     * ===================================================
     * PASSO 2
     *
     * Nenhuma reserva compatível encontrada.
     *
     * Agora sim solicitamos uma nova reserva ao banco.
     * ===================================================
     */

    const itensParaBanco =
      itens.map(
        (item) => ({
          produto_id:
            item.id,

          quantidade:
            Number(
              item.quantidade
            ),
        })
      );

    const {
      data,
      error,
    } = await supabase.rpc(
      "criar_reserva_estoque",
      {
        p_itens:
          itensParaBanco,
      }
    );

    /*
     * ===================================================
     * PASSO 3
     *
     * SE HOUVE ERRO:
     *
     * Antes de concluir que a reserva falhou, consultamos
     * novamente o banco.
     *
     * Isso cobre o cenário:
     *
     * PostgreSQL criou a reserva
     * ↓
     * conexão caiu antes do navegador receber a resposta
     * ↓
     * navegador pensa que falhou
     *
     * Se encontrarmos a reserva, seguimos normalmente.
     * ===================================================
     */

    if (error) {
      const reservaRecuperada =
        await procurarReservaAtivaDoCarrinho();

      if (
        reservaRecuperada
      ) {
        setMensagem(
          "A reserva já havia sido criada. Retomando pagamento..."
        );

        abrirReserva(
          reservaRecuperada
        );

        return;
      }

      setMensagem(
        `Não foi possível reservar o estoque: ${error.message}`
      );

      setFinalizando(
        false
      );

      return;
    }

    const resultado =
      data as ResultadoReserva;

    /*
     * ===================================================
     * PASSO 4
     *
     * RPC respondeu, mas veio algo inesperado.
     *
     * Mais uma vez procuramos a reserva antes de desistir.
     * ===================================================
     */

    if (
      !resultado?.sucesso ||
      !resultado?.reserva_id
    ) {
      const reservaRecuperada =
        await procurarReservaAtivaDoCarrinho();

      if (
        reservaRecuperada
      ) {
        abrirReserva(
          reservaRecuperada
        );

        return;
      }

      setMensagem(
        "Não foi possível criar a reserva de estoque."
      );

      setFinalizando(
        false
      );

      return;
    }

    /*
     * ===================================================
     * PASSO 5
     *
     * Reserva nova criada normalmente.
     * ===================================================
     */

    const novaReserva:
      ReservaEncontrada = {
        id:
          resultado.reserva_id,

        expira_em:
          resultado.expira_em,

        reservado_em:
          resultado.reservado_em,
      };

    localStorage.setItem(
      "reserva_pagamento",
      JSON.stringify({
        reserva_id:
          resultado.reserva_id,

        expira_em:
          resultado.expira_em,

        tempo_reserva_minutos:
          resultado.tempo_reserva_minutos,
      })
    );

    router.push(
      `/pagamento?reserva=${novaReserva.id}`
    );
  }

  /*
   * =====================================================
   * CARREGANDO
   * =====================================================
   */

  if (carregando) {
    return (
      <main className="min-h-screen bg-white p-10 text-black">
        <p>
          Carregando checkout...
        </p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-white p-10 text-black">
      <div className="mx-auto max-w-4xl">
        <h1 className="mb-8 text-3xl font-bold">
          Finalizar compra
        </h1>

        {itens.length ===
        0 ? (
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
            <div className="grid gap-8 md:grid-cols-2">
              <div>
                <h2 className="mb-4 text-xl font-bold">
                  Dados do cliente
                </h2>

                <div className="space-y-4">
                  <input
                    type="text"
                    value={nome}
                    onChange={(
                      e
                    ) =>
                      setNome(
                        e.target
                          .value
                      )
                    }
                    placeholder="Nome"
                    className="w-full rounded-lg border border-gray-300 p-3"
                  />

                  <input
                    type="text"
                    value={
                      telefone
                    }
                    onChange={(
                      e
                    ) =>
                      setTelefone(
                        e.target
                          .value
                      )
                    }
                    placeholder="Telefone"
                    className="w-full rounded-lg border border-gray-300 p-3"
                  />

                  <input
                    type="email"
                    value={email}
                    disabled
                    className="w-full rounded-lg border border-gray-300 bg-gray-100 p-3"
                  />
                </div>

                <div className="mt-6 rounded-xl border border-blue-300 bg-blue-50 p-5">
                  <p className="font-bold">
                    Reserva de
                    estoque
                  </p>

                  <p className="mt-2 text-sm text-gray-600">
                    Ao continuar
                    para o pagamento,
                    os produtos
                    disponíveis serão
                    reservados pelo
                    período configurado
                    para pagamento.
                  </p>

                  <p className="mt-2 text-sm text-gray-600">
                    Se já existir uma
                    reserva válida para
                    este mesmo carrinho,
                    ela será reutilizada
                    automaticamente.
                  </p>
                </div>
              </div>

              <div>
                <h2 className="mb-4 text-xl font-bold">
                  Resumo da compra
                </h2>

                <div className="space-y-3">
                  {itens.map(
                    (item) => (
                      <div
                        key={
                          item.id
                        }
                        className="rounded-lg border border-gray-300 p-4"
                      >
                        <p className="font-semibold">
                          {
                            item.nome
                          }
                        </p>

                        <p className="text-sm text-gray-500">
                          {
                            item.quantidade
                          }{" "}
                          x{" "}
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

                        <p className="mt-2 font-bold">
                          {(
                            Number(
                              item.preco
                            ) *
                            Number(
                              item.quantidade
                            )
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
                    )
                  )}
                </div>

                <div className="mt-6 rounded-xl border border-gray-300 p-5">
                  <p className="text-sm text-gray-500">
                    Total estimado
                  </p>

                  <p className="text-3xl font-bold">
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

                  <p className="mt-2 text-sm text-gray-500">
                    O preço e a
                    disponibilidade
                    definitivos serão
                    validados pelo
                    servidor antes da
                    reserva.
                  </p>
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={
                irParaPagamento
              }
              disabled={
                finalizando
              }
              className="mt-8 w-full rounded-lg bg-black p-4 font-semibold text-white disabled:cursor-not-allowed disabled:bg-gray-400"
            >
              {finalizando
                ? "Verificando reserva e estoque..."
                : "Ir para pagamento"}
            </button>
          </>
        )}

        {mensagem && (
          <div className="mt-6 rounded-lg border border-orange-300 bg-orange-50 p-4">
            {mensagem}
          </div>
        )}
      </div>
    </main>
  );
}