"use client";

import {
  useState,
} from "react";

import { supabase } from "@/lib/supabase";

type ResultadoPix = {
  sucesso: boolean;

  mensagem?: string;

  valor?: number;

  order_id?: string;

  payment_id?: string;

  status?: string;

  status_detail?: string;

  qr_code?: string;

  qr_code_base64?: string;

  ticket_url?: string;

  detalhe?: unknown;
};

export default function TestePixPage() {
  const [
    reservaId,
    setReservaId,
  ] = useState("");

  const [
    processando,
    setProcessando,
  ] = useState(false);

  const [
    resultado,
    setResultado,
  ] =
    useState<ResultadoPix | null>(
      null
    );

  async function criarPix() {
    setResultado(
      null
    );

    const id =
      reservaId.trim();

    if (!id) {
      setResultado({
        sucesso: false,
        mensagem:
          "Informe o ID da reserva.",
      });

      return;
    }

    setProcessando(
      true
    );

    const {
      data: sessionData,
      error: sessionError,
    } =
      await supabase.auth.getSession();

    if (
      sessionError ||
      !sessionData.session
    ) {
      setResultado({
        sucesso: false,
        mensagem:
          "Usuário não autenticado.",
      });

      setProcessando(
        false
      );

      return;
    }

    try {
      const resposta =
        await fetch(
          "/api/mercado-pago/pix",
          {
            method:
              "POST",

            headers: {
              "Content-Type":
                "application/json",

              Authorization:
                `Bearer ${sessionData.session.access_token}`,
            },

            body:
              JSON.stringify({
                reserva_id:
                  id,
              }),
          }
        );

      const dados =
        (await resposta.json()) as ResultadoPix;

      setResultado(
        dados
      );
    } catch {
      setResultado({
        sucesso: false,
        mensagem:
          "Erro de comunicação com o servidor.",
      });
    } finally {
      setProcessando(
        false
      );
    }
  }

  return (
    <main className="min-h-screen bg-white p-10 text-black">
      <div className="mx-auto max-w-3xl">
        <h1 className="text-3xl font-bold">
          Primeiro PIX Mercado Pago
        </h1>

        <p className="mt-2 text-gray-500">
          Laboratório O Box Driver
        </p>

        <div className="mt-8 rounded-xl border border-gray-300 p-6">
          <label className="font-semibold">
            ID da reserva
          </label>

          <input
            type="text"
            value={
              reservaId
            }
            onChange={(
              event
            ) =>
              setReservaId(
                event.target
                  .value
              )
            }
            placeholder="UUID da reserva"
            className="mt-3 w-full rounded-lg border border-gray-300 p-3"
          />

          <button
            type="button"
            onClick={
              criarPix
            }
            disabled={
              processando
            }
            className="mt-5 w-full rounded-lg bg-black p-4 font-semibold text-white disabled:bg-gray-400"
          >
            {processando
              ? "Criando PIX..."
              : "Criar PIX no Mercado Pago"}
          </button>
        </div>

        {resultado && (
          <div className="mt-8 rounded-xl border border-gray-300 p-6">
            <p className="font-bold">
              {resultado.sucesso
                ? "PIX criado!"
                : "Não foi possível criar o PIX"}
            </p>

            {resultado.mensagem && (
              <p className="mt-3">
                {
                  resultado.mensagem
                }
              </p>
            )}

            {resultado.valor !==
              undefined && (
              <p className="mt-3">
                Valor:{" "}
                <strong>
                  {Number(
                    resultado.valor
                  ).toLocaleString(
                    "pt-BR",
                    {
                      style:
                        "currency",
                      currency:
                        "BRL",
                    }
                  )}
                </strong>
              </p>
            )}

            {resultado.order_id && (
              <p className="mt-3 break-all text-sm">
                Order:{" "}
                {
                  resultado.order_id
                }
              </p>
            )}

            {resultado.payment_id && (
              <p className="mt-2 break-all text-sm">
                Payment:{" "}
                {
                  resultado.payment_id
                }
              </p>
            )}

            {resultado.status && (
              <p className="mt-2">
                Status:{" "}
                <strong>
                  {
                    resultado.status
                  }
                </strong>
              </p>
            )}

            {resultado.status_detail && (
              <p className="mt-2">
                Detalhe:{" "}
                <strong>
                  {
                    resultado.status_detail
                  }
                </strong>
              </p>
            )}

            {resultado.qr_code_base64 && (
              <div className="mt-6">
                <p className="mb-3 font-semibold">
                  QR Code
                </p>

                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`data:image/png;base64,${resultado.qr_code_base64}`}
                  alt="QR Code PIX"
                  className="mx-auto max-w-72"
                />
              </div>
            )}

            {resultado.qr_code && (
              <div className="mt-6">
                <p className="mb-2 font-semibold">
                  PIX Copia e Cola
                </p>

                <textarea
                  readOnly
                  value={
                    resultado.qr_code
                  }
                  className="h-32 w-full rounded-lg border border-gray-300 p-3 text-xs"
                />
              </div>
            )}

            {resultado.ticket_url && (
              <a
                href={
                  resultado.ticket_url
                }
                target="_blank"
                rel="noreferrer"
                className="mt-5 block rounded-lg border border-gray-300 p-3 text-center font-semibold"
              >
                Abrir página PIX do Mercado Pago
              </a>
            )}
          </div>
        )}
      </div>
    </main>
  );
}