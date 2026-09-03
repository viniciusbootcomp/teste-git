import Link from "next/link";
import { supabase } from "@/lib/supabase";

export default async function Home() {
  const { data: produtos, error } = await supabase
    .from("produtos")
    .select(
      "id, nome, descricao, preco, categoria, codigo, estoque, ativo"
    )
    .eq("ativo", true)
    .order("nome");

  return (
    <main className="min-h-screen bg-white p-10 text-black">
      <div className="mx-auto max-w-5xl">
        <h1 className="mb-8 text-3xl font-bold">
          O Box Driver - Catálogo
        </h1>

        {error && (
          <div className="mb-6 rounded-lg border border-red-400 p-4">
            Erro ao carregar produtos: {error.message}
          </div>
        )}

        <div className="grid gap-4 md:grid-cols-2">
          {produtos?.map((produto) => (
            <Link
              key={produto.id}
              href={`/produto/${produto.codigo}`}
              className="block rounded-xl border border-gray-300 p-5 transition hover:shadow-md"
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
                R$ {Number(produto.preco)
                  .toFixed(2)
                  .replace(".", ",")}
              </p>

              <div className="mt-3 text-sm text-gray-500">
                <p>Código: {produto.codigo}</p>
                <p>Estoque: {produto.estoque}</p>
              </div>

              <p className="mt-4 font-semibold">
                Ver produto
              </p>
            </Link>
          ))}
        </div>
      </div>
    </main>
  );
}