import {
  NextRequest,
  NextResponse,
} from "next/server";

import crypto from "crypto";

import {
  InvalidWebhookSignatureError,
  WebhookSignatureValidator,
} from "mercadopago";

import { supabaseAdmin } from "@/lib/supabase-admin";

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

  message?: string;
  error?: string;
};

type CorpoWebhook = {
  action?: string;
  type?: string;
  live_mode?: boolean;

  data?: {
    id?: string;
    external_reference?: string;
    status?: string;
    status_detail?: string;
  };
};

/*
 * =========================================================
 * VALIDAÇÃO MANUAL DA ASSINATURA
 * =========================================================
 *
 * Formato do manifest:
 *
 * id:<data.id>;
 * request-id:<x-request-id>;
 * ts:<ts>;
 *
 * Em notificações reais de Orders no sandbox observamos
 * que o Mercado Pago pode assinar usando data.id em
 * lowercase mesmo quando a query/body chegam em maiúsculas.
 *
 * Por isso validamos:
 *
 * - data.id exatamente como recebido
 * - data.id normalizado para lowercase
 *
 * O secret nunca é logado.
 * =========================================================
 */

function extrairPartesAssinatura(
  xSignature: string
) {
  let ts = "";
  let v1 = "";

  for (
    const parte of
    xSignature.split(",")
  ) {
    const indice =
      parte.indexOf("=");

    if (indice === -1) {
      continue;
    }

    const chave =
      parte
        .substring(
          0,
          indice
        )
        .trim();

    const valor =
      parte
        .substring(
          indice + 1
        )
        .trim();

    if (chave === "ts") {
      ts = valor;
    }

    if (chave === "v1") {
      v1 = valor;
    }
  }

  return {
    ts,
    v1,
  };
}

function calcularHmac({
  dataId,
  xRequestId,
  ts,
  secret,
}: {
  dataId: string;
  xRequestId: string;
  ts: string;
  secret: string;
}) {
  const manifest =
    `id:${dataId};` +
    `request-id:${xRequestId};` +
    `ts:${ts};`;

  return crypto
    .createHmac(
      "sha256",
      secret
    )
    .update(
      manifest,
      "utf8"
    )
    .digest(
      "hex"
    );
}

function hashesIguais(
  recebido: string,
  calculado: string
) {
  const recebidoBuffer =
    Buffer.from(
      recebido.toLowerCase(),
      "utf8"
    );

  const calculadoBuffer =
    Buffer.from(
      calculado.toLowerCase(),
      "utf8"
    );

  if (
    recebidoBuffer.length !==
    calculadoBuffer.length
  ) {
    return false;
  }

  return crypto.timingSafeEqual(
    recebidoBuffer,
    calculadoBuffer
  );
}

function validarHmacManual({
  xSignature,
  xRequestId,
  dataId,
  secret,
}: {
  xSignature: string;
  xRequestId: string;
  dataId: string;
  secret: string;
}) {
  const {
    ts,
    v1,
  } =
    extrairPartesAssinatura(
      xSignature
    );

  if (
    !ts ||
    !v1
  ) {
    return {
      valido: false,
      exatoValido: false,
      lowercaseValido: false,
    };
  }

  const exato =
    calcularHmac({
      dataId,
      xRequestId,
      ts,
      secret,
    });

  const lowercase =
    calcularHmac({
      dataId:
        dataId.toLowerCase(),
      xRequestId,
      ts,
      secret,
    });

  const exatoValido =
    hashesIguais(
      v1,
      exato
    );

  const lowercaseValido =
    hashesIguais(
      v1,
      lowercase
    );

  return {
    valido:
      exatoValido ||
      lowercaseValido,

    exatoValido,
    lowercaseValido,
  };
}

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
      corpo = {};
    }

    /*
     * =====================================================
     * 3. DADOS DA NOTIFICAÇÃO
     * =====================================================
     */

    const url =
      new URL(
        request.url
      );

    const dataIdQuery =
      url.searchParams.get(
        "data.id"
      );

    const dataIdBody =
      corpo.data?.id ??
      null;

    const dataId =
      dataIdQuery ??
      dataIdBody;

    const tipo =
      url.searchParams.get(
        "type"
      ) ??
      corpo.type ??
      null;

    const externalReferenceQuery =
      url.searchParams.get(
        "data.external_reference"
      );

    const externalReferenceBody =
      corpo.data
        ?.external_reference ??
      null;

    const externalReferenceNotificacao =
      externalReferenceQuery ??
      externalReferenceBody;

    const xSignature =
      request.headers.get(
        "x-signature"
      );

    const xRequestId =
      request.headers.get(
        "x-request-id"
      );

    console.log(
      "WEBHOOK MERCADO PAGO RECEBIDO",
      {
        data_id:
          dataId,
        tipo,
        live_mode:
          corpo.live_mode,
        external_reference:
          externalReferenceNotificacao,
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
     * 4. HMAC MANUAL
     * =====================================================
     */

    const hmacManual =
      validarHmacManual({
        xSignature,
        xRequestId,
        dataId,
        secret:
          webhookSecret,
      });

    /*
     * =====================================================
     * 5. SDK OFICIAL
     * =====================================================
     */

    let sdkValido =
      false;

    let sdkLowercaseValido =
      false;

    try {
      WebhookSignatureValidator.validate({
        xSignature,
        xRequestId,
        dataId,
        secret:
          webhookSecret,
      });

      sdkValido =
        true;
    } catch (error) {
      if (
        !(
          error instanceof
          InvalidWebhookSignatureError
        )
      ) {
        console.error(
          "Erro inesperado no SDK ao validar assinatura:",
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

    /*
     * Orders sandbox:
     * também tentamos lowercase porque notificações reais
     * já demonstraram usar essa normalização no HMAC.
     */
    if (
      !sdkValido &&
      dataId !==
        dataId.toLowerCase()
    ) {
      try {
        WebhookSignatureValidator.validate({
          xSignature,
          xRequestId,
          dataId:
            dataId.toLowerCase(),
          secret:
            webhookSecret,
        });

        sdkLowercaseValido =
          true;
      } catch (error) {
        if (
          !(
            error instanceof
            InvalidWebhookSignatureError
          )
        ) {
          console.error(
            "Erro inesperado no SDK lowercase:",
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
    }

    /*
     * =====================================================
     * 6. RESULTADO
     * =====================================================
     */

    const assinaturaValida =
      sdkValido ||
      sdkLowercaseValido ||
      hmacManual.valido;

    if (!assinaturaValida) {
      console.error(
        "Webhook Mercado Pago rejeitado: assinatura inválida.",
        {
          data_id:
            dataId,
          sdk:
            sdkValido,
          sdk_lowercase:
            sdkLowercaseValido,
          hmac_exato:
            hmacManual
              .exatoValido,
          hmac_lowercase:
            hmacManual
              .lowercaseValido,
        }
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

    console.log(
      "Assinatura Mercado Pago válida.",
      {
        sdk:
          sdkValido,
        sdk_lowercase:
          sdkLowercaseValido,
        hmac_exato:
          hmacManual
            .exatoValido,
        hmac_lowercase:
          hmacManual
            .lowercaseValido,
      }
    );

    /*
     * =====================================================
     * 7. SIMULAÇÃO MANUAL DO PAINEL
     * =====================================================
     */

    const ehSimulacaoManual =
      Boolean(
        externalReferenceBody
      ) &&
      externalReferenceBody!
        .toLowerCase()
        .startsWith(
          "ext_ref_"
        ) &&
      !externalReferenceQuery;

    if (
      ehSimulacaoManual
    ) {
      console.log(
        "Webhook de simulação manual Mercado Pago validado."
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
     * =====================================================
     * 8. SOMENTE ORDER
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
     * 9. CONSULTA A ORDER NO MERCADO PAGO
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
     * 10. DADOS OFICIAIS DA ORDER
     * =====================================================
     */

    const orderId =
      order.id ??
      dataId;

    const externalReference =
      order.external_reference ??
      null;

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
     * 11. FLUXOS O BOX DRIVER
     * =====================================================
     *
     * PIX:
     *   obox_pix_...
     *
     * Cartão de crédito:
     *   obox_cc_...
     * =====================================================
     */

    const externalReferenceLower =
      externalReference
        ?.toLowerCase() ??
      "";

    const fluxoPix =
      externalReferenceLower
        .startsWith(
          "obox_pix_"
        );

    const fluxoCartaoCredito =
      externalReferenceLower
        .startsWith(
          "obox_cc_"
        );

    if (
      !externalReference ||
      (
        !fluxoPix &&
        !fluxoCartaoCredito
      )
    ) {
      console.log(
        "Order ignorada: não pertence ao O Box Driver.",
        {
          orderId,
          externalReference,
        }
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
     * 12. LOCALIZA PAGAMENTO LOCAL
     * =====================================================
     */

    const {
      data: pagamento,
      error:
        pagamentoError,
    } =
      await supabaseAdmin
        .from(
          "pagamentos"
        )
        .select(`
          id,
          reserva_id,
          pedido_id,
          status,
          metodo,
          valor,
          order_id_provedor,
          payment_id_provedor,
          external_reference
        `)
        .eq(
          "provedor",
          "mercado_pago"
        )
        .eq(
          "external_reference",
          externalReference
        )
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

    if (!pagamento) {
      console.warn(
        "Order válida sem pagamento local correspondente:",
        {
          orderId,
          externalReference,
        }
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
     * 13. VALIDA MÉTODO E VALOR
     * =====================================================
     *
     * O body do webhook não é fonte de verdade.
     * Usamos a Order consultada diretamente no Mercado Pago.
     * =====================================================
     */

    if (!pagamentoMP) {
      console.error(
        "Order sem pagamento interno.",
        {
          orderId,
        }
      );

      return NextResponse.json(
        {
          sucesso: false,
        },
        {
          status: 409,
        }
      );
    }

    const metodoId =
      pagamentoMP
        .payment_method
        ?.id ??
      null;

    const metodoTipo =
      pagamentoMP
        .payment_method
        ?.type ??
      null;

    if (
      pagamento.metodo ===
        "pix" &&
      (
        metodoId !==
          "pix" ||
        metodoTipo !==
          "bank_transfer"
      )
    ) {
      console.error(
        "Método do webhook não corresponde ao PIX local.",
        {
          orderId,
          metodoId,
          metodoTipo,
        }
      );

      return NextResponse.json(
        {
          sucesso: false,
        },
        {
          status: 409,
        }
      );
    }

    if (
      pagamento.metodo ===
        "credit_card" &&
      metodoTipo !==
        "credit_card"
    ) {
      console.error(
        "Método do webhook não corresponde ao cartão de crédito local.",
        {
          orderId,
          metodoId,
          metodoTipo,
        }
      );

      return NextResponse.json(
        {
          sucesso: false,
        },
        {
          status: 409,
        }
      );
    }

    const valorLocal =
      Number(
        pagamento.valor
      );

    const valorOrder =
      Number(
        order.total_amount ??
        pagamentoMP.amount ??
        0
      );

    if (
      !Number.isFinite(
        valorLocal
      ) ||
      !Number.isFinite(
        valorOrder
      ) ||
      Math.abs(
        valorLocal -
        valorOrder
      ) > 0.009
    ) {
      console.error(
        "Valor do webhook não corresponde ao pagamento local.",
        {
          orderId,
          valorLocal,
          valorOrder,
        }
      );

      return NextResponse.json(
        {
          sucesso: false,
        },
        {
          status: 409,
        }
      );
    }

    /*
     * =====================================================
     * 14. CONFERE ORDER LOCAL
     * =====================================================
     */

    if (
      pagamento.order_id_provedor &&
      pagamento.order_id_provedor !==
        orderId
    ) {
      console.error(
        "Order do webhook não corresponde à Order local.",
        {
          order_recebida:
            orderId,

          order_local:
            pagamento.order_id_provedor,
        }
      );

      return NextResponse.json(
        {
          sucesso: false,
        },
        {
          status: 409,
        }
      );
    }

    /*
     * =====================================================
     * 15. ATUALIZA IDENTIFICADORES
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
     * 16. PAGAMENTO APROVADO
     * =====================================================
     */

    const pagamentoAprovado =
      (
        statusOrder ===
          "processed" &&
        statusPagamento ===
          "processed" &&
        statusDetail ===
          "accredited"
      ) ||
      statusPagamento ===
        "approved";

    if (
      pagamentoAprovado
    ) {
      /*
       * Idempotência.
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
       * Converte reserva em pedido.
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
       * Busca pedido criado.
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
        fluxoPix
          ? "PIX MERCADO PAGO APROVADO"
          : "CARTÃO DE CRÉDITO MERCADO PAGO APROVADO"
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
     * 17. PENDENTE
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

      console.log(
        fluxoPix
          ? "PIX ainda aguardando pagamento."
          : "Cartão ainda em processamento.",
        {
          orderId,
          statusPagamento,
          statusDetail,
        }
      );

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
     * 18. RECUSADO / CANCELADO / EXPIRADO
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

    if (novoStatus) {
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
       * Libera reserva.
       */
      if (
        novoStatus ===
          "recusado" ||
        novoStatus ===
          "cancelado"
      ) {
        const {
          error:
            reservaCanceladaError,
        } =
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

        if (
          reservaCanceladaError
        ) {
          console.error(
            "Erro ao cancelar reserva:",
            reservaCanceladaError
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

      if (
        novoStatus ===
        "expirado"
      ) {
        const {
          error:
            reservaExpiradaError,
        } =
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

        if (
          reservaExpiradaError
        ) {
          console.error(
            "Erro ao expirar reserva:",
            reservaExpiradaError
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
     * 19. STATUS NÃO MAPEADO
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