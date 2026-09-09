"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

type Categoria = {
  id: string;
  codigo: string;
  nome: string;
  ativo: boolean;
  created_at: string;
};

export default function AdminCategoriasPage() {
  const router = useRouter();

  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [mensagem, setMensagem] = useState("");
  const [busca, setBusca] = useState("");
  const [filtroStatus, setFiltroStatus] = useState<
    "todos" | "ativos" | "inativos"
  >("todos");

  useEffect(() => {
    const carregar = window.setTimeout(async () => {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        router.push("/login");
        return;
      }

      const { data: perfil, error: perfilError } = await supabase
        .from("perfil_cliente")
        .select("tipo_usuario")
        .eq("user_id", user.id)
        .maybeSingle();

      if (perfilError) {
        setMensagem(
          `Erro ao verificar acesso: ${perfilError.message}`
        );
        setCarregando(false);
        return;
      }

      if (!perfil || perfil.tipo_usuario !== "admin") {
        router.push("/area-cliente");
        return;
      }

      const { data, error } = await supabase
        .from("categorias_produto")
        .select("id, codigo, nome, ativo, created_at")
        .order("nome", {
          ascending: true,
        });

      if (error) {
        setMensagem(
          `Erro ao carregar categorias: ${error.message}`
        );
        setCarregando(false);
        return;
      }

      setCategorias((data ?? []) as Categoria[]);
      setCarregando(false);
    }, 0);

    return () => {
      window.clearTimeout(carregar);
    };
  }, [router]);

  const categoriasFiltradas = useMemo(() => {
    const termo = busca.trim().toLowerCase();

    return categorias.filter((categoria) => {
      const correspondeBusca =
        !termo ||
        categoria.codigo.toLowerCase().includes(termo) ||
        categoria.nome.toLowerCase().includes(termo);

      const correspondeStatus =
        filtroStatus === "todos" ||
        (filtroStatus === "ativos" && categoria.ativo) ||
        (filtroStatus === "inativos" && !categoria.ativo);

      return correspondeBusca && correspondeStatus;
    });
  }, [categorias, busca, filtroStatus]);

  if (carregando) {
    return (
      <main className="min-h-screen bg-white p-6 text-black md:p-10">
        <p>Carregando categorias...</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-white p-6 text-black md:p-10">
      <div className="mx-auto max-w-6xl">
        <div className="mb-8 flex flex-col justify-between gap-4 md:flex-row md:items-center">
          <div>
            <h1 className="text-3xl font-bold">
              Categorias de produtos
            </h1>

            <p className="mt-2 text-sm text-gray-500">
              Organize as categorias usadas no cadastro e na importação de produtos.
            </p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row">
            <button
              type="button"
              onClick={() =>
                router.push("/admin/produtos")
              }
              className="rounded-lg border border-gray-300 px-4 py-2 font-semibold hover:bg-gray-50"
            >
              Voltar para produtos
            </button>

            <button
              type="button"
              onClick={() =>
                router.push("/admin/categorias/novo")
              }
              className="rounded-lg bg-black px-4 py-2 font-semibold text-white hover:bg-gray-800"
            >
              Nova categoria
            </button>
          </div>
        </div>

        {mensagem && (
          <div className="mb-6 rounded-lg border border-red-400 p-4">
            {mensagem}
          </div>
        )}

        <div className="mb-6 grid gap-3 md:grid-cols-[1fr_220px]">
          <input
            value={busca}
            onChange={(event) =>
              setBusca(event.target.value)
            }
            placeholder="Buscar por código ou nome..."
            className="rounded-lg border border-gray-300 px-4 py-3 outline-none focus:border-black"
          />

          <select
            value={filtroStatus}
            onChange={(event) =>
              setFiltroStatus(
                event.target.value as
                  | "todos"
                  | "ativos"
                  | "inativos"
              )
            }
            className="rounded-lg border border-gray-300 px-4 py-3 outline-none focus:border-black"
          >
            <option value="todos">
              Todos
            </option>
            <option value="ativos">
              Ativos
            </option>
            <option value="inativos">
              Inativos
            </option>
          </select>
        </div>

        <div className="mb-4 text-sm text-gray-500">
          {categoriasFiltradas.length} categoria
          {categoriasFiltradas.length === 1 ? "" : "s"} encontrada
          {categoriasFiltradas.length === 1 ? "" : "s"}.
        </div>

        {categoriasFiltradas.length === 0 ? (
          <div className="rounded-xl border border-gray-300 p-8 text-center">
            <p className="font-semibold">
              Nenhuma categoria encontrada.
            </p>

            <p className="mt-2 text-sm text-gray-500">
              Ajuste os filtros ou cadastre uma nova categoria.
            </p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-gray-300">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[700px] border-collapse">
                <thead className="bg-gray-50">
                  <tr className="text-left text-sm text-gray-600">
                    <th className="px-4 py-3 font-semibold">
                      Código
                    </th>
                    <th className="px-4 py-3 font-semibold">
                      Categoria
                    </th>
                    <th className="px-4 py-3 font-semibold">
                      Status
                    </th>
                    <th className="px-4 py-3 text-right font-semibold">
                      Ações
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {categoriasFiltradas.map((categoria) => (
                    <tr
                      key={categoria.id}
                      className="border-t border-gray-200"
                    >
                      <td className="px-4 py-4 font-mono text-sm font-semibold">
                        {categoria.codigo}
                      </td>

                      <td className="px-4 py-4 font-semibold">
                        {categoria.nome}
                      </td>

                      <td className="px-4 py-4">
                        <span
                          className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${
                            categoria.ativo
                              ? "bg-green-100 text-green-800"
                              : "bg-gray-200 text-gray-700"
                          }`}
                        >
                          {categoria.ativo
                            ? "Ativa"
                            : "Inativa"}
                        </span>
                      </td>

                      <td className="px-4 py-4 text-right">
                        <button
                          type="button"
                          onClick={() =>
                            router.push(
                              `/admin/categorias/${categoria.id}`
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
