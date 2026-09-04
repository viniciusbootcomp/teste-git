"use client";

import {
  useCallback,
  useEffect,
  useState,
} from "react";

import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

type PedidoFila = {
  id: string;
  numero_pedido: number;
  checkin_em: string;
  status: string;
  total: number;
};

export default function FilaRetiradaPage() {
  const router = useRouter();

  const [pedidos, setPedidos] = useState<PedidoFila[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [mensagem, setMensagem] = useState("");

  /*
   * Guardamos o horário atual em um state.
   *
   * Isso evita chamar Date.now() diretamente durante
   * o render, coisa que o React 19 / Next 16 reclama.
   */
  const [agora, setAgora] = useState<number | null>(null);

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
      .from("pedidos")
      .select(
        "id, numero_pedido, checkin_em, status, total"
      )
      .eq("status", "cliente_no_local")
      .not("checkin_em", "is", null)
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

    setPedidos((data ?? []) as PedidoFila[]);
    setMensagem("");
    setCarregando(false);
  }, [router]);

  useEffect(() => {
    /*
     * Fazemos a primeira carga de forma assíncrona.
     * Isso evita o erro:
     *
     * "Calling setState synchronously within an effect"
     */
    const primeiraCarga = window.setTimeout(() => {
      carregarFila();
      setAgora(new Date().getTime());
    }, 0);

    /*
     * A cada 5 segundos:
     *
     * 1. atualiza a fila;
     * 2. atualiza o relógio usado para calcular
     *    o tempo de espera.
     */
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
    return new Date(data).toLocaleTimeString("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
    });
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

    if (horas === 1 && minutosRestantes === 0) {
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
        <p>Carregando fila de retirada...</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-white p-10 text-black">
      <div className="mx-auto max-w-5xl">
        <div className="mb-8 flex flex-col justify-between gap-4 md:flex-row md:items-end">
          <div>
            <p className="text-sm font-semibold uppercase tracking-widest text-gray-500">
              O Box Driver
            </p>

            <h1 className="mt-2 text-3xl font-bold">
              Clientes aguardando retirada
            </h1>

            <p className="mt-2 text-gray-500">
              Ordem de chegada no ponto de retirada.
            </p>
          </div>

          <div className="rounded-xl border border-gray-300 px-5 py-3">
            <p className="text-sm text-gray-500">
              Aguardando
            </p>

            <p className="text-3xl font-bold">
              {pedidos.length}
            </p>
          </div>
        </div>

        {mensagem && (
          <div className="mb-6 rounded-lg border border-red-300 bg-red-50 p-4">
            {mensagem}
          </div>
        )}

        {pedidos.length === 0 ? (
          <div className="rounded-2xl border border-gray-300 p-10 text-center">
            <p className="text-2xl font-bold">
              Nenhum cliente aguardando
            </p>

            <p className="mt-2 text-gray-500">
              Novos check-ins aparecerão automaticamente aqui.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {pedidos.map((pedido, index) => (
              <div
                key={pedido.id}
                className="rounded-2xl border border-gray-300 p-6"
              >
                <div className="flex flex-col justify-between gap-5 md:flex-row md:items-center">
                  <div>
                    <div className="flex items-center gap-3">
                      <span className="rounded-full border border-gray-300 px-3 py-1 text-sm font-semibold">
                        #{index + 1}
                      </span>

                      <h2 className="text-2xl font-bold">
                        Pedido nº {pedido.numero_pedido}
                      </h2>
                    </div>

                    <div className="mt-4 flex flex-wrap gap-x-8 gap-y-2 text-sm">
                      <p>
                        <span className="text-gray-500">
                          Check-in:
                        </span>{" "}
                        <strong>
                          {formatarHora(
                            pedido.checkin_em
                          )}
                        </strong>
                      </p>

                      <p>
                        <span className="text-gray-500">
                          Espera:
                        </span>{" "}
                        <strong>
                          {calcularTempoEspera(
                            pedido.checkin_em
                          )}
                        </strong>
                      </p>

                      <p>
                        <span className="text-gray-500">
                          Total:
                        </span>{" "}
                        <strong>
                          {formatarValor(
                            pedido.total
                          )}
                        </strong>
                      </p>
                    </div>
                  </div>

                  <button
                    onClick={() =>
                      router.push(
                        `/admin/pedidos/${pedido.numero_pedido}`
                      )
                    }
                    className="rounded-xl bg-black px-6 py-4 font-semibold text-white"
                  >
                    Abrir pedido
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <button
            onClick={carregarFila}
            className="w-full rounded-lg border border-gray-300 p-3 font-semibold"
          >
            Atualizar agora
          </button>

          <button
            onClick={() =>
              router.push("/admin/pedidos")
            }
            className="w-full rounded-lg border border-gray-300 p-3 font-semibold"
          >
            Todos os pedidos
          </button>
        </div>

        <p className="mt-5 text-center text-sm text-gray-400">
          Atualização automática a cada 5 segundos
        </p>
      </div>
    </main>
  );
}