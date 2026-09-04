"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import { useRouter } from "next/navigation";

type RetornoCheckin = {
  sucesso: boolean;
  pedido: number;
  status: string;
  terminal: string;
  ponto_retirada: string;
  instrucao_cliente: string;
};

export default function TotemPage() {
  const router = useRouter();

  const qrContainerId =
    "obox-qr-reader";

  const leitorRef = useRef<{
    stop: () => Promise<void>;
    clear: () => Promise<void> | void;
  } | null>(null);

  const processandoRef =
    useRef(false);

  const timerRef =
    useRef<number | null>(null);

  const [carregando, setCarregando] =
    useState(true);

  const [cameraAtiva, setCameraAtiva] =
    useState(false);

  const [processando, setProcessando] =
    useState(false);

  const [erro, setErro] =
    useState("");

  const [checkin, setCheckin] =
    useState<RetornoCheckin | null>(
      null
    );

  function limparTimer() {
    if (timerRef.current !== null) {
      window.clearTimeout(
        timerRef.current
      );

      timerRef.current = null;
    }
  }

  const pararCamera =
    useCallback(async () => {
      const leitor =
        leitorRef.current;

      if (!leitor) {
        return;
      }

      try {
        await leitor.stop();
      } catch {
        // Pode já estar parada.
      }

      try {
        await leitor.clear();
      } catch {
        // Pode já estar limpa.
      }

      leitorRef.current = null;
      setCameraAtiva(false);
    }, []);

  const registrarCheckin =
    useCallback(
      async (textoLido: string) => {
        const token =
          textoLido.trim();

        if (!token) {
          processandoRef.current =
            false;
          return;
        }

        setErro("");
        setProcessando(true);

        await pararCamera();

        try {
          const resposta =
            await fetch(
              "/api/totem/checkin",
              {
                method: "POST",
                headers: {
                  "Content-Type":
                    "application/json",
                },
                body: JSON.stringify({
                  token_retirada:
                    token,
                }),
              }
            );

          const retorno =
            await resposta.json();

          if (
            resposta.status === 401
          ) {
            router.replace(
              "/totem/ativar"
            );
            return;
          }

          if (!resposta.ok) {
            setErro(
              retorno.erro ??
                "Não foi possível realizar o check-in."
            );

            setProcessando(false);

            timerRef.current =
              window.setTimeout(
                () => {
                  window.location.reload();
                },
                4000
              );

            return;
          }

          setCheckin(
            retorno as RetornoCheckin
          );

          setProcessando(false);

          timerRef.current =
            window.setTimeout(
              () => {
                window.location.reload();
              },
              10000
            );
        } catch {
          setErro(
            "Erro de comunicação com o servidor."
          );

          setProcessando(false);

          timerRef.current =
            window.setTimeout(
              () => {
                window.location.reload();
              },
              4000
            );
        }
      },
      [pararCamera, router]
    );

  const iniciarCamera =
    useCallback(async () => {
      if (leitorRef.current) {
        return;
      }

      setErro("");

      try {
        const { Html5Qrcode } =
          await import(
            "html5-qrcode"
          );

        const leitor =
          new Html5Qrcode(
            qrContainerId
          );

        leitorRef.current =
          leitor;

        await leitor.start(
          {
            facingMode:
              "environment",
          },
          {
            fps: 10,
            qrbox: {
              width: 250,
              height: 250,
            },
          },
          async (textoLido) => {
            if (
              processandoRef.current
            ) {
              return;
            }

            processandoRef.current =
              true;

            await registrarCheckin(
              textoLido
            );
          },
          () => {
            // Enquanto procura um QR,
            // falhas de leitura são normais.
          }
        );

        setCameraAtiva(true);
      } catch (error) {
        const texto =
          error instanceof Error
            ? error.message
            : String(error);

        leitorRef.current = null;

        setCameraAtiva(false);

        setErro(
          `Não foi possível iniciar a câmera: ${texto}`
        );
      }
    }, [registrarCheckin]);

  useEffect(() => {
    const inicializar =
      window.setTimeout(
        async () => {
          try {
            const resposta =
              await fetch(
                "/api/totem/ativar",
                {
                  method: "GET",
                }
              );

            if (!resposta.ok) {
              router.replace(
                "/totem/ativar"
              );
              return;
            }

            setCarregando(false);

            window.setTimeout(
              () => {
                iniciarCamera();
              },
              300
            );
          } catch {
            setErro(
              "Não foi possível verificar o terminal."
            );

            setCarregando(false);
          }
        },
        0
      );

    return () => {
      window.clearTimeout(
        inicializar
      );

      limparTimer();

      const leitor =
        leitorRef.current;

      if (leitor) {
        leitor.stop().catch(() => {});
      }
    };
  }, [iniciarCamera, router]);

  if (carregando) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-white p-6 text-black">
        <p className="text-xl">
          Iniciando O Box Driver...
        </p>
      </main>
    );
  }

  if (checkin) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-white p-6 text-black">
        <div className="w-full max-w-3xl">
          <div className="rounded-3xl border-2 border-green-400 bg-green-50 p-8 text-center">
            <p className="text-lg font-semibold text-green-700">
              Check-in realizado
            </p>

            <h1 className="mt-3 text-4xl font-bold">
              Pedido nº{" "}
              {checkin.pedido}
            </h1>

            <p className="mt-5 text-xl">
              Seu pedido está pronto
              para retirada.
            </p>

            <div className="mt-8 rounded-2xl border border-green-300 bg-white p-8">
              <p className="text-sm text-gray-500">
                Local de retirada
              </p>

              <p className="mt-2 text-4xl font-bold">
                {
                  checkin.ponto_retirada
                }
              </p>

              <p className="mt-6 text-2xl font-semibold">
                {
                  checkin.instrucao_cliente
                }
              </p>
            </div>

            <p className="mt-8 text-sm text-gray-500">
              Em instantes esta tela estará
              pronta para o próximo cliente.
            </p>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-white p-6 text-black">
      <div className="w-full max-w-3xl">
        <div className="text-center">
          <p className="text-sm font-semibold uppercase tracking-widest text-gray-500">
            O Box Driver
          </p>

          <h1 className="mt-3 text-4xl font-bold">
            Retire seu pedido
          </h1>

          <p className="mt-4 text-xl text-gray-600">
            Aponte o QR Code do seu
            pedido para a câmera.
          </p>
        </div>

        <div className="mt-10 rounded-3xl border-2 border-black p-6">
          <p className="text-center text-xl font-bold">
            Aguardando leitura
          </p>

          <div
            id={qrContainerId}
            className="mx-auto mt-6 max-w-md overflow-hidden rounded-2xl"
          />

          {!cameraAtiva &&
            !processando &&
            !erro && (
              <p className="mt-5 text-center text-gray-500">
                Iniciando câmera...
              </p>
            )}

          {processando && (
            <p className="mt-5 text-center text-lg font-semibold">
              Identificando seu pedido...
            </p>
          )}

          {erro && (
            <div className="mt-6 rounded-xl border border-red-300 bg-red-50 p-5 text-center">
              <p className="font-semibold">
                Não foi possível
                realizar a leitura.
              </p>

              <p className="mt-2 text-sm">
                {erro}
              </p>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}