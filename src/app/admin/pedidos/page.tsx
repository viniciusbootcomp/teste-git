"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

type Pedido = {
  id: string;
  numero_pedido: number;
  created_at: string;
  status: string;
  total: number;
  user_id: string;
};

export default function AdminPedidosPage() {
  const router = useRouter();

  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [mensagem, setMensagem] = useState("");

  useEffect(() => {
    const carregar = window.setTimeout(async () => {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        router.push("/login");
        return;
      }

      const { data: perfil, error: perfilError } = await supabase
        .from("perfil_cliente")
        .select("tipo_usuario")
        .eq("user_id", user.id)
        .maybeSingle();

      if (perfilError) {
        setMensagem(
          `Erro ao verificar acesso: ${perfilError.message}`
        );
        setCarregando(false);
        return;
      }

      if (!perfil || perfil.tipo_usuario !== "admin") {
        router.push("/area-cliente");
        return;
      }

      const { data: pedidosData, error: pedidosError } =
        await supabase
          .from("pedidos")
          .select(
            "id, numero_pedido, created_at, status, total, user_id"
          )
          .order("numero_pedido", {
            ascending: false,
          });

      if (pedidosError) {
        setMensagem(
          `Erro ao carregar pedidos: ${pedidosError.message}`
        );
        setCarregando(false);
        return;
      }

      setPedidos(pedidosData ?? []);
      setCarregando(false);
    }, 0);

    return () => {
      window.clearTimeout(carregar);
    };
  }, [router]);

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
        <p>Carregando painel...</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-white p-10 text-black">
      <div className="mx-auto max-w-6xl">
        <h1 className="mb-8 text-3xl font-bold">
          Painel interno - Pedidos
        </h1>

        {mensagem && (
          <div className="mb-6 rounded-lg border border-red-400 p-4">
            {mensagem}
          </div>
        )}

        {pedidos.length === 0 ? (
          <div className="rounded-lg border border-gray-300 p-6">
            Nenhum pedido encontrado.
          </div>
        ) : (
          <div className="space-y-4">
            {pedidos.map((pedido) => (
              <div
                key={pedido.id}
                className="rounded-xl border border-gray-300 p-5"
              >
                <div className="flex flex-col justify-between gap-4 md:flex-row">
                  <div>
                    <h2 className="text-xl font-bold">
                      Pedido nº {pedido.numero_pedido}
                    </h2>

                    <p className="mt-1 text-sm text-gray-500">
                      {formatarData(pedido.created_at)}
                    </p>

                    <p className="mt-3 text-2xl font-bold">
                      {formatarValor(pedido.total)}
                    </p>
                  </div>

                  <div className="flex flex-col items-start gap-3 md:items-end">
                    <span className="rounded-full border border-gray-300 px-3 py-1 text-sm font-semibold">
                      {pedido.status}
                    </span>

                    <button
                      onClick={() =>
                        router.push(
                          `/admin/pedidos/${pedido.numero_pedido}`
                        )
                      }
                      className="rounded-lg border border-gray-300 px-4 py-2 font-semibold"
                    >
                      Abrir pedido
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}