"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export default function NovaSenhaPage() {
  const [senha, setSenha] = useState("");
  const [confirmarSenha, setConfirmarSenha] = useState("");
  const [mensagem, setMensagem] = useState("");
  const [carregando, setCarregando] = useState(false);

  useEffect(() => {
    async function verificarSessao() {
      const { data, error } = await supabase.auth.getSession();

      if (error) {
        console.log("Erro ao verificar sessão:", error.message);
        return;
      }

      if (data.session) {
        console.log("Sessão encontrada.");
      } else {
        console.log("Sessão: null");
      }
    }

    verificarSessao();
  }, []);

  async function alterarSenha() {
    setMensagem("");

    if (senha.length < 6) {
      setMensagem("A senha precisa ter pelo menos 6 caracteres.");
      return;
    }

    if (senha !== confirmarSenha) {
      setMensagem("As senhas não conferem.");
      return;
    }

    setCarregando(true);

    const { error } = await supabase.auth.updateUser({
      password: senha,
    });

    if (error) {
      setMensagem(`Erro: ${error.message}`);
    } else {
      setMensagem("Senha alterada com sucesso.");
    }

    setCarregando(false);
  }

  return (
    <main className="min-h-screen bg-white p-10 text-black">
      <div className="mx-auto max-w-md">
        <h1 className="mb-6 text-3xl font-bold">
          Criar nova senha
        </h1>

        <div className="space-y-4">
          <input
            type="password"
            placeholder="Nova senha"
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
            className="w-full rounded-lg border border-gray-300 p-3"
          />

          <input
            type="password"
            placeholder="Confirmar nova senha"
            value={confirmarSenha}
            onChange={(e) => setConfirmarSenha(e.target.value)}
            className="w-full rounded-lg border border-gray-300 p-3"
          />

          <button
            onClick={alterarSenha}
            disabled={carregando}
            className="w-full rounded-lg bg-black p-3 font-semibold text-white"
          >
            {carregando ? "Alterando..." : "Alterar senha"}
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