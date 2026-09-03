"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

type Pedido = {
  id: string;
  numero_pedido: number;
  created_at: string;
  status: string;
  total: number;
};

type ItemPedido = {
  id: string;
  nome_produto: string;
  codigo_produto: string;
  quantidade: number;
  preco_unitario: number;
  subtotal: number;
};

export default function PedidoDetalhePage() {
  const params = useParams();
  const router = useRouter();

  const numero = Number(params.numero);

  const [pedido, setPedido] = useState<Pedido | null>(null);
  const [itens, setItens] = useState<ItemPedido[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [mensagem, setMensagem] = useState("");

  useEffect(() => {
    const carregarPedido = window.setTimeout(async () => {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        router.push("/login");
        return;
      }

      const { data: pedidoData, error: pedidoError } =
        await supabase
          .from("pedidos")
          .select(
            "id, numero_pedido, created_at, status, total"
          )
          .eq("numero_pedido", numero)
          .eq("user_id", user.id)
          .maybeSingle();

      if (pedidoError) {
        setMensagem(
          `Erro ao carregar pedido: ${pedidoError.message}`
        );
        setCarregando(false);
        return;
      }

      if (!pedidoData) {
        setMensagem("Pedido não encontrado.");
        setCarregando(false);
        return;
      }

      setPedido(pedidoData);

      const { data: itensData, error: itensError } =
        await supabase
          .from("itens_pedido")
          .select(
            "id, nome_produto, codigo_produto, quantidade, preco_unitario, subtotal"
          )
          .eq("pedido_id", pedidoData.id)
          .order("created_at", {
            ascending: true,
          });

      if (itensError) {
        setMensagem(
          `Erro ao carregar itens: ${itensError.message}`
        );
        setCarregando(false);
        return;
      }

      setItens(itensData ?? []);
      setCarregando(false);
    }, 0);

    return () => {
      window.clearTimeout(carregarPedido);
    };
  }, [numero, router]);

  function formatarValor(valor: number) {
    return Number(valor).toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL",
    });
  }

  function formatarData(data: string) {
    return new Date(data).toLocaleString("pt-BR");
  }

  if (carregando) {
    return (
      <main className="min-h-screen bg-white p-10 text-black">
        <p>Carregando pedido...</p>
      </main>
    );
  }

  if (!pedido) {
    return (
      <main className="min-h-screen bg-white p-10 text-black">
        <div className="mx-auto max-w-3xl">
          <div className="rounded-lg border border-gray-300 p-6">
            <p>{mensagem || "Pedido não encontrado."}</p>

            <Link
              href="/area-cliente"
              className="mt-4 inline-block rounded-lg bg-black px-5 py-3 font-semibold text-white"
            >
              Voltar para área do cliente
            </Link>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-white p-10 text-black">
      <div className="mx-auto max-w-3xl">
        <div className="mb-8 flex flex-col justify-between gap-4 md:flex-row md:items-start">
          <div>
            <p className="text-sm text-gray-500">
              Pedido
            </p>

            <h1 className="text-3xl font-bold">
              Pedido nº {pedido.numero_pedido}
            </h1>

            <p className="mt-2 text-sm text-gray-500">
              {formatarData(pedido.created_at)}
            </p>
          </div>

          <span className="w-fit rounded-full border border-gray-300 px-4 py-2 font-semibold">
            {pedido.status}
          </span>
        </div>

        <div className="space-y-4">
          {itens.map((item) => (
            <div
              key={item.id}
              className="rounded-xl border border-gray-300 p-5"
            >
              <h2 className="text-xl font-bold">
                {item.nome_produto}
              </h2>

              <p className="mt-1 text-sm text-gray-500">
                Código: {item.codigo_produto}
              </p>

              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <div>
                  <p className="text-sm text-gray-500">
                    Quantidade
                  </p>

                  <p className="font-semibold">
                    {item.quantidade}
                  </p>
                </div>

                <div>
                  <p className="text-sm text-gray-500">
                    Preço unitário
                  </p>

                  <p className="font-semibold">
                    {formatarValor(
                      item.preco_unitario
                    )}
                  </p>
                </div>

                <div>
                  <p className="text-sm text-gray-500">
                    Subtotal
                  </p>

                  <p className="font-semibold">
                    {formatarValor(item.subtotal)}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-8 rounded-xl border border-gray-300 p-6">
          <p className="text-sm text-gray-500">
            Total do pedido
          </p>

          <p className="mt-1 text-3xl font-bold">
            {formatarValor(pedido.total)}
          </p>
        </div>

        <Link
          href="/area-cliente"
          className="mt-6 block w-full rounded-lg border border-gray-300 p-3 text-center font-semibold"
        >
          Voltar para área do cliente
        </Link>
      </div>
    </main>
  );
}