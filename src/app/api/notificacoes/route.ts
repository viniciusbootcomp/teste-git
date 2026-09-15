import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

const PERFIS_VALIDOS = [
  "cliente",
  "admin",
  "admin_rede",
  "franqueado",
  "gestor_unidade",
  "separacao",
  "retirada",
] as const;

const TIPOS_VALIDOS = [
  "sistema",
  "pedido_pago",
  "retirada_pronta",
  "checkin",
  "retirada_concluida",
  "operacional",
  "administrativa",
] as const;

type PerfilValido = (typeof PERFIS_VALIDOS)[number];
type TipoValido = (typeof TIPOS_VALIDOS)[number];

type CriarNotificacaoBody = {
  titulo?: string;
  mensagem?: string;
  tipo?: TipoValido;
  user_id?: string | null;
  perfil_destino?: PerfilValido | null;
  unidade_id?: string | null;
  pedido_id?: string | null;
  retirada_id?: string | null;
  link?: string | null;
};

function respostaErro(
  mensagem: string,
  status = 400
) {
  return NextResponse.json(
    {
      ok: false,
      erro: mensagem,
    },
    {
      status,
    }
  );
}

function obterBearerToken(request: NextRequest) {
  const authorization =
    request.headers.get("authorization") ?? "";

  if (!authorization.startsWith("Bearer ")) {
    return null;
  }

  return authorization.substring(7).trim() || null;
}

async function obterUsuarioLogado(
  request: NextRequest
) {
  const token = obterBearerToken(request);

  if (!token) {
    return {
      erro: respostaErro(
        "Token de autenticação não informado.",
        401
      ),
    };
  }

  const {
    data: { user },
    error: userError,
  } = await supabaseAdmin.auth.getUser(token);

  if (userError || !user) {
    return {
      erro: respostaErro(
        "Sessão inválida ou expirada.",
        401
      ),
    };
  }

  const { data: perfil, error: perfilError } =
    await supabaseAdmin
      .from("perfil_cliente")
      .select(
        `
          id,
          user_id,
          nome,
          tipo_usuario,
          ativo,
          unidade_id,
          franqueado_id
        `
      )
      .eq("user_id", user.id)
      .maybeSingle();

  if (perfilError) {
    return {
      erro: respostaErro(
        `Erro ao validar perfil: ${perfilError.message}`,
        500
      ),
    };
  }

  if (!perfil || !perfil.ativo) {
    return {
      erro: respostaErro(
        "Usuário sem perfil ativo.",
        403
      ),
    };
  }

  return {
    user,
    perfil,
  };
}

function podeVerNotificacao(
  notificacao: {
    user_id: string | null;
    perfil_destino: string | null;
    unidade_id: string | null;
  },
  usuario: {
    id: string;
  },
  perfil: {
    tipo_usuario: string;
    unidade_id: string | null;
  }
) {
  if (
    notificacao.user_id &&
    notificacao.user_id === usuario.id
  ) {
    return true;
  }

  if (
    !notificacao.user_id &&
    notificacao.perfil_destino &&
    notificacao.perfil_destino ===
      perfil.tipo_usuario
  ) {
    if (!notificacao.unidade_id) {
      return true;
    }

    return (
      notificacao.unidade_id ===
      perfil.unidade_id
    );
  }

  if (
    !notificacao.user_id &&
    !notificacao.perfil_destino &&
    notificacao.unidade_id &&
    notificacao.unidade_id ===
      perfil.unidade_id
  ) {
    return true;
  }

  return false;
}

export async function GET(
  request: NextRequest
) {
  const usuarioLogado =
    await obterUsuarioLogado(request);

  if ("erro" in usuarioLogado) {
    return usuarioLogado.erro;
  }

  const { searchParams } = new URL(
    request.url
  );

  const limiteInformado = Number(
    searchParams.get("limite") ?? "30"
  );

  const limite = Number.isFinite(
    limiteInformado
  )
    ? Math.min(
        Math.max(
          Math.trunc(limiteInformado),
          1
        ),
        100
      )
    : 30;

  const somenteNaoLidas =
    searchParams.get("nao_lidas") === "true";

  const { data, error } = await supabaseAdmin
    .from("notificacoes")
    .select(
      `
        id,
        created_at,
        titulo,
        mensagem,
        tipo,
        user_id,
        perfil_destino,
        unidade_id,
        pedido_id,
        retirada_id,
        link,
        criada_por_user_id
      `
    )
    .order("created_at", {
      ascending: false,
    })
    .limit(300);

  if (error) {
    return respostaErro(
      `Erro ao carregar notificações: ${error.message}`,
      500
    );
  }

  const visiveis = (data ?? []).filter(
    (notificacao) =>
      podeVerNotificacao(
        notificacao,
        usuarioLogado.user,
        usuarioLogado.perfil
      )
  );

  const idsVisiveis = visiveis.map(
    (notificacao) => notificacao.id
  );

  let mapaLeituras = new Map<
    string,
    string
  >();

  if (idsVisiveis.length > 0) {
    const {
      data: leituras,
      error: leiturasError,
    } = await supabaseAdmin
      .from("notificacoes_leitura")
      .select(
        `
          notificacao_id,
          lida_em
        `
      )
      .eq(
        "user_id",
        usuarioLogado.user.id
      )
      .in(
        "notificacao_id",
        idsVisiveis
      );

    if (leiturasError) {
      return respostaErro(
        `Erro ao carregar leitura das notificações: ${leiturasError.message}`,
        500
      );
    }

    mapaLeituras = new Map(
      (leituras ?? []).map(
        (leitura) => [
          leitura.notificacao_id,
          leitura.lida_em,
        ]
      )
    );
  }

  const visiveisComLeitura = visiveis.map(
    (notificacao) => {
      const lidaEm =
        mapaLeituras.get(
          notificacao.id
        ) ?? null;

      return {
        ...notificacao,
        lida: lidaEm !== null,
        lida_em: lidaEm,
      };
    }
  );

  const naoLidasTotal =
    visiveisComLeitura.filter(
      (notificacao) => !notificacao.lida
    ).length;

  const filtradas = somenteNaoLidas
    ? visiveisComLeitura.filter(
        (notificacao) => !notificacao.lida
      )
    : visiveisComLeitura;

  return NextResponse.json({
    ok: true,
    notificacoes: filtradas.slice(
      0,
      limite
    ),
    nao_lidas: naoLidasTotal,
  });
}

export async function POST(
  request: NextRequest
) {
  const usuarioLogado =
    await obterUsuarioLogado(request);

  if ("erro" in usuarioLogado) {
    return usuarioLogado.erro;
  }

  if (
    !["admin", "admin_rede"].includes(
      usuarioLogado.perfil.tipo_usuario
    )
  ) {
    return respostaErro(
      "Somente administradores podem criar notificações manuais.",
      403
    );
  }

  let body: CriarNotificacaoBody;

  try {
    body =
      (await request.json()) as CriarNotificacaoBody;
  } catch {
    return respostaErro(
      "Corpo da requisição inválido."
    );
  }

  const titulo =
    (body.titulo ?? "").trim();

  const mensagem =
    (body.mensagem ?? "").trim();

  const tipo =
    body.tipo ?? "administrativa";

  const userId =
    body.user_id?.trim() || null;

  const perfilDestino =
    body.perfil_destino?.trim() || null;

  const unidadeId =
    body.unidade_id?.trim() || null;

  const pedidoId =
    body.pedido_id?.trim() || null;

  const retiradaId =
    body.retirada_id?.trim() || null;

  const link =
    body.link?.trim() || null;

  if (!titulo) {
    return respostaErro(
      "Informe o título da notificação."
    );
  }

  if (!mensagem) {
    return respostaErro(
      "Informe a mensagem da notificação."
    );
  }

  if (
    !TIPOS_VALIDOS.includes(
      tipo as TipoValido
    )
  ) {
    return respostaErro(
      "Tipo de notificação inválido."
    );
  }

  if (
    perfilDestino &&
    !PERFIS_VALIDOS.includes(
      perfilDestino as PerfilValido
    )
  ) {
    return respostaErro(
      "Perfil de destino inválido."
    );
  }

  if (
    !userId &&
    !perfilDestino &&
    !unidadeId
  ) {
    return respostaErro(
      "Informe pelo menos um destino: usuário, perfil ou unidade."
    );
  }

  if (userId) {
    const {
      data: usuarioDestino,
      error: usuarioDestinoError,
    } =
      await supabaseAdmin.auth.admin.getUserById(
        userId
      );

    if (
      usuarioDestinoError ||
      !usuarioDestino.user
    ) {
      return respostaErro(
        "Usuário de destino não encontrado."
      );
    }
  }

  if (unidadeId) {
    const {
      data: unidade,
      error: unidadeError,
    } = await supabaseAdmin
      .from("unidades")
      .select("id")
      .eq("id", unidadeId)
      .maybeSingle();

    if (unidadeError || !unidade) {
      return respostaErro(
        "Unidade de destino não encontrada."
      );
    }
  }

  const { data: notificacaoCriada, error: insertError } =
    await supabaseAdmin
      .from("notificacoes")
      .insert({
        titulo,
        mensagem,
        tipo,
        user_id: userId,
        perfil_destino: perfilDestino,
        unidade_id: unidadeId,
        pedido_id: pedidoId,
        retirada_id: retiradaId,
        link,
        criada_por_user_id:
          usuarioLogado.user.id,
      })
      .select(
        `
          id,
          created_at,
          titulo,
          mensagem,
          tipo,
          user_id,
          perfil_destino,
          unidade_id,
          pedido_id,
          retirada_id,
          link,
          criada_por_user_id
        `
      )
      .single();

  if (insertError) {
    return respostaErro(
      `Erro ao criar notificação: ${insertError.message}`,
      500
    );
  }

  return NextResponse.json(
    {
      ok: true,
      notificacao: {
        ...notificacaoCriada,
        lida: false,
        lida_em: null,
      },
    },
    {
      status: 201,
    }
  );
}
