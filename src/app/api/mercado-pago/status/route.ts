import {
  NextResponse,
} from "next/server";

export async function GET() {
  try {
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
     * Fazemos uma chamada simples ao Mercado Pago
     * apenas para validar se o Access Token funciona.
     *
     * Este endpoint retorna informações da conta
     * autenticada pelo token.
     */
    const resposta =
      await fetch(
        "https://api.mercadopago.com/users/me",
        {
          method: "GET",

          headers: {
            Authorization:
              `Bearer ${accessToken}`,

            "Content-Type":
              "application/json",
          },

          cache: "no-store",
        }
      );

    const dados =
      await resposta.json();

    if (!resposta.ok) {
      console.error(
        "Erro Mercado Pago:",
        dados
      );

      return NextResponse.json(
        {
          sucesso: false,
          status:
            resposta.status,
          mensagem:
            "O Mercado Pago recusou a autenticação.",
          detalhe:
            dados,
        },
        {
          status:
            resposta.status,
        }
      );
    }

    return NextResponse.json({
      sucesso: true,

      mensagem:
        "O Box Driver conectado ao Mercado Pago.",

      mercado_pago: {
        id:
          dados.id ?? null,

        nickname:
          dados.nickname ??
          null,

        site_id:
          dados.site_id ??
          null,

        country_id:
          dados.country_id ??
          null,
      },
    });
  } catch (error) {
    console.error(
      "Erro ao testar Mercado Pago:",
      error
    );

    return NextResponse.json(
      {
        sucesso: false,
        mensagem:
          "Erro interno ao conectar com o Mercado Pago.",
      },
      {
        status: 500,
      }
    );
  }
}