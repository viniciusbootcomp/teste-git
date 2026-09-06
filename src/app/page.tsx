import Link from "next/link";
import { supabase } from "@/lib/supabase";

type Unidade = {
  id: string;
  codigo: string;
  nome: string;
  cidade: string | null;
  estado: string | null;
  ativo: boolean;
};

type EstoqueUnidade = {
  quantidade: number;

  unidades: Unidade | null;
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

type EstoqueDisponivel = {
  unidade: Unidade;
  quantidadeFisica: number;
  quantidadeDisponivel: number;
};

type ProdutoComDisponibilidade = ProdutoCatalogo & {
  disponibilidades: EstoqueDisponivel[];
};

export default async function Home() {
  /*
   * =====================================================
   * 1. CARREGA PRODUTOS E ESTOQUE FÍSICO
   * =====================================================
   *
   * estoque_unidade.quantidade continua representando
   * estoque FÍSICO.
   *
   * Não usamos mais esse valor diretamente como
   * disponibilidade para venda.
   * =====================================================
   */

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
            id,
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

  /*
   * =====================================================
   * 2. CALCULA DISPONIBILIDADE REAL
   * =====================================================
   *
   * Para cada produto/unidade ativa:
   *
   * estoque disponível =
   * estoque físico
   * -
   * reservas ativas e não vencidas
   *
   * A regra fica no PostgreSQL.
   *
   * O frontend não tenta recalcular reservas.
   * =====================================================
   */

  const produtosComDisponibilidade =
    await Promise.all(
      produtosCatalogo.map(
        async (
          produto
        ): Promise<ProdutoComDisponibilidade> => {
          const estoquesAtivos =
            produto.estoque_unidade.filter(
              (estoque) =>
                estoque.unidades?.ativo === true
            );

          const disponibilidades =
            await Promise.all(
              estoquesAtivos.map(
                async (
                  estoque
                ): Promise<EstoqueDisponivel | null> => {
                  const unidade =
                    estoque.unidades;

                  if (!unidade) {
                    return null;
                  }

                  const {
                    data:
                      quantidadeDisponivel,
                    error:
                      disponibilidadeError,
                  } = await supabase.rpc(
                    "estoque_disponivel_unidade",
                    {
                      p_produto_id:
                        produto.id,

                      p_unidade_id:
                        unidade.id,
                    }
                  );

                  /*
                   * Se houver erro ao consultar a
                   * disponibilidade, por segurança
                   * mostramos ZERO.
                   *
                   * Nunca devemos mostrar estoque físico
                   * como disponível quando não conseguimos
                   * descontar as reservas.
                   */
                  if (
                    disponibilidadeError
                  ) {
                    console.error(
                      `Erro ao consultar disponibilidade do produto ${produto.codigo} na unidade ${unidade.codigo}:`,
                      disponibilidadeError.message
                    );

                    return {
                      unidade,
                      quantidadeFisica:
                        Number(
                          estoque.quantidade
                        ),
                      quantidadeDisponivel:
                        0,
                    };
                  }

                  return {
                    unidade,

                    quantidadeFisica:
                      Number(
                        estoque.quantidade
                      ),

                    quantidadeDisponivel:
                      Math.max(
                        0,
                        Number(
                          quantidadeDisponivel ??
                            0
                        )
                      ),
                  };
                }
              )
            );

          return {
            ...produto,

            disponibilidades:
              disponibilidades.filter(
                (
                  disponibilidade
                ): disponibilidade is EstoqueDisponivel =>
                  disponibilidade !==
                  null
              ),
          };
        }
      )
    );

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
            Erro ao carregar produtos:{" "}
            {error.message}
          </div>
        )}

        <div className="grid gap-5 md:grid-cols-2">
          {produtosComDisponibilidade.map(
            (produto) => {
              /*
               * =================================================
               * ESTOQUE TOTAL REALMENTE DISPONÍVEL NA REDE
               * =================================================
               */

              const estoqueTotal =
                produto.disponibilidades.reduce(
                  (
                    total,
                    estoque
                  ) =>
                    total +
                    Number(
                      estoque.quantidadeDisponivel
                    ),
                  0
                );

              /*
               * Exibimos apenas unidades que possuem
               * disponibilidade real para venda.
               */
              const unidadesComEstoque =
                produto.disponibilidades.filter(
                  (estoque) =>
                    estoque.quantidadeDisponivel >
                    0
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
                    {Number(
                      produto.preco
                    ).toLocaleString(
                      "pt-BR",
                      {
                        style:
                          "currency",
                        currency:
                          "BRL",
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

                    {unidadesComEstoque.length >
                    0 ? (
                      <div className="mt-3 space-y-2">
                        {unidadesComEstoque.map(
                          (
                            estoque
                          ) => {
                            const unidade =
                              estoque.unidade;

                            return (
                              <div
                                key={
                                  unidade.id
                                }
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
                                  {
                                    estoque.quantidadeDisponivel
                                  }
                                </strong>
                              </div>
                            );
                          }
                        )}
                      </div>
                    ) : (
                      <p className="mt-3 text-sm font-semibold text-red-600">
                        Produto
                        indisponível no
                        momento
                      </p>
                    )}
                  </div>

                  <div className="mt-4 text-sm text-gray-500">
                    Código:{" "}
                    {produto.codigo}
                  </div>

                  <p className="mt-4 font-semibold">
                    Ver produto
                  </p>
                </Link>
              );
            }
          )}
        </div>
      </div>
    </main>
  );
}