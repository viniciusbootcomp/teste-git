import { supabase } from "@/lib/supabase";

export type TipoUsuario =
  | "cliente"
  | "admin"
  | "admin_rede"
  | "franqueado"
  | "gestor_unidade"
  | "separacao"
  | "retirada";

export type PermissaoOperacional =
  | "separacao"
  | "retirada";

type PerfilUsuario = {
  tipo_usuario: TipoUsuario;
  ativo: boolean;
};

type PermissaoUsuario = {
  permissao: PermissaoOperacional;
  ativo: boolean;
};

export type AcessoOperacional = {
  tipoUsuario: TipoUsuario;
  ativo: boolean;

  ehAdmin: boolean;

  podeSeparar: boolean;
  podeRetirar: boolean;

  podeAcessarPedidos: boolean;
  podeAcessarFilaRetirada: boolean;
};

export async function obterAcessoOperacional(
  userId: string
): Promise<AcessoOperacional> {
  const {
    data: perfil,
    error: perfilError,
  } = await supabase
    .from("perfil_cliente")
    .select(`
      tipo_usuario,
      ativo
    `)
    .eq("user_id", userId)
    .maybeSingle<PerfilUsuario>();

  if (perfilError) {
    throw new Error(
      `Não foi possível carregar o perfil do usuário: ${perfilError.message}`
    );
  }

  if (!perfil) {
    throw new Error(
      "Perfil do usuário não encontrado."
    );
  }

  if (!perfil.ativo) {
    return {
      tipoUsuario: perfil.tipo_usuario,
      ativo: false,

      ehAdmin: false,

      podeSeparar: false,
      podeRetirar: false,

      podeAcessarPedidos: false,
      podeAcessarFilaRetirada: false,
    };
  }

  const ehAdmin =
    perfil.tipo_usuario === "admin" ||
    perfil.tipo_usuario === "admin_rede";

  /*
   * Administradores possuem todas as
   * capacidades operacionais.
   */
  if (ehAdmin) {
    return {
      tipoUsuario: perfil.tipo_usuario,
      ativo: true,

      ehAdmin: true,

      podeSeparar: true,
      podeRetirar: true,

      podeAcessarPedidos: true,
      podeAcessarFilaRetirada: true,
    };
  }

  const {
    data: permissoes,
    error: permissoesError,
  } = await supabase
    .from("usuario_permissoes")
    .select(`
      permissao,
      ativo
    `)
    .eq("user_id", userId)
    .eq("ativo", true)
    .returns<PermissaoUsuario[]>();

  if (permissoesError) {
    throw new Error(
      `Não foi possível carregar as permissões do usuário: ${permissoesError.message}`
    );
  }

  const permissoesAtivas =
    new Set<PermissaoOperacional>(
      (permissoes ?? []).map(
        (item) => item.permissao
      )
    );

  /*
   * Compatibilidade temporária com o modelo
   * anterior baseado em tipo_usuario.
   *
   * Isso permite migrarmos as telas aos poucos
   * sem quebrar usuários já existentes.
   */
  if (
    perfil.tipo_usuario === "separacao"
  ) {
    permissoesAtivas.add(
      "separacao"
    );
  }

  if (
    perfil.tipo_usuario === "retirada"
  ) {
    permissoesAtivas.add(
      "retirada"
    );
  }

  const podeSeparar =
    permissoesAtivas.has(
      "separacao"
    );

  const podeRetirar =
    permissoesAtivas.has(
      "retirada"
    );

  /*
   * Pedidos é a área de trabalho
   * da equipe de separação.
   *
   * Quem possui apenas retirada não
   * precisa acessar a lista geral.
   */
  const podeAcessarPedidos =
    podeSeparar ||
    perfil.tipo_usuario === "franqueado" ||
    perfil.tipo_usuario === "gestor_unidade";

  /*
   * Fila é a área operacional de quem
   * realiza retirada/entrega física.
   */
  const podeAcessarFilaRetirada =
    podeRetirar;

  return {
    tipoUsuario:
      perfil.tipo_usuario,

    ativo: true,

    ehAdmin,

    podeSeparar,
    podeRetirar,

    podeAcessarPedidos,
    podeAcessarFilaRetirada,
  };
}