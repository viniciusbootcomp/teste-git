import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  InvalidWebhookSignatureError,
  WebhookSignatureValidator,
} from "mercadopago";

import { supabaseAdmin } from "@/lib/supabase-admin";

type MercadoPagoPayment = {
  id?: string;
  status?: string;
  status_detail?: string;
};

type MercadoPagoOrder = {
  id?: string;

  status?: string;
  status_detail?: string;

  external_reference?: string;

  transactions?: {
    payments?: MercadoPagoPayment[];
  };

  message?: string;
  error?: string;
};

type CorpoWebhook = {
  action?: string;
  type?: string;

  data?: {
    id?: string;
  };
};

export async function POST(
  request: NextRequest
) {
  try {
    /*
     * =====================================================
     * 1. CONFIGURAÇÕES
     * =====================================================
     */

    const webhookSecret =
      process.env
        .MERCADO_PAGO_WEBHOOK_SECRET;

    const mercadoPagoAccessToken =
      process.env
        .MERCADO_PAGO_ACCESS_TOKEN;

    if (
      !webhookSecret ||
      !mercadoPagoAccessToken
    ) {
      console.error(
        "Webhook Mercado Pago sem configuração.",
        {
          webhook_secret:
            Boolean(
              webhookSecret
            ),

          access_token:
            Boolean(
              mercadoPagoAccessToken
            ),
        }
      );

      return NextResponse.json(
        {
          sucesso: false,
        },
        {
          status: 500,
        }
      );
    }

    /*
     * =====================================================
     * 2. LÊ BODY
     * =====================================================
     */

    let corpo:
      CorpoWebhook = {};

    try {
      corpo =
        (await request.json()) as CorpoWebhook;
    } catch {
      /*
       * O body não é necessário para validar a assinatura
       * quando data.id veio na query string.
       */
      corpo = {};
    }

    /*
     * =====================================================
     * 3. DADOS RECEBIDOS
     * =====================================================
     */

    const url =
      new URL(
        request.url
      );

    /*
     * O Mercado Pago envia normalmente:
     *
     * ?data.id=ORDER_ID&type=order
     *
     * No simulador o ID também pode aparecer no body.
     */
    const dataIdQuery =
      url.searchParams.get(
        "data.id"
      );

    const dataIdBody =
      corpo.data?.id;

    const dataId =
      dataIdQuery ??
      dataIdBody ??
      null;

    const tipo =
      url.searchParams.get(
        "type"
      ) ??
      corpo.type ??
      null;

    const xSignature =
      request.headers.get(
        "x-signature"
      );

    const xRequestId =
      request.headers.get(
        "x-request-id"
      );

    /*
     * Diagnóstico sem expor segredo.
     */
    console.log(
      "WEBHOOK MERCADO PAGO:",
      {
        data_id:
          dataId,

        data_id_query:
          Boolean(
            dataIdQuery
          ),

        data_id_body:
          Boolean(
            dataIdBody
          ),

        tipo,

        tem_signature:
          Boolean(
            xSignature
          ),

        tem_request_id:
          Boolean(
            xRequestId
          ),

        tem_secret:
          Boolean(
            webhookSecret
          ),
      }
    );

    if (
      !dataId ||
      !xSignature ||
      !xRequestId
    ) {
      console.error(
        "Webhook sem dados necessários para validação."
      );

      return NextResponse.json(
        {
          sucesso: false,
        },
        {
          status: 401,
        }
      );
    }

    /*
     * =====================================================
     * 4. VALIDA ASSINATURA COM SDK OFICIAL
     * =====================================================
     *
     * Não calculamos mais o HMAC manualmente.
     *
     * O SDK oficial do Mercado Pago faz essa validação.
     * =====================================================
     */

    try {
      WebhookSignatureValidator.validate({
        xSignature,
        xRequestId,
        dataId,
        secret:
          webhookSecret,
      });

      console.log(
        "Assinatura Mercado Pago válida."
      );
      /*
 * =====================================================
 * SIMULAÇÃO DO PAINEL MERCADO PAGO
 * =====================================================
 *
 * IDs iniciados por ORDTST são gerados pelo simulador.
 *
 * O objetivo aqui é somente validar:
 *
 * - URL pública
 * - POST
 * - assinatura
 * - resposta HTTP
 *
 * Não devemos alterar pagamentos, reservas ou pedidos
 * reais do O Box Driver durante essa simulação.
 * =====================================================
 */

if (
  dataId
    .toUpperCase()
    .startsWith("ORDTST")
) {
  console.log(
    "Webhook de simulação Mercado Pago validado com sucesso."
  );

  return NextResponse.json(
    {
      sucesso: true,
      simulacao: true,
    },
    {
      status: 200,
    }
  );
}
    } catch (error) {
      if (
        error instanceof
        InvalidWebhookSignatureError
      ) {
        console.error(
          "Webhook Mercado Pago com assinatura inválida."
        );

        return NextResponse.json(
          {
            sucesso: false,
          },
          {
            status: 401,
          }
        );
      }

      /*
       * Se for outro erro inesperado do SDK,
       * registramos para diagnóstico.
       */
      console.error(
        "Erro ao validar assinatura Mercado Pago:",
        error
      );

      return NextResponse.json(
        {
          sucesso: false,
        },
        {
          status: 500,
        }
      );
    }

    /*
     * =====================================================
     * 5. SOMENTE EVENTOS ORDER
     * =====================================================
     */

    if (
      tipo &&
      tipo !== "order" &&
      tipo !== "orders"
    ) {
      console.log(
        "Webhook ignorado por não ser Order:",
        tipo
      );

      return NextResponse.json(
        {
          sucesso: true,
          ignorado: true,
        },
        {
          status: 200,
        }
      );
    }

    /*
     * =====================================================
     * 6. CONSULTA ORDER OFICIAL
     * =====================================================
     *
     * Mesmo com assinatura válida, nunca confiamos apenas
     * no status enviado pelo webhook.
     *
     * Consultamos a Order diretamente no Mercado Pago.
     * =====================================================
     */

    const respostaMercadoPago =
      await fetch(
        `https://api.mercadopago.com/v1/orders/${encodeURIComponent(
          dataId
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

    const order =
      (await respostaMercadoPago.json()) as MercadoPagoOrder;

    /*
     * =====================================================
     * SIMULAÇÃO DO PAINEL
     * =====================================================
     *
     * O simulador do Mercado Pago usa IDs como:
     *
     * ORDTST...
     *
     * Eles podem não existir realmente na API.
     *
     * Se a assinatura foi validada pelo SDK, respondemos
     * 200 para o teste do painel.
     * =====================================================
     */

    if (
      !respostaMercadoPago.ok
    ) {
      console.error(
        "Não foi possível consultar a Order:",
        {
          dataId,
          status:
            respostaMercadoPago.status,
          resposta:
            order,
        }
      );

      if (
        dataId.startsWith(
          "ORDTST"
        )
      ) {
        console.log(
          "Webhook de teste validado com sucesso."
        );

        return NextResponse.json(
          {
            sucesso: true,
            simulacao: true,
          },
          {
            status: 200,
          }
        );
      }

      /*
       * Para uma Order real, devolvemos erro.
       *
       * Isso permite que o Mercado Pago faça nova
       * tentativa depois.
       */
      return NextResponse.json(
        {
          sucesso: false,
        },
        {
          status: 500,
        }
      );
    }

    /*
     * =====================================================
     * 7. DADOS OFICIAIS DA ORDER
     * =====================================================
     */

    const orderId =
      order.id ??
      dataId;

    const externalReference =
      order.external_reference;

    const pagamentoMP =
      order.transactions
        ?.payments?.[0];

    const paymentId =
      pagamentoMP?.id ??
      null;

    const statusOrder =
      order.status ??
      null;

    const statusPagamento =
      pagamentoMP?.status ??
      statusOrder;

    const statusDetail =
      pagamentoMP
        ?.status_detail ??
      order.status_detail ??
      null;

    console.log(
      "ORDER MERCADO PAGO:",
      {
        order_id:
          orderId,

        payment_id:
          paymentId,

        external_reference:
          externalReference,

        status_order:
          statusOrder,

        status_pagamento:
          statusPagamento,

        status_detail:
          statusDetail,
      }
    );

    /*
     * =====================================================
     * 8. LOCALIZA PAGAMENTO LOCAL
     * =====================================================
     */

    let queryPagamento =
      supabaseAdmin
        .from(
          "pagamentos"
        )
        .select(`
          id,
          reserva_id,
          pedido_id,
          status,
          metodo,
          order_id_provedor,
          payment_id_provedor,
          external_reference
        `)
        .eq(
          "provedor",
          "mercado_pago"
        );

    /*
     * Preferimos external_reference.
     *
     * Ela foi gerada pelo próprio O Box Driver e é nossa
     * correlação principal com Mercado Pago.
     */
    if (
      externalReference
    ) {
      queryPagamento =
        queryPagamento.eq(
          "external_reference",
          externalReference
        );
    } else {
      queryPagamento =
        queryPagamento.eq(
          "order_id_provedor",
          orderId
        );
    }

    const {
      data: pagamento,
      error:
        pagamentoError,
    } =
      await queryPagamento
        .limit(1)
        .maybeSingle();

    if (
      pagamentoError
    ) {
      console.error(
        "Erro ao localizar pagamento:",
        pagamentoError
      );

      return NextResponse.json(
        {
          sucesso: false,
        },
        {
          status: 500,
        }
      );
    }

    /*
     * Pode acontecer em testes ou notificações que não
     * pertencem ao O Box Driver.
     *
     * A assinatura foi válida, portanto acusamos
     * recebimento mas não alteramos nada.
     */
    if (!pagamento) {
      console.warn(
        "Order sem pagamento local:",
        orderId
      );

      return NextResponse.json(
        {
          sucesso: true,
          recebido: true,
          ignorado: true,
        },
        {
          status: 200,
        }
      );
    }

    /*
     * =====================================================
     * 9. ATUALIZA IDENTIFICADORES E METADATA
     * =====================================================
     */

    const {
      error:
        atualizacaoBaseError,
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

          status_detail:
            statusDetail,

          metadata: {
            origem:
              "webhook",

            mercado_pago:
              order,
          },
        })
        .eq(
          "id",
          pagamento.id
        );

    if (
      atualizacaoBaseError
    ) {
      console.error(
        "Erro ao atualizar pagamento:",
        atualizacaoBaseError
      );

      return NextResponse.json(
        {
          sucesso: false,
        },
        {
          status: 500,
        }
      );
    }

    /*
     * =====================================================
     * 10. PAGAMENTO APROVADO
     * =====================================================
     *
     * Na Orders API podemos encontrar:
     *
     * payment.status = processed
     *
     * e/ou
     *
     * order.status = processed
     * =====================================================
     */

    if (
      statusPagamento ===
        "approved" ||
      statusPagamento ===
        "processed" ||
      statusOrder ===
        "processed"
    ) {
      /*
       * Webhook pode ser reenviado várias vezes.
       *
       * Se o pedido já existe, não fazemos nova conversão.
       */
      if (
        pagamento.status ===
          "aprovado" &&
        pagamento.pedido_id
      ) {
        console.log(
          "Pagamento já havia sido processado."
        );

        return NextResponse.json(
          {
            sucesso: true,
            ja_processado: true,
          },
          {
            status: 200,
          }
        );
      }

      /*
       * ===================================================
       * CONVERTE RESERVA
       * ===================================================
       */

      const {
        data: numeroPedido,
        error:
          conversaoError,
      } =
        await supabaseAdmin.rpc(
          "converter_reserva_em_pedido",
          {
            p_reserva_id:
              pagamento.reserva_id,
          }
        );

      if (
        conversaoError
      ) {
        console.error(
          "Pagamento aprovado, mas erro ao converter reserva:",
          conversaoError
        );

        /*
         * Não marcamos pagamento local como aprovado.
         *
         * Respondemos erro para permitir nova tentativa
         * do webhook.
         */
        return NextResponse.json(
          {
            sucesso: false,
          },
          {
            status: 500,
          }
        );
      }

      /*
       * ===================================================
       * LOCALIZA PEDIDO CRIADO
       * ===================================================
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
            pagamento.reserva_id
          )
          .maybeSingle();

      if (
        reservaConvertidaError ||
        !reservaConvertida?.pedido_id
      ) {
        console.error(
          "Reserva convertida sem pedido localizado."
        );

        return NextResponse.json(
          {
            sucesso: false,
          },
          {
            status: 500,
          }
        );
      }

      /*
       * ===================================================
       * MARCA PAGAMENTO APROVADO
       * ===================================================
       */

      const agora =
        new Date()
          .toISOString();

      const {
        error:
          pagamentoAprovadoError,
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

            aprovado_em:
              agora,

            status_detail:
              statusDetail ??
              "approved",
          })
          .eq(
            "id",
            pagamento.id
          );

      if (
        pagamentoAprovadoError
      ) {
        console.error(
          "Erro ao marcar pagamento aprovado:",
          pagamentoAprovadoError
        );

        return NextResponse.json(
          {
            sucesso: false,
          },
          {
            status: 500,
          }
        );
      }

      console.log(
        "======================================"
      );

      console.log(
        `PIX MERCADO PAGO APROVADO`
      );

      console.log(
        `PEDIDO O BOX DRIVER: ${numeroPedido}`
      );

      console.log(
        "======================================"
      );

      return NextResponse.json(
        {
          sucesso: true,
          aprovado: true,

          numero_pedido:
            Number(
              numeroPedido
            ),
        },
        {
          status: 200,
        }
      );
    }

    /*
     * =====================================================
     * 11. PENDENTE / AGUARDANDO PIX
     * =====================================================
     */

    if (
      statusPagamento ===
        "action_required" ||
      statusPagamento ===
        "pending" ||
      statusPagamento ===
        "in_process"
    ) {
      const novoStatus =
        statusPagamento ===
        "in_process"
          ? "processando"
          : "pendente";

      const {
        error:
          pagamentoPendenteError,
      } =
        await supabaseAdmin
          .from(
            "pagamentos"
          )
          .update({
            status:
              novoStatus,

            processando_em:
              statusPagamento ===
              "in_process"
                ? new Date()
                    .toISOString()
                : null,

            status_detail:
              statusDetail,
          })
          .eq(
            "id",
            pagamento.id
          );

      if (
        pagamentoPendenteError
      ) {
        console.error(
          "Erro ao atualizar pagamento pendente:",
          pagamentoPendenteError
        );

        return NextResponse.json(
          {
            sucesso: false,
          },
          {
            status: 500,
          }
        );
      }

      return NextResponse.json(
        {
          sucesso: true,
          pendente: true,
        },
        {
          status: 200,
        }
      );
    }

    /*
     * =====================================================
     * 12. RECUSADO / CANCELADO / EXPIRADO
     * =====================================================
     */

    let novoStatus:
      | "recusado"
      | "cancelado"
      | "expirado"
      | null = null;

    if (
      statusPagamento ===
      "rejected"
    ) {
      novoStatus =
        "recusado";
    }

    if (
      statusPagamento ===
        "cancelled" ||
      statusPagamento ===
        "canceled"
    ) {
      novoStatus =
        "cancelado";
    }

    if (
      statusPagamento ===
      "expired"
    ) {
      novoStatus =
        "expirado";
    }

    if (
      novoStatus
    ) {
      const agora =
        new Date()
          .toISOString();

      const {
        error:
          atualizacaoStatusError,
      } =
        await supabaseAdmin
          .from(
            "pagamentos"
          )
          .update({
            status:
              novoStatus,

            status_detail:
              statusDetail,

            recusado_em:
              novoStatus ===
              "recusado"
                ? agora
                : null,

            cancelado_em:
              novoStatus ===
              "cancelado"
                ? agora
                : null,

            expirado_em:
              novoStatus ===
              "expirado"
                ? agora
                : null,
          })
          .eq(
            "id",
            pagamento.id
          );

      if (
        atualizacaoStatusError
      ) {
        console.error(
          "Erro ao atualizar pagamento finalizado:",
          atualizacaoStatusError
        );

        return NextResponse.json(
          {
            sucesso: false,
          },
          {
            status: 500,
          }
        );
      }

      /*
       * Libera estoque reservado.
       */
      if (
        novoStatus ===
          "recusado" ||
        novoStatus ===
          "cancelado"
      ) {
        await supabaseAdmin
          .from(
            "reservas_estoque"
          )
          .update({
            status:
              "cancelada",

            cancelada_em:
              agora,
          })
          .eq(
            "id",
            pagamento.reserva_id
          )
          .eq(
            "status",
            "ativa"
          );
      }

      if (
        novoStatus ===
        "expirado"
      ) {
        await supabaseAdmin
          .from(
            "reservas_estoque"
          )
          .update({
            status:
              "expirada",
          })
          .eq(
            "id",
            pagamento.reserva_id
          )
          .eq(
            "status",
            "ativa"
          );
      }

      return NextResponse.json(
        {
          sucesso: true,
          status:
            novoStatus,
        },
        {
          status: 200,
        }
      );
    }

    /*
     * =====================================================
     * 13. STATUS AINDA NÃO MAPEADO
     * =====================================================
     */

    console.warn(
      "Status Mercado Pago ainda não mapeado:",
      {
        statusOrder,
        statusPagamento,
        statusDetail,
      }
    );

    return NextResponse.json(
      {
        sucesso: true,

        status_nao_mapeado:
          true,
      },
      {
        status: 200,
      }
    );
  } catch (error) {
    console.error(
      "Erro inesperado no webhook Mercado Pago:",
      error
    );

    return NextResponse.json(
      {
        sucesso: false,
      },
      {
        status: 500,
      }
    );
  }
}