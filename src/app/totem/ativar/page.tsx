"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

export default function AtivarTotemPage() {
  const router = useRouter();

  const [identificador, setIdentificador] =
    useState("TOTEM-01");

  const [segredo, setSegredo] =
    useState("");

  const [mensagem, setMensagem] =
    useState("");

  const [ativando, setAtivando] =
    useState(false);

  async function ativar(
    event: FormEvent
  ) {
    event.preventDefault();

    setMensagem("");
    setAtivando(true);

    try {
      const resposta = await fetch(
        "/api/totem/ativar",
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            identificador,
            segredo,
          }),
        }
      );

      const retorno =
        await resposta.json();

      if (!resposta.ok) {
        setMensagem(
          retorno.erro ??
            "Não foi possível ativar o terminal."
        );

        setAtivando(false);
        return;
      }

      router.replace("/totem");
    } catch {
      setMensagem(
        "Erro de comunicação com o servidor."
      );

      setAtivando(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-white p-6 text-black">
      <div className="w-full max-w-lg">
        <div className="text-center">
          <p className="text-sm font-semibold uppercase tracking-widest text-gray-500">
            O Box Driver
          </p>

          <h1 className="mt-3 text-3xl font-bold">
            Ativação do terminal
          </h1>

          <p className="mt-3 text-gray-500">
            Esta configuração é necessária
            somente na instalação do equipamento.
          </p>
        </div>

        <form
          onSubmit={ativar}
          className="mt-8 rounded-2xl border border-gray-300 p-6"
        >
          <label className="block font-semibold">
            Terminal
          </label>

          <input
            type="text"
            value={identificador}
            onChange={(e) =>
              setIdentificador(
                e.target.value
              )
            }
            className="mt-2 w-full rounded-lg border border-gray-300 p-4"
          />

          <label className="mt-5 block font-semibold">
            Chave de ativação
          </label>

          <input
            type="password"
            value={segredo}
            onChange={(e) =>
              setSegredo(e.target.value)
            }
            autoComplete="off"
            className="mt-2 w-full rounded-lg border border-gray-300 p-4"
          />

          {mensagem && (
            <div className="mt-5 rounded-lg border border-red-300 bg-red-50 p-4">
              {mensagem}
            </div>
          )}

          <button
            type="submit"
            disabled={ativando}
            className="mt-6 w-full rounded-lg bg-black p-4 font-semibold text-white disabled:bg-gray-400"
          >
            {ativando
              ? "Ativando..."
              : "Ativar terminal"}
          </button>
        </form>
      </div>
    </main>
  );
}