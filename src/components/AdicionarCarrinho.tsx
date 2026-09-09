"use client";

import Link from "next/link";
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
   * Estoque representa a disponibilidade
   * REAL atual em toda a rede.
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

  const [
    adicionadoComSucesso,
    setAdicionadoComSucesso,
  ] = useState(false);

  /*
   * =====================================================
   * SUGESTÃO DE DISTRIBUIÇÃO
   * =====================================================
   *
   * Utilizamos primeiro as unidades que possuem
   * maior disponibilidade.
   *
   * Dessa maneira tentamos atender o cliente com
   * o menor número possível de pontos de retirada.
   * =====================================================
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

      /*
       * Segurança:
       *
       * se por alguma inconsistência a soma das
       * unidades não conseguir atender a quantidade,
       * não mostramos distribuição.
       */
      if (restante > 0) {
        return [];
      }

      return resultado;
    }, [
      quantidade,
      produto.disponibilidade,
      produto.estoque,
    ]);

  /*
   * =====================================================
   * CONTROLES DA QUANTIDADE
   * =====================================================
   */

  function aumentar() {
    setMensagem("");
    setAdicionadoComSucesso(false);

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
    setMensagem("");
    setAdicionadoComSucesso(false);

    if (quantidade > 1) {
      setQuantidade(
        quantidade - 1
      );
    }
  }

  function alterarQuantidade(
    valor: string
  ) {
    setMensagem("");
    setAdicionadoComSucesso(false);

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

      setMensagem(
        `A rede possui ${produto.estoque} unidade(s) disponíveis neste momento.`
      );

      return;
    }

    setQuantidade(
      novaQuantidade
    );
  }

  /*
   * =====================================================
   * ADICIONA / ATUALIZA CARRINHO
   * =====================================================
   *
   * IMPORTANTE:
   *
   * "Quantidade desejada" representa a quantidade TOTAL
   * que o cliente deseja comprar.
   *
   * Portanto:
   *
   * carrinho tinha 5
   * cliente escolheu 20
   * → carrinho passa para 20
   *
   * Não fazemos:
   *
   * 5 + 20 = 25
   * =====================================================
   */

  function adicionar() {
    setMensagem("");
    setAdicionadoComSucesso(false);

    if (
      quantidade <= 0
    ) {
      setMensagem(
        "Informe uma quantidade válida."
      );

      return;
    }

    if (
      quantidade >
      produto.estoque
    ) {
      setMensagem(
        `Quantidade indisponível. A rede possui ${produto.estoque} unidade(s) disponíveis neste momento.`
      );

      return;
    }

    let carrinho: ItemCarrinho[] =
      [];

    const carrinhoSalvo =
      localStorage.getItem(
        "carrinho"
      );

    if (carrinhoSalvo) {
      try {
        carrinho =
          JSON.parse(
            carrinhoSalvo
          ) as ItemCarrinho[];
      } catch {
        /*
         * Se o conteúdo estiver corrompido,
         * reconstruímos o carrinho.
         */
        carrinho = [];
      }
    }

    const itemExistente =
      carrinho.find(
        (item) =>
          item.id === produto.id
      );

    if (itemExistente) {
      /*
       * Produto já está no carrinho.
       *
       * Substituímos pela quantidade desejada
       * informada nesta tela.
       */
      itemExistente.quantidade =
        quantidade;

      /*
       * Atualizamos também os dados atuais
       * utilizados pela interface.
       *
       * O checkout NÃO confia nesses dados.
       * O servidor valida novamente estoque,
       * preço e distribuição.
       */
      itemExistente.nome =
        produto.nome;

      itemExistente.preco =
        produto.preco;

      itemExistente.codigo =
        produto.codigo;

      itemExistente.estoque =
        produto.estoque;

      itemExistente.disponibilidade =
        produto.disponibilidade;

      localStorage.setItem(
        "carrinho",
        JSON.stringify(
          carrinho
        )
      );

      setMensagem(
        `Carrinho atualizado para ${quantidade} unidade(s).`
      );

      setAdicionadoComSucesso(
        true
      );

      return;
    }

    /*
     * Produto ainda não existe no carrinho.
     */
    carrinho.push({
      ...produto,
      quantidade,
    });

    localStorage.setItem(
      "carrinho",
      JSON.stringify(
        carrinho
      )
    );

    setMensagem(
      `${quantidade} unidade(s) adicionada(s) ao carrinho.`
    );

    setAdicionadoComSucesso(
      true
    );
  }

  /*
   * =====================================================
   * SEM ESTOQUE
   * =====================================================
   */

  if (produto.estoque <= 0) {
    return (
      <div className="mt-6">
        <button
          disabled
          className="w-full rounded-lg bg-gray-400 px-5 py-3 font-semibold text-white"
        >
          Produto sem estoque
        </button>

        <p className="mt-3 text-sm text-gray-500">
          Não há unidades disponíveis para venda neste
          momento.
        </p>
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
          disabled={
            quantidade <= 1
          }
          className="h-11 w-11 rounded-lg border border-gray-300 text-xl font-bold disabled:cursor-not-allowed disabled:opacity-40"
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
          disabled={
            quantidade >=
            produto.estoque
          }
          className="h-11 w-11 rounded-lg border border-gray-300 text-xl font-bold disabled:cursor-not-allowed disabled:opacity-40"
        >
          +
        </button>

        <span className="text-sm text-gray-500">
          Disponível na rede:{" "}
          {produto.estoque}
        </span>
      </div>

      {/* =================================================
          DISTRIBUIÇÃO SUGERIDA
      ================================================= */}

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
              Para atender esta quantidade serão
              necessários{" "}
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
                  key={
                    unidade.codigo
                  }
                  className="flex items-center justify-between gap-5 rounded-xl bg-white p-4"
                >
                  <div>
                    <p className="font-semibold">
                      {
                        unidade.nome
                      }
                    </p>

                    {unidade.cidade && (
                      <p className="mt-1 text-sm text-gray-500">
                        {
                          unidade.cidade
                        }

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
              Esta é uma sugestão inicial. A
              distribuição definitiva será confirmada
              no checkout de acordo com o estoque
              disponível naquele momento.
            </p>
          )}
        </div>
      )}

      {/* =================================================
          ADICIONAR / ATUALIZAR
      ================================================= */}

      <button
        type="button"
        onClick={adicionar}
        className="w-full rounded-lg bg-black px-5 py-3 font-semibold text-white"
      >
        Adicionar ao carrinho
      </button>

      {mensagem && (
        <div className="mt-3 rounded-xl border border-gray-300 p-4">
          <p className="font-semibold">
            {mensagem}
          </p>

          {adicionadoComSucesso && (
            <div className="mt-4 flex flex-col gap-3 sm:flex-row">
              <Link
                href="/"
                className="flex-1 rounded-lg border border-gray-300 px-4 py-3 text-center font-semibold"
              >
                Continuar comprando
              </Link>

              <Link
                href="/carrinho"
                className="flex-1 rounded-lg bg-black px-4 py-3 text-center font-semibold text-white"
              >
                Ir para o carrinho
              </Link>
            </div>
          )}
        </div>
      )}
    </div>
  );
}