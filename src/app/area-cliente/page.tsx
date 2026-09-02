"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

type Perfil = {
  id: string;
  user_id: string;
  nome: string | null;
  telefone: string | null;
};

export default function AreaClientePage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [userId, setUserId] = useState("");
  const [perfil, setPerfil] = useState<Perfil | null>(null);

  const [nome, setNome] = useState("");
  const [telefone, setTelefone] = useState("");

  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [mensagem, setMensagem] = useState("");

  useEffect(() => {
    async function carregarDados() {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        router.push("/login");
        return;
      }

      setEmail(user.email ?? "");
      setUserId(user.id);

      const { data, error } = await supabase
        .from("perfil_cliente")
        .select("id, user_id, nome, telefone")
        .eq("user_id", user.id)
        .maybeSingle();

      if (error) {
        setMensagem(`Erro ao carregar perfil: ${error.message}`);
        setCarregando(false);
        return;
      }

      if (data) {
        setPerfil(data);
        setNome(data.nome ?? "");
        setTelefone(data.telefone ?? "");
      }

      setCarregando(false);
    }

    carregarDados();
  }, [router]);

  async function salvarPerfil() {
    setMensagem("");

    if (!nome.trim()) {
      setMensagem("Informe o nome.");
      return;
    }

    setSalvando(true);

    if (perfil) {
      const { data, error } = await supabase
        .from("perfil_cliente")
        .update({
          nome: nome.trim(),
          telefone: telefone.trim(),
        })
        .eq("user_id", userId)
        .select("id, user_id, nome, telefone")
        .single();

      if (error) {
        setMensagem(`Erro ao atualizar perfil: ${error.message}`);
      } else {
        setPerfil(data);
        setMensagem("Perfil atualizado com sucesso.");
      }
    } else {
      const { data, error } = await supabase
        .from("perfil_cliente")
        .insert({
          user_id: userId,
          nome: nome.trim(),
          telefone: telefone.trim(),
        })
        .select("id, user_id, nome, telefone")
        .single();

      if (error) {
        setMensagem(`Erro ao criar perfil: ${error.message}`);
      } else {
        setPerfil(data);
        setMensagem("Perfil criado com sucesso.");
      }
    }

    setSalvando(false);
  }

  async function sair() {
    await supabase.auth.signOut();
    router.push("/login");
  }

  if (carregando) {
    return (
      <main className="min-h-screen bg-white p-10 text-black">
        <p>Carregando...</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-white p-10 text-black">
      <div className="mx-auto max-w-md">
        <h1 className="mb-6 text-3xl font-bold">
          Área do cliente
        </h1>

        <div className="space-y-4">
          <div className="rounded-lg border border-gray-300 p-4">
            <p className="text-sm text-gray-500">
              Usuário logado
            </p>

            <p className="font-semibold">
              {email}
            </p>
          </div>

          <input
            type="text"
            placeholder="Nome"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            className="w-full rounded-lg border border-gray-300 p-3"
          />

          <input
            type="text"
            placeholder="Telefone"
            value={telefone}
            onChange={(e) => setTelefone(e.target.value)}
            className="w-full rounded-lg border border-gray-300 p-3"
          />

          <button
            onClick={salvarPerfil}
            disabled={salvando}
            className="w-full rounded-lg bg-black p-3 font-semibold text-white"
          >
            {salvando
              ? "Salvando..."
              : perfil
              ? "Atualizar perfil"
              : "Criar perfil"}
          </button>

          {mensagem && (
            <p className="rounded-lg border border-gray-300 p-3">
              {mensagem}
            </p>
          )}

          <button
            onClick={sair}
            className="w-full rounded-lg border border-gray-300 p-3 font-semibold"
          >
            Sair
          </button>
        </div>
      </div>
    </main>
  );
}