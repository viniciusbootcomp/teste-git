import Link from "next/link";
import { notFound } from "next/navigation";

import { supabase } from "@/lib/supabase";
import AdicionarCarrinho from "@/components/AdicionarCarrinho";

type Props = {
  params: Promise<{
    codigo: string;
  }>;
};

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

type DisponibilidadeUnidade = {
  codigo: string;
  nome: string;
  cidade: string | null;
  estado: string | null;
  quantidade: number;
};

export default async function ProdutoPage({
  params,
}: Props) {
  const { codigo } = await params;

  /*
   * =====================================================
   * 1. CARREGA PRODUTO + ESTOQUE FÍSICO
   * =====================================================
   *
   * estoque_unidade.quantidade representa estoque físico.
   *
   * Não usamos mais esse valor diretamente como
   * disponibilidade comercial.
   * =====================================================
   */

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
          id,
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
   * =====================================================
   * 2. SOMENTE UNIDADES ATIVAS
   * =====================================================
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
   * =====================================================
   * 3. CONSULTA DISPONIBILIDADE REAL
   * =====================================================
   *
   * disponibilidade =
   * estoque físico
   * -
   * reservas ativas e não vencidas
   *
   * Essa regra permanece no PostgreSQL.
   * =====================================================
   */

  const disponibilidadesCalculadas =
    await Promise.all(
      estoquesAtivos.map(
        async (
          estoque
        ): Promise<DisponibilidadeUnidade | null> => {
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
           * Segurança:
           *
           * se não conseguirmos validar as reservas,
           * consideramos ZERO disponível.
           *
           * Nunca fazemos fallback para estoque físico.
           */
          if (
            disponibilidadeError
          ) {
            console.error(
              `Erro ao consultar disponibilidade do produto ${produto.codigo} na unidade ${unidade.codigo}:`,
              disponibilidadeError.message
            );

            return {
              codigo:
                unidade.codigo,

              nome:
                unidade.nome,

              cidade:
                unidade.cidade,

              estado:
                unidade.estado,

              quantidade: 0,
            };
          }

          return {
            codigo:
              unidade.codigo,

            nome:
              unidade.nome,

            cidade:
              unidade.cidade,

            estado:
              unidade.estado,

            quantidade:
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

  const disponibilidade =
    disponibilidadesCalculadas.filter(
      (
        item
      ): item is DisponibilidadeUnidade =>
        item !== null
    );

  /*
   * =====================================================
   * 4. ESTOQUE TOTAL DISPONÍVEL NA REDE
   * =====================================================
   */

  const estoqueTotal =
    disponibilidade.reduce(
      (
        total,
        estoque
      ) =>
        total +
        Number(
          estoque.quantidade
        ),
      0
    );

  /*
   * Mantemos todas as unidades ativas na tela,
   * inclusive as que estão com disponibilidade 0.
   *
   * Isso deixa claro para o cliente que a unidade existe,
   * mas naquele momento não possui quantidade disponível.
   */

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
          ).toLocaleString(
            "pt-BR",
            {
              style: "currency",
              currency: "BRL",
            }
          )}
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
            {disponibilidade.map(
              (estoque) => (
                <div
                  key={
                    estoque.codigo
                  }
                  className="flex items-center justify-between gap-5 rounded-xl bg-gray-50 p-4"
                >
                  <div>
                    <p className="font-semibold">
                      {
                        estoque.nome
                      }
                    </p>

                    {estoque.cidade && (
                      <p className="mt-1 text-sm text-gray-500">
                        {
                          estoque.cidade
                        }

                        {estoque.estado
                          ? ` - ${estoque.estado}`
                          : ""}
                      </p>
                    )}
                  </div>

                  <div className="text-right">
                    <p
                      className={`text-xl font-bold ${
                        estoque.quantidade <=
                        0
                          ? "text-red-600"
                          : ""
                      }`}
                    >
                      {
                        estoque.quantidade
                      }
                    </p>

                    <p className="text-xs text-gray-500">
                      disponíveis
                    </p>
                  </div>
                </div>
              )
            )}
          </div>

          {estoqueTotal <= 0 && (
            <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-4">
              <p className="font-semibold text-red-600">
                Produto indisponível em toda a rede.
              </p>

              <p className="mt-1 text-sm text-gray-600">
                O estoque pode estar temporariamente
                reservado por outros clientes.
              </p>
            </div>
          )}
        </div>

        <AdicionarCarrinho
          produto={{
            id: produto.id,
            nome: produto.nome,
            preco:
              Number(
                produto.preco
              ),
            codigo:
              produto.codigo,

            /*
             * Agora estoque representa
             * DISPONIBILIDADE REAL da rede.
             *
             * Não mais estoque físico.
             */
            estoque:
              estoqueTotal,

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