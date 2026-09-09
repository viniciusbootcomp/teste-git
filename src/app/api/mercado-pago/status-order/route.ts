import {
  NextRequest,
  NextResponse,
} from "next/server";

type MercadoPagoPayment = {
  id?: string;
  status?: string;
  status_detail?: string;

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

  transactions?: {
    payments?: MercadoPagoPayment[];
  };

  message?: string;
  error?: string;
};

export async function GET(
  request: NextRequest
) {
  try {
    const accessToken =
      process.env
        .MERCADO_PAGO_ACCESS_TOKEN;

    if (!accessToken) {
      return NextResponse.json(
        {
          sucesso: false,
          erro:
            "MERCADO_PAGO_ACCESS_TOKEN não configurado.",
        },
        {
          status: 500,
        }
      );
    }

    const url =
      new URL(request.url);

    const orderId =
      url.searchParams.get(
        "order_id"
      );

    if (!orderId) {
      return NextResponse.json(
        {
          sucesso: false,
          erro:
            "Informe order_id.",
        },
        {
          status: 400,
        }
      );
    }

    if (
      !orderId
        .toUpperCase()
        .startsWith("ORD")
    ) {
      return NextResponse.json(
        {
          sucesso: false,
          erro:
            "Order ID inválido.",
        },
        {
          status: 400,
        }
      );
    }

    const resposta =
      await fetch(
        `https://api.mercadopago.com/v1/orders/${encodeURIComponent(
          orderId
        )}`,
        {
          method: "GET",

          headers: {
            Authorization:
              `Bearer ${accessToken}`,

            Accept:
              "application/json",
          },

          cache:
            "no-store",
        }
      );

    const order =
      (await resposta.json()) as MercadoPagoOrder;

    if (!resposta.ok) {
      console.error(
        "Erro ao consultar Order Mercado Pago:",
        order
      );

      return NextResponse.json(
        {
          sucesso: false,

          status_http:
            resposta.status,

          erro:
            order.message ??
            order.error ??
            "Erro ao consultar Order.",
        },
        {
          status:
            resposta.status
        }
      );
    }

    const pagamento =
      order.transactions
        ?.payments?.[0] ??
      null;

    return NextResponse.json(
      {
        sucesso: true,

        order_id:
          order.id,

        external_reference:
          order.external_reference,

        valor:
          order.total_amount,

        order_status:
          order.status,

        order_status_detail:
          order.status_detail,

        payment_id:
          pagamento?.id,

        payment_status:
          pagamento?.status,

        payment_status_detail:
          pagamento
            ?.status_detail,

        metodo:
          pagamento
            ?.payment_method,
      },
      {
        status: 200,
      }
    );
  } catch (error) {
    console.error(
      "Erro inesperado ao consultar Order:",
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