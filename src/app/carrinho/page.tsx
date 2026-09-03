"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type ItemCarrinho = {
  id: string;
  nome: string;
  preco: number;
  codigo: string;
  quantidade: number;
  estoque: number;
};

export default function CarrinhoPage() {
  const [itens, setItens] = useState<ItemCarrinho[]>([]);

  useEffect(() => {
    const carregarCarrinho = window.setTimeout(() => {
      const carrinhoSalvo = localStorage.getItem("carrinho");

      if (carrinhoSalvo) {
        try {
          const carrinho = JSON.parse(
            carrinhoSalvo
          ) as ItemCarrinho[];

          setItens(carrinho);
        } catch {
          localStorage.removeItem("carrinho");
        }
      }
    }, 0);

    return () => {
      window.clearTimeout(carregarCarrinho);
    };
  }, []);

  function salvarCarrinho(novosItens: ItemCarrinho[]) {
    setItens(novosItens);

    localStorage.setItem(
      "carrinho",
      JSON.stringify(novosItens)
    );
  }

  function aumentarQuantidade(id: string) {
    const item = itens.find(
      (produto) => produto.id === id
    );

    if (!item) {
      return;
    }

    if (item.quantidade >= item.estoque) {
      return;
    }

    const novosItens = itens.map((produto) =>
      produto.id === id
        ? {
            ...produto,
            quantidade: produto.quantidade + 1,
          }
        : produto
    );

    salvarCarrinho(novosItens);
  }

  function diminuirQuantidade(id: string) {
    const novosItens = itens
      .map((item) =>
        item.id === id
          ? {
              ...item,
              quantidade: item.quantidade - 1,
            }
          : item
      )
      .filter((item) => item.quantidade > 0);

    salvarCarrinho(novosItens);
  }

  function removerItem(id: string) {
    const novosItens = itens.filter(
      (item) => item.id !== id
    );

    salvarCarrinho(novosItens);
  }

  function limparCarrinho() {
    salvarCarrinho([]);
  }

  const total = useMemo(() => {
    return itens.reduce(
      (soma, item) =>
        soma + item.preco * item.quantidade,
      0
    );
  }, [itens]);

  return (
    <main className="min-h-screen bg-white p-10 text-black">
      <div className="mx-auto max-w-4xl">
        <h1 className="mb-8 text-3xl font-bold">
          Carrinho
        </h1>

        {itens.length === 0 ? (
          <div className="rounded-xl border border-gray-300 p-6">
            <p className="mb-4">
              Seu carrinho está vazio.
            </p>

            <Link
              href="/"
              className="inline-block rounded-lg bg-black px-5 py-3 font-semibold text-white"
            >
              Voltar ao catálogo
            </Link>
          </div>
        ) : (
          <>
            <div className="space-y-4">
              {itens.map((item) => {
                const subtotal =
                  item.preco * item.quantidade;

                const estoqueMaximo =
                  item.quantidade >= item.estoque;

                return (
                  <div
                    key={item.id}
                    className="rounded-xl border border-gray-300 p-5"
                  >
                    <div className="flex flex-col justify-between gap-4 md:flex-row">
                      <div>
                        <h2 className="text-xl font-bold">
                          {item.nome}
                        </h2>

                        <p className="text-sm text-gray-500">
                          Código: {item.codigo}
                        </p>

                        <p className="mt-1 text-sm text-gray-500">
                          Estoque disponível:{" "}
                          {item.estoque}
                        </p>

                        <p className="mt-2 font-semibold">
                          R${" "}
                          {item.preco
                            .toFixed(2)
                            .replace(".", ",")}
                        </p>
                      </div>

                      <div>
                        <div className="flex items-center gap-3">
                          <button
                            onClick={() =>
                              diminuirQuantidade(
                                item.id
                              )
                            }
                            className="h-10 w-10 rounded-lg border border-gray-300 text-xl font-bold"
                          >
                            -
                          </button>

                          <span className="min-w-8 text-center font-bold">
                            {item.quantidade}
                          </span>

                          <button
                            onClick={() =>
                              aumentarQuantidade(
                                item.id
                              )
                            }
                            className="h-10 w-10 rounded-lg border border-gray-300 text-xl font-bold"
                          >
                            +
                          </button>
                        </div>

                        {estoqueMaximo && (
                          <div className="mt-3 max-w-xs rounded-lg border border-orange-300 bg-orange-50 p-3 text-sm">
                            Limite de estoque atingido.
                            Disponível:{" "}
                            <strong>
                              {item.estoque}
                            </strong>{" "}
                            unidades.
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="mt-4 flex items-center justify-between border-t border-gray-200 pt-4">
                      <p className="font-bold">
                        Subtotal: R${" "}
                        {subtotal
                          .toFixed(2)
                          .replace(".", ",")}
                      </p>

                      <button
                        onClick={() =>
                          removerItem(item.id)
                        }
                        className="text-sm font-semibold underline"
                      >
                        Remover
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="mt-8 rounded-xl border border-gray-300 p-6">
              <p className="text-sm text-gray-500">
                Total do pedido
              </p>

              <p className="mt-1 text-3xl font-bold">
                R${" "}
                {total
                  .toFixed(2)
                  .replace(".", ",")}
              </p>

              <Link
                href="/checkout"
                className="mt-6 block w-full rounded-lg bg-black p-3 text-center font-semibold text-white"
              >
                Continuar compra
              </Link>

              <button
                onClick={limparCarrinho}
                className="mt-3 w-full rounded-lg border border-gray-300 p-3 font-semibold"
              >
                Limpar carrinho
              </button>

              <Link
                href="/"
                className="mt-3 block text-center text-sm font-semibold underline"
              >
                Continuar comprando
              </Link>
            </div>
          </>
        )}
      </div>
    </main>
  );
}