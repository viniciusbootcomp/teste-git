import Link from "next/link";
import { notFound } from "next/navigation";

import { supabase } from "@/lib/supabase";
import AdicionarCarrinho from "@/components/AdicionarCarrinho";

type Props = {
  params: Promise<{
    codigo: string;
  }>;
};

type EstoqueUnidade = {
  quantidade: number;

  unidades: {
    codigo: string;
    nome: string;
    cidade: string | null;
    estado: string | null;
    ativo: boolean;
  } | null;
};

type ProdutoDetalhe = {
  id: string;
  nome: string;
  descricao: string | null;
  preco: number;
  categoria: string | null;
  codigo: string;
  ativo: boolean;
  imagem_url: string | null;

  estoque_unidade: EstoqueUnidade[];
};

export default async function ProdutoPage({
  params,
}: Props) {
  const { codigo } = await params;

  const { data, error } = await supabase
    .from("produtos")
    .select(`
      id,
      nome,
      descricao,
      preco,
      categoria,
      codigo,
      ativo,
      imagem_url,

      estoque_unidade (
        quantidade,

        unidades (
          codigo,
          nome,
          cidade,
          estado,
          ativo
        )
      )
    `)
    .eq("codigo", codigo)
    .eq("ativo", true)
    .maybeSingle();

  if (error) {
    return (
      <main className="min-h-screen bg-white p-10 text-black">
        <div className="mx-auto max-w-3xl">
          <p className="rounded-lg border border-red-400 bg-red-50 p-4">
            Erro ao carregar produto: {error.message}
          </p>
        </div>
      </main>
    );
  }

  if (!data) {
    notFound();
  }

  const produto =
    data as unknown as ProdutoDetalhe;

  /*
   * Consideramos somente unidades ativas.
   */
  const estoquesAtivos =
    produto.estoque_unidade
      .filter(
        (estoque) =>
          estoque.unidades?.ativo === true
      )
      .sort((a, b) => {
        const nomeA =
          a.unidades?.cidade ??
          a.unidades?.nome ??
          "";

        const nomeB =
          b.unidades?.cidade ??
          b.unidades?.nome ??
          "";

        return nomeA.localeCompare(
          nomeB,
          "pt-BR"
        );
      });

  /*
   * Estoque total disponível na rede.
   */
  const estoqueTotal =
    estoquesAtivos.reduce(
      (total, estoque) =>
        total +
        Number(estoque.quantidade),
      0
    );

  /*
   * Estrutura que enviaremos para o componente
   * de quantidade/carrinho.
   */
  const disponibilidade =
    estoquesAtivos
      .filter(
        (estoque) =>
          estoque.unidades !== null
      )
      .map((estoque) => ({
        codigo:
          estoque.unidades!.codigo,

        nome:
          estoque.unidades!.nome,

        cidade:
          estoque.unidades!.cidade,

        estado:
          estoque.unidades!.estado,

        quantidade:
          Number(estoque.quantidade),
      }));

  return (
    <main className="min-h-screen bg-white p-10 text-black">
      <div className="mx-auto max-w-3xl">
        <p className="mb-2 text-sm text-gray-500">
          {produto.categoria}
        </p>

        <h1 className="text-4xl font-bold">
          {produto.nome}
        </h1>

        <p className="mt-6 text-lg text-gray-600">
          {produto.descricao}
        </p>

        <p className="mt-8 text-3xl font-bold">
          {Number(
            produto.preco
          ).toLocaleString("pt-BR", {
            style: "currency",
            currency: "BRL",
          })}
        </p>

        <div className="mt-6 rounded-xl border border-gray-300 p-5">
          <p className="text-sm text-gray-500">
            Código
          </p>

          <p className="mt-1 font-semibold">
            {produto.codigo}
          </p>
        </div>

        <div className="mt-5 rounded-2xl border border-gray-300 p-6">
          <p className="text-sm text-gray-500">
            Disponibilidade na rede
          </p>

          <p className="mt-1 text-2xl font-bold">
            {estoqueTotal}{" "}
            {estoqueTotal === 1
              ? "unidade disponível"
              : "unidades disponíveis"}
          </p>

          <div className="mt-5 space-y-3">
            {estoquesAtivos.map(
              (estoque) => {
                const unidade =
                  estoque.unidades;

                if (!unidade) {
                  return null;
                }

                return (
                  <div
                    key={unidade.codigo}
                    className="flex items-center justify-between gap-5 rounded-xl bg-gray-50 p-4"
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
                        {estoque.quantidade}
                      </p>

                      <p className="text-xs text-gray-500">
                        disponíveis
                      </p>
                    </div>
                  </div>
                );
              }
            )}
          </div>

          {estoqueTotal <= 0 && (
            <p className="mt-4 font-semibold text-red-600">
              Produto indisponível em toda a rede.
            </p>
          )}
        </div>

        <AdicionarCarrinho
          produto={{
            id: produto.id,
            nome: produto.nome,
            preco: Number(produto.preco),
            codigo: produto.codigo,

            /*
             * A propriedade estoque continua existindo
             * temporariamente no carrinho, mas agora
             * representa o TOTAL DA REDE.
             */
            estoque: estoqueTotal,

            disponibilidade,
          }}
        />

        <Link
          href="/"
          className="mt-6 inline-block rounded-lg border border-gray-300 px-5 py-3 font-semibold"
        >
          Voltar ao catálogo
        </Link>
      </div>
    </main>
  );
}