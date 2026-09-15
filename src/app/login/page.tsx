"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { obterDestinoPosLogin } from "@/lib/auth/destino-pos-login";

export default function LoginPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [mensagem, setMensagem] = useState("");
  const [carregando, setCarregando] = useState(false);

  async function entrar() {
    if (carregando) {
      return;
    }

    setCarregando(true);
    setMensagem("");

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password: senha,
      });

      if (error) {
        setMensagem(`Erro: ${error.message}`);
        return;
      }

      const userId = data.user?.id;

      if (!userId) {
        await supabase.auth.signOut();
        setMensagem("Não foi possível identificar o usuário autenticado.");
        return;
      }

      const destino = await obterDestinoPosLogin(userId);

      router.replace(destino);
      router.refresh();
    } catch (error) {
      const mensagemErro =
        error instanceof Error
          ? error.message
          : "Não foi possível concluir o login.";

      await supabase.auth.signOut();
      setMensagem(mensagemErro);
    } finally {
      setCarregando(false);
    }
  }

  function tratarEnter(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      void entrar();
    }
  }

  return (
    <main className="min-h-screen bg-white p-10 text-black">
      <div className="mx-auto max-w-md">
        <h1 className="mb-6 text-3xl font-bold">
          Entrar
        </h1>

        <div className="space-y-4">
          <input
            type="email"
            placeholder="Seu e-mail"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={tratarEnter}
            autoComplete="email"
            className="w-full rounded-lg border border-gray-300 p-3"
          />

          <input
            type="password"
            placeholder="Sua senha"
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
            onKeyDown={tratarEnter}
            autoComplete="current-password"
            className="w-full rounded-lg border border-gray-300 p-3"
          />

          <button
            onClick={() => void entrar()}
            disabled={carregando}
            className="w-full rounded-lg bg-black p-3 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
          >
            {carregando ? "Entrando..." : "Entrar"}
          </button>

          <button
            onClick={() => router.push("/recuperar-senha")}
            className="w-full text-sm underline"
          >
            Esqueci minha senha
          </button>

          <button
            onClick={() => router.push("/cadastro")}
            className="w-full text-sm underline"
          >
            Criar conta
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
