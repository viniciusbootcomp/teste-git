"use client";

import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

type FormState = {
  codigo: string;
  nome: string;
  ativo: boolean;
};

function gerarCodigoCategoria(nome: string) {
  return nome
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toUpperCase();
}

export default function NovaCategoriaPage() {
  const router = useRouter();

  const [form, setForm] = useState<FormState>({
    codigo: "",
    nome: "",
    ativo: true,
  });

  const [codigoEditadoManual, setCodigoEditadoManual] =
    useState(false);

  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  const [mensagem, setMensagem] = useState("");

  const codigoSugerido = useMemo(
    () => gerarCodigoCategoria(form.nome),
    [form.nome]
  );

  function atualizarNome(nome: string) {
    setForm((atual) => ({
      ...atual,
      nome,
      codigo: codigoEditadoManual
        ? atual.codigo
        : gerarCodigoCategoria(nome),
    }));
  }

  function atualizarCodigo(codigo: string) {
    setCodigoEditadoManual(true);

    setForm((atual) => ({
      ...atual,
      codigo: codigo
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-zA-Z0-9_]+/g, "_")
        .replace(/^_+|_+$/g, "")
        .toUpperCase(),
    }));
  }

  async function garantirAdmin() {
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      router.push("/login");
      return null;
    }

    const { data: perfil, error: perfilError } =
      await supabase
        .from("perfil_cliente")
        .select("tipo_usuario")
        .eq("user_id", user.id)
        .maybeSingle();

    if (
      perfilError ||
      !perfil ||
      perfil.tipo_usuario !== "admin"
    ) {
      router.push("/area-cliente");
      return null;
    }

    return user;
  }

  async function salvarCategoria(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    setErro("");
    setMensagem("");

    const nome = form.nome.trim();
    const codigo = form.codigo.trim().toUpperCase();

    if (!nome) {
      setErro("Informe o nome da categoria.");
      return;
    }

    if (!codigo) {
      setErro("Informe o código da categoria.");
      return;
    }

    const user = await garantirAdmin();

    if (!user) {
      return;
    }

    setSalvando(true);

    try {
      const { data: categoriaPorCodigo, error: codigoError } =
        await supabase
          .from("categorias_produto")
          .select("id, codigo, nome")
          .ilike("codigo", codigo)
          .maybeSingle();

      if (codigoError) {
        throw new Error(
          `Erro ao validar código: ${codigoError.message}`
        );
      }

      if (categoriaPorCodigo) {
        throw new Error(
          `Já existe uma categoria com o código ${codigo}.`
        );
      }

      const { data: categoriaPorNome, error: nomeError } =
        await supabase
          .from("categorias_produto")
          .select("id, codigo, nome")
          .ilike("nome", nome)
          .maybeSingle();

      if (nomeError) {
        throw new Error(
          `Erro ao validar nome: ${nomeError.message}`
        );
      }

      if (categoriaPorNome) {
        throw new Error(
          `Já existe uma categoria chamada "${categoriaPorNome.nome}".`
        );
      }

      const { error: insertError } = await supabase
        .from("categorias_produto")
        .insert({
          codigo,
          nome,
          ativo: form.ativo,
        });

      if (insertError) {
        if (
          insertError.code === "23505" ||
          insertError.message
            .toLowerCase()
            .includes("duplicate")
        ) {
          throw new Error(
            "Já existe uma categoria com esse código ou nome."
          );
        }

        throw new Error(
          `Erro ao cadastrar categoria: ${insertError.message}`
        );
      }

      setMensagem("Categoria cadastrada com sucesso.");

      window.setTimeout(() => {
        router.push("/admin/categorias");
      }, 700);
    } catch (error) {
      setErro(
        error instanceof Error
          ? error.message
          : "Não foi possível cadastrar a categoria."
      );
    } finally {
      setSalvando(false);
    }
  }

  return (
    <main className="min-h-screen bg-white p-6 text-black md:p-10">
      <div className="mx-auto max-w-3xl">
        <div className="mb-8 flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <h1 className="text-3xl font-bold">
              Nova categoria
            </h1>

            <p className="mt-2 text-sm text-gray-500">
              Cadastre uma nova categoria para organizar os produtos.
            </p>
          </div>

          <button
            type="button"
            onClick={() =>
              router.push("/admin/categorias")
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
          onSubmit={salvarCategoria}
          className="space-y-6 rounded-xl border border-gray-300 p-6"
        >
          <div>
            <label className="mb-2 block text-sm font-semibold">
              Nome da categoria *
            </label>

            <input
              value={form.nome}
              onChange={(event) =>
                atualizarNome(event.target.value)
              }
              placeholder="Ex.: Acessórios"
              className="w-full rounded-lg border border-gray-300 px-4 py-3 outline-none focus:border-black"
              maxLength={120}
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-semibold">
              Código *
            </label>

            <input
              value={form.codigo}
              onChange={(event) =>
                atualizarCodigo(event.target.value)
              }
              placeholder="Ex.: ACESSORIOS"
              className="w-full rounded-lg border border-gray-300 px-4 py-3 font-mono outline-none focus:border-black"
              maxLength={80}
            />

            <p className="mt-2 text-xs text-gray-500">
              O sistema sugere o código automaticamente a partir do nome.
              Sugestão atual:{" "}
              <strong>{codigoSugerido || "-"}</strong>
            </p>
          </div>

          <div>
            <label className="mb-2 block text-sm font-semibold">
              Status
            </label>

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
                Categoria ativa
              </span>
            </label>
          </div>

          <div className="flex flex-col-reverse gap-3 border-t border-gray-200 pt-6 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={() =>
                router.push("/admin/categorias")
              }
              disabled={salvando}
              className="rounded-lg border border-gray-300 px-5 py-3 font-semibold hover:bg-gray-50 disabled:opacity-50"
            >
              Cancelar
            </button>

            <button
              type="submit"
              disabled={salvando}
              className="rounded-lg bg-black px-5 py-3 font-semibold text-white hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {salvando
                ? "Salvando..."
                : "Salvar categoria"}
            </button>
          </div>
        </form>
      </div>
    </main>
  );
}
