"use client";

import { useMemo, useState } from "react";

type DisponibilidadeUnidade = {
  codigo: string;
  nome: string;
  cidade: string | null;
  estado: string | null;
  quantidade: number;
};

type ProdutoCarrinho = {
  id: string;
  nome: string;
  preco: number;
  codigo: string;

  /*
   * Agora estoque representa o estoque
   * total disponível na rede.
   */
  estoque: number;

  disponibilidade: DisponibilidadeUnidade[];
};

type ItemCarrinho = ProdutoCarrinho & {
  quantidade: number;
};

type Props = {
  produto: ProdutoCarrinho;
};

type Distribuicao = {
  unidade: DisponibilidadeUnidade;
  quantidade: number;
};

export default function AdicionarCarrinho({
  produto,
}: Props) {
  const [quantidade, setQuantidade] =
    useState(1);

  const [mensagem, setMensagem] =
    useState("");

  /*
   * Calcula uma sugestão de distribuição.
   *
   * Nesta etapa priorizamos utilizar o menor
   * número possível de unidades.
   *
   * Para isso, usamos primeiro as unidades
   * que possuem maior quantidade disponível.
   *
   * Futuramente poderemos considerar também:
   *
   * - distância do cliente;
   * - preferência do cliente;
   * - horário;
   * - franqueado;
   * - capacidade operacional.
   */
  const distribuicao =
    useMemo<Distribuicao[]>(() => {
      if (
        quantidade <= 0 ||
        quantidade > produto.estoque
      ) {
        return [];
      }

      const unidadesOrdenadas =
        [...produto.disponibilidade]
          .filter(
            (unidade) =>
              Number(unidade.quantidade) > 0
          )
          .sort(
            (a, b) =>
              Number(b.quantidade) -
              Number(a.quantidade)
          );

      let restante = quantidade;

      const resultado: Distribuicao[] =
        [];

      for (const unidade of unidadesOrdenadas) {
        if (restante <= 0) {
          break;
        }

        const quantidadeUsada =
          Math.min(
            restante,
            Number(unidade.quantidade)
          );

        if (quantidadeUsada > 0) {
          resultado.push({
            unidade,
            quantidade: quantidadeUsada,
          });

          restante -= quantidadeUsada;
        }
      }

      if (restante > 0) {
        return [];
      }

      return resultado;
    }, [
      quantidade,
      produto.disponibilidade,
      produto.estoque,
    ]);

  function aumentar() {
    if (
      quantidade <
      produto.estoque
    ) {
      setQuantidade(
        quantidade + 1
      );
    }
  }

  function diminuir() {
    if (quantidade > 1) {
      setQuantidade(
        quantidade - 1
      );
    }
  }

  function alterarQuantidade(
    valor: string
  ) {
    const novaQuantidade =
      Number(valor);

    if (
      !Number.isInteger(
        novaQuantidade
      )
    ) {
      return;
    }

    if (novaQuantidade < 1) {
      setQuantidade(1);
      return;
    }

    if (
      novaQuantidade >
      produto.estoque
    ) {
      setQuantidade(
        produto.estoque
      );

      return;
    }

    setQuantidade(
      novaQuantidade
    );
  }

  function adicionar() {
    setMensagem("");

    const carrinhoSalvo =
      localStorage.getItem(
        "carrinho"
      );

    const carrinho: ItemCarrinho[] =
      carrinhoSalvo
        ? JSON.parse(
            carrinhoSalvo
          )
        : [];

    const itemExistente =
      carrinho.find(
        (item) =>
          item.id === produto.id
      );

    if (itemExistente) {
      const novaQuantidade =
        Number(
          itemExistente.quantidade
        ) + quantidade;

      if (
        novaQuantidade >
        produto.estoque
      ) {
        setMensagem(
          `Quantidade indisponível. A rede possui ${produto.estoque} unidade(s) disponíveis neste momento.`
        );

        return;
      }

      /*
       * Atualizamos também as informações
       * atuais de disponibilidade.
       *
       * Isso serve apenas para UX.
       *
       * O checkout NÃO confiará nesses dados.
       * O servidor recalculará o estoque.
       */
      itemExistente.quantidade =
        novaQuantidade;

      itemExistente.estoque =
        produto.estoque;

      itemExistente.disponibilidade =
        produto.disponibilidade;
    } else {
      if (
        quantidade >
        produto.estoque
      ) {
        setMensagem(
          `Quantidade indisponível. A rede possui ${produto.estoque} unidade(s) disponíveis neste momento.`
        );

        return;
      }

      carrinho.push({
        ...produto,
        quantidade,
      });
    }

    localStorage.setItem(
      "carrinho",
      JSON.stringify(carrinho)
    );

    setMensagem(
      `${quantidade} unidade(s) adicionada(s) ao carrinho.`
    );

    setQuantidade(1);
  }

  if (produto.estoque <= 0) {
    return (
      <div className="mt-6">
        <button
          disabled
          className="w-full rounded-lg bg-gray-400 px-5 py-3 font-semibold text-white"
        >
          Produto sem estoque
        </button>
      </div>
    );
  }

  return (
    <div className="mt-6">
      <p className="mb-2 font-semibold">
        Quantidade desejada
      </p>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={diminuir}
          className="h-11 w-11 rounded-lg border border-gray-300 text-xl font-bold"
        >
          -
        </button>

        <input
          type="number"
          min={1}
          max={produto.estoque}
          value={quantidade}
          onChange={(event) =>
            alterarQuantidade(
              event.target.value
            )
          }
          className="h-11 w-24 rounded-lg border border-gray-300 px-3 text-center font-bold outline-none focus:border-black"
        />

        <button
          type="button"
          onClick={aumentar}
          className="h-11 w-11 rounded-lg border border-gray-300 text-xl font-bold"
        >
          +
        </button>

        <span className="text-sm text-gray-500">
          Disponível na rede:{" "}
          {produto.estoque}
        </span>
      </div>

      {distribuicao.length > 0 && (
        <div className="mb-5 rounded-2xl border border-gray-300 bg-gray-50 p-5">
          <p className="text-sm text-gray-500">
            Disponibilidade para esta quantidade
          </p>

          {distribuicao.length === 1 ? (
            <p className="mt-1 font-bold">
              Retirada possível em uma única unidade
            </p>
          ) : (
            <p className="mt-1 font-bold">
              Para atender esta quantidade serão necessários{" "}
              {distribuicao.length} pontos de retirada
            </p>
          )}

          <div className="mt-4 space-y-3">
            {distribuicao.map(
              ({
                unidade,
                quantidade:
                  quantidadeDistribuida,
              }) => (
                <div
                  key={unidade.codigo}
                  className="flex items-center justify-between gap-5 rounded-xl bg-white p-4"
                >
                  <div>
                    <p className="font-semibold">
                      {unidade.nome}
                    </p>

                    {unidade.cidade && (
                      <p className="mt-1 text-sm text-gray-500">
                        {unidade.cidade}
                        {unidade.estado
                          ? ` - ${unidade.estado}`
                          : ""}
                      </p>
                    )}
                  </div>

                  <div className="text-right">
                    <p className="text-xl font-bold">
                      {
                        quantidadeDistribuida
                      }
                    </p>

                    <p className="text-xs text-gray-500">
                      nesta retirada
                    </p>
                  </div>
                </div>
              )
            )}
          </div>

          {distribuicao.length > 1 && (
            <p className="mt-4 text-sm text-gray-500">
              Esta é uma sugestão inicial. A distribuição
              definitiva será confirmada no checkout de
              acordo com o estoque disponível naquele
              momento.
            </p>
          )}
        </div>
      )}

      <button
        type="button"
        onClick={adicionar}
        className="w-full rounded-lg bg-black px-5 py-3 font-semibold text-white"
      >
        Adicionar ao carrinho
      </button>

      {mensagem && (
        <p className="mt-3 rounded-lg border border-gray-300 p-3">
          {mensagem}
        </p>
      )}
    </div>
  );
}