import {
  NextRequest,
  NextResponse,
} from "next/server";

import { createClient } from "@supabase/supabase-js";

import { supabaseAdmin } from "@/lib/supabase-admin";

type CorpoRequisicao = {
  reserva_id?: string;
};

export async function POST(
  request: NextRequest
) {
  try {
    /*
     * =====================================================
     * 1. PEGA TOKEN DO USUÁRIO
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

    const accessToken =
      authorization
        .replace(
          "Bearer ",
          ""
        )
        .trim();

    if (!accessToken) {
      return NextResponse.json(
        {
          sucesso: false,
          mensagem:
            "Token de autenticação não informado.",
        },
        {
          status: 401,
        }
      );
    }

    /*
     * =====================================================
     * 2. VALIDA TOKEN NO SUPABASE
     * =====================================================
     *
     * Aqui usamos uma instância normal do Supabase,
     * SEM service_role, apenas para validar o token.
     * =====================================================
     */

    const supabaseUrl =
      process.env
        .NEXT_PUBLIC_SUPABASE_URL;

    const supabaseAnonKey =
      process.env
        .NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (
      !supabaseUrl ||
      !supabaseAnonKey
    ) {
      console.error(
        "Variáveis públicas do Supabase não configuradas."
      );

      return NextResponse.json(
        {
          sucesso: false,
          mensagem:
            "Configuração do servidor inválida.",
        },
        {
          status: 500,
        }
      );
    }

    const supabaseAuth =
      createClient(
        supabaseUrl,
        supabaseAnonKey,
        {
          global: {
            headers: {
              Authorization:
                `Bearer ${accessToken}`,
            },
          },
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
        accessToken
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
     * 3. LÊ RESERVA INFORMADA
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

    /*
     * =====================================================
     * 4. CONFERE DONO DA RESERVA
     * =====================================================
     *
     * Aqui usamos service_role porque a API precisa
     * enxergar a reserva independentemente de RLS.
     *
     * Porém só permitimos continuar se:
     *
     * reserva.user_id === user.id
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
            "Não foi possível validar a reserva.",
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
     * 5. CONVERTE RESERVA
     * =====================================================
     */

    const {
      data: numeroPedido,
      error,
    } =
      await supabaseAdmin.rpc(
        "converter_reserva_em_pedido",
        {
          p_reserva_id:
            reservaId,
        }
      );

    if (error) {
      console.error(
        "Erro ao converter reserva:",
        error
      );

      return NextResponse.json(
        {
          sucesso: false,
          mensagem:
            error.message,
        },
        {
          status: 400,
        }
      );
    }

    if (
      numeroPedido === null ||
      numeroPedido === undefined
    ) {
      return NextResponse.json(
        {
          sucesso: false,
          mensagem:
            "A reserva foi processada, mas o número do pedido não foi retornado.",
        },
        {
          status: 500,
        }
      );
    }

    /*
     * =====================================================
     * 6. SUCESSO
     * =====================================================
     */

    return NextResponse.json({
      sucesso: true,
      numero_pedido:
        Number(
          numeroPedido
        ),
    });
  } catch (error) {
    console.error(
      "Erro inesperado no pagamento de laboratório:",
      error
    );

    return NextResponse.json(
      {
        sucesso: false,
        mensagem:
          "Erro interno ao processar pagamento de laboratório.",
      },
      {
        status: 500,
      }
    );
  }
}