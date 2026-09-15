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

  if (acesso.ehAdmin) {
    return "/admin/pedidos";
  }

  /*
   * Quem possui separação entra na área
   * de pedidos, mesmo que também possua
   * a capacidade de retirada.
   */
  if (
    acesso.podeSeparar
  ) {
    return "/admin/pedidos";
  }

  /*
   * Quem possui somente retirada entra
   * diretamente na fila operacional.
   */
  if (
    acesso.podeRetirar
  ) {
    return "/admin/retirada/fila";
  }

  if (
    acesso.tipoUsuario ===
      "franqueado" ||
    acesso.tipoUsuario ===
      "gestor_unidade"
  ) {
    return "/admin/pedidos";
  }

  return "/";
}