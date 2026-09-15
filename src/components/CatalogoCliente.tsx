"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import CabecalhoCatalogoCliente from "@/components/CabecalhoCatalogoCliente";
import type { ProdutoComDisponibilidade } from "@/types/catalogo";

type CatalogoClienteProps = {
  produtos: ProdutoComDisponibilidade[];
  erro: string | null;
};

export default function CatalogoCliente({
  produtos,
  erro,
}: CatalogoClienteProps) {
  const [busca, setBusca] = useState("");

  const produtosFiltrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();

    if (!termo) {
      return produtos;
    }

    return produtos.filter((produto) => {
      const textoPesquisa = [
        produto.nome,
        produto.descricao ?? "",
        produto.categoria ?? "",
        produto.codigo,
      ]
        .join(" ")
        .toLowerCase();

      return textoPesquisa.includes(termo);
    });
  }, [busca, produtos]);

  return (
    <main className="min-h-screen bg-white text-black">
      <CabecalhoCatalogoCliente
        valorBusca={busca}
        onBuscaChange={setBusca}
        nomeUsuario={null}
        fotoUrl={null}
      />

      <div className="mx-auto max-w-5xl px-4 py-8 md:px-6">
        <div className="mb-8">
          <h1 className="text-3xl font-bold">
            O Box Driver - Catálogo
          </h1>

          <p className="mt-2 text-gray-500">
            Consulte a disponibilidade em toda a rede.
          </p>
        </div>

        {erro && (
          <div className="mb-6 rounded-lg border border-red-400 bg-red-50 p-4">
            Erro ao carregar produtos: {erro}
          </div>
        )}

        {!erro && produtosFiltrados.length === 0 && (
          <div className="rounded-xl border border-gray-200 bg-gray-50 p-6 text-center text-gray-600">
            Nenhum produto encontrado.
          </div>
        )}

        <div className="grid gap-5 md:grid-cols-2">
          {produtosFiltrados.map((produto) => {
            const estoqueTotal =
              produto.disponibilidades.reduce(
                (total, estoque) =>
                  total +
                  Number(estoque.quantidadeDisponivel),
                0
              );

            const unidadesComEstoque =
              produto.disponibilidades.filter(
                (estoque) =>
                  estoque.quantidadeDisponivel > 0
              );

            return (
              <Link
                key={produto.id}
                href={`/produto/${produto.codigo}`}
                className="block rounded-2xl border border-gray-300 p-6 transition hover:shadow-md"
              >
                <p className="mb-1 text-sm text-gray-500">
                  {produto.categoria}
                </p>

                <h2 className="text-xl font-bold">
                  {produto.nome}
                </h2>

                <p className="mt-2 text-gray-600">
                  {produto.descricao}
                </p>

                <p className="mt-4 text-2xl font-bold">
                  {Number(produto.preco).toLocaleString(
                    "pt-BR",
                    {
                      style: "currency",
                      currency: "BRL",
                    }
                  )}
                </p>

                <div className="mt-5 rounded-xl bg-gray-50 p-4">
                  <p className="text-sm text-gray-500">
                    Disponibilidade na rede
                  </p>

                  <p className="mt-1 text-xl font-bold">
                    {estoqueTotal}{" "}
                    {estoqueTotal === 1
                      ? "unidade disponível"
                      : "unidades disponíveis"}
                  </p>

                  {unidadesComEstoque.length > 0 ? (
                    <div className="mt-3 space-y-2">
                      {unidadesComEstoque.map(
                        (estoque) => {
                          const unidade = estoque.unidade;

                          return (
                            <div
                              key={unidade.id}
                              className="flex items-center justify-between gap-4 text-sm"
                            >
                              <span className="text-gray-600">
                                {unidade.cidade ?? unidade.nome}
                                {unidade.estado
                                  ? ` - ${unidade.estado}`
                                  : ""}
                              </span>

                              <strong>
                                {estoque.quantidadeDisponivel}
                              </strong>
                            </div>
                          );
                        }
                      )}
                    </div>
                  ) : (
                    <p className="mt-3 text-sm font-semibold text-red-600">
                      Produto indisponível no momento
                    </p>
                  )}
                </div>

                <div className="mt-4 text-sm text-gray-500">
                  Código: {produto.codigo}
                </div>

                <p className="mt-4 font-semibold">
                  Ver produto
                </p>
              </Link>
            );
          })}
        </div>
      </div>
    </main>
  );
}
