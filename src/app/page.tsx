import { supabase } from "@/lib/supabase";

export default async function Home() {
  const { data: produtos, error } = await supabase
    .from("produto_teste")
    .select("id, nome, preco, ativo")
    .eq("ativo", true)
    .order("id");

  return (
    <main className="min-h-screen bg-white p-10 text-black">
      <h1 className="mb-8 text-3xl font-bold">
        O Box Driver - Produtos de teste
      </h1>

      {error && (
        <div className="rounded border border-red-400 p-4">
          Erro ao consultar produtos: {error.message}
        </div>
      )}

      <div className="space-y-4">
        {produtos?.map((produto) => (
          <div
            key={produto.id}
            className="rounded-lg border border-gray-300 p-4"
          >
            <h2 className="text-xl font-semibold">{produto.nome}</h2>

            <p>
              R$ {Number(produto.preco).toFixed(2).replace(".", ",")}
            </p>
          </div>
        ))}
      </div>
    </main>
  );
}