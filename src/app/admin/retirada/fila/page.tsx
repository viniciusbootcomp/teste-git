"use client";

import {
  useCallback,
  useEffect,
  useState,
} from "react";

import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

type RetiradaFila = {
  id: string;
  sequencia: number;
  checkin_em: string;
  status: string;

  pedidos: {
    numero_pedido: number;
    total: number;
  } | null;

  unidades: {
    id: string;
    codigo: string;
    nome: string;
  } | null;

  pontos_retirada: {
    nome: string;
  } | null;
};

export default function FilaRetiradaPage() {
  const router = useRouter();

  const [retiradas, setRetiradas] =
    useState<RetiradaFila[]>([]);

  const [carregando, setCarregando] =
    useState(true);

  const [mensagem, setMensagem] =
    useState("");

  const [agora, setAgora] =
    useState<number | null>(null);

  const CODIGO_UNIDADE_ATUAL = "MOGI-01";
  const NOME_UNIDADE_ATUAL = "Mogi 01";

  const carregarFila = useCallback(async () => {
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

    const { data, error } = await supabase
      .from("retiradas_pedido")
      .select(`
        id,
        sequencia,
        checkin_em,
        status,

        pedidos (
          numero_pedido,
          total
        ),

        unidades (
          id,
          codigo,
          nome
        ),

        pontos_retirada (
          nome
        )
      `)
      .eq("status", "cliente_no_local")
      .not("checkin_em", "is", null)
      .eq("unidades.codigo", CODIGO_UNIDADE_ATUAL)
      .order("checkin_em", {
        ascending: true,
      });

    if (error) {
      setMensagem(
        `Erro ao carregar fila: ${error.message}`
      );

      setCarregando(false);
      return;
    }

    const retiradasFiltradas =
      ((data ?? []) as unknown as RetiradaFila[]).filter(
        (retirada) =>
          retirada.unidades?.codigo ===
          CODIGO_UNIDADE_ATUAL
      );

    setRetiradas(retiradasFiltradas);
    setMensagem("");
    setCarregando(false);
  }, [router]);

  useEffect(() => {
    const primeiraCarga = window.setTimeout(() => {
      carregarFila();
      setAgora(new Date().getTime());
    }, 0);

    const intervalo = window.setInterval(() => {
      carregarFila();
      setAgora(new Date().getTime());
    }, 5000);

    return () => {
      window.clearTimeout(primeiraCarga);
      window.clearInterval(intervalo);
    };
  }, [carregarFila]);

  function formatarHora(data: string) {
    return new Date(data).toLocaleTimeString(
      "pt-BR",
      {
        hour: "2-digit",
        minute: "2-digit",
      }
    );
  }

  function calcularTempoEspera(data: string) {
    if (agora === null) {
      return "calculando...";
    }

    const chegada = new Date(data).getTime();

    const minutos = Math.max(
      0,
      Math.floor((agora - chegada) / 60000)
    );

    if (minutos === 0) {
      return "agora";
    }

    if (minutos === 1) {
      return "há 1 min";
    }

    if (minutos < 60) {
      return `há ${minutos} min`;
    }

    const horas = Math.floor(minutos / 60);
    const minutosRestantes = minutos % 60;

    if (
      horas === 1 &&
      minutosRestantes === 0
    ) {
      return "há 1 hora";
    }

    if (minutosRestantes === 0) {
      return `há ${horas} horas`;
    }

    return `há ${horas}h ${minutosRestantes}min`;
  }

  function formatarValor(valor: number) {
    return Number(valor).toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL",
    });
  }

  if (carregando) {
    return (
      <main className="min-h-screen bg-white p-10 text-black">
        <p>Carregando painel de retirada...</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-white p-6 text-black md:p-10">
      <div className="mx-auto max-w-6xl">
        <div className="mb-8 flex flex-col justify-between gap-5 md:flex-row md:items-end">
          <div>
            <p className="text-sm font-semibold uppercase tracking-widest text-gray-500">
              O Box Driver
            </p>

            <h1 className="mt-2 text-4xl font-bold">
              Painel de Retirada — {NOME_UNIDADE_ATUAL}
            </h1>

            <p className="mt-3 text-lg text-gray-600">
              Clientes que já realizaram check-in e aguardam atendimento.
            </p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row">
            <div className="rounded-2xl border border-gray-300 px-6 py-4">
              <p className="text-sm text-gray-500">
                Aguardando
              </p>

              <p className="text-4xl font-bold">
                {retiradas.length}
              </p>
            </div>

            <button
              type="button"
              onClick={() => router.push("/admin/pedidos")}
              className="rounded-2xl border border-gray-300 px-6 py-4 font-semibold"
            >
              Ver todos os pedidos
            </button>
          </div>
        </div>

        <div className="mb-6 rounded-xl border border-green-300 bg-green-50 px-5 py-4">
          <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
            <div>
              <p className="font-semibold text-green-800">
                Painel operacional ativo
              </p>

              <p className="mt-1 text-sm text-green-700">
                Mantenha esta tela aberta no terminal interno do ponto de retirada.
              </p>
            </div>

            <p className="text-sm font-semibold text-green-700">
              Atualização automática a cada 5 segundos
            </p>
          </div>
        </div>

        {mensagem && (
          <div className="mb-6 rounded-lg border border-red-300 bg-red-50 p-4">
            {mensagem}
          </div>
        )}

        {retiradas.length === 0 ? (
          <div className="rounded-3xl border border-gray-300 p-14 text-center">
            <p className="text-3xl font-bold">
              Nenhum cliente aguardando
            </p>

            <p className="mt-3 text-lg text-gray-500">
              Assim que um cliente fizer check-in no totem, ele aparecerá automaticamente aqui.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {retiradas.map(
              (retirada, index) => {
                const pedido =
                  retirada.pedidos;

                const unidade =
                  retirada.unidades;

                const ponto =
                  retirada.pontos_retirada;

                return (
                  <div
                    key={retirada.id}
                    className="rounded-3xl border-2 border-gray-300 p-6"
                  >
                    <div className="flex flex-col justify-between gap-6 md:flex-row md:items-center">
                      <div>
                        <div className="flex flex-wrap items-center gap-3">
                          <span className="rounded-full bg-black px-4 py-2 text-sm font-bold text-white">
                            Fila #{index + 1}
                          </span>

                          <h2 className="text-3xl font-bold">
                            Pedido nº{" "}
                            {pedido?.numero_pedido ?? "-"}
                          </h2>
                        </div>

                        <p className="mt-3 text-base font-semibold text-gray-600">
                          Retirada {retirada.sequencia}
                        </p>

                        <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
                          <div>
                            <p className="text-sm text-gray-500">
                              Unidade
                            </p>
                            <p className="font-bold">
                              {unidade?.nome ?? "-"}
                            </p>
                          </div>

                          <div>
                            <p className="text-sm text-gray-500">
                              Ponto
                            </p>
                            <p className="font-bold">
                              {ponto?.nome ?? "-"}
                            </p>
                          </div>

                          <div>
                            <p className="text-sm text-gray-500">
                              Check-in
                            </p>
                            <p className="font-bold">
                              {formatarHora(retirada.checkin_em)}
                            </p>
                          </div>

                          <div>
                            <p className="text-sm text-gray-500">
                              Espera
                            </p>
                            <p className="font-bold">
                              {calcularTempoEspera(retirada.checkin_em)}
                            </p>
                          </div>

                          <div>
                            <p className="text-sm text-gray-500">
                              Total do pedido
                            </p>
                            <p className="font-bold">
                              {pedido
                                ? formatarValor(pedido.total)
                                : "-"}
                            </p>
                          </div>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() =>
                          router.push(
                            `/admin/retiradas/${retirada.id}`
                          )
                        }
                        className="rounded-2xl bg-black px-8 py-5 text-lg font-semibold text-white"
                      >
                        Atender retirada
                      </button>
                    </div>
                  </div>
                );
              }
            )}
          </div>
        )}

        <div className="mt-8">
          <button
            type="button"
            onClick={carregarFila}
            className="w-full rounded-xl border border-gray-300 p-4 font-semibold"
          >
            Atualizar agora
          </button>
        </div>
      </div>
    </main>
  );
}
