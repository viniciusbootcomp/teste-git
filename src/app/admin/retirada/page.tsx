"use client";

import {
  useEffect,
  useRef,
  useState,
} from "react";

import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

type RetornoCheckin = {
  sucesso: boolean;
  pedido: number;
  status: string;
  terminal: string;
  ponto_retirada: string;
  instrucao_cliente: string;
};

export default function AdminRetiradaPage() {
  const router = useRouter();

  const qrContainerId = "reader";

  const html5QrCodeRef = useRef<{
    stop: () => Promise<void>;
    clear: () => Promise<void> | void;
  } | null>(null);

  const processandoRef = useRef(false);
  const timerResetRef = useRef<number | null>(null);

  const [carregando, setCarregando] = useState(true);
  const [cameraAtiva, setCameraAtiva] = useState(false);
  const [processando, setProcessando] = useState(false);

  const [erro, setErro] = useState("");
  const [checkin, setCheckin] =
    useState<RetornoCheckin | null>(null);

  const terminalIdentificador = "TOTEM-01";

  function limparTimerReset() {
    if (timerResetRef.current !== null) {
      window.clearTimeout(timerResetRef.current);
      timerResetRef.current = null;
    }
  }

  async function pararCamera() {
    const leitor = html5QrCodeRef.current;

    if (!leitor) {
      return;
    }

    try {
      await leitor.stop();
    } catch {
      // A câmera pode já estar parada.
    }

    try {
      await leitor.clear();
    } catch {
      // Ignora caso o leitor já tenha sido limpo.
    }

    html5QrCodeRef.current = null;
    setCameraAtiva(false);
  }

  async function iniciarCamera() {
    setErro("");

    try {
      const { Html5Qrcode } = await import(
        "html5-qrcode"
      );

      if (html5QrCodeRef.current) {
        return;
      }

      const leitor = new Html5Qrcode(
        qrContainerId
      );

      html5QrCodeRef.current = leitor;

      await leitor.start(
        {
          facingMode: "environment",
        },
        {
          fps: 10,
          qrbox: {
            width: 250,
            height: 250,
          },
        },
        async (textoLido) => {
          if (processandoRef.current) {
            return;
          }

          processandoRef.current = true;

          await registrarCheckin(textoLido);
        },
        () => {
          // Leituras inválidas durante a busca
          // são normais e não precisam ser exibidas.
        }
      );

      setCameraAtiva(true);
    } catch (error) {
      const mensagem =
        error instanceof Error
          ? error.message
          : String(error);

      setErro(
        `Não foi possível iniciar a câmera: ${mensagem}`
      );

      html5QrCodeRef.current = null;
      setCameraAtiva(false);
    }
  }

  async function voltarParaEspera() {
    limparTimerReset();

    setErro("");
    setCheckin(null);
    setProcessando(false);

    processandoRef.current = false;

    await iniciarCamera();
  }

  function agendarRetornoParaEspera(
    tempo: number
  ) {
    limparTimerReset();

    timerResetRef.current = window.setTimeout(() => {
      voltarParaEspera();
    }, tempo);
  }

  async function registrarCheckin(
    tokenInformado: string
  ) {
    const token = tokenInformado.trim();

    if (!token) {
      processandoRef.current = false;
      return;
    }

    setErro("");
    setCheckin(null);
    setProcessando(true);

    await pararCamera();

    const { data, error } = await supabase.rpc(
      "registrar_checkin_retirada",
      {
        p_token_retirada: token,
        p_terminal_identificador:
          terminalIdentificador,
      }
    );

    if (error) {
      setErro(
        `Não foi possível realizar o check-in: ${error.message}`
      );

      setProcessando(false);

      agendarRetornoParaEspera(4000);
      return;
    }

    const retorno = data as RetornoCheckin;

    setCheckin(retorno);
    setProcessando(false);

    agendarRetornoParaEspera(10000);
  }

  useEffect(() => {
    const validarAcesso = window.setTimeout(
      async () => {
        const {
          data: { user },
          error: userError,
        } = await supabase.auth.getUser();

        if (userError || !user) {
          router.push("/login");
          return;
        }

        const {
          data: perfil,
          error: perfilError,
        } = await supabase
          .from("perfil_cliente")
          .select("tipo_usuario")
          .eq("user_id", user.id)
          .maybeSingle();

        if (perfilError) {
          setErro(
            `Erro ao verificar acesso: ${perfilError.message}`
          );

          setCarregando(false);
          return;
        }

        if (
          !perfil ||
          perfil.tipo_usuario !== "admin"
        ) {
          router.push("/area-cliente");
          return;
        }

        setCarregando(false);

        window.setTimeout(() => {
          iniciarCamera();
        }, 200);
      },
      0
    );

    return () => {
      window.clearTimeout(validarAcesso);
      limparTimerReset();

      const leitor = html5QrCodeRef.current;

      if (leitor) {
        leitor.stop().catch(() => {});
      }
    };
  }, [router]);

  if (carregando) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-white p-10 text-black">
        <p className="text-xl">
          Carregando terminal...
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
              Pedido nº {checkin.pedido}
            </h1>

            <p className="mt-6 text-xl">
              Seu pedido está pronto para retirada.
            </p>

            <div className="mt-8 rounded-2xl border border-green-300 bg-white p-8">
              <p className="text-sm text-gray-500">
                Local de retirada
              </p>

              <p className="mt-2 text-3xl font-bold">
                {checkin.ponto_retirada}
              </p>

              <p className="mt-5 text-2xl font-semibold">
                {checkin.instrucao_cliente}
              </p>
            </div>

            <p className="mt-8 text-sm text-gray-500">
              Esta tela voltará automaticamente
              para o próximo atendimento.
            </p>

            <button
              onClick={voltarParaEspera}
              className="mt-6 rounded-xl border border-gray-300 bg-white px-6 py-3 font-semibold"
            >
              Finalizar
            </button>
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
            Aponte o QR Code do seu pedido
            para a câmera.
          </p>
        </div>

        <div className="mt-10 rounded-3xl border-2 border-black p-6">
          <div className="text-center">
            <p className="text-xl font-bold">
              Aguardando leitura
            </p>

            <p className="mt-2 text-gray-500">
              Posicione o QR Code dentro
              da área da câmera.
            </p>
          </div>

          <div
            id={qrContainerId}
            className="mx-auto mt-6 max-w-md overflow-hidden rounded-2xl"
          />

          {processando && (
            <p className="mt-5 text-center text-lg font-semibold">
              Identificando seu pedido...
            </p>
          )}

          {!cameraAtiva &&
            !processando &&
            !erro && (
              <p className="mt-5 text-center text-gray-500">
                Iniciando câmera...
              </p>
            )}

          {erro && (
            <div className="mt-6 rounded-xl border border-red-300 bg-red-50 p-5 text-center">
              <p className="font-semibold">
                Não foi possível realizar a leitura.
              </p>

              <p className="mt-2 text-sm">
                {erro}
              </p>

              <p className="mt-3 text-sm text-gray-500">
                A tela tentará novamente automaticamente.
              </p>
            </div>
          )}
        </div>

        <p className="mt-6 text-center text-sm text-gray-400">
          Terminal: {terminalIdentificador}
        </p>
      </div>
    </main>
  );
}