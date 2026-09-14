"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

type Pedido = {
  id: string;
  numero_pedido: number;
  created_at: string;
  status: string;
  status_pagamento: string;
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
        setMensagem(`Erro ao verificar acesso: ${perfilError.message}`);
        setCarregando(false);
        return;
      }

      if (!perfil || perfil.tipo_usuario !== "admin") {
        router.push("/area-cliente");
        return;
      }

      const { data: pedidosData, error: pedidosError } = await supabase
        .from("pedidos")
        .select(
          "id, numero_pedido, created_at, status, status_pagamento, total, user_id"
        )
        .order("numero_pedido", { ascending: false });

      if (pedidosError) {
        setMensagem(`Erro ao carregar pedidos: ${pedidosError.message}`);
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

  function traduzirPagamento(status: string) {
    switch (status) {
      case "pendente":
        return "Aguardando pagamento";
      case "aprovado":
        return "Aprovado";
      case "recusado":
        return "Recusado";
      case "cancelado":
        return "Cancelado";
      case "estornado":
        return "Estornado";
      default:
        return status || "Não informado";
    }
  }

  function traduzirOperacao(status: string) {
    switch (status) {
      case "recebido":
        return "Novo pedido";
      case "em_separacao":
        return "Em separação";
      case "pronto_retirada":
        return "Pronto para retirada";
      case "cliente_no_local":
        return "Cliente no local";
      case "entregue":
        return "Retirada concluída";
      case "cancelado":
        return "Cancelado";
      default:
        return status || "Não informado";
    }
  }

  function classePagamento(status: string) {
    switch (status) {
      case "aprovado":
        return "border-green-300 bg-green-50 text-green-700";
      case "pendente":
        return "border-amber-300 bg-amber-50 text-amber-700";
      case "recusado":
      case "cancelado":
        return "border-red-300 bg-red-50 text-red-700";
      case "estornado":
        return "border-orange-300 bg-orange-50 text-orange-700";
      default:
        return "border-gray-300 bg-gray-50 text-gray-700";
    }
  }

  function classeOperacao(status: string) {
    switch (status) {
      case "recebido":
        return "border-blue-300 bg-blue-50 text-blue-700";
      case "em_separacao":
        return "border-indigo-300 bg-indigo-50 text-indigo-700";
      case "pronto_retirada":
        return "border-green-300 bg-green-50 text-green-700";
      case "cliente_no_local":
        return "border-purple-300 bg-purple-50 text-purple-700";
      case "entregue":
        return "border-gray-400 bg-gray-100 text-gray-700";
      case "cancelado":
        return "border-red-300 bg-red-50 text-red-700";
      default:
        return "border-gray-300 bg-gray-50 text-gray-700";
    }
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
                <div className="flex flex-col justify-between gap-5 md:flex-row md:items-center">
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

                  <div className="flex flex-col gap-3 md:min-w-[330px]">
                    <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
                      <div
                        className={`rounded-lg border px-3 py-2 text-sm ${classePagamento(
                          pedido.status_pagamento
                        )}`}
                      >
                        <span>Pagamento:</span>{" "}
                        <span className="font-bold">
                          {traduzirPagamento(pedido.status_pagamento)}
                        </span>
                      </div>

                      <div
                        className={`rounded-lg border px-3 py-2 text-sm ${classeOperacao(
                          pedido.status
                        )}`}
                      >
                        <span>Operação:</span>{" "}
                        <span className="font-bold">
                          {traduzirOperacao(pedido.status)}
                        </span>
                      </div>
                    </div>

                    <button
                      onClick={() =>
                        router.push(
                          `/admin/pedidos/${pedido.numero_pedido}`
                        )
                      }
                      className="rounded-lg border border-gray-300 px-4 py-2 font-semibold hover:bg-gray-50 md:self-end"
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
