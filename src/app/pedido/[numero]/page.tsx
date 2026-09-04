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
  status_pagamento: string;
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

type Retirada = {
  id: string;
  sequencia: number;
  status: string;
  token_retirada: string;
  checkin_em: string | null;
  entregue_em: string | null;

  unidades: {
    nome: string;
    codigo: string;
    cidade: string | null;
    estado: string | null;
  } | null;

  pontos_retirada: {
    nome: string;
    instrucao_cliente: string | null;
  } | null;
};

export default function PedidoDetalhePage() {
  const params = useParams();
  const router = useRouter();

  const numero = Number(params.numero);

  const [pedido, setPedido] = useState<Pedido | null>(null);
  const [itens, setItens] = useState<ItemPedido[]>([]);
  const [retiradas, setRetiradas] = useState<Retirada[]>([]);

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
            "id, numero_pedido, created_at, status_pagamento, total"
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

      const { data: retiradasData, error: retiradasError } =
        await supabase
          .from("retiradas_pedido")
          .select(`
            id,
            sequencia,
            status,
            token_retirada,
            checkin_em,
            entregue_em,

            unidades (
              nome,
              codigo,
              cidade,
              estado
            ),

            pontos_retirada (
              nome,
              instrucao_cliente
            )
          `)
          .eq("pedido_id", pedidoData.id)
          .order("sequencia", {
            ascending: true,
          });

      if (retiradasError) {
        setMensagem(
          `Erro ao carregar retiradas: ${retiradasError.message}`
        );

        setCarregando(false);
        return;
      }

      setRetiradas(
        (retiradasData ?? []) as unknown as Retirada[]
      );

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

      case "em_separacao":
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

          <div className="rounded-full border border-gray-300 px-4 py-2 font-semibold">
            Pagamento: {pedido.status_pagamento}
          </div>
        </div>

        {mensagem && (
          <div className="mb-6 rounded-xl border border-red-300 bg-red-50 p-5">
            {mensagem}
          </div>
        )}

        {retiradas.length === 0 && (
          <div className="mb-8 rounded-xl border border-orange-300 bg-orange-50 p-6">
            <p className="font-bold">
              Retirada ainda não definida
            </p>

            <p className="mt-2 text-gray-600">
              Estamos preparando as informações de retirada
              deste pedido.
            </p>
          </div>
        )}

        <div className="space-y-8">
          {retiradas.map((retirada) => {
            const unidade = retirada.unidades;
            const ponto = retirada.pontos_retirada;

            return (
              <div
                key={retirada.id}
                className="rounded-2xl border border-gray-300 p-6"
              >
                <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
                  <div>
                    <p className="text-sm text-gray-500">
                      Retirada {retirada.sequencia}
                    </p>

                    <h2 className="mt-1 text-2xl font-bold">
                      {unidade?.nome ??
                        "Unidade O Box Driver"}
                    </h2>

                    {unidade?.cidade && (
                      <p className="mt-1 text-gray-500">
                        {unidade.cidade}
                        {unidade.estado
                          ? ` - ${unidade.estado}`
                          : ""}
                      </p>
                    )}
                  </div>

                  <span className="w-fit rounded-full border border-gray-300 px-4 py-2 font-semibold">
                    {traduzirStatus(retirada.status)}
                  </span>
                </div>

                {retirada.status === "recebido" && (
                  <div className="mt-6 rounded-xl border border-gray-300 bg-gray-50 p-5">
                    <p className="font-bold">
                      Pedido recebido
                    </p>

                    <p className="mt-2 text-gray-600">
                      Esta retirada será encaminhada para
                      separação.
                    </p>
                  </div>
                )}

                {retirada.status === "em_separacao" && (
                  <div className="mt-6 rounded-xl border border-blue-300 bg-blue-50 p-5">
                    <p className="font-bold">
                      Estamos separando seus produtos
                    </p>

                    <p className="mt-2 text-gray-600">
                      Assim que a conferência terminar, o QR
                      Code ficará disponível aqui.
                    </p>
                  </div>
                )}

                {retirada.status === "pronto_retirada" && (
                  <div className="mt-6 rounded-2xl border-2 border-green-400 bg-green-50 p-8 text-center">
                    <p className="text-sm font-semibold uppercase tracking-widest text-green-700">
                      Retirada pronta
                    </p>

                    <h3 className="mt-2 text-2xl font-bold">
                      Seus produtos estão prontos
                    </h3>

                    <p className="mt-3 text-gray-600">
                      Ao chegar ao O Box Driver, apresente
                      este QR Code no terminal de
                      autoatendimento.
                    </p>

                    <div className="mt-8 flex justify-center">
                      <div className="rounded-2xl border border-gray-300 bg-white p-6">
                        <QRCodeSVG
                          value={retirada.token_retirada}
                          size={240}
                          level="H"
                          includeMargin
                        />
                      </div>
                    </div>

                    <p className="mt-6 font-semibold">
                      Pedido nº {pedido.numero_pedido}
                    </p>

                    <p className="mt-1 text-sm text-gray-500">
                      Retirada {retirada.sequencia}
                    </p>

                    {ponto && (
                      <div className="mt-6 rounded-xl border border-green-300 bg-white p-5">
                        <p className="text-sm text-gray-500">
                          Ponto de retirada
                        </p>

                        <p className="mt-1 text-xl font-bold">
                          {ponto.nome}
                        </p>

                        {ponto.instrucao_cliente && (
                          <p className="mt-3 text-gray-600">
                            {ponto.instrucao_cliente}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {retirada.status === "cliente_no_local" && (
                  <div className="mt-6 rounded-2xl border-2 border-orange-400 bg-orange-50 p-8 text-center">
                    <p className="text-sm font-semibold uppercase tracking-widest text-orange-700">
                      Check-in realizado
                    </p>

                    <h3 className="mt-2 text-2xl font-bold">
                      Identificamos sua chegada
                    </h3>

                    <p className="mt-3 text-lg">
                      Siga a orientação exibida no terminal e
                      dirija-se ao ponto de retirada.
                    </p>

                    {retirada.checkin_em && (
                      <p className="mt-4 text-sm text-gray-500">
                        Check-in:{" "}
                        {formatarData(
                          retirada.checkin_em
                        )}
                      </p>
                    )}
                  </div>
                )}

                {retirada.status === "entregue" && (
                  <div className="mt-6 rounded-2xl border-2 border-green-400 bg-green-50 p-8 text-center">
                    <p className="text-sm font-semibold uppercase tracking-widest text-green-700">
                      Retirada concluída
                    </p>

                    <h3 className="mt-2 text-2xl font-bold">
                      Produtos entregues
                    </h3>

                    {retirada.entregue_em && (
                      <p className="mt-3 text-gray-600">
                        Entregue em{" "}
                        {formatarData(
                          retirada.entregue_em
                        )}
                      </p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="mt-10 space-y-4">
          <h2 className="text-2xl font-bold">
            Itens do pedido
          </h2>

          {itens.map((item) => (
            <div
              key={item.id}
              className="rounded-xl border border-gray-300 p-5"
            >
              <h3 className="text-xl font-bold">
                {item.nome_produto}
              </h3>

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