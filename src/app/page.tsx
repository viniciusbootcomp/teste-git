import { supabase } from "@/lib/supabase";
import CatalogoCliente from "@/components/CatalogoCliente";
import type {
  ProdutoCatalogo,
  ProdutoComDisponibilidade,
  EstoqueDisponivel,
} from "@/types/catalogo";

export default async function Home() {
  const { data: produtos, error } = await supabase
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

  const produtosComDisponibilidade = await Promise.all(
    produtosCatalogo.map(
      async (
        produto
      ): Promise<ProdutoComDisponibilidade> => {
        const estoquesAtivos = produto.estoque_unidade.filter(
          (estoque) => estoque.unidades?.ativo === true
        );

        const disponibilidades = await Promise.all(
          estoquesAtivos.map(
            async (
              estoque
            ): Promise<EstoqueDisponivel | null> => {
              const unidade = estoque.unidades;

              if (!unidade) {
                return null;
              }

              const {
                data: quantidadeDisponivel,
                error: disponibilidadeError,
              } = await supabase.rpc(
                "estoque_disponivel_unidade",
                {
                  p_produto_id: produto.id,
                  p_unidade_id: unidade.id,
                }
              );

              if (disponibilidadeError) {
                console.error(
                  `Erro ao consultar disponibilidade do produto ${produto.codigo} na unidade ${unidade.codigo}:`,
                  disponibilidadeError.message
                );

                return {
                  unidade,
                  quantidadeFisica: Number(
                    estoque.quantidade
                  ),
                  quantidadeDisponivel: 0,
                };
              }

              return {
                unidade,
                quantidadeFisica: Number(
                  estoque.quantidade
                ),
                quantidadeDisponivel: Math.max(
                  0,
                  Number(quantidadeDisponivel ?? 0)
                ),
              };
            }
          )
        );

        return {
          ...produto,
          disponibilidades: disponibilidades.filter(
            (
              disponibilidade
            ): disponibilidade is EstoqueDisponivel =>
              disponibilidade !== null
          ),
        };
      }
    )
  );

  return (
    <CatalogoCliente
      produtos={produtosComDisponibilidade}
      erro={error?.message ?? null}
    />
  );
}
