"use client";

import {
  FormEvent,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

type UsuarioAdmin = {
  id: string;
  user_id: string | null;
  created_at: string;
  nome: string | null;
  telefone: string | null;
  email: string | null;
  tipo_usuario: string;
  ativo: boolean;
  unidade_id: string | null;
  franqueado_id: string | null;
  ultimo_login_em: string | null;
};

type Unidade = {
  id: string;
  nome: string;
  codigo: string;
};

type Franqueado = {
  id: string;
  nome: string;
  codigo: string;
};

type FormNovoUsuario = {
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

export default function AdminUsuariosPage() {
  const router = useRouter();

  const [usuarios, setUsuarios] =
    useState<UsuarioAdmin[]>([]);
  const [unidades, setUnidades] =
    useState<Unidade[]>([]);
  const [franqueados, setFranqueados] =
    useState<Franqueado[]>([]);

  const [form, setForm] = useState<FormNovoUsuario>({
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
  const [mostrarFormulario, setMostrarFormulario] =
    useState(false);
  const [busca, setBusca] = useState("");
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

  async function carregarDados() {
    setErro("");

    const token = await obterAccessToken();

    if (!token) {
      return;
    }

    const response = await fetch(
      "/api/admin/usuarios",
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
          "Não foi possível carregar os usuários."
      );
    }

    setUsuarios(
      (json.usuarios ?? []) as UsuarioAdmin[]
    );
    setUnidades(
      (json.unidades ?? []) as Unidade[]
    );
    setFranqueados(
      (json.franqueados ?? []) as Franqueado[]
    );
  }

  useEffect(() => {
    const carregar = window.setTimeout(async () => {
      try {
        await carregarDados();
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
  }, []);

  const usuariosFiltrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();

    if (!termo) {
      return usuarios;
    }

    return usuarios.filter((usuario) => {
      return (
        (usuario.nome ?? "")
          .toLowerCase()
          .includes(termo) ||
        (usuario.email ?? "")
          .toLowerCase()
          .includes(termo) ||
        usuario.tipo_usuario
          .toLowerCase()
          .includes(termo)
      );
    });
  }, [usuarios, busca]);

  function labelPerfil(tipo: string) {
    return (
      PERFIS.find(
        (perfil) => perfil.value === tipo
      )?.label ?? tipo
    );
  }

  function formatarData(data: string | null) {
    if (!data) {
      return "-";
    }

    return new Date(data).toLocaleString("pt-BR");
  }

  async function criarUsuario(
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

    if (!token) {
      return;
    }

    setSalvando(true);

    try {
      const response = await fetch(
        "/api/admin/usuarios",
        {
          method: "POST",
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
            "Não foi possível criar o usuário."
        );
      }

      setMensagem(
        "Usuário criado com sucesso. Oriente-o a usar 'Esqueci minha senha' para definir a própria senha."
      );

      setForm({
        nome: "",
        email: "",
        telefone: "",
        tipo_usuario: "separacao",
        ativo: true,
        unidade_id: "",
        franqueado_id: "",
      });

      await carregarDados();
      setMostrarFormulario(false);
    } catch (error) {
      setErro(
        error instanceof Error
          ? error.message
          : "Não foi possível criar o usuário."
      );
    } finally {
      setSalvando(false);
    }
  }

  if (carregando) {
    return (
      <main className="min-h-screen bg-white p-6 text-black md:p-10">
        <p>Carregando usuários...</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-white p-6 text-black md:p-10">
      <div className="mx-auto max-w-7xl">
        <div className="mb-8 flex flex-col justify-between gap-4 md:flex-row md:items-center">
          <div>
            <h1 className="text-3xl font-bold">
              Usuários administrativos
            </h1>
            <p className="mt-2 text-sm text-gray-500">
              Gerencie os usuários internos e seus perfis de acesso.
            </p>
          </div>

          <button
            type="button"
            onClick={() =>
              setMostrarFormulario((valor) => !valor)
            }
            className="rounded-lg bg-black px-4 py-2 font-semibold text-white hover:bg-gray-800"
          >
            {mostrarFormulario
              ? "Fechar cadastro"
              : "Novo usuário"}
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

        {mostrarFormulario && (
          <form
            onSubmit={criarUsuario}
            className="mb-8 space-y-6 rounded-xl border border-gray-300 p-6"
          >
            <div>
              <h2 className="text-xl font-bold">
                Novo usuário interno
              </h2>
              <p className="mt-1 text-sm text-gray-500">
                O usuário será criado no Supabase Auth e terá seu perfil vinculado ao O Box Driver.
              </p>
            </div>

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
                  placeholder="Nome do usuário"
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
                  placeholder="usuario@empresa.com"
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
                  placeholder="(11) 99999-9999"
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
                    >
                      {unidade.nome} ({unidade.codigo})
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
                    >
                      {franqueado.nome} ({franqueado.codigo})
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
              <span className="font-medium">
                Usuário ativo
              </span>
            </label>

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={salvando}
                className="rounded-lg bg-black px-5 py-3 font-semibold text-white hover:bg-gray-800 disabled:opacity-50"
              >
                {salvando
                  ? "Criando..."
                  : "Criar usuário"}
              </button>
            </div>
          </form>
        )}

        <div className="mb-6">
          <input
            value={busca}
            onChange={(event) =>
              setBusca(event.target.value)
            }
            placeholder="Buscar por nome, e-mail ou perfil..."
            className="w-full rounded-lg border border-gray-300 px-4 py-3 outline-none focus:border-black"
          />
        </div>

        {usuariosFiltrados.length === 0 ? (
          <div className="rounded-xl border border-gray-300 p-8 text-center">
            Nenhum usuário interno encontrado.
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-gray-300">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1100px] border-collapse">
                <thead className="bg-gray-50">
                  <tr className="text-left text-sm text-gray-600">
                    <th className="px-4 py-3">Nome</th>
                    <th className="px-4 py-3">E-mail</th>
                    <th className="px-4 py-3">Perfil</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Último login</th>
                    <th className="px-4 py-3 text-right">
                      Ações
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {usuariosFiltrados.map((usuario) => (
                    <tr
                      key={usuario.id}
                      className="border-t border-gray-200"
                    >
                      <td className="px-4 py-4 font-semibold">
                        {usuario.nome || "-"}
                      </td>
                      <td className="px-4 py-4 text-sm">
                        {usuario.email || "-"}
                      </td>
                      <td className="px-4 py-4 text-sm">
                        {labelPerfil(
                          usuario.tipo_usuario
                        )}
                      </td>
                      <td className="px-4 py-4">
                        <span
                          className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${
                            usuario.ativo
                              ? "bg-green-100 text-green-800"
                              : "bg-gray-200 text-gray-700"
                          }`}
                        >
                          {usuario.ativo
                            ? "Ativo"
                            : "Inativo"}
                        </span>
                      </td>
                      <td className="px-4 py-4 text-sm">
                        {formatarData(
                          usuario.ultimo_login_em
                        )}
                      </td>
                      <td className="px-4 py-4 text-right">
                        <button
                          type="button"
                          onClick={() =>
                            router.push(
                              `/admin/usuarios/${usuario.id}`
                            )
                          }
                          className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold hover:bg-gray-50"
                        >
                          Editar
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
