import {
  NextRequest,
  NextResponse,
} from "next/server";

import { createClient } from "@supabase/supabase-js";

import { supabaseAdmin } from "@/lib/supabase-admin";

type CorpoRequisicao = {
  reserva_id?: string;
};

type PreparacaoPix = {
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

  pix_qr_code?: string | null;
  pix_qr_code_base64?: string | null;
  pix_ticket_url?: string | null;
};

type MercadoPagoPayment = {
  id?: string;
  status?: string;
  status_detail?: string;

  payment_method?: {
    id?: string;
    type?: string;

    ticket_url?: string;
    qr_code?: string;
    qr_code_base64?: string;
  };
};

type MercadoPagoOrder = {
  id?: string;
  status?: string;
  status_detail?: string;
  external_reference?: string;

  transactions?: {
    payments?: MercadoPagoPayment[];
  };

  error?: string;
  message?: string;
  cause?: unknown;
};

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
     * 2. CONFIGURAÇÃO SUPABASE
     * =====================================================
     */

    const supabaseUrl =
      process.env
        .NEXT_PUBLIC_SUPABASE_URL;

    const supabasePublishableKey =
      process.env
        .NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

    if (
      !supabaseUrl ||
      !supabasePublishableKey
    ) {
      return NextResponse.json(
        {
          sucesso: false,
          mensagem:
            "Configuração Supabase inválida.",
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
     * 4. RESERVA
     * =====================================================
     */

    const corpo =
      (await request.json()) as CorpoRequisicao;

    const reservaId =
      corpo.reserva_id?.trim();

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
          expira_em
        `)
        .eq(
          "id",
          reservaId
        )
        .maybeSingle();

    if (
      reservaError
    ) {
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
     * =====================================================
     * 5. PREPARA PAGAMENTO LOCAL
     * =====================================================
     */

    const {
      data: preparacaoData,
      error: preparacaoError,
    } =
      await supabaseAdmin.rpc(
        "preparar_pagamento_pix",
        {
          p_reserva_id:
            reservaId,
        }
      );

    if (
      preparacaoError
    ) {
      console.error(
        "Erro ao preparar PIX:",
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
      preparacaoData as PreparacaoPix;

    /*
     * =====================================================
     * 6. REUTILIZA PIX EXISTENTE
     * =====================================================
     */

    if (
      preparacao.reutilizado &&
      preparacao.order_id_provedor &&
      preparacao.pix_qr_code
    ) {
      return NextResponse.json({
        sucesso: true,
        reutilizado: true,

        pagamento_id:
          preparacao.pagamento_id,

        reserva_id:
          preparacao.reserva_id,

        status:
          preparacao.status,

        valor:
          Number(
            preparacao.valor
          ),

        expira_em:
          preparacao.expira_em,

        order_id:
          preparacao.order_id_provedor,

        payment_id:
          preparacao.payment_id_provedor,

        qr_code:
          preparacao.pix_qr_code,

        qr_code_base64:
          preparacao.pix_qr_code_base64,

        ticket_url:
          preparacao.pix_ticket_url,
      });
    }

    /*
     * =====================================================
     * 7. ACCESS TOKEN MERCADO PAGO
     * =====================================================
     */

    const mercadoPagoAccessToken =
      process.env
        .MERCADO_PAGO_ACCESS_TOKEN;

    if (
      !mercadoPagoAccessToken
    ) {
      return NextResponse.json(
        {
          sucesso: false,
          mensagem:
            "MERCADO_PAGO_ACCESS_TOKEN não configurado.",
        },
        {
          status: 500,
        }
      );
    }

    /*
     * =====================================================
     * 8. VALOR OFICIAL
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
     * 9. DADOS DO PAGADOR NO SANDBOX
     * =====================================================
     *
     * IMPORTANTE:
     *
     * Estes valores são específicos para o teste oficial
     * do Mercado Pago.
     *
     * Em produção NÃO usaremos estes dados fixos.
     * =====================================================
     */

    const payerEmail =
      "test_user_br@testuser.com";

    const payerFirstName =
      "APRO";

    /*
     * =====================================================
     * 10. CRIA ORDER PIX
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

              total_amount:
                valorFormatado,

              external_reference:
                preparacao.external_reference,

              processing_mode:
                "automatic",

              transactions: {
                payments: [
                  {
                    amount:
                      valorFormatado,

                    payment_method: {
                      id:
                        "pix",

                      type:
                        "bank_transfer",
                    },

                    expiration_time:
                      "PT30M",
                  },
                ],
              },

              payer: {
                email:
                  payerEmail,

                first_name:
                  payerFirstName,
              },
            }),

          cache:
            "no-store",
        }
      );

    const respostaJson =
      (await respostaMercadoPago.json()) as MercadoPagoOrder;

    /*
     * =====================================================
     * 11. ERRO MERCADO PAGO
     * =====================================================
     */

    if (
      !respostaMercadoPago.ok
    ) {
      console.error(
        "ERRO MERCADO PAGO PIX:",
        JSON.stringify(
          respostaJson,
          null,
          2
        )
      );

      await supabaseAdmin
        .from(
          "pagamentos"
        )
        .update({
          status_detail:
            "erro_criacao_order",

          metadata: {
            mercado_pago:
              respostaJson,
          },
        })
        .eq(
          "id",
          preparacao.pagamento_id
        );

      return NextResponse.json(
        {
          sucesso: false,

          mensagem:
            "O Mercado Pago recusou a criação do PIX.",

          status:
            respostaMercadoPago.status,

          erro_mercado_pago:
            respostaJson.error ??
            null,

          mensagem_mercado_pago:
            respostaJson.message ??
            null,

          detalhe:
            respostaJson,
        },
        {
          status:
            respostaMercadoPago.status,
        }
      );
    }

    /*
     * =====================================================
     * 12. EXTRAI PIX
     * =====================================================
     */

    const pagamentoMP =
      respostaJson
        .transactions
        ?.payments?.[0];

    const orderId =
      respostaJson.id;

    const paymentId =
      pagamentoMP?.id;

    const qrCode =
      pagamentoMP
        ?.payment_method
        ?.qr_code;

    const qrCodeBase64 =
      pagamentoMP
        ?.payment_method
        ?.qr_code_base64;

    const ticketUrl =
      pagamentoMP
        ?.payment_method
        ?.ticket_url;

    /*
     * =====================================================
     * 13. VALIDA RESPOSTA
     * =====================================================
     */

    if (
      !orderId ||
      !paymentId ||
      !qrCode
    ) {
      console.error(
        "Resposta PIX incompleta:",
        respostaJson
      );

      return NextResponse.json(
        {
          sucesso: false,

          mensagem:
            "O Mercado Pago criou a Order, mas não retornou todos os dados do PIX.",

          detalhe:
            respostaJson,
        },
        {
          status: 502,
        }
      );
    }

    /*
     * =====================================================
     * 14. GRAVA RETORNO
     * =====================================================
     */

    const {
      error: atualizarPagamentoError,
    } =
      await supabaseAdmin
        .from(
          "pagamentos"
        )
        .update({
          order_id_provedor:
            orderId,

          payment_id_provedor:
            paymentId,

          status:
            "pendente",

          status_detail:
            pagamentoMP
              ?.status_detail ??
            respostaJson
              .status_detail ??
            "waiting_transfer",

          pix_qr_code:
            qrCode,

          pix_qr_code_base64:
            qrCodeBase64 ??
            null,

          pix_ticket_url:
            ticketUrl ??
            null,

          metadata: {
            order_status:
              respostaJson.status ??
              null,

            payment_status:
              pagamentoMP?.status ??
              null,

            mercado_pago:
              respostaJson,
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
        "Erro ao salvar PIX localmente:",
        atualizarPagamentoError
      );

      return NextResponse.json(
        {
          sucesso: false,

          mensagem:
            "PIX criado no Mercado Pago, mas houve erro ao salvar os dados localmente.",
        },
        {
          status: 500,
        }
      );
    }

    /*
     * =====================================================
     * 15. SUCESSO
     * =====================================================
     */

    return NextResponse.json({
      sucesso: true,
      reutilizado: false,

      pagamento_id:
        preparacao.pagamento_id,

      reserva_id:
        preparacao.reserva_id,

      valor,

      expira_em:
        preparacao.expira_em,

      order_id:
        orderId,

      payment_id:
        paymentId,

      status:
        pagamentoMP?.status ??
        respostaJson.status ??
        "action_required",

      status_detail:
        pagamentoMP?.status_detail ??
        respostaJson.status_detail ??
        "waiting_transfer",

      qr_code:
        qrCode,

      qr_code_base64:
        qrCodeBase64 ??
        null,

      ticket_url:
        ticketUrl ??
        null,
    });
  } catch (error) {
    console.error(
      "Erro inesperado ao criar PIX:",
      error
    );

    return NextResponse.json(
      {
        sucesso: false,
        mensagem:
          "Erro interno ao criar pagamento PIX.",
      },
      {
        status: 500,
      }
    );
  }
}