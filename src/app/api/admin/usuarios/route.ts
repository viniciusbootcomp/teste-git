import { randomBytes } from "crypto";
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

type CriarUsuarioBody = {
  email?: string;
  nome?: string;
  telefone?: string;
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
      .select("user_id, nome, tipo_usuario, ativo")
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
    return "Administrador da rede não pode criar outro administrador geral.";
  }

  return null;
}

export async function GET(request: NextRequest) {
  const administrador = await obterAdministrador(request);

  if ("erro" in administrador) {
    return administrador.erro;
  }

  const [
    perfisResult,
    authResult,
    unidadesResult,
    franqueadosResult,
  ] = await Promise.all([
    supabaseAdmin
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
      .in("tipo_usuario", [...PERFIS_INTERNOS])
      .order("nome", { ascending: true }),

    supabaseAdmin.auth.admin.listUsers({
      page: 1,
      perPage: 1000,
    }),

    supabaseAdmin
      .from("unidades")
      .select("id, nome, codigo, ativo")
      .eq("ativo", true)
      .order("nome", { ascending: true }),

    supabaseAdmin
      .from("franqueados")
      .select("id, nome, codigo, ativo")
      .eq("ativo", true)
      .order("nome", { ascending: true }),
  ]);

  if (perfisResult.error) {
    return respostaErro(
      `Erro ao carregar perfis: ${perfisResult.error.message}`,
      500
    );
  }

  if (authResult.error) {
    return respostaErro(
      `Erro ao carregar usuários do Auth: ${authResult.error.message}`,
      500
    );
  }

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

  const authPorId = new Map(
    authResult.data.users.map((usuario) => [
      usuario.id,
      usuario,
    ])
  );

  const usuarios = (perfisResult.data ?? []).map(
    (perfil) => {
      const authUser = perfil.user_id
        ? authPorId.get(perfil.user_id)
        : undefined;

      return {
        id: perfil.id,
        user_id: perfil.user_id,
        created_at: perfil.created_at,
        nome: perfil.nome,
        telefone: perfil.telefone,
        email: authUser?.email ?? null,
        tipo_usuario: perfil.tipo_usuario,
        ativo: perfil.ativo,
        unidade_id: perfil.unidade_id,
        franqueado_id: perfil.franqueado_id,
        ultimo_login_em:
          authUser?.last_sign_in_at ?? null,
      };
    }
  );

  return NextResponse.json({
    ok: true,
    usuarios,
    unidades: unidadesResult.data ?? [],
    franqueados: franqueadosResult.data ?? [],
  });
}

export async function POST(request: NextRequest) {
  const administrador = await obterAdministrador(request);

  if ("erro" in administrador) {
    return administrador.erro;
  }

  let body: CriarUsuarioBody;

  try {
    body = (await request.json()) as CriarUsuarioBody;
  } catch {
    return respostaErro("Corpo da requisição inválido.");
  }

  const email = (body.email ?? "")
    .trim()
    .toLowerCase();

  const nome = (body.nome ?? "").trim();
  const telefone = (body.telefone ?? "").trim() || null;
  const tipoUsuario = body.tipo_usuario ?? "separacao";
  const ativo =
    typeof body.ativo === "boolean" ? body.ativo : true;
  const unidadeId = body.unidade_id?.trim() || null;
  const franqueadoId =
    body.franqueado_id?.trim() || null;

  if (!email) {
    return respostaErro("Informe o e-mail do usuário.");
  }

  if (!nome) {
    return respostaErro("Informe o nome do usuário.");
  }

  const erroPerfil = validarPerfilSolicitado(
    administrador.perfil.tipo_usuario,
    tipoUsuario
  );

  if (erroPerfil) {
    return respostaErro(erroPerfil, 403);
  }

  const senhaTemporaria =
    randomBytes(32).toString("base64url");

  const {
    data: usuarioCriado,
    error: criarAuthError,
  } = await supabaseAdmin.auth.admin.createUser({
    email,
    password: senhaTemporaria,
    email_confirm: true,
  });

  if (criarAuthError || !usuarioCriado.user) {
    const mensagem =
      criarAuthError?.message ??
      "Não foi possível criar o usuário.";

    if (
      mensagem.toLowerCase().includes("already") ||
      mensagem.toLowerCase().includes("registered")
    ) {
      return respostaErro(
        "Já existe um usuário cadastrado com este e-mail."
      );
    }

    return respostaErro(
      `Erro ao criar usuário: ${mensagem}`,
      500
    );
  }

  const userId = usuarioCriado.user.id;

  const { error: perfilError } = await supabaseAdmin
    .from("perfil_cliente")
    .insert({
      user_id: userId,
      nome,
      telefone,
      tipo_usuario: tipoUsuario,
      ativo,
      unidade_id: unidadeId,
      franqueado_id: franqueadoId,
    });

  if (perfilError) {
    await supabaseAdmin.auth.admin.deleteUser(userId);

    return respostaErro(
      `Erro ao criar perfil do usuário: ${perfilError.message}`,
      500
    );
  }

  return NextResponse.json(
    {
      ok: true,
      usuario: {
        user_id: userId,
        email,
        nome,
        telefone,
        tipo_usuario: tipoUsuario,
        ativo,
        unidade_id: unidadeId,
        franqueado_id: franqueadoId,
      },
      orientacao:
        "Usuário criado. Para definir a senha, utilize o fluxo de recuperação de senha já existente no aplicativo.",
    },
    { status: 201 }
  );
}
