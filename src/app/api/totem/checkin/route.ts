import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";

import { supabaseAdmin } from "@/lib/supabase-admin";

const COOKIE_NAME = "obox_totem";

function gerarAssinatura(
  identificador: string,
  segredo: string
) {
  return crypto
    .createHmac("sha256", segredo)
    .update(identificador)
    .digest("hex");
}

function validarTerminal(
  valor: string | undefined
) {
  if (!valor) {
    return null;
  }

  const separador = valor.indexOf(".");

  if (separador <= 0) {
    return null;
  }

  const identificador = valor.substring(
    0,
    separador
  );

  const assinaturaRecebida =
    valor.substring(separador + 1);

  if (identificador !== "TOTEM-01") {
    return null;
  }

  const segredo =
    process.env.TOTEM_01_SECRET;

  if (!segredo) {
    return null;
  }

  const assinaturaEsperada =
    gerarAssinatura(
      identificador,
      segredo
    );

  if (
    assinaturaRecebida.length !==
    assinaturaEsperada.length
  ) {
    return null;
  }

  const valido = crypto.timingSafeEqual(
    Buffer.from(assinaturaRecebida),
    Buffer.from(assinaturaEsperada)
  );

  if (!valido) {
    return null;
  }

  return identificador;
}

export async function POST(
  request: NextRequest
) {
  try {
    const cookie =
      request.cookies.get(COOKIE_NAME)?.value;

    const terminalIdentificador =
      validarTerminal(cookie);

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

    const body = await request.json();

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

    const { data, error } =
      await supabaseAdmin.rpc(
        "registrar_checkin_totem",
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
          erro: error.message,
        },
        {
          status: 400,
        }
      );
    }

    return NextResponse.json(data);
  } catch {
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