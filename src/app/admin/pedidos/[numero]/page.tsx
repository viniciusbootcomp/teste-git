"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

type Pedido = {
  id: string;
  numero_pedido: number;
  created_at: string;
  status: string;
  status_pagamento: string;
  total: number;
  user_id: string;
  separacao_iniciada_em: string | null;
  checkin_em: string | null;
  entregue_em: string | null;
};

type ItemPedido = {
  id: string;
  nome_produto: string;
  codigo_produto: string;
  quantidade: number;
  quantidade_separada: number;
  preco_unitario: number;
  subtotal: number;
};

type RetornoLeitura = {
  pedido: number;
  codigo: string;
  produto: string;
  quantidade_pedida: number;
  quantidade_separada: number;
  item_concluido: boolean;
  pedido_concluido: boolean;
};

type RetornoEntrega = {
  sucesso: boolean;
  pedido: number;
  status: string;
};

export default function AdminPedidoDetalhePage() {
  const params = useParams();
  const router = useRouter();

  const numero = Number(params.numero);

  const inputLeituraRef = useRef<HTMLInputElement>(null);
  const timerMensagemRef = useRef<number | null>(null);

  const [pedido, setPedido] = useState<Pedido | null>(null);
  const [itens, setItens] = useState<ItemPedido[]>([]);

  const [codigoLido, setCodigoLido] = useState("");

  const [mensagem, setMensagem] = useState("");
  const [mensagemLeitura, setMensagemLeitura] =
    useState("");

  const [tipoMensagemLeitura, setTipoMensagemLeitura] =
    useState<"sucesso" | "erro" | "">("");

  const [carregando, setCarregando] = useState(true);
  const [iniciando, setIniciando] = useState(false);

  const [registrandoLeitura, setRegistrandoLeitura] =
    useState(false);

  const [confirmandoEntrega, setConfirmandoEntrega] =
    useState(false);

  const [pedidoConcluido, setPedidoConcluido] =
    useState(false);

  function limparTimerMensagem() {
    if (timerMensagemRef.current !== null) {
      window.clearTimeout(timerMensagemRef.current);
      timerMensagemRef.current = null;
    }
  }

  function mostrarMensagemLeitura(
    texto: string,
    tipo: "sucesso" | "erro"
  ) {
    limparTimerMensagem();

    setMensagemLeitura(texto);
    setTipoMensagemLeitura(tipo);

    timerMensagemRef.current = window.setTimeout(() => {
      setMensagemLeitura("");
      setTipoMensagemLeitura("");
      timerMensagemRef.current = null;
    }, 3000);
  }

  function focarLeitor() {
    window.setTimeout(() => {
      inputLeituraRef.current?.focus();
    }, 100);
  }

  const carregarPedido = useCallback(async () => {
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      router.push("/login");
      return;
    }

    const { data: perfil, error: perfilError } =
      await supabase
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

    const { data: pedidoData, error: pedidoError } =
      await supabase
        .from("pedidos")
        .select(
          "id, numero_pedido, created_at, status, status_pagamento, total, user_id, separacao_iniciada_em, checkin_em, entregue_em"
        )
        .eq("numero_pedido", numero)
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
          "id, nome_produto, codigo_produto, quantidade, quantidade_separada, preco_unitario, subtotal"
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

    const itensCarregados = itensData ?? [];

    setItens(itensCarregados);

    const todosConcluidos =
      itensCarregados.length > 0 &&
      itensCarregados.every(
        (item) =>
          Number(item.quantidade_separada) >=
          Number(item.quantidade)
      );

    setPedidoConcluido(todosConcluidos);

    setCarregando(false);
  }, [numero, router]);

  useEffect(() => {
    const carregar = window.setTimeout(() => {
      carregarPedido();
    }, 0);

    return () => {
      window.clearTimeout(carregar);
      limparTimerMensagem();
    };
  }, [carregarPedido]);

  useEffect(() => {
    if (pedido?.status === "em separação") {
      focarLeitor();
    }
  }, [pedido?.status]);

  async function iniciarSeparacao() {
    setMensagem("");
    setMensagemLeitura("");
    setTipoMensagemLeitura("");
    setIniciando(true);

    const { error } = await supabase.rpc(
      "iniciar_separacao",
      {
        p_numero_pedido: numero,
      }
    );

    if (error) {
      setMensagem(
        `Não foi possível iniciar a separação: ${error.message}`
      );

      setIniciando(false);
      return;
    }

    setMensagem("Separação iniciada com sucesso.");

    window.setTimeout(() => {
      setMensagem("");
    }, 3000);

    await carregarPedido();

    setIniciando(false);
    focarLeitor();
  }

  async function registrarLeitura() {
    const codigo = codigoLido.trim();

    if (!codigo) {
      focarLeitor();
      return;
    }

    setRegistrandoLeitura(true);

    const { data, error } = await supabase.rpc(
      "registrar_leitura_separacao",
      {
        p_numero_pedido: numero,
        p_codigo_lido: codigo,
      }
    );

    if (error) {
      mostrarMensagemLeitura(
        `Erro na leitura: ${error.message}`,
        "erro"
      );

      setCodigoLido("");
      setRegistrandoLeitura(false);

      focarLeitor();
      return;
    }

    const retorno = data as RetornoLeitura;

    if (retorno.item_concluido) {
      mostrarMensagemLeitura(
        `${retorno.produto}: ${retorno.quantidade_separada}/${retorno.quantidade_pedida} - item concluído.`,
        "sucesso"
      );
    } else {
      mostrarMensagemLeitura(
        `${retorno.produto}: ${retorno.quantidade_separada}/${retorno.quantidade_pedida} separado.`,
        "sucesso"
      );
    }

    setPedidoConcluido(retorno.pedido_concluido);

    setCodigoLido("");

    await carregarPedido();

    setRegistrandoLeitura(false);

    focarLeitor();
  }

  async function confirmarEntrega() {
    if (!pedido) {
      return;
    }

    const confirmou = window.confirm(
      `Confirma a entrega física do Pedido nº ${pedido.numero_pedido} ao cliente?`
    );

    if (!confirmou) {
      return;
    }

    setMensagem("");
    setConfirmandoEntrega(true);

    const { data, error } = await supabase.rpc(
      "confirmar_entrega",
      {
        p_numero_pedido: numero,
      }
    );

    if (error) {
      setMensagem(
        `Não foi possível confirmar a entrega: ${error.message}`
      );

      setConfirmandoEntrega(false);
      return;
    }

    const retorno = data as RetornoEntrega;

    if (!retorno.sucesso) {
      setMensagem(
        "Não foi possível confirmar a entrega do pedido."
      );

      setConfirmandoEntrega(false);
      return;
    }

    await carregarPedido();

    setMensagem(
      `Pedido nº ${retorno.pedido} entregue com sucesso.`
    );

    setConfirmandoEntrega(false);

    window.setTimeout(() => {
      setMensagem("");
    }, 4000);
  }

  function tratarEnter(
    event: React.KeyboardEvent<HTMLInputElement>
  ) {
    if (event.key === "Enter") {
      event.preventDefault();

      if (!registrandoLeitura) {
        registrarLeitura();
      }
    }
  }

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
        <div className="mx-auto max-w-4xl">
          <div className="rounded-lg border border-gray-300 p-6">
            <p>
              {mensagem || "Pedido não encontrado."}
            </p>

            <button
              onClick={() =>
                router.push("/admin/pedidos")
              }
              className="mt-4 rounded-lg bg-black px-5 py-3 font-semibold text-white"
            >
              Voltar para pedidos
            </button>
          </div>
        </div>
      </main>
    );
  }

  const podeIniciarSeparacao =
    pedido.status_pagamento === "aprovado" &&
    pedido.status === "recebido";

  const podeConfirmarEntrega =
    pedido.status === "cliente_no_local";

  return (
    <main className="min-h-screen bg-white p-10 text-black">
      <div className="mx-auto max-w-4xl">
        <div className="mb-8 flex flex-col justify-between gap-6 md:flex-row">
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

          <div className="min-w-72 space-y-3">
            <div className="rounded-lg border border-gray-300 p-4">
              <p className="text-sm text-gray-500">
                Status do pagamento
              </p>

              <p className="mt-1 font-bold">
                {pedido.status_pagamento}
              </p>
            </div>

            <div className="rounded-lg border border-gray-300 p-4">
              <p className="text-sm text-gray-500">
                Status operacional
              </p>

              <p className="mt-1 font-bold">
                {pedido.status}
              </p>
            </div>
          </div>
        </div>

        {mensagem && (
          <div className="mb-6 rounded-lg border border-gray-300 p-4">
            {mensagem}
          </div>
        )}

        {pedido.status_pagamento !== "aprovado" && (
          <div className="mb-6 rounded-lg border border-orange-300 bg-orange-50 p-4">
            Este pedido ainda não está liberado para
            separação porque o pagamento não foi aprovado.
          </div>
        )}

        {podeIniciarSeparacao && (
          <button
            onClick={iniciarSeparacao}
            disabled={iniciando}
            className="mb-8 w-full rounded-lg bg-black p-4 font-semibold text-white disabled:bg-gray-400"
          >
            {iniciando
              ? "Iniciando separação..."
              : "Iniciar separação"}
          </button>
        )}

        {pedido.status === "em separação" && (
          <>
            <div className="mb-6 rounded-lg border border-green-300 bg-green-50 p-4">
              <p className="font-semibold">
                Separação em andamento
              </p>

              {pedido.separacao_iniciada_em && (
                <p className="mt-1 text-sm">
                  Iniciada em{" "}
                  {formatarData(
                    pedido.separacao_iniciada_em
                  )}
                </p>
              )}
            </div>

            <div className="mb-8 rounded-xl border-2 border-black p-5">
              <h2 className="text-xl font-bold">
                Leitura de produtos
              </h2>

              <p className="mt-2 text-sm text-gray-500">
                Passe o produto no leitor ou digite o código e
                pressione Enter.
              </p>

              <input
                ref={inputLeituraRef}
                type="text"
                value={codigoLido}
                onChange={(e) =>
                  setCodigoLido(e.target.value)
                }
                onKeyDown={tratarEnter}
                disabled={registrandoLeitura}
                placeholder="Aguardando leitura..."
                autoComplete="off"
                className="mt-4 w-full rounded-lg border border-gray-300 p-4 text-xl font-semibold outline-none focus:border-black disabled:bg-gray-100"
              />

              {registrandoLeitura && (
                <p className="mt-3 text-sm">
                  Registrando leitura...
                </p>
              )}

              {mensagemLeitura && (
                <div
                  className={
                    tipoMensagemLeitura === "erro"
                      ? "mt-4 rounded-lg border border-red-300 bg-red-50 p-4"
                      : "mt-4 rounded-lg border border-green-300 bg-green-50 p-4"
                  }
                >
                  {mensagemLeitura}
                </div>
              )}
            </div>
          </>
        )}

        {pedido.status === "pronto_retirada" && (
          <div className="mb-8 rounded-xl border border-blue-300 bg-blue-50 p-6">
            <p className="text-xl font-bold">
              Pedido pronto para retirada
            </p>

            <p className="mt-2">
              Todos os produtos foram conferidos. Estamos
              aguardando o cliente realizar o check-in no
              terminal de autoatendimento.
            </p>
          </div>
        )}

        {pedido.status === "cliente_no_local" && (
          <div className="mb-8 rounded-xl border-2 border-orange-400 bg-orange-50 p-6">
            <p className="text-2xl font-bold">
              Cliente no local
            </p>

            <p className="mt-2">
              O cliente realizou o check-in e está aguardando
              a retirada da mercadoria.
            </p>

            {pedido.checkin_em && (
              <p className="mt-3 font-semibold">
                Check-in:{" "}
                {formatarData(pedido.checkin_em)}
              </p>
            )}
          </div>
        )}

        {pedido.status === "entregue" && (
          <div className="mb-8 rounded-xl border-2 border-green-400 bg-green-50 p-6">
            <p className="text-2xl font-bold">
              Pedido entregue
            </p>

            <p className="mt-2">
              A entrega física deste pedido já foi
              confirmada.
            </p>

            {pedido.entregue_em && (
              <p className="mt-3 font-semibold">
                Entregue em:{" "}
                {formatarData(pedido.entregue_em)}
              </p>
            )}
          </div>
        )}

        <div className="space-y-4">
          {itens.map((item) => {
            const concluido =
              Number(item.quantidade_separada) >=
              Number(item.quantidade);

            return (
              <div
                key={item.id}
                className="rounded-xl border border-gray-300 p-5"
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h2 className="text-xl font-bold">
                      {item.nome_produto}
                    </h2>

                    <p className="mt-1 text-sm text-gray-500">
                      Código: {item.codigo_produto}
                    </p>
                  </div>

                  {concluido && (
                    <span className="rounded-full border border-green-400 bg-green-50 px-3 py-1 text-sm font-semibold">
                      Concluído
                    </span>
                  )}
                </div>

                <div className="mt-4 grid gap-4 sm:grid-cols-4">
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
                      Separado
                    </p>

                    <p className="font-semibold">
                      {item.quantidade_separada}
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
            );
          })}
        </div>

        {pedido.status === "em separação" &&
          pedidoConcluido && (
            <div className="mt-8 rounded-xl border border-green-400 bg-green-50 p-6">
              <p className="text-xl font-bold">
                Todos os itens foram separados.
              </p>

              <p className="mt-2">
                A separação será finalizada automaticamente
                pelo sistema.
              </p>
            </div>
          )}

        {podeConfirmarEntrega && (
          <div className="mt-8 rounded-xl border-2 border-black p-6">
            <h2 className="text-xl font-bold">
              Entrega da mercadoria
            </h2>

            <p className="mt-2 text-gray-600">
              Confirme somente depois que a mercadoria
              tiver sido entregue fisicamente ao cliente.
            </p>

            <button
              onClick={confirmarEntrega}
              disabled={confirmandoEntrega}
              className="mt-5 w-full rounded-lg bg-black p-4 text-lg font-semibold text-white disabled:bg-gray-400"
            >
              {confirmandoEntrega
                ? "Confirmando entrega..."
                : "Confirmar entrega"}
            </button>
          </div>
        )}

        <div className="mt-8 rounded-xl border border-gray-300 p-6">
          <p className="text-sm text-gray-500">
            Total do pedido
          </p>

          <p className="mt-1 text-3xl font-bold">
            {formatarValor(pedido.total)}
          </p>
        </div>

        <button
          onClick={() =>
            router.push("/admin/pedidos")
          }
          className="mt-6 w-full rounded-lg border border-gray-300 p-3 font-semibold"
        >
          Voltar para pedidos
        </button>
      </div>
    </main>
  );
}