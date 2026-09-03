"use client";

import { useState } from "react";

type ProdutoCarrinho = {
  id: string;
  nome: string;
  preco: number;
  codigo: string;
  estoque: number;
};

type ItemCarrinho = ProdutoCarrinho & {
  quantidade: number;
};

type Props = {
  produto: ProdutoCarrinho;
};

export default function AdicionarCarrinho({ produto }: Props) {
  const [quantidade, setQuantidade] = useState(1);
  const [mensagem, setMensagem] = useState("");

  function aumentar() {
    if (quantidade < produto.estoque) {
      setQuantidade(quantidade + 1);
    }
  }

  function diminuir() {
    if (quantidade > 1) {
      setQuantidade(quantidade - 1);
    }
  }

  function adicionar() {
    setMensagem("");

    const carrinhoSalvo = localStorage.getItem("carrinho");

    const carrinho: ItemCarrinho[] = carrinhoSalvo
      ? JSON.parse(carrinhoSalvo)
      : [];

    const itemExistente = carrinho.find(
      (item) => item.id === produto.id
    );

    if (itemExistente) {
      const novaQuantidade =
        itemExistente.quantidade + quantidade;

      if (novaQuantidade > produto.estoque) {
        setMensagem(
          `Quantidade indisponível. Estoque atual: ${produto.estoque}.`
        );
        return;
      }

      itemExistente.quantidade = novaQuantidade;
    } else {
      if (quantidade > produto.estoque) {
        setMensagem(
          `Quantidade indisponível. Estoque atual: ${produto.estoque}.`
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

  return (
    <div className="mt-6">
      <p className="mb-2 font-semibold">
        Quantidade
      </p>

      <div className="mb-4 flex items-center gap-3">
        <button
          onClick={diminuir}
          className="h-11 w-11 rounded-lg border border-gray-300 text-xl font-bold"
        >
          -
        </button>

        <div className="min-w-14 rounded-lg border border-gray-300 px-4 py-2 text-center font-bold">
          {quantidade}
        </div>

        <button
          onClick={aumentar}
          className="h-11 w-11 rounded-lg border border-gray-300 text-xl font-bold"
        >
          +
        </button>

        <span className="text-sm text-gray-500">
          Disponível: {produto.estoque}
        </span>
      </div>

      <button
        onClick={adicionar}
        disabled={produto.estoque <= 0}
        className="w-full rounded-lg bg-black px-5 py-3 font-semibold text-white disabled:bg-gray-400"
      >
        {produto.estoque > 0
          ? "Adicionar ao carrinho"
          : "Produto sem estoque"}
      </button>

      {mensagem && (
        <p className="mt-3 rounded-lg border border-gray-300 p-3">
          {mensagem}
        </p>
      )}
    </div>
  );
}