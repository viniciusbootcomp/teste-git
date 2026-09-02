"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";

export default function CadastroPage() {
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [mensagem, setMensagem] = useState("");
  const [carregando, setCarregando] = useState(false);

  async function cadastrar() {
    setCarregando(true);
    setMensagem("");

    const { error } = await supabase.auth.signUp({
      email,
      password: senha,
    });

    if (error) {
      setMensagem(`Erro: ${error.message}`);
    } else {
      setMensagem(
        "Cadastro realizado. Verifique seu e-mail para confirmar a conta."
      );
    }

    setCarregando(false);
  }

  return (
    <main className="min-h-screen bg-white p-10 text-black">
      <div className="mx-auto max-w-md">
        <h1 className="mb-6 text-3xl font-bold">
          Criar conta
        </h1>

        <div className="space-y-4">
          <input
            type="email"
            placeholder="Seu e-mail"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-lg border border-gray-300 p-3"
          />

          <input
            type="password"
            placeholder="Sua senha"
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
            className="w-full rounded-lg border border-gray-300 p-3"
          />

          <button
            onClick={cadastrar}
            disabled={carregando}
            className="w-full rounded-lg bg-black p-3 font-semibold text-white"
          >
            {carregando ? "Cadastrando..." : "Cadastrar"}
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