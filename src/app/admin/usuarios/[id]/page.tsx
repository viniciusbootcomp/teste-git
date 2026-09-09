"use client";

import {
  FormEvent,
  useEffect,
  useState,
} from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

type UsuarioAdmin = {
  id: string;
  user_id: string | null;
  nome: string | null;
  telefone: string | null;
  email: string | null;
  tipo_usuario: string;
  ativo: boolean;
  unidade_id: string | null;
  franqueado_id: string | null;
};

type Unidade = {
  id: string;
  nome: string;
  codigo: string;
  ativo: boolean;
};

type Franqueado = {
  id: string;
  nome: string;
  codigo: string;
  ativo: boolean;
};

type FormState = {
  nome: string;
  email: string;
  telefone: string;
  tipo_usuario: string;
  ativo: boolean;
  unidade_id: string;
  franqueado_id: string;
};

const PERFIS = [
  { value: "admin", label: "Administrador geral" },
  { value: "admin_rede", label: "Administrador da rede" },
  { value: "franqueado", label: "Franqueado" },
  { value: "gestor_unidade", label: "Gestor de unidade" },
  { value: "separacao", label: "Separação" },
  { value: "retirada", label: "Retirada" },
];

export default function EditarUsuarioPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const usuarioId = params?.id;

  const [unidades, setUnidades] =
    useState<Unidade[]>([]);
  const [franqueados, setFranqueados] =
    useState<Franqueado[]>([]);

  const [form, setForm] = useState<FormState>({
    nome: "",
    email: "",
    telefone: "",
    tipo_usuario: "separacao",
    ativo: true,
    unidade_id: "",
    franqueado_id: "",
  });

  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  const [mensagem, setMensagem] = useState("");

  async function obterAccessToken() {
    const {
      data: { session },
      error,
    } = await supabase.auth.getSession();

    if (error || !session?.access_token) {
      router.push("/login");
      return null;
    }

    return session.access_token;
  }

  useEffect(() => {
    const carregar = window.setTimeout(async () => {
      try {
        if (!usuarioId) {
          setErro("Usuário inválido.");
          return;
        }

        const token = await obterAccessToken();

        if (!token) {
          return;
        }

        const response = await fetch(
          `/api/admin/usuarios/${usuarioId}`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
            cache: "no-store",
          }
        );

        const json = await response.json();

        if (!response.ok) {
          if (response.status === 401) {
            router.push("/login");
            return;
          }

          if (response.status === 403) {
            router.push("/area-cliente");
            return;
          }

          throw new Error(
            json.erro ??
              "Não foi possível carregar o usuário."
          );
        }

        const usuario = json.usuario as UsuarioAdmin;

        setForm({
          nome: usuario.nome ?? "",
          email: usuario.email ?? "",
          telefone: usuario.telefone ?? "",
          tipo_usuario: usuario.tipo_usuario,
          ativo: usuario.ativo,
          unidade_id: usuario.unidade_id ?? "",
          franqueado_id:
            usuario.franqueado_id ?? "",
        });

        setUnidades(
          (json.unidades ?? []) as Unidade[]
        );

        setFranqueados(
          (json.franqueados ?? []) as Franqueado[]
        );
      } catch (error) {
        setErro(
          error instanceof Error
            ? error.message
            : "Não foi possível carregar a tela."
        );
      } finally {
        setCarregando(false);
      }
    }, 0);

    return () => {
      window.clearTimeout(carregar);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [usuarioId]);

  async function salvar(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    setErro("");
    setMensagem("");

    const nome = form.nome.trim();
    const email = form.email.trim().toLowerCase();

    if (!nome) {
      setErro("Informe o nome do usuário.");
      return;
    }

    if (!email) {
      setErro("Informe o e-mail do usuário.");
      return;
    }

    const token = await obterAccessToken();

    if (!token || !usuarioId) {
      return;
    }

    setSalvando(true);

    try {
      const response = await fetch(
        `/api/admin/usuarios/${usuarioId}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            nome,
            email,
            telefone:
              form.telefone.trim() || null,
            tipo_usuario: form.tipo_usuario,
            ativo: form.ativo,
            unidade_id:
              form.unidade_id || null,
            franqueado_id:
              form.franqueado_id || null,
          }),
        }
      );

      const json = await response.json();

      if (!response.ok) {
        throw new Error(
          json.erro ??
            "Não foi possível atualizar o usuário."
        );
      }

      setMensagem(
        "Usuário atualizado com sucesso."
      );

      window.setTimeout(() => {
        router.push("/admin/usuarios");
      }, 900);
    } catch (error) {
      setErro(
        error instanceof Error
          ? error.message
          : "Não foi possível atualizar o usuário."
      );
    } finally {
      setSalvando(false);
    }
  }

  if (carregando) {
    return (
      <main className="min-h-screen bg-white p-6 text-black md:p-10">
        <p>Carregando usuário...</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-white p-6 text-black md:p-10">
      <div className="mx-auto max-w-4xl">
        <div className="mb-8 flex flex-col justify-between gap-4 md:flex-row md:items-center">
          <div>
            <h1 className="text-3xl font-bold">
              Editar usuário
            </h1>

            <p className="mt-2 text-sm text-gray-500">
              Altere os dados, perfil e vínculos do usuário interno.
            </p>
          </div>

          <button
            type="button"
            onClick={() =>
              router.push("/admin/usuarios")
            }
            className="rounded-lg border border-gray-300 px-4 py-2 font-semibold hover:bg-gray-50"
          >
            Voltar
          </button>
        </div>

        {erro && (
          <div className="mb-6 rounded-lg border border-red-400 bg-red-50 p-4 text-red-700">
            {erro}
          </div>
        )}

        {mensagem && (
          <div className="mb-6 rounded-lg border border-green-400 bg-green-50 p-4 text-green-700">
            {mensagem}
          </div>
        )}

        <form
          onSubmit={salvar}
          className="space-y-6 rounded-xl border border-gray-300 p-6"
        >
          <div className="grid gap-5 md:grid-cols-2">
            <div>
              <label className="mb-2 block text-sm font-semibold">
                Nome *
              </label>

              <input
                value={form.nome}
                onChange={(event) =>
                  setForm((atual) => ({
                    ...atual,
                    nome: event.target.value,
                  }))
                }
                className="w-full rounded-lg border border-gray-300 px-4 py-3 outline-none focus:border-black"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-semibold">
                E-mail *
              </label>

              <input
                type="email"
                value={form.email}
                onChange={(event) =>
                  setForm((atual) => ({
                    ...atual,
                    email: event.target.value,
                  }))
                }
                className="w-full rounded-lg border border-gray-300 px-4 py-3 outline-none focus:border-black"
              />
            </div>
          </div>

          <div className="grid gap-5 md:grid-cols-2">
            <div>
              <label className="mb-2 block text-sm font-semibold">
                Telefone
              </label>

              <input
                value={form.telefone}
                onChange={(event) =>
                  setForm((atual) => ({
                    ...atual,
                    telefone: event.target.value,
                  }))
                }
                className="w-full rounded-lg border border-gray-300 px-4 py-3 outline-none focus:border-black"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-semibold">
                Perfil *
              </label>

              <select
                value={form.tipo_usuario}
                onChange={(event) =>
                  setForm((atual) => ({
                    ...atual,
                    tipo_usuario:
                      event.target.value,
                  }))
                }
                className="w-full rounded-lg border border-gray-300 px-4 py-3 outline-none focus:border-black"
              >
                {PERFIS.map((perfil) => (
                  <option
                    key={perfil.value}
                    value={perfil.value}
                  >
                    {perfil.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid gap-5 md:grid-cols-2">
            <div>
              <label className="mb-2 block text-sm font-semibold">
                Unidade
              </label>

              <select
                value={form.unidade_id}
                onChange={(event) =>
                  setForm((atual) => ({
                    ...atual,
                    unidade_id:
                      event.target.value,
                  }))
                }
                className="w-full rounded-lg border border-gray-300 px-4 py-3 outline-none focus:border-black"
              >
                <option value="">
                  Sem vínculo específico
                </option>

                {unidades.map((unidade) => (
                  <option
                    key={unidade.id}
                    value={unidade.id}
                    disabled={!unidade.ativo}
                  >
                    {unidade.nome} ({unidade.codigo})
                    {!unidade.ativo ? " - Inativa" : ""}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-2 block text-sm font-semibold">
                Franqueado / operação
              </label>

              <select
                value={form.franqueado_id}
                onChange={(event) =>
                  setForm((atual) => ({
                    ...atual,
                    franqueado_id:
                      event.target.value,
                  }))
                }
                className="w-full rounded-lg border border-gray-300 px-4 py-3 outline-none focus:border-black"
              >
                <option value="">
                  Sem vínculo específico
                </option>

                {franqueados.map((franqueado) => (
                  <option
                    key={franqueado.id}
                    value={franqueado.id}
                    disabled={!franqueado.ativo}
                  >
                    {franqueado.nome} ({franqueado.codigo})
                    {!franqueado.ativo
                      ? " - Inativo"
                      : ""}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-gray-300 px-4 py-3">
            <input
              type="checkbox"
              checked={form.ativo}
              onChange={(event) =>
                setForm((atual) => ({
                  ...atual,
                  ativo: event.target.checked,
                }))
              }
              className="h-5 w-5"
            />

            <div>
              <div className="font-semibold">
                Usuário ativo
              </div>
              <div className="text-sm text-gray-500">
                Usuários inativos permanecem cadastrados, mas não devem ter acesso operacional.
              </div>
            </div>
          </label>

          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={() =>
                router.push("/admin/usuarios")
              }
              disabled={salvando}
              className="rounded-lg border border-gray-300 px-5 py-3 font-semibold hover:bg-gray-50 disabled:opacity-50"
            >
              Cancelar
            </button>

            <button
              type="submit"
              disabled={salvando}
              className="rounded-lg bg-black px-5 py-3 font-semibold text-white hover:bg-gray-800 disabled:opacity-50"
            >
              {salvando
                ? "Salvando..."
                : "Salvar alterações"}
            </button>
          </div>
        </form>
      </div>
    </main>
  );
}
