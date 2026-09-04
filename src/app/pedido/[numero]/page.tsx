"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { QRCodeSVG } from "qrcode.react";

import { supabase } from "@/lib/supabase";

type Pedido = {
  id: string;
  numero_pedido: number;
  created_at: string;
  status: string;
  total: number;
  token_retirada: string;
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
            "id, numero_pedido, created_at, status, total, token_retirada"
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

  function traduzirStatus(status: string) {
    switch (status) {
      case "recebido":
        return "Pedido recebido";

      case "em separação":
        return "Em separação";

      case "pronto_retirada":
        return "Pronto para retirada";

      case "cliente_no_local":
        return "Check-in realizado";

      case "entregue":
        return "Entregue";

      case "cancelado":
        return "Cancelado";

      default:
        return status;
    }
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
            <p>
              {mensagem || "Pedido não encontrado."}
            </p>

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
            {traduzirStatus(pedido.status)}
          </span>
        </div>

        {pedido.status === "pronto_retirada" && (
          <div className="mb-8 rounded-2xl border-2 border-green-400 bg-green-50 p-8 text-center">
            <p className="text-sm font-semibold uppercase tracking-widest text-green-700">
              Pedido pronto
            </p>

            <h2 className="mt-2 text-2xl font-bold">
              Seu pedido está pronto para retirada
            </h2>

            <p className="mt-3 text-gray-600">
              Ao chegar ao O Box Driver, apresente este QR
              Code no terminal de autoatendimento.
            </p>

            <div className="mt-8 flex justify-center">
              <div className="rounded-2xl border border-gray-300 bg-white p-6">
                <QRCodeSVG
                  value={pedido.token_retirada}
                  size={240}
                  level="H"
                  includeMargin
                />
              </div>
            </div>

            <p className="mt-6 font-semibold">
              Pedido nº {pedido.numero_pedido}
            </p>

            <p className="mt-2 text-sm text-gray-500">
              Não é necessário informar o número do pedido no
              terminal. Apenas apresente o QR Code.
            </p>
          </div>
        )}

        {pedido.status === "cliente_no_local" && (
          <div className="mb-8 rounded-2xl border-2 border-orange-400 bg-orange-50 p-8 text-center">
            <p className="text-sm font-semibold uppercase tracking-widest text-orange-700">
              Check-in realizado
            </p>

            <h2 className="mt-2 text-2xl font-bold">
              Identificamos sua chegada
            </h2>

            <p className="mt-3 text-lg">
              Siga a orientação exibida no terminal de
              autoatendimento e dirija-se ao ponto de
              retirada.
            </p>
          </div>
        )}

        {pedido.status === "entregue" && (
          <div className="mb-8 rounded-2xl border-2 border-green-400 bg-green-50 p-8 text-center">
            <p className="text-sm font-semibold uppercase tracking-widest text-green-700">
              Retirada concluída
            </p>

            <h2 className="mt-2 text-2xl font-bold">
              Pedido entregue
            </h2>

            <p className="mt-3 text-gray-600">
              A retirada deste pedido já foi concluída.
            </p>
          </div>
        )}

        {pedido.status === "em separação" && (
          <div className="mb-8 rounded-2xl border border-blue-300 bg-blue-50 p-6">
            <p className="font-bold">
              Estamos separando seu pedido
            </p>

            <p className="mt-2 text-gray-600">
              Assim que a conferência terminar, o QR Code de
              retirada ficará disponível aqui.
            </p>
          </div>
        )}

        {pedido.status === "recebido" && (
          <div className="mb-8 rounded-2xl border border-gray-300 bg-gray-50 p-6">
            <p className="font-bold">
              Pedido recebido
            </p>

            <p className="mt-2 text-gray-600">
              Seu pedido foi recebido e em breve seguirá para
              separação.
            </p>
          </div>
        )}

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
                    {formatarValor(
                      item.subtotal
                    )}
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