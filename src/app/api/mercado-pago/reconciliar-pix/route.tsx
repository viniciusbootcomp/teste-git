import {
  NextRequest,
  NextResponse,
} from "next/server";

import { createClient } from "@supabase/supabase-js";

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

type Body = {
  reserva_id?: string;
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
          erro:
            "Configuração do servidor incompleta.",
        },
        {
          status: 500,
        }
      );
    }

    /*
     * =====================================================
     * 2. AUTENTICA CLIENTE
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
          erro:
            "Sessão não informada.",
        },
        {
          status: 401,
        }
      );
    }

    const accessToken =
      authorization
        .substring(
          "Bearer ".length
        )
        .trim();

    const supabaseAuth =
      createClient(
        supabaseUrl,
        supabasePublishableKey,
        {
          auth: {
            autoRefreshToken:
              false,

            persistSession:
              false,
          },
        }
      );

    const {
      data: userData,
      error: userError,
    } =
      await supabaseAuth
        .auth
        .getUser(
          accessToken
        );

    if (
      userError ||
      !userData.user
    ) {
      return NextResponse.json(
        {
          sucesso: false,
          erro:
            "Sessão inválida.",
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
     * 3. RESERVA INFORMADA
     * =====================================================
     */

    let body:
      Body = {};

    try {
      body =
        (await request.json()) as Body;
    } catch {
      body = {};
    }

    const reservaId =
      body.reserva_id;

    if (!reservaId) {
      return NextResponse.json(
        {
          sucesso: false,
          erro:
            "Informe reserva_id.",
        },
        {
          status: 400,
        }
      );
    }

    /*
     * =====================================================
     * 4. CONFERE RESERVA
     * =====================================================
     */

    const {
      data: reserva,
      error:
        reservaError,
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

    if (
      reservaError
    ) {
      console.error(
        "Erro ao buscar reserva:",
        reservaError
      );

      return NextResponse.json(
        {
          sucesso: false,
          erro:
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
          erro:
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
          erro:
            "Reserva não pertence ao usuário autenticado.",
        },
        {
          status: 403,
        }
      );
    }

    /*
     * Se já foi convertida, podemos responder de forma
     * idempotente.
     */
    if (
      reserva.status ===
        "convertida" &&
      reserva.pedido_id
    ) {
      return NextResponse.json(
        {
          sucesso: true,
          ja_processado: true,
          pedido_id:
            reserva.pedido_id,
        },
        {
          status: 200,
        }
      );
    }

    /*
     * =====================================================
     * 5. BUSCA PAGAMENTO PIX
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
          user_id,
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
          "reserva_id",
          reservaId
        )
        .eq(
          "provedor",
          "mercado_pago"
        )
        .eq(
          "metodo",
          "pix"
        )
        .order(
          "created_at",
          {
            ascending:
              false,
          }
        )
        .limit(1)
        .maybeSingle();

    if (
      pagamentoError
    ) {
      console.error(
        "Erro ao buscar pagamento:",
        pagamentoError
      );

      return NextResponse.json(
        {
          sucesso: false,
          erro:
            "Erro ao consultar pagamento.",
        },
        {
          status: 500,
        }
      );
    }

    if (!pagamento) {
      return NextResponse.json(
        {
          sucesso: false,
          erro:
            "Pagamento PIX não encontrado.",
        },
        {
          status: 404,
        }
      );
    }

    if (
      pagamento.user_id !==
      user.id
    ) {
      return NextResponse.json(
        {
          sucesso: false,
          erro:
            "Pagamento não pertence ao usuário autenticado.",
        },
        {
          status: 403,
        }
      );
    }

    if (
      !pagamento.order_id_provedor
    ) {
      return NextResponse.json(
        {
          sucesso: false,
          erro:
            "Pagamento ainda não possui Order do Mercado Pago.",
        },
        {
          status: 409,
        }
      );
    }

    /*
     * =====================================================
     * 6. CONSULTA ORDER DIRETAMENTE NO MERCADO PAGO
     * =====================================================
     */

    const respostaMercadoPago =
      await fetch(
        `https://api.mercadopago.com/v1/orders/${encodeURIComponent(
          pagamento.order_id_provedor
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
        "Erro ao consultar Mercado Pago:",
        order
      );

      return NextResponse.json(
        {
          sucesso: false,
          erro:
            "Não foi possível consultar a Order no Mercado Pago.",
        },
        {
          status: 502,
        }
      );
    }

    /*
     * =====================================================
     * 7. VALIDA CORRELAÇÃO
     * =====================================================
     */

    if (
      order.id !==
      pagamento.order_id_provedor
    ) {
      return NextResponse.json(
        {
          sucesso: false,
          erro:
            "Order retornada não corresponde ao pagamento local.",
        },
        {
          status: 409,
        }
      );
    }

    if (
      !order.external_reference ||
      order.external_reference !==
        pagamento.external_reference
    ) {
      return NextResponse.json(
        {
          sucesso: false,
          erro:
            "External reference não corresponde ao pagamento local.",
        },
        {
          status: 409,
        }
      );
    }

    const pagamentoMP =
      order.transactions
        ?.payments?.[0];

    if (!pagamentoMP) {
      return NextResponse.json(
        {
          sucesso: false,
          erro:
            "Pagamento não encontrado dentro da Order.",
        },
        {
          status: 409,
        }
      );
    }

    /*
     * =====================================================
     * 8. VALIDA MÉTODO
     * =====================================================
     */

    const metodoId =
      pagamentoMP
        .payment_method
        ?.id;

    const metodoTipo =
      pagamentoMP
        .payment_method
        ?.type;

    if (
      metodoId !== "pix" ||
      metodoTipo !==
        "bank_transfer"
    ) {
      return NextResponse.json(
        {
          sucesso: false,
          erro:
            "A Order não corresponde a um pagamento PIX.",
        },
        {
          status: 409,
        }
      );
    }

    /*
     * =====================================================
     * 9. VALIDA VALOR
     * =====================================================
     */

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
        "Valor Mercado Pago diferente do valor local.",
        {
          valorLocal,
          valorOrder,
        }
      );

      return NextResponse.json(
        {
          sucesso: false,
          erro:
            "Valor do pagamento não corresponde ao valor esperado.",
        },
        {
          status: 409,
        }
      );
    }

    /*
     * =====================================================
     * 10. CONFERE STATUS
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

    if (!aprovado) {
      /*
       * Ainda não aprovado.
       */
      return NextResponse.json(
        {
          sucesso: true,
          aprovado: false,

          order_status:
            statusOrder,

          payment_status:
            statusPagamento,

          status_detail:
            statusDetail,
        },
        {
          status: 200,
        }
      );
    }

    /*
     * =====================================================
     * 11. CONVERTE RESERVA EM PEDIDO
     * =====================================================
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
            reservaId,
        }
      );

    if (
      conversaoError
    ) {
      console.error(
        "Pagamento confirmado, mas reserva não foi convertida:",
        conversaoError
      );

      return NextResponse.json(
        {
          sucesso: false,
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
     * 12. BUSCA PEDIDO GERADO
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
          erro:
            "Pedido criado, mas vínculo da reserva não foi localizado.",
        },
        {
          status: 500,
        }
      );
    }

    /*
     * =====================================================
     * 13. ATUALIZA PAGAMENTO LOCAL
     * =====================================================
     */

    const agora =
      new Date()
        .toISOString();

    const {
      error:
        atualizarPagamentoError,
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
            pagamentoMP.id ??
            pagamento
              .payment_id_provedor,

          aprovado_em:
            agora,

          status_detail:
            statusDetail,

          metadata: {
            origem:
              "reconciliacao",

            mercado_pago:
              order,
          },
        })
        .eq(
          "id",
          pagamento.id
        );

    if (
      atualizarPagamentoError
    ) {
      console.error(
        "Pedido criado, mas erro ao atualizar pagamento:",
        atualizarPagamentoError
      );

      return NextResponse.json(
        {
          sucesso: false,
          erro:
            "Pedido criado, mas o pagamento local não pôde ser atualizado.",
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
      "PIX RECONCILIADO COM SUCESSO"
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
      "Erro inesperado na reconciliação PIX:",
      error
    );

    return NextResponse.json(
      {
        sucesso: false,
        erro:
          "Erro inesperado.",
      },
      {
        status: 500,
      }
    );
  }
}