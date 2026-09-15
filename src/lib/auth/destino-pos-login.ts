import { supabase } from "@/lib/supabase";

export type TipoUsuario =
  | "cliente"
  | "admin"
  | "admin_rede"
  | "franqueado"
  | "gestor_unidade"
  | "separacao"
  | "retirada";

export type PermissaoOperacional = "separacao" | "retirada";

type PerfilAtual = {
  tipo_usuario: TipoUsuario;
  ativo: boolean;
};

type PermissaoAtual = {
  permissao: PermissaoOperacional;
  ativo: boolean;
};

export async function obterDestinoPosLogin(
  userId: string
): Promise<string> {
  const { data: perfil, error: perfilError } = await supabase
    .from("perfil_cliente")
    .select("tipo_usuario, ativo")
    .eq("user_id", userId)
    .maybeSingle<PerfilAtual>();

  if (perfilError) {
    throw new Error(
      `Não foi possível carregar o perfil do usuário: ${perfilError.message}`
    );
  }

  if (!perfil) {
    return "/";
  }

  if (!perfil.ativo) {
    throw new Error("Usuário inativo. Procure o administrador do sistema.");
  }

  if (perfil.tipo_usuario === "cliente") {
    return "/";
  }

  if (
    perfil.tipo_usuario === "admin" ||
    perfil.tipo_usuario === "admin_rede"
  ) {
    return "/admin/pedidos";
  }

  const { data: permissoes, error: permissoesError } = await supabase
    .from("usuario_permissoes")
    .select("permissao, ativo")
    .eq("user_id", userId)
    .eq("ativo", true)
    .returns<PermissaoAtual[]>();

  if (permissoesError) {
    throw new Error(
      `Não foi possível carregar as permissões do usuário: ${permissoesError.message}`
    );
  }

  const permissoesAtivas = new Set<PermissaoOperacional>(
    (permissoes ?? []).map((item) => item.permissao)
  );

  if (perfil.tipo_usuario === "separacao") {
    permissoesAtivas.add("separacao");
  }

  if (perfil.tipo_usuario === "retirada") {
    permissoesAtivas.add("retirada");
  }

  if (permissoesAtivas.has("separacao")) {
    return "/admin/pedidos";
  }

  if (permissoesAtivas.has("retirada")) {
    return "/admin/retirada/fila";
  }

  if (
    perfil.tipo_usuario === "franqueado" ||
    perfil.tipo_usuario === "gestor_unidade"
  ) {
    return "/admin/pedidos";
  }

  return "/";
}
