import {
  NextRequest,
  NextResponse,
} from "next/server";

import crypto from "crypto";

import { supabaseAdmin } from "@/lib/supabase-admin";

const COOKIE_NAME = "obox_totem";

/*
 * =========================================================
 * CHAVE MESTRA
 * =========================================================
 */
function obterChaveMestra() {
  const segredo =
    process.env.TOTEM_MASTER_SECRET;

  if (!segredo) {
    throw new Error(
      "TOTEM_MASTER_SECRET não configurado."
    );
  }

  return segredo;
}

/*
 * =========================================================
 * ASSINATURA DO COOKIE
 *
 * Deve ser EXATAMENTE a mesma lógica usada na rota
 * /api/totem/ativar.
 * =========================================================
 */
function gerarAssinaturaCookie(
  identificador: string
) {
  const segredo =
    obterChaveMestra();

  return crypto
    .createHmac("sha256", segredo)
    .update(
      `cookie:${identificador}`
    )
    .digest("hex");
}

/*
 * =========================================================
 * COMPARAÇÃO SEGURA
 * =========================================================
 */
function compararSeguro(
  recebido: string,
  esperado: string
) {
  const bufferRecebido =
    Buffer.from(
      recebido,
      "utf8"
    );

  const bufferEsperado =
    Buffer.from(
      esperado,
      "utf8"
    );

  if (
    bufferRecebido.length !==
    bufferEsperado.length
  ) {
    return false;
  }

  return crypto.timingSafeEqual(
    bufferRecebido,
    bufferEsperado
  );
}

/*
 * =========================================================
 * VALIDA COOKIE DO TERMINAL
 * =========================================================
 */
function validarTerminal(
  valor: string | undefined
) {
  if (!valor) {
    return null;
  }

  const separador =
    valor.indexOf(".");

  if (separador <= 0) {
    return null;
  }

  const identificador =
    valor.substring(
      0,
      separador
    );

  const assinaturaRecebida =
    valor.substring(
      separador + 1
    );

  if (
    !identificador ||
    !assinaturaRecebida
  ) {
    return null;
  }

  let assinaturaEsperada: string;

  try {
    assinaturaEsperada =
      gerarAssinaturaCookie(
        identificador
      );
  } catch {
    return null;
  }

  if (
    !compararSeguro(
      assinaturaRecebida,
      assinaturaEsperada
    )
  ) {
    return null;
  }

  return identificador;
}

/*
 * =========================================================
 * GARANTE QUE O TERMINAL CONTINUA ATIVO
 *
 * O cookie sozinho não basta.
 * O terminal precisa existir no banco, estar ativo
 * e estar ligado a uma unidade válida.
 * =========================================================
 */
async function buscarTerminalAtivo(
  identificador: string
) {
  const {
    data,
    error,
  } = await supabaseAdmin
    .from("terminais_checkin")
    .select(`
      id,
      identificador,
      ativo,
      unidade_id,

      unidades (
        id,
        codigo,
        nome,
        ativo
      )
    `)
    .eq(
      "identificador",
      identificador
    )
    .eq("ativo", true)
    .maybeSingle();

  if (error) {
    throw new Error(
      error.message
    );
  }

  if (!data) {
    return null;
  }

  if (!data.unidade_id) {
    return null;
  }

  const unidade =
    Array.isArray(data.unidades)
      ? data.unidades[0]
      : data.unidades;

  if (
    !unidade ||
    unidade.ativo !== true
  ) {
    return null;
  }

  return {
    ...data,
    unidades: unidade,
  };
}

/*
 * =========================================================
 * CHECK-IN
 * =========================================================
 */
export async function POST(
  request: NextRequest
) {
  try {
    /*
     * -----------------------------------------------------
     * 1. COOKIE
     * -----------------------------------------------------
     */

    const cookie =
      request.cookies.get(
        COOKIE_NAME
      )?.value;

    const terminalIdentificador =
      validarTerminal(
        cookie
      );

    if (!terminalIdentificador) {
      return NextResponse.json(
        {
          erro:
            "Terminal não ativado.",
        },
        {
          status: 401,
        }
      );
    }

    /*
     * -----------------------------------------------------
     * 2. TERMINAL PRECISA CONTINUAR ATIVO
     * -----------------------------------------------------
     */

    const terminal =
      await buscarTerminalAtivo(
        terminalIdentificador
      );

    if (!terminal) {
      return NextResponse.json(
        {
          erro:
            "Terminal não encontrado, inativo ou sem unidade válida.",
        },
        {
          status: 401,
        }
      );
    }

    /*
     * -----------------------------------------------------
     * 3. QR
     * -----------------------------------------------------
     */

    const body =
      await request.json();

    const tokenRetirada =
      String(
        body.token_retirada ?? ""
      ).trim();

    if (!tokenRetirada) {
      return NextResponse.json(
        {
          erro:
            "QR Code inválido.",
        },
        {
          status: 400,
        }
      );
    }

    /*
     * -----------------------------------------------------
     * 4. RPC OFICIAL
     *
     * A própria RPC valida:
     *
     * retirada.unidade_id
     * =
     * terminal.unidade_id
     *
     * Portanto QR de Mogi não funciona em Suzano
     * e vice-versa.
     * -----------------------------------------------------
     */

    const {
      data,
      error,
    } = await supabaseAdmin.rpc(
      "registrar_checkin_totem_retirada",
      {
        p_token_retirada:
          tokenRetirada,

        p_terminal_identificador:
          terminalIdentificador,
      }
    );

    if (error) {
      return NextResponse.json(
        {
          erro:
            error.message,
        },
        {
          status: 400,
        }
      );
    }

    return NextResponse.json(
      data
    );
  } catch (error) {
    console.error(
      "Erro ao registrar check-in:",
      error
    );

    return NextResponse.json(
      {
        erro:
          "Erro interno ao registrar check-in.",
      },
      {
        status: 500,
      }
    );
  }
}