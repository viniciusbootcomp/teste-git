import {
  NextRequest,
  NextResponse,
} from "next/server";

import { supabaseAdmin } from "@/lib/supabase-admin";

type CorpoRequisicao = {
  reserva_id?: string;
};

export async function POST(
  request: NextRequest
) {
  try {
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

    /*
     * =====================================================
     * 1. PROCURA PAGAMENTO LOCAL
     * =====================================================
     */

    const {
      data: pagamento,
      error: pagamentoError,
    } =
      await supabaseAdmin
        .from("pagamentos")
        .select(`
          id,
          reserva_id,
          status,
          external_reference,
          order_id_provedor,
          payment_id_provedor,
          pix_qr_code,
          pix_qr_code_base64,
          pix_ticket_url
        `)
        .eq(
          "reserva_id",
          reservaId
        )
        .eq(
          "metodo",
          "pix"
        )
        .order(
          "created_at",
          {
            ascending: false,
          }
        )
        .limit(1)
        .maybeSingle();

    if (
      pagamentoError ||
      !pagamento
    ) {
      return NextResponse.json(
        {
          sucesso: false,
          mensagem:
            "Pagamento PIX local não encontrado.",
        },
        {
          status: 404,
        }
      );
    }

    /*
     * Se já temos Order gravada, nem precisamos pesquisar.
     */
    if (
      pagamento.order_id_provedor
    ) {
      return NextResponse.json({
        sucesso: true,
        encontrado_localmente: true,

        pagamento_id:
          pagamento.id,

        order_id:
          pagamento.order_id_provedor,

        payment_id:
          pagamento.payment_id_provedor,

        qr_code:
          pagamento.pix_qr_code,

        qr_code_base64:
          pagamento.pix_qr_code_base64,

        ticket_url:
          pagamento.pix_ticket_url,
      });
    }

    /*
     * =====================================================
     * 2. ACCESS TOKEN MP
     * =====================================================
     */

    const accessToken =
      process.env
        .MERCADO_PAGO_ACCESS_TOKEN;

    if (!accessToken) {
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
     * 3. PESQUISA ORDER PELO EXTERNAL_REFERENCE
     * =====================================================
     */

    const agora =
      new Date();

    const inicio =
      new Date(
        agora.getTime() -
          24 * 60 * 60 * 1000
      );

    const fim =
      new Date(
        agora.getTime() +
          60 * 60 * 1000
      );

    const url =
      new URL(
        "https://api.mercadopago.com/v1/orders"
      );

    url.searchParams.set(
      "begin_date",
      inicio.toISOString()
    );

    url.searchParams.set(
      "end_date",
      fim.toISOString()
    );

    url.searchParams.set(
      "external_reference",
      pagamento.external_reference
    );

    const resposta =
      await fetch(
        url.toString(),
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

    const dados =
      await resposta.json();

    if (!resposta.ok) {
      console.error(
        "Erro ao pesquisar Order:",
        dados
      );

      return NextResponse.json(
        {
          sucesso: false,
          mensagem:
            "Não foi possível pesquisar a Order no Mercado Pago.",
          detalhe:
            dados,
        },
        {
          status:
            resposta.status,
        }
      );
    }

    /*
     * O formato pode trazer resultados paginados.
     */
    const resultados =
      Array.isArray(dados)
        ? dados
        : (
            dados.results ??
            dados.data ??
            []
          );

    const order =
      resultados?.[0];

    if (!order) {
      return NextResponse.json({
        sucesso: false,
        encontrada:
          false,

        mensagem:
          "Nenhuma Order encontrada para este external_reference.",
      });
    }

    /*
     * =====================================================
     * 4. BUSCA DETALHE DA ORDER
     * =====================================================
     */

    const orderId =
      order.id;

    const detalheResposta =
      await fetch(
        `https://api.mercadopago.com/v1/orders/${orderId}`,
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

    const detalhe =
      await detalheResposta.json();

    if (
      !detalheResposta.ok
    ) {
      return NextResponse.json(
        {
          sucesso: false,
          mensagem:
            "Order encontrada, mas não foi possível carregar o detalhe.",
          detalhe,
        },
        {
          status:
            detalheResposta.status,
        }
      );
    }

    const pagamentoMP =
      detalhe
        ?.transactions
        ?.payments?.[0];

    const paymentId =
      pagamentoMP?.id ??
      null;

    const qrCode =
      pagamentoMP
        ?.payment_method
        ?.qr_code ??
      null;

    const qrCodeBase64 =
      pagamentoMP
        ?.payment_method
        ?.qr_code_base64 ??
      null;

    const ticketUrl =
      pagamentoMP
        ?.payment_method
        ?.ticket_url ??
      null;

    /*
     * =====================================================
     * 5. RECUPERA ESTADO LOCAL
     * =====================================================
     */

    const {
      error: updateError,
    } =
      await supabaseAdmin
        .from("pagamentos")
        .update({
          order_id_provedor:
            orderId,

          payment_id_provedor:
            paymentId,

          pix_qr_code:
            qrCode,

          pix_qr_code_base64:
            qrCodeBase64,

          pix_ticket_url:
            ticketUrl,

          status_detail:
            pagamentoMP
              ?.status_detail ??
            detalhe
              ?.status_detail ??
            "order_recuperada",

          metadata: {
            recuperada_apos_timeout:
              true,

            mercado_pago:
              detalhe,
          },
        })
        .eq(
          "id",
          pagamento.id
        );

    if (updateError) {
      console.error(
        "Erro ao recuperar pagamento local:",
        updateError
      );

      return NextResponse.json(
        {
          sucesso: false,
          mensagem:
            "Order encontrada, mas houve erro ao atualizar o banco local.",
        },
        {
          status: 500,
        }
      );
    }

    return NextResponse.json({
      sucesso: true,
      encontrada:
        true,

      order_id:
        orderId,

      payment_id:
        paymentId,

      qr_code:
        qrCode,

      qr_code_base64:
        qrCodeBase64,

      ticket_url:
        ticketUrl,

      status:
        pagamentoMP?.status ??
        detalhe?.status ??
        null,

      status_detail:
        pagamentoMP
          ?.status_detail ??
        detalhe
          ?.status_detail ??
        null,
    });
  } catch (error) {
    console.error(
      "Erro ao recuperar Order Mercado Pago:",
      error
    );

    return NextResponse.json(
      {
        sucesso: false,
        mensagem:
          "Erro interno ao recuperar Order.",
      },
      {
        status: 500,
      }
    );
  }
}