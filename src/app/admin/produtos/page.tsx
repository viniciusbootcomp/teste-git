"use client";

/* eslint-disable @next/next/no-img-element */

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

type Produto = {
  id: string;
  codigo: string;
  nome: string;
  descricao: string | null;
  categoria: string | null;
  preco: number;
  ativo: boolean;
  imagem_url: string | null;
};

export default function AdminProdutosPage() {
  const router = useRouter();

  const [produtos, setProdutos] = useState<Produto[]>([]);
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
        .from("produtos")
        .select(
          "id, codigo, nome, descricao, categoria, preco, ativo, imagem_url"
        )
        .order("nome", {
          ascending: true,
        });

      if (error) {
        setMensagem(
          `Erro ao carregar produtos: ${error.message}`
        );
        setCarregando(false);
        return;
      }

      setProdutos((data ?? []) as Produto[]);
      setCarregando(false);
    }, 0);

    return () => {
      window.clearTimeout(carregar);
    };
  }, [router]);

  const produtosFiltrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();

    return produtos.filter((produto) => {
      const correspondeBusca =
        !termo ||
        produto.codigo.toLowerCase().includes(termo) ||
        produto.nome.toLowerCase().includes(termo) ||
        (produto.categoria ?? "")
          .toLowerCase()
          .includes(termo);

      const correspondeStatus =
        filtroStatus === "todos" ||
        (filtroStatus === "ativos" && produto.ativo) ||
        (filtroStatus === "inativos" && !produto.ativo);

      return correspondeBusca && correspondeStatus;
    });
  }, [produtos, busca, filtroStatus]);

  function formatarValor(valor: number) {
    return Number(valor).toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL",
    });
  }

  if (carregando) {
    return (
      <main className="min-h-screen bg-white p-6 text-black md:p-10">
        <p>Carregando produtos...</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-white p-6 text-black md:p-10">
      <div className="mx-auto max-w-7xl">
        <div className="mb-8 flex flex-col justify-between gap-4 md:flex-row md:items-center">
          <div>
            <h1 className="text-3xl font-bold">
              Produtos
            </h1>

            <p className="mt-2 text-sm text-gray-500">
              Cadastre, edite e organize os produtos disponíveis no O Box Driver.
            </p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row">
            <button
              onClick={() =>
                router.push("/admin/produtos/importar")
              }
              className="rounded-lg border border-gray-300 px-4 py-2 font-semibold hover:bg-gray-50"
            >
              Importar produtos
            </button>

            <button
              onClick={() =>
                router.push("/admin/produtos/novo")
              }
              className="rounded-lg bg-black px-4 py-2 font-semibold text-white hover:bg-gray-800"
            >
              Novo produto
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
            placeholder="Buscar por código, nome ou categoria..."
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
          {produtosFiltrados.length} produto
          {produtosFiltrados.length === 1 ? "" : "s"} encontrado
          {produtosFiltrados.length === 1 ? "" : "s"}.
        </div>

        {produtosFiltrados.length === 0 ? (
          <div className="rounded-xl border border-gray-300 p-8 text-center">
            <p className="font-semibold">
              Nenhum produto encontrado.
            </p>

            <p className="mt-2 text-sm text-gray-500">
              Ajuste os filtros ou cadastre um novo produto.
            </p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-gray-300">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] border-collapse">
                <thead className="bg-gray-50">
                  <tr className="text-left text-sm text-gray-600">
                    <th className="px-4 py-3 font-semibold">
                      Imagem
                    </th>
                    <th className="px-4 py-3 font-semibold">
                      Código
                    </th>
                    <th className="px-4 py-3 font-semibold">
                      Produto
                    </th>
                    <th className="px-4 py-3 font-semibold">
                      Categoria
                    </th>
                    <th className="px-4 py-3 font-semibold">
                      Preço
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
                  {produtosFiltrados.map((produto) => (
                    <tr
                      key={produto.id}
                      className="border-t border-gray-200"
                    >
                      <td className="px-4 py-4">
                        <div className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-lg border border-gray-200 bg-gray-50">
                          {produto.imagem_url ? (
                            <img
                              src={produto.imagem_url}
                              alt={produto.nome}
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            <span className="px-2 text-center text-[10px] text-gray-400">
                              Sem imagem
                            </span>
                          )}
                        </div>
                      </td>

                      <td className="px-4 py-4 font-mono text-sm font-semibold">
                        {produto.codigo}
                      </td>

                      <td className="px-4 py-4">
                        <div className="font-semibold">
                          {produto.nome}
                        </div>

                        {produto.descricao && (
                          <div className="mt-1 max-w-md truncate text-sm text-gray-500">
                            {produto.descricao}
                          </div>
                        )}
                      </td>

                      <td className="px-4 py-4 text-sm">
                        {produto.categoria || "-"}
                      </td>

                      <td className="px-4 py-4 font-semibold">
                        {formatarValor(produto.preco)}
                      </td>

                      <td className="px-4 py-4">
                        <span
                          className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${
                            produto.ativo
                              ? "bg-green-100 text-green-800"
                              : "bg-gray-200 text-gray-700"
                          }`}
                        >
                          {produto.ativo
                            ? "Ativo"
                            : "Inativo"}
                        </span>
                      </td>

                      <td className="px-4 py-4 text-right">
                        <button
                          onClick={() =>
                            router.push(
                              `/admin/produtos/${produto.id}`
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
