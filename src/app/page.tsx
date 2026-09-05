import Link from "next/link";
import { supabase } from "@/lib/supabase";

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

type ProdutoCatalogo = {
  id: string;
  nome: string;
  descricao: string | null;
  preco: number;
  categoria: string | null;
  codigo: string;
  ativo: boolean;

  estoque_unidade: EstoqueUnidade[];
};

export default async function Home() {
  const { data: produtos, error } =
    await supabase
      .from("produtos")
      .select(`
        id,
        nome,
        descricao,
        preco,
        categoria,
        codigo,
        ativo,

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
      .eq("ativo", true)
      .order("nome");

  const produtosCatalogo =
    (produtos ?? []) as unknown as ProdutoCatalogo[];

  return (
    <main className="min-h-screen bg-white p-10 text-black">
      <div className="mx-auto max-w-5xl">
        <div className="mb-8">
          <h1 className="text-3xl font-bold">
            O Box Driver - Catálogo
          </h1>

          <p className="mt-2 text-gray-500">
            Consulte a disponibilidade em toda a rede.
          </p>
        </div>

        {error && (
          <div className="mb-6 rounded-lg border border-red-400 bg-red-50 p-4">
            Erro ao carregar produtos: {error.message}
          </div>
        )}

        <div className="grid gap-5 md:grid-cols-2">
          {produtosCatalogo.map((produto) => {
            /*
             * Consideramos somente unidades ativas.
             */
            const estoquesAtivos =
              produto.estoque_unidade.filter(
                (estoque) =>
                  estoque.unidades?.ativo === true
              );

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
             * Mostramos somente unidades que realmente
             * possuem quantidade disponível.
             */
            const unidadesComEstoque =
              estoquesAtivos.filter(
                (estoque) =>
                  Number(estoque.quantidade) > 0
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
                          const unidade =
                            estoque.unidades;

                          if (!unidade) {
                            return null;
                          }

                          return (
                            <div
                              key={unidade.codigo}
                              className="flex items-center justify-between gap-4 text-sm"
                            >
                              <span className="text-gray-600">
                                {unidade.cidade ??
                                  unidade.nome}
                                {unidade.estado
                                  ? ` - ${unidade.estado}`
                                  : ""}
                              </span>

                              <strong>
                                {estoque.quantidade}
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