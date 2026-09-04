import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";

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

function criarTokenTerminal(
  identificador: string,
  segredo: string
) {
  const assinatura = gerarAssinatura(
    identificador,
    segredo
  );

  return `${identificador}.${assinatura}`;
}

function validarCookieTerminal(
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

  const assinaturaRecebida = valor.substring(
    separador + 1
  );

  if (identificador !== "TOTEM-01") {
    return null;
  }

  const segredo = process.env.TOTEM_01_SECRET;

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

export async function GET(
  request: NextRequest
) {
  const cookie =
    request.cookies.get(COOKIE_NAME)?.value;

  const identificador =
    validarCookieTerminal(cookie);

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

  return NextResponse.json({
    ativado: true,
    identificador,
  });
}

export async function POST(
  request: NextRequest
) {
  try {
    const body = await request.json();

    const identificador =
      String(
        body.identificador ?? ""
      ).trim();

    const segredoInformado =
      String(body.segredo ?? "").trim();

    if (!identificador) {
      return NextResponse.json(
        {
          erro: "Informe o terminal.",
        },
        {
          status: 400,
        }
      );
    }

    if (identificador !== "TOTEM-01") {
      return NextResponse.json(
        {
          erro: "Terminal não autorizado.",
        },
        {
          status: 403,
        }
      );
    }

    const segredoEsperado =
      process.env.TOTEM_01_SECRET;

    if (!segredoEsperado) {
      return NextResponse.json(
        {
          erro:
            "Terminal não configurado no servidor.",
        },
        {
          status: 500,
        }
      );
    }

    if (
      segredoInformado !== segredoEsperado
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

    const token = criarTokenTerminal(
      identificador,
      segredoEsperado
    );

    const response =
      NextResponse.json({
        sucesso: true,
        identificador,
      });

    response.cookies.set(
      COOKIE_NAME,
      token,
      {
        httpOnly: true,
        secure: true,
        sameSite: "lax",
        path: "/",
        maxAge:
          60 * 60 * 24 * 365,
      }
    );

    return response;
  } catch {
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