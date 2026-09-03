import Link from "next/link";
import { notFound } from "next/navigation";
import { supabase } from "@/lib/supabase";
import AdicionarCarrinho from "@/components/AdicionarCarrinho";

type Props = {
  params: Promise<{
    codigo: string;
  }>;
};

export default async function ProdutoPage({ params }: Props) {
  const { codigo } = await params;

  const { data: produto, error } = await supabase
    .from("produtos")
    .select(
      "id, nome, descricao, preco, categoria, codigo, estoque, ativo, imagem_url"
    )
    .eq("codigo", codigo)
    .eq("ativo", true)
    .maybeSingle();

  if (error) {
    return (
      <main className="min-h-screen bg-white p-10 text-black">
        <div className="mx-auto max-w-3xl">
          <p className="rounded-lg border border-red-400 p-4">
            Erro ao carregar produto: {error.message}
          </p>
        </div>
      </main>
    );
  }

  if (!produto) {
    notFound();
  }

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
          R$ {Number(produto.preco)
            .toFixed(2)
            .replace(".", ",")}
        </p>

        <div className="mt-6 rounded-lg border border-gray-300 p-4">
          <p>
            <strong>Código:</strong> {produto.codigo}
          </p>

          <p>
            <strong>Estoque:</strong> {produto.estoque}
          </p>
        </div>

        <AdicionarCarrinho
          produto={{
            id: produto.id,
            nome: produto.nome,
            preco: Number(produto.preco),
            codigo: produto.codigo,
            estoque: Number(produto.estoque),
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