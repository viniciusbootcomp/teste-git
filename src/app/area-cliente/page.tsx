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

type Pedido = {
  id: string;
  numero_pedido: number;
  created_at: string;
  status: string;
  total: number;
};

export default function AreaClientePage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [userId, setUserId] = useState("");

  const [perfil, setPerfil] = useState<Perfil | null>(null);
  const [pedidos, setPedidos] = useState<Pedido[]>([]);

  const [nome, setNome] = useState("");
  const [telefone, setTelefone] = useState("");

  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [mensagem, setMensagem] = useState("");

  useEffect(() => {
    const carregarDados = window.setTimeout(async () => {
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

      const { data: perfilData, error: perfilError } =
        await supabase
          .from("perfil_cliente")
          .select("id, user_id, nome, telefone")
          .eq("user_id", user.id)
          .maybeSingle();

      if (perfilError) {
        setMensagem(
          `Erro ao carregar perfil: ${perfilError.message}`
        );
      }

      if (perfilData) {
        setPerfil(perfilData);
        setNome(perfilData.nome ?? "");
        setTelefone(perfilData.telefone ?? "");
      }

      const { data: pedidosData, error: pedidosError } =
        await supabase
          .from("pedidos")
          .select(
            "id, numero_pedido, created_at, status, total"
          )
          .eq("user_id", user.id)
          .order("numero_pedido", {
            ascending: false,
          });

      if (pedidosError) {
        setMensagem(
          `Erro ao carregar pedidos: ${pedidosError.message}`
        );
      }

      if (pedidosData) {
        setPedidos(pedidosData);
      }

      setCarregando(false);
    }, 0);

    return () => {
      window.clearTimeout(carregarDados);
    };
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
        setMensagem(
          `Erro ao atualizar perfil: ${error.message}`
        );
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
        setMensagem(
          `Erro ao criar perfil: ${error.message}`
        );
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

  function formatarData(data: string) {
    return new Date(data).toLocaleString("pt-BR");
  }

  function formatarValor(valor: number) {
    return Number(valor).toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL",
    });
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
      <div className="mx-auto max-w-4xl">
        <h1 className="mb-8 text-3xl font-bold">
          Área do cliente
        </h1>

        <div className="grid gap-8 md:grid-cols-2">
          <div>
            <h2 className="mb-4 text-xl font-bold">
              Meu perfil
            </h2>

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
                onChange={(e) =>
                  setNome(e.target.value)
                }
                className="w-full rounded-lg border border-gray-300 p-3"
              />

              <input
                type="text"
                placeholder="Telefone"
                value={telefone}
                onChange={(e) =>
                  setTelefone(e.target.value)
                }
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

          <div>
            <h2 className="mb-4 text-xl font-bold">
              Meus pedidos
            </h2>

            {pedidos.length === 0 ? (
              <div className="rounded-lg border border-gray-300 p-4">
                <p>Você ainda não possui pedidos.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {pedidos.map((pedido) => (
                  <div
                    key={pedido.id}
                    className="rounded-xl border border-gray-300 p-5"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-xl font-bold">
                          Pedido nº{" "}
                          {pedido.numero_pedido}
                        </p>

                        <p className="mt-1 text-sm text-gray-500">
                          {formatarData(
                            pedido.created_at
                          )}
                        </p>
                      </div>

                      <span className="rounded-full border border-gray-300 px-3 py-1 text-sm font-semibold">
                        {pedido.status}
                      </span>
                    </div>

                    <p className="mt-4 text-2xl font-bold">
                      {formatarValor(pedido.total)}
                    </p>

                    <button
                      onClick={() =>
                        router.push(
                          `/pedido/${pedido.numero_pedido}`
                        )
                      }
                      className="mt-4 w-full rounded-lg border border-gray-300 p-3 font-semibold"
                    >
                      Ver pedido
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}