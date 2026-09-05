"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

type ItemCarrinho = {
  id: string;
  nome: string;
  preco: number;
  codigo: string;
  quantidade: number;
  estoque: number;
};

export default function CheckoutPage() {
  const router = useRouter();

  const [itens, setItens] = useState<ItemCarrinho[]>([]);
  const [nome, setNome] = useState("");
  const [telefone, setTelefone] = useState("");
  const [email, setEmail] = useState("");

  const [carregando, setCarregando] = useState(true);
  const [finalizando, setFinalizando] = useState(false);
  const [mensagem, setMensagem] = useState("");

  useEffect(() => {
    const carregarCheckout = window.setTimeout(async () => {
      const carrinhoSalvo = localStorage.getItem("carrinho");

      if (carrinhoSalvo) {
        try {
          const carrinho = JSON.parse(
            carrinhoSalvo
          ) as ItemCarrinho[];

          setItens(carrinho);
        } catch {
          localStorage.removeItem("carrinho");
        }
      }

      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        router.push("/login");
        return;
      }

      setEmail(user.email ?? "");

      const { data: perfil, error: perfilError } =
        await supabase
          .from("perfil_cliente")
          .select("nome, telefone")
          .eq("user_id", user.id)
          .maybeSingle();

      if (perfilError) {
        setMensagem(
          `Erro ao carregar perfil: ${perfilError.message}`
        );
      }

      if (perfil) {
        setNome(perfil.nome ?? "");
        setTelefone(perfil.telefone ?? "");
      }

      setCarregando(false);
    }, 0);

    return () => {
      window.clearTimeout(carregarCheckout);
    };
  }, [router]);

  const total = useMemo(() => {
    return itens.reduce(
      (soma, item) =>
        soma + Number(item.preco) * Number(item.quantidade),
      0
    );
  }, [itens]);

  async function finalizarPedido() {
    setMensagem("");

    if (itens.length === 0) {
      setMensagem("O carrinho está vazio.");
      return;
    }

    const possuiQuantidadeInvalida = itens.some(
      (item) =>
        !Number.isInteger(Number(item.quantidade)) ||
        Number(item.quantidade) <= 0
    );

    if (possuiQuantidadeInvalida) {
      setMensagem(
        "Existe um item com quantidade inválida no carrinho."
      );
      return;
    }

    setFinalizando(true);

    /*
     * Enviamos ao banco somente:
     *
     * - produto_id
     * - quantidade
     *
     * Preço, estoque, unidade e distribuição
     * NÃO são confiados ao navegador.
     *
     * A função no PostgreSQL recalcula tudo.
     */
    const itensParaBanco = itens.map((item) => ({
      produto_id: item.id,
      quantidade: Number(item.quantidade),
    }));

    const { data: numeroPedido, error } =
      await supabase.rpc(
        "finalizar_pedido_multiunidade",
        {
          p_itens: itensParaBanco,
        }
      );

    if (error) {
      setMensagem(
        `Não foi possível finalizar o pedido: ${error.message}`
      );

      setFinalizando(false);
      return;
    }

    if (numeroPedido === null || numeroPedido === undefined) {
      setMensagem(
        "O pedido foi processado, mas o número do pedido não foi retornado."
      );

      setFinalizando(false);
      return;
    }

    localStorage.removeItem("carrinho");
    setItens([]);

    router.push(
      `/pedido-sucesso?numero=${numeroPedido}`
    );
  }

  if (carregando) {
    return (
      <main className="min-h-screen bg-white p-10 text-black">
        <p>Carregando checkout...</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-white p-10 text-black">
      <div className="mx-auto max-w-4xl">
        <h1 className="mb-8 text-3xl font-bold">
          Finalizar pedido
        </h1>

        {itens.length === 0 ? (
          <div className="rounded-xl border border-gray-300 p-6">
            <p className="mb-4">
              Seu carrinho está vazio.
            </p>

            <Link
              href="/"
              className="inline-block rounded-lg bg-black px-5 py-3 font-semibold text-white"
            >
              Voltar ao catálogo
            </Link>
          </div>
        ) : (
          <>
            <div className="grid gap-8 md:grid-cols-2">
              <div>
                <h2 className="mb-4 text-xl font-bold">
                  Dados do cliente
                </h2>

                <div className="space-y-4">
                  <input
                    type="text"
                    value={nome}
                    onChange={(e) =>
                      setNome(e.target.value)
                    }
                    placeholder="Nome"
                    className="w-full rounded-lg border border-gray-300 p-3"
                  />

                  <input
                    type="text"
                    value={telefone}
                    onChange={(e) =>
                      setTelefone(e.target.value)
                    }
                    placeholder="Telefone"
                    className="w-full rounded-lg border border-gray-300 p-3"
                  />

                  <input
                    type="email"
                    value={email}
                    disabled
                    className="w-full rounded-lg border border-gray-300 bg-gray-100 p-3"
                  />
                </div>
              </div>

              <div>
                <h2 className="mb-4 text-xl font-bold">
                  Resumo do pedido
                </h2>

                <div className="space-y-3">
                  {itens.map((item) => (
                    <div
                      key={item.id}
                      className="rounded-lg border border-gray-300 p-4"
                    >
                      <p className="font-semibold">
                        {item.nome}
                      </p>

                      <p className="text-sm text-gray-500">
                        {item.quantidade} x{" "}
                        {Number(
                          item.preco
                        ).toLocaleString(
                          "pt-BR",
                          {
                            style: "currency",
                            currency: "BRL",
                          }
                        )}
                      </p>

                      <p className="mt-2 font-bold">
                        {(
                          Number(item.preco) *
                          Number(item.quantidade)
                        ).toLocaleString(
                          "pt-BR",
                          {
                            style: "currency",
                            currency: "BRL",
                          }
                        )}
                      </p>
                    </div>
                  ))}
                </div>

                <div className="mt-6 rounded-xl border border-gray-300 p-5">
                  <p className="text-sm text-gray-500">
                    Total estimado
                  </p>

                  <p className="text-3xl font-bold">
                    {total.toLocaleString(
                      "pt-BR",
                      {
                        style: "currency",
                        currency: "BRL",
                      }
                    )}
                  </p>

                  <p className="mt-2 text-sm text-gray-500">
                    O estoque, os valores e os pontos de
                    retirada serão validados novamente no
                    momento da finalização.
                  </p>
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={finalizarPedido}
              disabled={finalizando}
              className="mt-8 w-full rounded-lg bg-black p-4 font-semibold text-white disabled:bg-gray-400"
            >
              {finalizando
                ? "Validando estoque e finalizando..."
                : "Finalizar pedido"}
            </button>
          </>
        )}

        {mensagem && (
          <div className="mt-6 rounded-lg border border-orange-300 bg-orange-50 p-4">
            {mensagem}
          </div>
        )}
      </div>
    </main>
  );
}