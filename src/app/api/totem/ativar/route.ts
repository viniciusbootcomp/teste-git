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
 *
 * Existe apenas UMA chave secreta no servidor.
 *
 * A partir dela criamos uma chave diferente para cada
 * terminal.
 *
 * Portanto não precisaremos criar:
 *
 * TOTEM_01_SECRET
 * TOTEM_02_SECRET
 * TOTEM_03_SECRET
 * ...
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
 * CHAVE DE ATIVAÇÃO DO TERMINAL
 * =========================================================
 *
 * Exemplo:
 *
 * master + TOTEM-01
 * gera uma chave
 *
 * master + TOTEM-02
 * gera outra chave
 *
 * Mesmo conhecendo a chave do TOTEM-01,
 * não é possível descobrir a chave do TOTEM-02.
 */
function gerarChaveAtivacao(
  identificador: string
) {
  const segredo =
    obterChaveMestra();

  return crypto
    .createHmac("sha256", segredo)
    .update(
      `ativacao:${identificador}`
    )
    .digest("hex");
}

/*
 * =========================================================
 * ASSINATURA DO COOKIE
 * =========================================================
 *
 * Usamos outro contexto HMAC:
 *
 * cookie:TOTEM-01
 *
 * Isso separa conceitualmente:
 *
 * chave de ativação
 * assinatura da sessão do terminal
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

function criarTokenTerminal(
  identificador: string
) {
  const assinatura =
    gerarAssinaturaCookie(
      identificador
    );

  return `${identificador}.${assinatura}`;
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
 * VALIDA COOKIE
 * =========================================================
 */
function validarCookieTerminal(
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
 * CONSULTA TERMINAL NO BANCO
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
      nome,
      identificador,
      ativo,
      unidade_id,

      unidades (
        id,
        codigo,
        nome,
        cidade,
        estado,
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

  /*
   * Terminal sem unidade não pode funcionar.
   */
  if (!data.unidade_id) {
    return null;
  }

  const unidade =
    Array.isArray(data.unidades)
      ? data.unidades[0]
      : data.unidades;

  /*
   * A própria unidade também precisa estar ativa.
   */
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
 * GET
 *
 * Verifica se o navegador já possui uma ativação válida.
 * =========================================================
 */
export async function GET(
  request: NextRequest
) {
  try {
    const cookie =
      request.cookies.get(
        COOKIE_NAME
      )?.value;

    const identificador =
      validarCookieTerminal(
        cookie
      );

    if (!identificador) {
      return NextResponse.json(
        {
          ativado: false,
        },
        {
          status: 401,
        }
      );
    }

    /*
     * Não basta o cookie estar corretamente assinado.
     *
     * O terminal precisa continuar existindo e ativo
     * no banco.
     *
     * Isso nos permite revogar um terminal simplesmente
     * marcando ativo = false.
     */
    const terminal =
      await buscarTerminalAtivo(
        identificador
      );

    if (!terminal) {
      return NextResponse.json(
        {
          ativado: false,
        },
        {
          status: 401,
        }
      );
    }

    return NextResponse.json({
      ativado: true,

      identificador:
        terminal.identificador,

      terminal: {
        nome:
          terminal.nome,

        unidade_codigo:
          terminal.unidades.codigo,

        unidade_nome:
          terminal.unidades.nome,

        cidade:
          terminal.unidades.cidade,

        estado:
          terminal.unidades.estado,
      },
    });
  } catch (error) {
    console.error(
      "Erro ao validar terminal:",
      error
    );

    return NextResponse.json(
      {
        ativado: false,
      },
      {
        status: 500,
      }
    );
  }
}

/*
 * =========================================================
 * POST
 *
 * Ativa um terminal.
 * =========================================================
 */
export async function POST(
  request: NextRequest
) {
  try {
    const body =
      await request.json();

    const identificador =
      String(
        body.identificador ?? ""
      )
        .trim()
        .toUpperCase();

    const segredoInformado =
      String(
        body.segredo ?? ""
      ).trim();

    if (!identificador) {
      return NextResponse.json(
        {
          erro:
            "Informe o terminal.",
        },
        {
          status: 400,
        }
      );
    }

    if (!segredoInformado) {
      return NextResponse.json(
        {
          erro:
            "Informe a chave de ativação.",
        },
        {
          status: 400,
        }
      );
    }

    /*
     * =====================================================
     * TERMINAL PRECISA EXISTIR NO BANCO
     * =====================================================
     */

    const terminal =
      await buscarTerminalAtivo(
        identificador
      );

    if (!terminal) {
      return NextResponse.json(
        {
          erro:
            "Terminal não encontrado, inativo ou sem unidade válida.",
        },
        {
          status: 403,
        }
      );
    }

    /*
     * =====================================================
     * CALCULA CHAVE INDIVIDUAL DO TERMINAL
     * =====================================================
     */

    const segredoEsperado =
      gerarChaveAtivacao(
        identificador
      );

    if (
      !compararSeguro(
        segredoInformado,
        segredoEsperado
      )
    ) {
      return NextResponse.json(
        {
          erro:
            "Chave de ativação inválida.",
        },
        {
          status: 401,
        }
      );
    }

    /*
     * =====================================================
     * COOKIE DO TERMINAL
     * =====================================================
     */

    const token =
      criarTokenTerminal(
        identificador
      );

    const response =
      NextResponse.json({
        sucesso: true,

        identificador:
          terminal.identificador,

        terminal: {
          nome:
            terminal.nome,

          unidade_codigo:
            terminal.unidades.codigo,

          unidade_nome:
            terminal.unidades.nome,

          cidade:
            terminal.unidades.cidade,

          estado:
            terminal.unidades.estado,
        },
      });

    response.cookies.set(
      COOKIE_NAME,
      token,
      {
        httpOnly: true,

        secure:
          process.env.NODE_ENV ===
          "production",

        sameSite: "lax",

        path: "/",

        maxAge:
          60 *
          60 *
          24 *
          365,
      }
    );

    return response;
  } catch (error) {
    console.error(
      "Erro ao ativar terminal:",
      error
    );

    return NextResponse.json(
      {
        erro:
          "Não foi possível ativar o terminal.",
      },
      {
        status: 500,
      }
    );
  }
}