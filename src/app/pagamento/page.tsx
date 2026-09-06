"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  useRouter,
  useSearchParams,
} from "next/navigation";

import { supabase } from "@/lib/supabase";

type Reserva = {
  id: string;
  status: string;
  reservado_em: string;
  expira_em: string;
  pedido_id: string | null;
};

type ItemReserva = {
  id: string;
  quantidade: number;
  preco_unitario: number;
  nome_produto: string;
  codigo_produto: string;

  unidades: {
    codigo: string;
    nome: string;
    cidade: string | null;
    estado: string | null;
  } | null;
};

type RespostaPagamentoLab = {
  sucesso: boolean;
  numero_pedido?: number;
  mensagem?: string;
};

export default function PagamentoPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const reservaId =
    searchParams.get("reserva");

  const [reserva, setReserva] =
    useState<Reserva | null>(null);

  const [itens, setItens] =
    useState<ItemReserva[]>([]);

  const [carregando, setCarregando] =
    useState(true);

  const [processando, setProcessando] =
    useState(false);

  const [mensagem, setMensagem] =
    useState("");

  const [
    segundosRestantes,
    setSegundosRestantes,
  ] = useState(0);

  /*
   * =====================================================
   * CARREGA RESERVA
   * =====================================================
   */

  const carregarReserva =
    useCallback(async () => {
      if (!reservaId) {
        setMensagem(
          "Reserva não informada."
        );

        setCarregando(false);
        return;
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

      /*
       * RLS garante que o cliente só visualize
       * a própria reserva.
       */
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
          reservado_em,
          expira_em,
          pedido_id
        `)
        .eq(
          "id",
          reservaId
        )
        .maybeSingle();

      if (
        reservaError
      ) {
        setMensagem(
          `Erro ao carregar reserva: ${reservaError.message}`
        );

        setCarregando(false);
        return;
      }

      if (
        !reservaData
      ) {
        setMensagem(
          "Reserva não encontrada."
        );

        setCarregando(false);
        return;
      }

      setReserva(
        reservaData as Reserva
      );

      /*
       * Itens e distribuição física da reserva.
       */
      const {
        data: itensData,
        error: itensError,
      } = await supabase
        .from(
          "itens_reserva_estoque"
        )
        .select(`
          id,
          quantidade,
          preco_unitario,
          nome_produto,
          codigo_produto,

          unidades (
            codigo,
            nome,
            cidade,
            estado
          )
        `)
        .eq(
          "reserva_id",
          reservaData.id
        )
        .order(
          "created_at",
          {
            ascending: true,
          }
        );

      if (
        itensError
      ) {
        setMensagem(
          `Erro ao carregar itens da reserva: ${itensError.message}`
        );

        setCarregando(false);
        return;
      }

      setItens(
        (itensData ??
          []) as unknown as ItemReserva[]
      );

      setCarregando(false);
    }, [
      reservaId,
      router,
    ]);

  useEffect(() => {
    const timer =
      window.setTimeout(
        () => {
          void carregarReserva();
        },
        0
      );

    return () => {
      window.clearTimeout(
        timer
      );
    };
  }, [
    carregarReserva,
  ]);

  /*
   * =====================================================
   * CONTADOR
   * =====================================================
   */

  useEffect(() => {
  if (!reserva) {
    return;
  }

  /*
   * Guardamos o valor depois que o TypeScript
   * já confirmou que reserva não é null.
   */
  const expiraEmReserva =
    reserva.expira_em;

  function atualizarTempo() {
    const expiraEm =
      new Date(
        expiraEmReserva
      ).getTime();

    const agora =
      Date.now();

    const diferenca =
      Math.max(
        0,
        Math.floor(
          (
            expiraEm -
            agora
          ) / 1000
        )
      );

    setSegundosRestantes(
      diferenca
    );
  }

  atualizarTempo();

  const intervalo =
    window.setInterval(
      atualizarTempo,
      1000
    );

  return () => {
    window.clearInterval(
      intervalo
    );
  };
}, [
  reserva,
]);
  /*
   * =====================================================
   * TOTAL
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
            item.quantidade
          ) *
            Number(
              item.preco_unitario
            ),
        0
      );
    }, [itens]);

  /*
   * =====================================================
   * TEMPO FORMATADO
   * =====================================================
   */

  const tempoFormatado =
    useMemo(() => {
      const minutos =
        Math.floor(
          segundosRestantes /
            60
        );

      const segundos =
        segundosRestantes %
        60;

      return `${String(
        minutos
      ).padStart(
        2,
        "0"
      )}:${String(
        segundos
      ).padStart(
        2,
        "0"
      )}`;
    }, [
      segundosRestantes,
    ]);

  const reservaExpirada =
    segundosRestantes <= 0 ||
    reserva?.status ===
      "expirada";

  const reservaConvertida =
    reserva?.status ===
    "convertida";

  const reservaCancelada =
    reserva?.status ===
    "cancelada";

  /*
   * =====================================================
   * SIMULA PAGAMENTO APROVADO
   * =====================================================
   *
   * IMPORTANTE:
   *
   * O navegador NÃO chama mais diretamente:
   *
   * converter_reserva_em_pedido()
   *
   * Agora o fluxo é:
   *
   * navegador
   * ↓
   * /api/lab/pagamento-aprovado
   * ↓
   * service_role
   * ↓
   * converter_reserva_em_pedido()
   *
   * Quando Mercado Pago entrar, esta rota de laboratório
   * será substituída pelo fluxo real do gateway/webhook.
   * =====================================================
   */

  async function simularPagamentoAprovado() {
    setMensagem("");

    if (!reserva) {
      setMensagem(
        "Reserva não carregada."
      );

      return;
    }

    if (
      reserva.status !==
      "ativa"
    ) {
      setMensagem(
        `A reserva está com status "${reserva.status}".`
      );

      return;
    }

    if (
      segundosRestantes <= 0
    ) {
      setMensagem(
        "O prazo da reserva terminou. Volte ao carrinho e tente novamente."
      );

      return;
    }

    if (
      processando
    ) {
      return;
    }

    setProcessando(true);

    try {
      /*
       * ===================================================
       * CHAMADA AO NOSSO BACKEND
       * ===================================================
       */

      const {
  data: sessionData,
  error: sessionError,
} =
  await supabase.auth.getSession();

if (
  sessionError ||
  !sessionData.session
) {
  setMensagem(
    "Sua sessão expirou. Entre novamente para continuar."
  );

  setProcessando(false);
  return;
}

const accessToken =
  sessionData.session.access_token;

const resposta =
  await fetch(
    "/api/lab/pagamento-aprovado",
    {
      method: "POST",

      headers: {
        "Content-Type":
          "application/json",

        Authorization:
          `Bearer ${accessToken}`,
      },

      body:
        JSON.stringify({
          reserva_id:
            reserva.id,
        }),
    }
  );

      let resultado:
        RespostaPagamentoLab;

      try {
        resultado =
          (await resposta.json()) as RespostaPagamentoLab;
      } catch {
        setMensagem(
          "O servidor retornou uma resposta inválida."
        );

        setProcessando(false);
        return;
      }

      /*
       * ===================================================
       * ERRO DO BACKEND
       * ===================================================
       */

      if (
        !resposta.ok ||
        !resultado.sucesso
      ) {
        /*
         * Recarregamos a reserva porque pode ter ocorrido
         * mudança de status no banco.
         */
        await carregarReserva();

        setMensagem(
          resultado.mensagem ??
            "Não foi possível confirmar o pagamento."
        );

        setProcessando(false);
        return;
      }

      /*
       * ===================================================
       * PEDIDO CRIADO
       * ===================================================
       */

      const numeroPedido =
        resultado.numero_pedido;

      if (
        numeroPedido ===
          null ||
        numeroPedido ===
          undefined
      ) {
        setMensagem(
          "Pagamento confirmado, mas o número do pedido não foi retornado."
        );

        setProcessando(false);
        return;
      }

      /*
       * ===================================================
       * LIMPEZA LOCAL
       * ===================================================
       *
       * Só limpamos o carrinho depois que o backend
       * confirmou a conversão da reserva em pedido.
       * ===================================================
       */

      localStorage.removeItem(
        "carrinho"
      );

      localStorage.removeItem(
        "reserva_pagamento"
      );

      /*
       * ===================================================
       * REDIRECIONA PARA SUCESSO
       * ===================================================
       */

      router.push(
        `/pedido-sucesso?numero=${numeroPedido}`
      );
    } catch (error) {
      /*
       * ===================================================
       * FALHA DE REDE / NAVEGADOR
       * ===================================================
       *
       * Aqui existe uma possibilidade importante:
       *
       * o backend pode ter convertido a reserva,
       * mas a resposta pode ter se perdido.
       *
       * Portanto recarregamos a reserva antes de
       * simplesmente permitir nova tentativa.
       * ===================================================
       */

      console.error(
        "Erro de comunicação ao confirmar pagamento:",
        error
      );

      await carregarReserva();

      setMensagem(
        "Houve uma falha de comunicação. O status da reserva foi atualizado; confira antes de tentar novamente."
      );

      setProcessando(false);
    }
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
          Carregando pagamento...
        </p>
      </main>
    );
  }

  /*
   * =====================================================
   * RESERVA NÃO ENCONTRADA
   * =====================================================
   */

  if (!reserva) {
    return (
      <main className="min-h-screen bg-white p-10 text-black">
        <div className="mx-auto max-w-3xl">
          <div className="rounded-xl border border-gray-300 p-6">
            <p>
              {mensagem ||
                "Reserva não encontrada."}
            </p>

            <Link
              href="/carrinho"
              className="mt-5 inline-block rounded-lg bg-black px-5 py-3 font-semibold text-white"
            >
              Voltar ao carrinho
            </Link>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-white p-10 text-black">
      <div className="mx-auto max-w-4xl">

        {/* =================================================
            CABEÇALHO
        ================================================= */}

        <div className="mb-8">
          <p className="text-sm text-gray-500">
            Pagamento
          </p>

          <h1 className="mt-1 text-3xl font-bold">
            Finalize sua compra
          </h1>
        </div>

        {mensagem && (
          <div className="mb-6 rounded-xl border border-orange-300 bg-orange-50 p-5">
            {mensagem}
          </div>
        )}

        {/* =================================================
            RESERVA ATIVA
        ================================================= */}

        {reserva.status ===
          "ativa" &&
          !reservaExpirada && (
            <div className="mb-8 rounded-2xl border-2 border-green-400 bg-green-50 p-6">
              <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-center">

                <div>
                  <p className="text-sm font-semibold uppercase tracking-widest text-green-700">
                    Estoque reservado
                  </p>

                  <h2 className="mt-2 text-2xl font-bold">
                    Seus produtos estão garantidos por
                    alguns minutos
                  </h2>

                  <p className="mt-2 text-gray-600">
                    Finalize o pagamento antes do prazo
                    abaixo.
                  </p>
                </div>

                <div className="rounded-xl bg-white px-6 py-4 text-center">
                  <p className="text-xs font-semibold uppercase tracking-widest text-gray-500">
                    Tempo restante
                  </p>

                  <p className="mt-1 text-4xl font-bold tabular-nums">
                    {tempoFormatado}
                  </p>
                </div>

              </div>
            </div>
          )}

        {/* =================================================
            EXPIRADA
        ================================================= */}

        {reservaExpirada &&
          !reservaConvertida &&
          !reservaCancelada && (
            <div className="mb-8 rounded-2xl border-2 border-red-300 bg-red-50 p-6">
              <p className="text-sm font-semibold uppercase tracking-widest text-red-700">
                Reserva encerrada
              </p>

              <h2 className="mt-2 text-2xl font-bold">
                O tempo para pagamento terminou
              </h2>

              <p className="mt-3 text-gray-600">
                O estoque reservado voltou a ficar
                disponível para outros clientes.
              </p>

              <Link
                href="/carrinho"
                className="mt-5 inline-block rounded-lg bg-black px-5 py-3 font-semibold text-white"
              >
                Voltar ao carrinho
              </Link>
            </div>
          )}

        {/* =================================================
            CONVERTIDA
        ================================================= */}

        {reservaConvertida && (
          <div className="mb-8 rounded-2xl border-2 border-green-400 bg-green-50 p-6">
            <p className="text-xl font-bold">
              Pagamento já confirmado
            </p>

            <p className="mt-2 text-gray-600">
              Esta reserva já foi convertida em pedido.
            </p>

            <p className="mt-2 text-sm text-gray-500">
              Se você chegou novamente a esta tela após
              uma falha de conexão, a venda já foi
              processada pelo servidor.
            </p>
          </div>
        )}

        {/* =================================================
            CANCELADA
        ================================================= */}

        {reservaCancelada && (
          <div className="mb-8 rounded-2xl border-2 border-red-300 bg-red-50 p-6">
            <p className="text-xl font-bold">
              Reserva cancelada
            </p>

            <p className="mt-2 text-gray-600">
              Esta reserva não está mais disponível para
              pagamento.
            </p>

            <Link
              href="/carrinho"
              className="mt-5 inline-block rounded-lg bg-black px-5 py-3 font-semibold text-white"
            >
              Voltar ao carrinho
            </Link>
          </div>
        )}

        {/* =================================================
            CONTEÚDO
        ================================================= */}

        <div className="grid gap-8 md:grid-cols-2">

          {/* =================================================
              PRODUTOS
          ================================================= */}

          <div>
            <h2 className="mb-4 text-xl font-bold">
              Produtos reservados
            </h2>

            <div className="space-y-4">
              {itens.map(
                (item) => {
                  const subtotal =
                    Number(
                      item.quantidade
                    ) *
                    Number(
                      item.preco_unitario
                    );

                  return (
                    <div
                      key={item.id}
                      className="rounded-xl border border-gray-300 p-5"
                    >
                      <div className="flex justify-between gap-4">

                        <div>
                          <p className="font-bold">
                            {item.nome_produto}
                          </p>

                          <p className="mt-1 text-sm text-gray-500">
                            Código:{" "}
                            {item.codigo_produto}
                          </p>
                        </div>

                        <p className="text-xl font-bold">
                          {item.quantidade}
                        </p>

                      </div>

                      {item.unidades && (
                        <div className="mt-4 rounded-lg bg-gray-50 p-3">
                          <p className="text-sm font-semibold">
                            {item.unidades.nome}
                          </p>

                          {item.unidades.cidade && (
                            <p className="text-sm text-gray-500">
                              {item.unidades.cidade}

                              {item.unidades.estado
                                ? ` - ${item.unidades.estado}`
                                : ""}
                            </p>
                          )}
                        </div>
                      )}

                      <div className="mt-4 flex justify-between border-t border-gray-200 pt-4">
                        <span className="text-sm text-gray-500">
                          {item.quantidade} x{" "}
                          {Number(
                            item.preco_unitario
                          ).toLocaleString(
                            "pt-BR",
                            {
                              style:
                                "currency",
                              currency:
                                "BRL",
                            }
                          )}
                        </span>

                        <strong>
                          {subtotal.toLocaleString(
                            "pt-BR",
                            {
                              style:
                                "currency",
                              currency:
                                "BRL",
                            }
                          )}
                        </strong>
                      </div>
                    </div>
                  );
                }
              )}
            </div>
          </div>

          {/* =================================================
              PAGAMENTO
          ================================================= */}

          <div>
            <h2 className="mb-4 text-xl font-bold">
              Pagamento
            </h2>

            <div className="rounded-2xl border border-gray-300 p-6">

              <p className="text-sm text-gray-500">
                Total
              </p>

              <p className="mt-1 text-4xl font-bold">
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

              <div className="mt-6 rounded-xl border border-blue-300 bg-blue-50 p-4">
                <p className="font-bold">
                  Ambiente de laboratório
                </p>

                <p className="mt-2 text-sm text-gray-600">
                  O Mercado Pago ainda não está conectado.
                </p>

                <p className="mt-2 text-sm text-gray-600">
                  A simulação agora passa pelo backend,
                  exatamente como acontecerá com a
                  confirmação real do pagamento.
                </p>
              </div>

              <button
                type="button"
                onClick={
                  simularPagamentoAprovado
                }
                disabled={
                  processando ||
                  reservaExpirada ||
                  reservaConvertida ||
                  reservaCancelada
                }
                className="mt-6 w-full rounded-xl bg-black p-4 text-lg font-semibold text-white disabled:cursor-not-allowed disabled:bg-gray-400"
              >
                {processando
                  ? "Confirmando pagamento..."
                  : "Simular pagamento aprovado"}
              </button>

              {reserva.status ===
                "ativa" &&
                !reservaExpirada && (
                  <p className="mt-4 text-center text-sm text-gray-500">
                    O estoque continuará reservado enquanto
                    o contador estiver ativo.
                  </p>
                )}

            </div>

            <Link
              href="/carrinho"
              className="mt-5 block w-full rounded-xl border border-gray-300 p-3 text-center font-semibold"
            >
              Voltar ao carrinho
            </Link>
          </div>
        </div>

        {/* =================================================
            IDENTIFICAÇÃO DA RESERVA
        ================================================= */}

        <div className="mt-8 rounded-xl border border-gray-200 bg-gray-50 p-4">
          <p className="text-xs text-gray-500">
            Reserva
          </p>

          <p className="mt-1 break-all text-sm">
            {reserva.id}
          </p>
        </div>

      </div>
    </main>
  );
}