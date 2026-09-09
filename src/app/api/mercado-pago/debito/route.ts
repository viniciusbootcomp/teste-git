import {
  NextRequest,
  NextResponse,
} from "next/server";

import { createClient } from "@supabase/supabase-js";

import { supabaseAdmin } from "@/lib/supabase-admin";

type CorpoRequisicao = {
  reserva_id?: string;
  token?: string;
  payment_method_id?: string;
  payer_email?: string;
};

type PreparacaoDebito = {
  sucesso: boolean;
  reutilizado: boolean;

  pagamento_id: string;
  reserva_id: string;
  status: string;

  valor: number | string;

  external_reference: string;
  idempotency_key: string;

  expira_em: string;

  order_id_provedor?: string | null;
  payment_id_provedor?: string | null;
  status_detail?: string | null;
};

type MercadoPagoPayment = {
  id?: string;
  status?: string;
  status_detail?: string;

  amount?: string | number;
  paid_amount?: string | number;

  payment_method?: {
    id?: string;
    type?: string;
    installments?: number;
  };
};

type MercadoPagoOrder = {
  id?: string;
  status?: string;
  status_detail?: string;

  external_reference?: string;

  total_amount?: string | number;
  total_paid_amount?: string | number;

  transactions?: {
    payments?: MercadoPagoPayment[];
  };

  error?: string;
  message?: string;
  cause?: unknown;
};

function emailValido(
  email: string
) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
    email
  );
}

function respostaSeguraMercadoPago(
  order: MercadoPagoOrder
) {
  const pagamento =
    order.transactions
      ?.payments?.[0];

  return {
    order_id:
      order.id ?? null,

    order_status:
      order.status ?? null,

    order_status_detail:
      order.status_detail ?? null,

    external_reference:
      order.external_reference ??
      null,

    total_amount:
      order.total_amount ?? null,

    total_paid_amount:
      order.total_paid_amount ??
      null,

    payment_id:
      pagamento?.id ?? null,

    payment_status:
      pagamento?.status ?? null,

    payment_status_detail:
      pagamento?.status_detail ??
      null,

    payment_amount:
      pagamento?.amount ?? null,

    paid_amount:
      pagamento?.paid_amount ??
      null,

    payment_method_id:
      pagamento?.payment_method
        ?.id ?? null,

    payment_method_type:
      pagamento?.payment_method
        ?.type ?? null,

    installments:
      pagamento?.payment_method
        ?.installments ?? null,
  };
}

export async function POST(
  request: NextRequest
) {
  try {
    /*
     * =====================================================
     * 1. TOKEN DO CLIENTE
     * =====================================================
     */

    const authorization =
      request.headers.get(
        "authorization"
      );

    if (
      !authorization ||
      !authorization.startsWith(
        "Bearer "
      )
    ) {
      return NextResponse.json(
        {
          sucesso: false,
          mensagem:
            "Usuário não autenticado.",
        },
        {
          status: 401,
        }
      );
    }

    const accessTokenCliente =
      authorization
        .replace(
          "Bearer ",
          ""
        )
        .trim();

    if (!accessTokenCliente) {
      return NextResponse.json(
        {
          sucesso: false,
          mensagem:
            "Token do usuário não informado.",
        },
        {
          status: 401,
        }
      );
    }

    /*
     * =====================================================
     * 2. CONFIGURAÇÕES
     * =====================================================
     */

    const supabaseUrl =
      process.env
        .NEXT_PUBLIC_SUPABASE_URL;

    const supabasePublishableKey =
      process.env
        .NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

    const mercadoPagoAccessToken =
      process.env
        .MERCADO_PAGO_ACCESS_TOKEN;

    if (
      !supabaseUrl ||
      !supabasePublishableKey ||
      !mercadoPagoAccessToken
    ) {
      return NextResponse.json(
        {
          sucesso: false,
          mensagem:
            "Configuração do servidor incompleta.",
        },
        {
          status: 500,
        }
      );
    }

    /*
     * =====================================================
     * 3. VALIDA USUÁRIO
     * =====================================================
     */

    const supabaseAuth =
      createClient(
        supabaseUrl,
        supabasePublishableKey,
        {
          auth: {
            persistSession:
              false,

            autoRefreshToken:
              false,
          },
        }
      );

    const {
      data: userData,
      error: userError,
    } =
      await supabaseAuth.auth.getUser(
        accessTokenCliente
      );

    if (
      userError ||
      !userData.user
    ) {
      return NextResponse.json(
        {
          sucesso: false,
          mensagem:
            "Sessão inválida ou expirada.",
        },
        {
          status: 401,
        }
      );
    }

    const user =
      userData.user;

    /*
     * =====================================================
     * 4. LÊ E VALIDA O CORPO
     * =====================================================
     *
     * O navegador envia apenas os dados necessários
     * produzidos pelo Brick.
     *
     * O VALOR NÃO vem do navegador.
     * =====================================================
     */

    let corpo:
      CorpoRequisicao = {};

    try {
      corpo =
        (await request.json()) as CorpoRequisicao;
    } catch {
      corpo = {};
    }

    const reservaId =
      corpo.reserva_id?.trim();

    const cardToken =
      corpo.token?.trim();

    const paymentMethodId =
      corpo.payment_method_id
        ?.trim()
        .toLowerCase();

    const payerEmail =
      corpo.payer_email
        ?.trim()
        .toLowerCase();

    if (!reservaId) {
      return NextResponse.json(
        {
          sucesso: false,
          mensagem:
            "Reserva não informada.",
        },
        {
          status: 400,
        }
      );
    }

    if (
      !cardToken ||
      cardToken.length < 10 ||
      cardToken.length > 300
    ) {
      return NextResponse.json(
        {
          sucesso: false,
          mensagem:
            "Token do cartão inválido.",
        },
        {
          status: 400,
        }
      );
    }

    if (
      !paymentMethodId ||
      !/^[a-z0-9_-]+$/.test(
        paymentMethodId
      )
    ) {
      return NextResponse.json(
        {
          sucesso: false,
          mensagem:
            "Bandeira do cartão inválida.",
        },
        {
          status: 400,
        }
      );
    }

    if (
      !payerEmail ||
      payerEmail.length > 254 ||
      !emailValido(
        payerEmail
      )
    ) {
      return NextResponse.json(
        {
          sucesso: false,
          mensagem:
            "E-mail do pagador inválido.",
        },
        {
          status: 400,
        }
      );
    }

    /*
     * =====================================================
     * 5. CONFERE RESERVA
     * =====================================================
     */

    const {
      data: reserva,
      error: reservaError,
    } =
      await supabaseAdmin
        .from(
          "reservas_estoque"
        )
        .select(`
          id,
          user_id,
          status,
          pedido_id,
          expira_em
        `)
        .eq(
          "id",
          reservaId
        )
        .maybeSingle();

    if (reservaError) {
      console.error(
        "Erro ao consultar reserva:",
        reservaError
      );

      return NextResponse.json(
        {
          sucesso: false,
          mensagem:
            "Erro ao consultar reserva.",
        },
        {
          status: 500,
        }
      );
    }

    if (!reserva) {
      return NextResponse.json(
        {
          sucesso: false,
          mensagem:
            "Reserva não encontrada.",
        },
        {
          status: 404,
        }
      );
    }

    if (
      reserva.user_id !==
      user.id
    ) {
      return NextResponse.json(
        {
          sucesso: false,
          mensagem:
            "Reserva não pertence ao usuário autenticado.",
        },
        {
          status: 403,
        }
      );
    }

    /*
     * Se outro caminho já converteu a reserva,
     * respondemos de forma idempotente.
     */
    if (
      reserva.status ===
        "convertida" &&
      reserva.pedido_id
    ) {
      return NextResponse.json(
        {
          sucesso: true,
          aprovado: true,
          ja_processado: true,
          pedido_id:
            reserva.pedido_id,
        },
        {
          status: 200,
        }
      );
    }

    if (
      reserva.status !==
      "ativa"
    ) {
      return NextResponse.json(
        {
          sucesso: false,
          mensagem:
            `A reserva está com status "${reserva.status}".`,
        },
        {
          status: 409,
        }
      );
    }

    if (
      new Date(
        reserva.expira_em
      ).getTime() <=
      Date.now()
    ) {
      return NextResponse.json(
        {
          sucesso: false,
          mensagem:
            "Reserva expirada.",
        },
        {
          status: 409,
        }
      );
    }

    /*
     * =====================================================
     * 6. PREPARA PAGAMENTO LOCAL
     * =====================================================
     */

    const {
      data: preparacaoData,
      error: preparacaoError,
    } =
      await supabaseAdmin.rpc(
        "preparar_pagamento_cartao_debito",
        {
          p_reserva_id:
            reservaId,
        }
      );

    if (preparacaoError) {
      console.error(
        "Erro ao preparar cartão de débito:",
        preparacaoError
      );

      return NextResponse.json(
        {
          sucesso: false,
          mensagem:
            preparacaoError.message,
        },
        {
          status: 400,
        }
      );
    }

    const preparacao =
      preparacaoData as PreparacaoDebito;

    /*
     * =====================================================
     * 7. VALOR OFICIAL
     * =====================================================
     */

    const valor =
      Number(
        preparacao.valor
      );

    if (
      !Number.isFinite(
        valor
      ) ||
      valor <= 0
    ) {
      return NextResponse.json(
        {
          sucesso: false,
          mensagem:
            "Valor do pagamento inválido.",
        },
        {
          status: 400,
        }
      );
    }

    const valorFormatado =
      valor.toFixed(2);

    /*
     * =====================================================
     * 8. SE JÁ EXISTE ORDER, CONSULTA EM VEZ DE CRIAR OUTRA
     * =====================================================
     */

    let order:
      MercadoPagoOrder;

    let respostaStatus =
      200;

    if (
      preparacao.reutilizado &&
      preparacao.order_id_provedor
    ) {
      const respostaConsulta =
        await fetch(
          `https://api.mercadopago.com/v1/orders/${encodeURIComponent(
            preparacao.order_id_provedor
          )}`,
          {
            method:
              "GET",

            headers: {
              Authorization:
                `Bearer ${mercadoPagoAccessToken}`,

              Accept:
                "application/json",
            },

            cache:
              "no-store",
          }
        );

      order =
        (await respostaConsulta.json()) as MercadoPagoOrder;

      respostaStatus =
        respostaConsulta.status;

      if (
        !respostaConsulta.ok
      ) {
        console.error(
          "Erro ao consultar Order existente do cartão:",
          respostaSeguraMercadoPago(
            order
          )
        );

        return NextResponse.json(
          {
            sucesso: false,
            mensagem:
              "Não foi possível consultar o pagamento existente no Mercado Pago.",
          },
          {
            status: 502,
          }
        );
      }
    } else {
      /*
       * =====================================================
       * 9. CRIA ORDER DE CARTÃO DE DÉBITO
       * =====================================================
       */

      const respostaMercadoPago =
        await fetch(
          "https://api.mercadopago.com/v1/orders",
          {
            method:
              "POST",

            headers: {
              Authorization:
                `Bearer ${mercadoPagoAccessToken}`,

              "Content-Type":
                "application/json",

              Accept:
                "application/json",

              "X-Idempotency-Key":
                preparacao.idempotency_key,
            },

            body:
              JSON.stringify({
                type:
                  "online",

                processing_mode:
                  "automatic",

                total_amount:
                  valorFormatado,

                external_reference:
                  preparacao.external_reference,

                payer: {
                  email:
                    payerEmail,
                },

                transactions: {
                  payments: [
                    {
                      amount:
                        valorFormatado,

                      payment_method: {
                        id:
                          paymentMethodId,

                        type:
                          "debit_card",

                        token:
                          cardToken,
                      },
                    },
                  ],
                },
              }),

            cache:
              "no-store",
          }
        );

      respostaStatus =
        respostaMercadoPago.status;

      order =
        (await respostaMercadoPago.json()) as MercadoPagoOrder;

      if (
        !respostaMercadoPago.ok
      ) {
        /*
         * IMPORTANTE:
         * Não gravamos o token do cartão no banco nem no log.
         */
        console.error(
          "ERRO MERCADO PAGO DÉBITO:",
          {
            http_status:
              respostaMercadoPago.status,

            retorno:
              respostaSeguraMercadoPago(
                order
              ),

            error:
              order.error ?? null,

            message:
              order.message ?? null,
          }
        );

        await supabaseAdmin
          .from(
            "pagamentos"
          )
          .update({
            status:
              "recusado",

            status_detail:
              order.status_detail ??
              order.error ??
              "erro_criacao_order",

            metadata: {
              origem:
                "cartao_debito",

              http_status:
                respostaMercadoPago.status,

              mercado_pago:
                respostaSeguraMercadoPago(
                  order
                ),
            },
          })
          .eq(
            "id",
            preparacao.pagamento_id
          );

        return NextResponse.json(
          {
            sucesso: false,

            aprovado:
              false,

            mensagem:
              order.message ??
              "O Mercado Pago recusou o pagamento com cartão de débito.",

            status:
              respostaMercadoPago.status,

            erro_mercado_pago:
              order.error ?? null,

            status_detail:
              order.status_detail ??
              null,
          },
          {
            status:
              respostaMercadoPago.status >=
                400 &&
              respostaMercadoPago.status <
                600
                ? respostaMercadoPago.status
                : 502,
          }
        );
      }
    }

    /*
     * =====================================================
     * 10. EXTRAI E VALIDA A ORDER
     * =====================================================
     */

    const pagamentoMP =
      order.transactions
        ?.payments?.[0];

    const orderId =
      order.id;

    const paymentId =
      pagamentoMP?.id;

    if (
      !orderId ||
      !pagamentoMP
    ) {
      console.error(
        "Resposta do cartão incompleta:",
        respostaSeguraMercadoPago(
          order
        )
      );

      return NextResponse.json(
        {
          sucesso: false,
          mensagem:
            "O Mercado Pago não retornou todos os dados esperados do pagamento.",
        },
        {
          status: 502,
        }
      );
    }

    if (
      order.external_reference !==
      preparacao.external_reference
    ) {
      return NextResponse.json(
        {
          sucesso: false,
          mensagem:
            "External reference retornada pelo Mercado Pago não corresponde ao pagamento local.",
        },
        {
          status: 409,
        }
      );
    }

    const metodoTipo =
      pagamentoMP
        .payment_method
        ?.type;

    const metodoIdRetornado =
      pagamentoMP
        .payment_method
        ?.id;

    if (
      metodoTipo !==
      "debit_card"
    ) {
      return NextResponse.json(
        {
          sucesso: false,
          mensagem:
            "A Order retornada não corresponde a um pagamento com cartão de débito.",
        },
        {
          status: 409,
        }
      );
    }

    if (
      metodoIdRetornado &&
      metodoIdRetornado !==
        paymentMethodId
    ) {
      return NextResponse.json(
        {
          sucesso: false,
          mensagem:
            "A bandeira retornada pelo Mercado Pago não corresponde à enviada pelo Brick.",
        },
        {
          status: 409,
        }
      );
    }

    const valorOrder =
      Number(
        order.total_amount ??
        pagamentoMP.amount ??
        0
      );

    if (
      !Number.isFinite(
        valorOrder
      ) ||
      Math.abs(
        valor -
        valorOrder
      ) > 0.009
    ) {
      console.error(
        "Valor Mercado Pago diferente do valor local.",
        {
          valorLocal:
            valor,

          valorOrder:
            valorOrder,
        }
      );

      return NextResponse.json(
        {
          sucesso: false,
          mensagem:
            "Valor do pagamento não corresponde ao valor esperado.",
        },
        {
          status: 409,
        }
      );
    }

    /*
     * =====================================================
     * 11. GRAVA RETORNO DO PROVEDOR
     * =====================================================
     *
     * Não armazenamos o token do cartão.
     * =====================================================
     */

    const statusOrder =
      order.status;

    const statusPagamento =
      pagamentoMP.status;

    const statusDetail =
      pagamentoMP
        .status_detail ??
      order.status_detail ??
      null;

    const aprovado =
      statusOrder ===
        "processed" &&
      statusPagamento ===
        "processed" &&
      statusDetail ===
        "accredited";

    const recusado =
      statusPagamento ===
        "rejected" ||
      statusOrder ===
        "failed";

    const statusLocal =
      aprovado
        ? "aprovado"
        : recusado
          ? "recusado"
          : "processando";

    const {
      error:
        atualizarPagamentoError,
    } =
      await supabaseAdmin
        .from(
          "pagamentos"
        )
        .update({
          order_id_provedor:
            orderId,

          payment_id_provedor:
            paymentId ?? null,

          status:
            statusLocal,

          status_detail:
            statusDetail ??
            statusPagamento ??
            statusOrder ??
            "processando",

          metadata: {
            origem:
              "cartao_debito",

            http_status:
              respostaStatus,

            payment_method_id:
              metodoIdRetornado ??
              paymentMethodId,

            installments:
              pagamentoMP
                .payment_method
                ?.installments ??
              null,

            mercado_pago:
              respostaSeguraMercadoPago(
                order
              ),
          },
        })
        .eq(
          "id",
          preparacao.pagamento_id
        );

    if (
      atualizarPagamentoError
    ) {
      console.error(
        "Erro ao salvar pagamento com cartão de débito:",
        atualizarPagamentoError
      );

      return NextResponse.json(
        {
          sucesso: false,
          mensagem:
            "Pagamento processado no Mercado Pago, mas houve erro ao salvar os dados localmente.",
        },
        {
          status: 500,
        }
      );
    }

    /*
     * =====================================================
     * 12. SE AINDA NÃO FOI APROVADO
     * =====================================================
     */

    if (!aprovado) {
      return NextResponse.json(
        {
          sucesso: true,
          aprovado: false,

          pagamento_id:
            preparacao.pagamento_id,

          reserva_id:
            preparacao.reserva_id,

          order_id:
            orderId,

          payment_id:
            paymentId ?? null,

          status:
            statusPagamento ??
            statusOrder ??
            statusLocal,

          status_detail:
            statusDetail,

          recusado:
            recusado,
        },
        {
          status: 200,
        }
      );
    }

    /*
     * =====================================================
     * 13. CONVERTE RESERVA EM PEDIDO
     * =====================================================
     */

    const {
      data: numeroPedido,
      error: conversaoError,
    } =
      await supabaseAdmin.rpc(
        "converter_reserva_em_pedido",
        {
          p_reserva_id:
            reservaId,
        }
      );

    if (
      conversaoError
    ) {
      console.error(
        "Cartão aprovado, mas reserva não foi convertida:",
        conversaoError
      );

      return NextResponse.json(
        {
          sucesso: false,
          aprovado: true,
          mensagem:
            "Pagamento aprovado, mas houve erro ao criar o pedido.",
          erro:
            conversaoError.message,
        },
        {
          status: 500,
        }
      );
    }

    /*
     * =====================================================
     * 14. BUSCA PEDIDO GERADO
     * =====================================================
     */

    const {
      data:
        reservaConvertida,
      error:
        reservaConvertidaError,
    } =
      await supabaseAdmin
        .from(
          "reservas_estoque"
        )
        .select(
          "pedido_id"
        )
        .eq(
          "id",
          reservaId
        )
        .maybeSingle();

    if (
      reservaConvertidaError ||
      !reservaConvertida
        ?.pedido_id
    ) {
      console.error(
        "Reserva convertida sem pedido_id."
      );

      return NextResponse.json(
        {
          sucesso: false,
          aprovado: true,
          mensagem:
            "Pedido criado, mas o vínculo da reserva não foi localizado.",
        },
        {
          status: 500,
        }
      );
    }

    /*
     * =====================================================
     * 15. FINALIZA PAGAMENTO LOCAL
     * =====================================================
     */

    const agora =
      new Date()
        .toISOString();

    const {
      error:
        finalizarPagamentoError,
    } =
      await supabaseAdmin
        .from(
          "pagamentos"
        )
        .update({
          status:
            "aprovado",

          pedido_id:
            reservaConvertida
              .pedido_id,

          payment_id_provedor:
            paymentId ?? null,

          order_id_provedor:
            orderId,

          aprovado_em:
            agora,

          status_detail:
            statusDetail ??
            "accredited",

          metadata: {
            origem:
              "cartao_debito",

            http_status:
              respostaStatus,

            payment_method_id:
              metodoIdRetornado ??
              paymentMethodId,

            installments:
              pagamentoMP
                .payment_method
                ?.installments ??
              null,

            mercado_pago:
              respostaSeguraMercadoPago(
                order
              ),
          },
        })
        .eq(
          "id",
          preparacao.pagamento_id
        );

    if (
      finalizarPagamentoError
    ) {
      console.error(
        "Pedido criado, mas erro ao finalizar pagamento:",
        finalizarPagamentoError
      );

      return NextResponse.json(
        {
          sucesso: false,
          aprovado: true,
          mensagem:
            "Pedido criado, mas o pagamento local não pôde ser finalizado.",
        },
        {
          status: 500,
        }
      );
    }

    console.log(
      "========================================"
    );

    console.log(
      "CARTÃO DE DÉBITO APROVADO COM SUCESSO"
    );

    console.log(
      `PEDIDO O BOX DRIVER: ${numeroPedido}`
    );

    console.log(
      "========================================"
    );

    return NextResponse.json(
      {
        sucesso: true,
        aprovado: true,

        pagamento_id:
          preparacao.pagamento_id,

        reserva_id:
          preparacao.reserva_id,

        order_id:
          orderId,

        payment_id:
          paymentId ?? null,

        status:
          statusPagamento ??
          statusOrder ??
          "processed",

        status_detail:
          statusDetail ??
          "accredited",

        numero_pedido:
          Number(
            numeroPedido
          ),

        pedido_id:
          reservaConvertida
            .pedido_id,
      },
      {
        status: 200,
      }
    );
  } catch (error) {
    console.error(
      "Erro inesperado ao processar cartão de débito:",
      error
    );

    return NextResponse.json(
      {
        sucesso: false,
        mensagem:
          "Erro interno ao processar pagamento com cartão de débito.",
      },
      {
        status: 500,
      }
    );
  }
}
