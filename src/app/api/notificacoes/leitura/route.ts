import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

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

export async function PATCH(
  request: NextRequest
) {
  const usuarioLogado =
    await obterUsuarioLogado(request);

  if ("erro" in usuarioLogado) {
    return usuarioLogado.erro;
  }

  let body: {
    notificacao_id?: string;
    marcar_todas?: boolean;
  };

  try {
    body = await request.json();
  } catch {
    return respostaErro(
      "Corpo da requisição inválido."
    );
  }

  if (body.marcar_todas === true) {
    const { data: notificacoes, error } =
      await supabaseAdmin
        .from("notificacoes")
        .select(
          `
            id,
            user_id,
            perfil_destino,
            unidade_id
          `
        )
        .order("created_at", {
          ascending: false,
        })
        .limit(1000);

    if (error) {
      return respostaErro(
        `Erro ao carregar notificações: ${error.message}`,
        500
      );
    }

    const idsVisiveis = (notificacoes ?? [])
      .filter((notificacao) =>
        podeVerNotificacao(
          notificacao,
          usuarioLogado.user,
          usuarioLogado.perfil
        )
      )
      .map((notificacao) => notificacao.id);

    if (idsVisiveis.length === 0) {
      return NextResponse.json({
        ok: true,
        marcadas: 0,
      });
    }

    const leituras = idsVisiveis.map(
      (notificacaoId) => ({
        notificacao_id: notificacaoId,
        user_id: usuarioLogado.user.id,
        lida_em: new Date().toISOString(),
      })
    );

    const { error: leituraError } =
      await supabaseAdmin
        .from("notificacoes_leitura")
        .upsert(
          leituras,
          {
            onConflict: "notificacao_id,user_id",
          }
        );

    if (leituraError) {
      return respostaErro(
        `Erro ao marcar todas como lidas: ${leituraError.message}`,
        500
      );
    }

    return NextResponse.json({
      ok: true,
      marcadas: idsVisiveis.length,
    });
  }

  const notificacaoId =
    body.notificacao_id?.trim();

  if (!notificacaoId) {
    return respostaErro(
      "Informe a notificação a ser marcada como lida."
    );
  }

  const {
    data: notificacao,
    error: notificacaoError,
  } = await supabaseAdmin
    .from("notificacoes")
    .select(
      `
        id,
        user_id,
        perfil_destino,
        unidade_id
      `
    )
    .eq("id", notificacaoId)
    .maybeSingle();

  if (notificacaoError) {
    return respostaErro(
      `Erro ao localizar notificação: ${notificacaoError.message}`,
      500
    );
  }

  if (
    !notificacao ||
    !podeVerNotificacao(
      notificacao,
      usuarioLogado.user,
      usuarioLogado.perfil
    )
  ) {
    return respostaErro(
      "Notificação não encontrada ou sem acesso.",
      404
    );
  }

  const { error: leituraError } =
    await supabaseAdmin
      .from("notificacoes_leitura")
      .upsert(
        {
          notificacao_id: notificacao.id,
          user_id: usuarioLogado.user.id,
          lida_em: new Date().toISOString(),
        },
        {
          onConflict: "notificacao_id,user_id",
        }
      );

  if (leituraError) {
    return respostaErro(
      `Erro ao marcar notificação como lida: ${leituraError.message}`,
      500
    );
  }

  return NextResponse.json({
    ok: true,
  });
}
