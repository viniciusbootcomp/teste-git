"use client";

import {
  FormEvent,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

type UsuarioInterno = {
  id: string;
  user_id: string | null;
  nome: string | null;
  email: string | null;
  tipo_usuario: string;
  ativo: boolean;
};

type Unidade = {
  id: string;
  nome: string;
  codigo: string;
};

type DestinoTipo = "usuario" | "perfil" | "unidade";

type FormState = {
  titulo: string;
  mensagem: string;
  destino_tipo: DestinoTipo;
  user_id: string;
  perfil_destino: string;
  unidade_id: string;
  link: string;
};

const PERFIS = [
  { value: "cliente", label: "Cliente" },
  { value: "admin", label: "Administrador geral" },
  { value: "admin_rede", label: "Administrador da rede" },
  { value: "franqueado", label: "Franqueado" },
  { value: "gestor_unidade", label: "Gestor de unidade" },
  { value: "separacao", label: "Separação" },
  { value: "retirada", label: "Retirada" },
];

export default function AdminNotificacoesPage() {
  const router = useRouter();

  const [usuarios, setUsuarios] = useState<UsuarioInterno[]>([]);
  const [unidades, setUnidades] = useState<Unidade[]>([]);

  const [form, setForm] = useState<FormState>({
    titulo: "",
    mensagem: "",
    destino_tipo: "usuario",
    user_id: "",
    perfil_destino: "",
    unidade_id: "",
    link: "",
  });

  const [carregando, setCarregando] = useState(true);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState("");
  const [mensagemSucesso, setMensagemSucesso] = useState("");

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
        const token = await obterAccessToken();

        if (!token) {
          return;
        }

        const response = await fetch("/api/admin/usuarios", {
          headers: {
            Authorization: `Bearer ${token}`,
          },
          cache: "no-store",
        });

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
              "Não foi possível carregar usuários e unidades."
          );
        }

        setUsuarios(
          ((json.usuarios ?? []) as UsuarioInterno[]).filter(
            (usuario) =>
              usuario.ativo && Boolean(usuario.user_id)
          )
        );

        setUnidades((json.unidades ?? []) as Unidade[]);
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

  const destinoDescricao = useMemo(() => {
    if (form.destino_tipo === "usuario") {
      const usuario = usuarios.find(
        (item) => item.user_id === form.user_id
      );

      if (!usuario) {
        return "Selecione um usuário.";
      }

      return `${usuario.nome ?? "Usuário"}${
        usuario.email ? ` — ${usuario.email}` : ""
      }`;
    }

    if (form.destino_tipo === "perfil") {
      const perfil = PERFIS.find(
        (item) => item.value === form.perfil_destino
      );

      return perfil
        ? `Todos os usuários ativos do perfil ${perfil.label}.`
        : "Selecione um perfil.";
    }

    const unidade = unidades.find(
      (item) => item.id === form.unidade_id
    );

    return unidade
      ? `Usuários vinculados à unidade ${unidade.nome}.`
      : "Selecione uma unidade.";
  }, [form, usuarios, unidades]);

  function alterarDestino(tipo: DestinoTipo) {
    setErro("");
    setMensagemSucesso("");

    setForm((atual) => ({
      ...atual,
      destino_tipo: tipo,
      user_id: "",
      perfil_destino: "",
      unidade_id: "",
    }));
  }

  async function enviarNotificacao(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    setErro("");
    setMensagemSucesso("");

    const titulo = form.titulo.trim();
    const mensagem = form.mensagem.trim();
    const link = form.link.trim();

    if (!titulo) {
      setErro("Informe o título da notificação.");
      return;
    }

    if (!mensagem) {
      setErro("Informe a mensagem da notificação.");
      return;
    }

    if (
      form.destino_tipo === "usuario" &&
      !form.user_id
    ) {
      setErro("Selecione o usuário de destino.");
      return;
    }

    if (
      form.destino_tipo === "perfil" &&
      !form.perfil_destino
    ) {
      setErro("Selecione o perfil de destino.");
      return;
    }

    if (
      form.destino_tipo === "unidade" &&
      !form.unidade_id
    ) {
      setErro("Selecione a unidade de destino.");
      return;
    }

    const confirmado = window.confirm(
      `Enviar esta notificação?\n\nDestino: ${destinoDescricao}`
    );

    if (!confirmado) {
      return;
    }

    const token = await obterAccessToken();

    if (!token) {
      return;
    }

    setEnviando(true);

    try {
      const payload = {
        titulo,
        mensagem,
        tipo: "administrativa",
        user_id:
          form.destino_tipo === "usuario"
            ? form.user_id
            : null,
        perfil_destino:
          form.destino_tipo === "perfil"
            ? form.perfil_destino
            : null,
        unidade_id:
          form.destino_tipo === "unidade"
            ? form.unidade_id
            : null,
        link: link || null,
      };

      const response = await fetch(
        "/api/notificacoes",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(payload),
        }
      );

      const json = await response.json();

      if (!response.ok) {
        throw new Error(
          json.erro ??
            "Não foi possível enviar a notificação."
        );
      }

      setMensagemSucesso(
        "Notificação enviada com sucesso."
      );

      setForm((atual) => ({
        ...atual,
        titulo: "",
        mensagem: "",
        link: "",
      }));
    } catch (error) {
      setErro(
        error instanceof Error
          ? error.message
          : "Não foi possível enviar a notificação."
      );
    } finally {
      setEnviando(false);
    }
  }

  if (carregando) {
    return (
      <main className="min-h-screen bg-white p-6 text-black md:p-10">
        <p>Carregando notificações...</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-white p-6 text-black md:p-10">
      <div className="mx-auto max-w-4xl">
        <div className="mb-8 flex flex-col justify-between gap-4 md:flex-row md:items-center">
          <div>
            <h1 className="text-3xl font-bold">
              Enviar notificação
            </h1>

            <p className="mt-2 text-sm text-gray-500">
              Envie avisos internos para um usuário, perfil ou unidade.
            </p>
          </div>

          <button
            type="button"
            onClick={() => router.back()}
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

        {mensagemSucesso && (
          <div className="mb-6 rounded-lg border border-green-400 bg-green-50 p-4 text-green-700">
            {mensagemSucesso}
          </div>
        )}

        <form
          onSubmit={enviarNotificacao}
          className="space-y-6 rounded-xl border border-gray-300 p-6"
        >
          <div>
            <label className="mb-2 block text-sm font-semibold">
              Título *
            </label>

            <input
              value={form.titulo}
              onChange={(event) =>
                setForm((atual) => ({
                  ...atual,
                  titulo: event.target.value,
                }))
              }
              maxLength={120}
              placeholder="Ex.: Aviso operacional"
              className="w-full rounded-lg border border-gray-300 px-4 py-3 outline-none focus:border-black"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-semibold">
              Mensagem *
            </label>

            <textarea
              value={form.mensagem}
              onChange={(event) =>
                setForm((atual) => ({
                  ...atual,
                  mensagem: event.target.value,
                }))
              }
              rows={5}
              maxLength={1000}
              placeholder="Digite a mensagem que será exibida na central de notificações."
              className="w-full resize-y rounded-lg border border-gray-300 px-4 py-3 outline-none focus:border-black"
            />

            <div className="mt-1 text-right text-xs text-gray-400">
              {form.mensagem.length}/1000
            </div>
          </div>

          <div>
            <label className="mb-3 block text-sm font-semibold">
              Destino *
            </label>

            <div className="grid gap-3 md:grid-cols-3">
              <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-gray-300 px-4 py-3">
                <input
                  type="radio"
                  name="destino"
                  checked={form.destino_tipo === "usuario"}
                  onChange={() =>
                    alterarDestino("usuario")
                  }
                />
                <span className="font-medium">
                  Usuário
                </span>
              </label>

              <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-gray-300 px-4 py-3">
                <input
                  type="radio"
                  name="destino"
                  checked={form.destino_tipo === "perfil"}
                  onChange={() =>
                    alterarDestino("perfil")
                  }
                />
                <span className="font-medium">
                  Perfil
                </span>
              </label>

              <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-gray-300 px-4 py-3">
                <input
                  type="radio"
                  name="destino"
                  checked={form.destino_tipo === "unidade"}
                  onChange={() =>
                    alterarDestino("unidade")
                  }
                />
                <span className="font-medium">
                  Unidade
                </span>
              </label>
            </div>
          </div>

          {form.destino_tipo === "usuario" && (
            <div>
              <label className="mb-2 block text-sm font-semibold">
                Usuário de destino *
              </label>

              <select
                value={form.user_id}
                onChange={(event) =>
                  setForm((atual) => ({
                    ...atual,
                    user_id: event.target.value,
                  }))
                }
                className="w-full rounded-lg border border-gray-300 px-4 py-3 outline-none focus:border-black"
              >
                <option value="">
                  Selecione...
                </option>

                {usuarios.map((usuario) => (
                  <option
                    key={usuario.id}
                    value={usuario.user_id ?? ""}
                  >
                    {usuario.nome ?? "Sem nome"}
                    {usuario.email
                      ? ` — ${usuario.email}`
                      : ""}
                  </option>
                ))}
              </select>
            </div>
          )}

          {form.destino_tipo === "perfil" && (
            <div>
              <label className="mb-2 block text-sm font-semibold">
                Perfil de destino *
              </label>

              <select
                value={form.perfil_destino}
                onChange={(event) =>
                  setForm((atual) => ({
                    ...atual,
                    perfil_destino:
                      event.target.value,
                  }))
                }
                className="w-full rounded-lg border border-gray-300 px-4 py-3 outline-none focus:border-black"
              >
                <option value="">
                  Selecione...
                </option>

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
          )}

          {form.destino_tipo === "unidade" && (
            <div>
              <label className="mb-2 block text-sm font-semibold">
                Unidade de destino *
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
                  Selecione...
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
          )}

          <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800">
            <strong>Destino atual:</strong>{" "}
            {destinoDescricao}
          </div>

          <div>
            <label className="mb-2 block text-sm font-semibold">
              Link interno
            </label>

            <input
              value={form.link}
              onChange={(event) =>
                setForm((atual) => ({
                  ...atual,
                  link: event.target.value,
                }))
              }
              placeholder="Ex.: /admin/retiradas"
              className="w-full rounded-lg border border-gray-300 px-4 py-3 outline-none focus:border-black"
            />

            <p className="mt-2 text-xs text-gray-500">
              Opcional. Se informado, o usuário será levado para esta tela ao clicar na notificação.
            </p>
          </div>

          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={() => router.back()}
              disabled={enviando}
              className="rounded-lg border border-gray-300 px-5 py-3 font-semibold hover:bg-gray-50 disabled:opacity-50"
            >
              Cancelar
            </button>

            <button
              type="submit"
              disabled={enviando}
              className="rounded-lg bg-black px-5 py-3 font-semibold text-white hover:bg-gray-800 disabled:opacity-50"
            >
              {enviando
                ? "Enviando..."
                : "Enviar notificação"}
            </button>
          </div>
        </form>
      </div>
    </main>
  );
}
