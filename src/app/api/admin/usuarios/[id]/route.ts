import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

const PERFIS_INTERNOS = [
  "admin",
  "admin_rede",
  "franqueado",
  "gestor_unidade",
  "separacao",
  "retirada",
] as const;

type PerfilInterno = (typeof PERFIS_INTERNOS)[number];

type AtualizarUsuarioBody = {
  nome?: string;
  email?: string;
  telefone?: string | null;
  tipo_usuario?: PerfilInterno;
  ativo?: boolean;
  unidade_id?: string | null;
  franqueado_id?: string | null;
};

function respostaErro(mensagem: string, status = 400) {
  return NextResponse.json(
    { ok: false, erro: mensagem },
    { status }
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

async function obterAdministrador(request: NextRequest) {
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
      .select("id, user_id, nome, tipo_usuario, ativo")
      .eq("user_id", user.id)
      .maybeSingle();

  if (perfilError) {
    return {
      erro: respostaErro(
        `Erro ao validar permissão: ${perfilError.message}`,
        500
      ),
    };
  }

  if (
    !perfil ||
    !perfil.ativo ||
    !["admin", "admin_rede"].includes(
      perfil.tipo_usuario
    )
  ) {
    return {
      erro: respostaErro(
        "Acesso permitido somente para administradores.",
        403
      ),
    };
  }

  return { user, perfil };
}

function validarPerfilSolicitado(
  administradorTipo: string,
  perfilSolicitado: string
) {
  if (
    !PERFIS_INTERNOS.includes(
      perfilSolicitado as PerfilInterno
    )
  ) {
    return "Perfil de usuário inválido.";
  }

  if (
    administradorTipo === "admin_rede" &&
    ["admin", "admin_rede"].includes(perfilSolicitado)
  ) {
    return "Administrador da rede não pode atribuir perfil de administrador geral.";
  }

  return null;
}

async function buscarUsuario(perfilId: string) {
  const { data: perfil, error: perfilError } =
    await supabaseAdmin
      .from("perfil_cliente")
      .select(`
        id,
        created_at,
        user_id,
        nome,
        telefone,
        tipo_usuario,
        ativo,
        unidade_id,
        franqueado_id
      `)
      .eq("id", perfilId)
      .maybeSingle();

  if (perfilError) {
    throw new Error(perfilError.message);
  }

  if (!perfil) {
    return null;
  }

  let email: string | null = null;
  let ultimoLoginEm: string | null = null;

  if (perfil.user_id) {
    const { data: authData, error: authError } =
      await supabaseAdmin.auth.admin.getUserById(
        perfil.user_id
      );

    if (authError) {
      throw new Error(authError.message);
    }

    email = authData.user?.email ?? null;
    ultimoLoginEm =
      authData.user?.last_sign_in_at ?? null;
  }

  return {
    ...perfil,
    email,
    ultimo_login_em: ultimoLoginEm,
  };
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const administrador = await obterAdministrador(request);

  if ("erro" in administrador) {
    return administrador.erro;
  }

  const { id } = await context.params;

  try {
    const usuario = await buscarUsuario(id);

    if (!usuario) {
      return respostaErro(
        "Usuário não encontrado.",
        404
      );
    }

    const [
      unidadesResult,
      franqueadosResult,
    ] = await Promise.all([
      supabaseAdmin
        .from("unidades")
        .select("id, nome, codigo, ativo")
        .order("nome", { ascending: true }),

      supabaseAdmin
        .from("franqueados")
        .select("id, nome, codigo, ativo")
        .order("nome", { ascending: true }),
    ]);

    if (unidadesResult.error) {
      return respostaErro(
        `Erro ao carregar unidades: ${unidadesResult.error.message}`,
        500
      );
    }

    if (franqueadosResult.error) {
      return respostaErro(
        `Erro ao carregar franqueados: ${franqueadosResult.error.message}`,
        500
      );
    }

    return NextResponse.json({
      ok: true,
      usuario,
      unidades: unidadesResult.data ?? [],
      franqueados: franqueadosResult.data ?? [],
    });
  } catch (error) {
    return respostaErro(
      error instanceof Error
        ? error.message
        : "Não foi possível carregar o usuário.",
      500
    );
  }
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const administrador = await obterAdministrador(request);

  if ("erro" in administrador) {
    return administrador.erro;
  }

  const { id } = await context.params;

  let body: AtualizarUsuarioBody;

  try {
    body =
      (await request.json()) as AtualizarUsuarioBody;
  } catch {
    return respostaErro(
      "Corpo da requisição inválido."
    );
  }

  const usuarioAtual = await buscarUsuario(id);

  if (!usuarioAtual) {
    return respostaErro(
      "Usuário não encontrado.",
      404
    );
  }

  const nome = (body.nome ?? "").trim();
  const email = (body.email ?? "")
    .trim()
    .toLowerCase();
  const telefone =
    (body.telefone ?? "").trim() || null;
  const tipoUsuario =
    body.tipo_usuario ?? usuarioAtual.tipo_usuario;
  const ativo =
    typeof body.ativo === "boolean"
      ? body.ativo
      : usuarioAtual.ativo;
  const unidadeId =
    body.unidade_id?.trim() || null;
  const franqueadoId =
    body.franqueado_id?.trim() || null;

  if (!nome) {
    return respostaErro(
      "Informe o nome do usuário."
    );
  }

  if (!email) {
    return respostaErro(
      "Informe o e-mail do usuário."
    );
  }

  const erroPerfil = validarPerfilSolicitado(
    administrador.perfil.tipo_usuario,
    tipoUsuario
  );

  if (erroPerfil) {
    return respostaErro(erroPerfil, 403);
  }

  const editandoProprioUsuario =
    usuarioAtual.user_id === administrador.user.id;

  if (editandoProprioUsuario && !ativo) {
    return respostaErro(
      "Você não pode inativar o próprio usuário.",
      400
    );
  }

  if (
    editandoProprioUsuario &&
    !["admin", "admin_rede"].includes(tipoUsuario)
  ) {
    return respostaErro(
      "Você não pode remover o próprio perfil administrativo.",
      400
    );
  }

  if (!usuarioAtual.user_id) {
    return respostaErro(
      "Este perfil não possui usuário vinculado no Supabase Auth.",
      400
    );
  }

  const emailAnterior = usuarioAtual.email ?? "";

  if (email !== emailAnterior.toLowerCase()) {
    const { error: authUpdateError } =
      await supabaseAdmin.auth.admin.updateUserById(
        usuarioAtual.user_id,
        {
          email,
          email_confirm: true,
        }
      );

    if (authUpdateError) {
      return respostaErro(
        `Erro ao atualizar e-mail no Auth: ${authUpdateError.message}`,
        500
      );
    }
  }

  const { error: perfilUpdateError } =
    await supabaseAdmin
      .from("perfil_cliente")
      .update({
        nome,
        telefone,
        tipo_usuario: tipoUsuario,
        ativo,
        unidade_id: unidadeId,
        franqueado_id: franqueadoId,
      })
      .eq("id", id);

  if (perfilUpdateError) {
    if (
      email !== emailAnterior.toLowerCase() &&
      emailAnterior
    ) {
      await supabaseAdmin.auth.admin.updateUserById(
        usuarioAtual.user_id,
        {
          email: emailAnterior,
          email_confirm: true,
        }
      );
    }

    return respostaErro(
      `Erro ao atualizar perfil: ${perfilUpdateError.message}`,
      500
    );
  }

  const usuarioAtualizado = await buscarUsuario(id);

  return NextResponse.json({
    ok: true,
    usuario: usuarioAtualizado,
  });
}
