"use client";

import { FormEvent, useEffect, useState } from "react";
import {
  KeyRound,
  Save,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import { useRouter } from "next/navigation";

import { supabase } from "@/lib/supabase";
import {
  obterAcessoOperacional,
  type AcessoOperacional,
} from "@/lib/auth/permissoes-operacionais";

type Perfil = {
  nome: string | null;
  telefone: string | null;
  tipo_usuario: string;
  unidade_id: string | null;
};

type Unidade = {
  nome: string;
  codigo: string;
};

export default function AdminMinhaContaPage() {
  const router = useRouter();

  const [acesso, setAcesso] =
    useState<AcessoOperacional | null>(null);
  const [email, setEmail] = useState("");
  const [nome, setNome] = useState("");
  const [telefone, setTelefone] = useState("");
  const [perfilPrincipal, setPerfilPrincipal] =
    useState("");
  const [unidade, setUnidade] =
    useState<Unidade | null>(null);

  const [novaSenha, setNovaSenha] = useState("");
  const [confirmacaoSenha, setConfirmacaoSenha] =
    useState("");

  const [carregando, setCarregando] = useState(true);
  const [salvandoPerfil, setSalvandoPerfil] =
    useState(false);
  const [salvandoSenha, setSalvandoSenha] =
    useState(false);
  const [mensagem, setMensagem] = useState("");
  const [erro, setErro] = useState("");

  useEffect(() => {
    const carregar = window.setTimeout(async () => {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        router.replace("/login");
        return;
      }

      try {
        const acessoAtual =
          await obterAcessoOperacional(user.id);

        if (
          !acessoAtual.ativo ||
          acessoAtual.tipoUsuario === "cliente"
        ) {
          router.replace("/");
          return;
        }

        setAcesso(acessoAtual);

        // O e-mail pertence ao Supabase Auth, não à tabela perfil_cliente.
        setEmail(user.email ?? "");

        const { data: perfil, error: perfilError } =
          await supabase
            .from("perfil_cliente")
            .select(
              "nome, telefone, tipo_usuario, unidade_id"
            )
            .eq("user_id", user.id)
            .maybeSingle<Perfil>();

        if (perfilError) {
          throw new Error(perfilError.message);
        }

        setNome(perfil?.nome ?? "");
        setTelefone(perfil?.telefone ?? "");
        setPerfilPrincipal(
          perfil?.tipo_usuario ??
            acessoAtual.tipoUsuario
        );

        if (perfil?.unidade_id) {
          const { data: unidadeData, error: unidadeError } =
            await supabase
              .from("unidades")
              .select("nome, codigo")
              .eq("id", perfil.unidade_id)
              .maybeSingle<Unidade>();

          if (unidadeError) {
            throw new Error(unidadeError.message);
          }

          setUnidade(unidadeData ?? null);
        } else {
          setUnidade(null);
        }
      } catch (error) {
        setErro(
          error instanceof Error
            ? error.message
            : "Não foi possível carregar sua conta."
        );
      } finally {
        setCarregando(false);
      }
    }, 0);

    return () => {
      window.clearTimeout(carregar);
    };
  }, [router]);

  async function salvarPerfil(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    setErro("");
    setMensagem("");

    if (!nome.trim()) {
      setErro("Informe seu nome.");
      return;
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      router.replace("/login");
      return;
    }

    setSalvandoPerfil(true);

    const { error } = await supabase
      .from("perfil_cliente")
      .update({
        nome: nome.trim(),
        telefone: telefone.trim() || null,
      })
      .eq("user_id", user.id);

    setSalvandoPerfil(false);

    if (error) {
      setErro(
        `Não foi possível atualizar seus dados: ${error.message}`
      );
      return;
    }

    setMensagem("Dados pessoais atualizados com sucesso.");
  }

  async function alterarSenha(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    setErro("");
    setMensagem("");

    if (novaSenha.length < 8) {
      setErro(
        "A nova senha deve possuir pelo menos 8 caracteres."
      );
      return;
    }

    if (novaSenha !== confirmacaoSenha) {
      setErro("As senhas informadas não conferem.");
      return;
    }

    setSalvandoSenha(true);

    const { error } = await supabase.auth.updateUser({
      password: novaSenha,
    });

    setSalvandoSenha(false);

    if (error) {
      setErro(
        `Não foi possível alterar a senha: ${error.message}`
      );
      return;
    }

    setNovaSenha("");
    setConfirmacaoSenha("");
    setMensagem("Senha alterada com sucesso.");
  }

  function traduzirPerfil(perfil: string) {
    const perfis: Record<string, string> = {
      admin: "Administrador geral",
      admin_rede: "Administrador da rede",
      franqueado: "Franqueado",
      gestor_unidade: "Gestor de unidade",
      separacao: "Separação",
      retirada: "Retirada",
    };

    return perfis[perfil] ?? perfil;
  }

  if (carregando) {
    return (
      <main className="p-6 md:p-10">
        Carregando sua conta...
      </main>
    );
  }

  return (
    <main className="p-6 md:p-10">
      <div className="mx-auto max-w-5xl">
        <div className="mb-8">
          <p className="text-sm font-medium text-gray-500">
            Administrativo
          </p>

          <h1 className="mt-1 text-3xl font-bold">
            Minha conta
          </h1>

          <p className="mt-2 text-gray-600">
            Atualize seus dados pessoais e configurações de acesso.
          </p>
        </div>

        {erro && (
          <div className="mb-6 rounded-xl border border-red-300 bg-red-50 p-4 text-red-700">
            {erro}
          </div>
        )}

        {mensagem && (
          <div className="mb-6 rounded-xl border border-green-300 bg-green-50 p-4 text-green-700">
            {mensagem}
          </div>
        )}

        <div className="grid gap-6 lg:grid-cols-2">
          <form
            onSubmit={salvarPerfil}
            className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm"
          >
            <div className="mb-6 flex items-center gap-3">
              <div className="rounded-xl bg-gray-100 p-3">
                <UserRound className="h-5 w-5" />
              </div>

              <div>
                <h2 className="text-xl font-bold">
                  Dados pessoais
                </h2>
                <p className="text-sm text-gray-500">
                  Informações básicas do colaborador.
                </p>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <label className="mb-2 block text-sm font-semibold">
                  Nome
                </label>
                <input
                  value={nome}
                  onChange={(event) =>
                    setNome(event.target.value)
                  }
                  className="w-full rounded-lg border border-gray-300 px-4 py-3 outline-none focus:border-black"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-semibold">
                  E-mail
                </label>
                <input
                  value={email}
                  disabled
                  className="w-full rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-gray-500"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-semibold">
                  Telefone
                </label>
                <input
                  value={telefone}
                  onChange={(event) =>
                    setTelefone(event.target.value)
                  }
                  className="w-full rounded-lg border border-gray-300 px-4 py-3 outline-none focus:border-black"
                  placeholder="(11) 99999-9999"
                />
              </div>

              <button
                type="submit"
                disabled={salvandoPerfil}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-black px-4 py-3 font-semibold text-white disabled:opacity-50"
              >
                <Save className="h-4 w-4" />
                {salvandoPerfil
                  ? "Salvando..."
                  : "Salvar dados"}
              </button>
            </div>
          </form>

          <div className="space-y-6">
            <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
              <div className="mb-5 flex items-center gap-3">
                <div className="rounded-xl bg-gray-100 p-3">
                  <ShieldCheck className="h-5 w-5" />
                </div>

                <div>
                  <h2 className="text-xl font-bold">
                    Acesso
                  </h2>
                  <p className="text-sm text-gray-500">
                    Perfil e permissões atuais.
                  </p>
                </div>
              </div>

              <div className="space-y-3 text-sm">
                <div className="flex justify-between gap-4 rounded-lg bg-gray-50 p-3">
                  <span className="text-gray-500">
                    Perfil principal
                  </span>
                  <span className="font-semibold">
                    {traduzirPerfil(perfilPrincipal)}
                  </span>
                </div>

                <div className="flex justify-between gap-4 rounded-lg bg-gray-50 p-3">
                  <span className="text-gray-500">
                    Unidade
                  </span>
                  <span className="text-right font-semibold">
                    {unidade
                      ? `${unidade.nome} (${unidade.codigo})`
                      : "Sem vínculo específico"}
                  </span>
                </div>

                <div className="rounded-lg bg-gray-50 p-3">
                  <p className="mb-2 text-gray-500">
                    Capacidades
                  </p>

                  <div className="flex flex-wrap gap-2">
                    {acesso?.podeSeparar && (
                      <span className="rounded-full border border-gray-300 bg-white px-3 py-1 font-semibold">
                        Separação
                      </span>
                    )}

                    {acesso?.podeRetirar && (
                      <span className="rounded-full border border-gray-300 bg-white px-3 py-1 font-semibold">
                        Retirada
                      </span>
                    )}

                    {acesso?.ehAdmin && (
                      <span className="rounded-full border border-gray-300 bg-white px-3 py-1 font-semibold">
                        Administração
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <form
              onSubmit={alterarSenha}
              className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm"
            >
              <div className="mb-5 flex items-center gap-3">
                <div className="rounded-xl bg-gray-100 p-3">
                  <KeyRound className="h-5 w-5" />
                </div>

                <div>
                  <h2 className="text-xl font-bold">
                    Alterar senha
                  </h2>
                  <p className="text-sm text-gray-500">
                    Defina uma nova senha para seu acesso.
                  </p>
                </div>
              </div>

              <div className="space-y-4">
                <input
                  type="password"
                  value={novaSenha}
                  onChange={(event) =>
                    setNovaSenha(event.target.value)
                  }
                  placeholder="Nova senha"
                  autoComplete="new-password"
                  className="w-full rounded-lg border border-gray-300 px-4 py-3 outline-none focus:border-black"
                />

                <input
                  type="password"
                  value={confirmacaoSenha}
                  onChange={(event) =>
                    setConfirmacaoSenha(
                      event.target.value
                    )
                  }
                  placeholder="Confirmar nova senha"
                  autoComplete="new-password"
                  className="w-full rounded-lg border border-gray-300 px-4 py-3 outline-none focus:border-black"
                />

                <button
                  type="submit"
                  disabled={salvandoSenha}
                  className="w-full rounded-lg border border-gray-300 px-4 py-3 font-semibold hover:bg-gray-50 disabled:opacity-50"
                >
                  {salvandoSenha
                    ? "Alterando..."
                    : "Alterar senha"}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </main>
  );
}
