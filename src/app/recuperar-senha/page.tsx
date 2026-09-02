"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";

export default function RecuperarSenhaPage() {
  const [email, setEmail] = useState("");
  const [mensagem, setMensagem] = useState("");
  const [carregando, setCarregando] = useState(false);

  async function recuperarSenha() {
    setCarregando(true);
    setMensagem("");

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: "http://localhost:3000/nova-senha",
    });

    if (error) {
      setMensagem(`Erro: ${error.message}`);
    } else {
      setMensagem(
        "E-mail de recuperação enviado. Verifique sua caixa de entrada."
      );
    }

    setCarregando(false);
  }

  return (
    <main className="min-h-screen bg-white p-10 text-black">
      <div className="mx-auto max-w-md">
        <h1 className="mb-6 text-3xl font-bold">
          Recuperar senha
        </h1>

        <div className="space-y-4">
          <input
            type="email"
            placeholder="Seu e-mail"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-lg border border-gray-300 p-3"
          />

          <button
            onClick={recuperarSenha}
            disabled={carregando}
            className="w-full rounded-lg bg-black p-3 font-semibold text-white"
          >
            {carregando ? "Enviando..." : "Enviar recuperação"}
          </button>

          {mensagem && (
            <p className="rounded-lg border border-gray-300 p-3">
              {mensagem}
            </p>
          )}
        </div>
      </div>
    </main>
  );
}