"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

type Notificacao = {
  id: string;
  created_at: string;
  titulo: string;
  mensagem: string;
  tipo: string;
  link: string | null;
  lida: boolean;
};

export default function NotificacoesSino() {
  const router = useRouter();
  const painelRef = useRef<HTMLDivElement | null>(null);

  const [autenticado, setAutenticado] = useState(false);
  const [aberto, setAberto] = useState(false);
  const [notificacoes, setNotificacoes] = useState<Notificacao[]>([]);
  const [naoLidas, setNaoLidas] = useState(0);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState("");

  async function obterToken() {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session?.access_token) {
      setAutenticado(false);
      return null;
    }

    setAutenticado(true);
    return session.access_token;
  }

  async function carregarNotificacoes(
    silencioso = false
  ) {
    const token = await obterToken();

    if (!token) {
      setNotificacoes([]);
      setNaoLidas(0);
      return;
    }

    if (!silencioso) {
      setCarregando(true);
    }

    setErro("");

    try {
      const response = await fetch(
        "/api/notificacoes?limite=20",
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
          cache: "no-store",
        }
      );

      const json = await response.json();

      if (!response.ok) {
        throw new Error(
          json.erro ??
            "Não foi possível carregar as notificações."
        );
      }

      setNotificacoes(
        (json.notificacoes ?? []) as Notificacao[]
      );
      setNaoLidas(Number(json.nao_lidas ?? 0));
    } catch (error) {
      setErro(
        error instanceof Error
          ? error.message
          : "Não foi possível carregar as notificações."
      );
    } finally {
      if (!silencioso) {
        setCarregando(false);
      }
    }
  }

  async function marcarComoLida(
    notificacao: Notificacao
  ) {
    if (notificacao.lida) {
      if (notificacao.link) {
        setAberto(false);
        router.push(notificacao.link);
      }
      return;
    }

    const token = await obterToken();

    if (!token) {
      return;
    }

    try {
      const response = await fetch(
        "/api/notificacoes/leitura",
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            notificacao_id: notificacao.id,
          }),
        }
      );

      const json = await response.json();

      if (!response.ok) {
        throw new Error(
          json.erro ??
            "Não foi possível marcar a notificação como lida."
        );
      }

      setNotificacoes((atuais) =>
        atuais.map((item) =>
          item.id === notificacao.id
            ? { ...item, lida: true }
            : item
        )
      );

      setNaoLidas((atual) =>
        Math.max(0, atual - 1)
      );

      if (notificacao.link) {
        setAberto(false);
        router.push(notificacao.link);
      }
    } catch (error) {
      setErro(
        error instanceof Error
          ? error.message
          : "Não foi possível atualizar a notificação."
      );
    }
  }

  async function marcarTodasComoLidas() {
    const token = await obterToken();

    if (!token) {
      return;
    }

    try {
      const response = await fetch(
        "/api/notificacoes/leitura",
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            marcar_todas: true,
          }),
        }
      );

      const json = await response.json();

      if (!response.ok) {
        throw new Error(
          json.erro ??
            "Não foi possível marcar todas como lidas."
        );
      }

      setNotificacoes((atuais) =>
        atuais.map((item) => ({
          ...item,
          lida: true,
        }))
      );

      setNaoLidas(0);
      setErro("");
    } catch (error) {
      setErro(
        error instanceof Error
          ? error.message
          : "Não foi possível atualizar as notificações."
      );
    }
  }

  useEffect(() => {
    const carregarInicial = window.setTimeout(() => {
      void carregarNotificacoes(true);
    }, 0);

    const intervalo = window.setInterval(() => {
      void carregarNotificacoes(true);
    }, 60000);

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        if (!session) {
          setAutenticado(false);
          setNotificacoes([]);
          setNaoLidas(0);
          setAberto(false);
          return;
        }

        setAutenticado(true);

        window.setTimeout(() => {
          void carregarNotificacoes(true);
        }, 0);
      }
    );

    return () => {
      window.clearTimeout(carregarInicial);
      window.clearInterval(intervalo);
      subscription.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    function fecharAoClicarFora(event: MouseEvent) {
      if (
        painelRef.current &&
        !painelRef.current.contains(
          event.target as Node
        )
      ) {
        setAberto(false);
      }
    }

    document.addEventListener(
      "mousedown",
      fecharAoClicarFora
    );

    return () => {
      document.removeEventListener(
        "mousedown",
        fecharAoClicarFora
      );
    };
  }, []);

  function formatarData(data: string) {
    const valor = new Date(data);

    return valor.toLocaleString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  if (!autenticado) {
    return null;
  }

  return (
    <div className="border-b border-gray-200 bg-white">
      <div className="mx-auto flex min-h-14 w-full max-w-7xl items-center justify-between px-6">
        <div className="text-sm font-bold text-black">
          O Box Driver
        </div>

        <div
          ref={painelRef}
          className="relative"
        >
          <button
            type="button"
            aria-label="Notificações"
            onClick={() => {
              setAberto((valor) => !valor);

              if (!aberto) {
                void carregarNotificacoes();
              }
            }}
            className="relative flex h-10 w-10 items-center justify-center rounded-full border border-gray-300 bg-white text-xl hover:bg-gray-50"
          >
            🔔

            {naoLidas > 0 && (
              <span className="absolute -right-1 -top-1 flex min-h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1 text-[11px] font-bold text-white">
                {naoLidas > 99 ? "99+" : naoLidas}
              </span>
            )}
          </button>

          {aberto && (
            <div className="absolute right-0 top-12 z-50 w-[360px] max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border border-gray-200 bg-white shadow-xl">
              <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
                <div>
                  <h2 className="font-bold text-black">
                    Notificações
                  </h2>
                  <p className="text-xs text-gray-500">
                    {naoLidas} não lida
                    {naoLidas === 1 ? "" : "s"}
                  </p>
                </div>

                {naoLidas > 0 && (
                  <button
                    type="button"
                    onClick={() =>
                      void marcarTodasComoLidas()
                    }
                    className="text-xs font-semibold text-black underline"
                  >
                    Marcar todas como lidas
                  </button>
                )}
              </div>

              {erro && (
                <div className="border-b border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {erro}
                </div>
              )}

              <div className="max-h-[420px] overflow-y-auto">
                {carregando ? (
                  <div className="p-6 text-center text-sm text-gray-500">
                    Carregando...
                  </div>
                ) : notificacoes.length === 0 ? (
                  <div className="p-8 text-center text-sm text-gray-500">
                    Nenhuma notificação por enquanto.
                  </div>
                ) : (
                  notificacoes.map(
                    (notificacao) => (
                      <button
                        key={notificacao.id}
                        type="button"
                        onClick={() =>
                          void marcarComoLida(
                            notificacao
                          )
                        }
                        className={`block w-full border-b border-gray-100 px-4 py-4 text-left last:border-b-0 hover:bg-gray-50 ${
                          !notificacao.lida
                            ? "bg-blue-50/60"
                            : "bg-white"
                        }`}
                      >
                        <div className="flex gap-3">
                          <div className="pt-1">
                            <span
                              className={`block h-2.5 w-2.5 rounded-full ${
                                notificacao.lida
                                  ? "bg-gray-300"
                                  : "bg-blue-600"
                              }`}
                            />
                          </div>

                          <div className="min-w-0 flex-1">
                            <div className="font-semibold text-black">
                              {notificacao.titulo}
                            </div>

                            <div className="mt-1 text-sm leading-5 text-gray-600">
                              {notificacao.mensagem}
                            </div>

                            <div className="mt-2 text-xs text-gray-400">
                              {formatarData(
                                notificacao.created_at
                              )}
                            </div>
                          </div>
                        </div>
                      </button>
                    )
                  )
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
