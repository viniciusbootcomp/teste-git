import {
  obterAcessoOperacional,
} from "@/lib/auth/permissoes-operacionais";

export async function obterDestinoPosLogin(
  userId: string
): Promise<string> {
  const acesso =
    await obterAcessoOperacional(
      userId
    );

  if (!acesso.ativo) {
    throw new Error(
      "Usuário inativo. Procure o administrador do sistema."
    );
  }

  if (
    acesso.tipoUsuario ===
    "cliente"
  ) {
    return "/";
  }

  /*
   * Todo usuário interno entra pela experiência
   * operacional, e não pelo catálogo do cliente.
   *
   * O dashboard adapta os atalhos e indicadores
   * conforme as capacidades do usuário.
   */
  return "/admin/dashboard";
}
