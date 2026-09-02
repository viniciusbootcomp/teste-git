"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

export default function AreaClientePage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    async function verificarUsuario() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.push("/login");
        return;
      }

      setEmail(user.email ?? "");
      setCarregando(false);
    }

    verificarUsuario();
  }, [router]);

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

          <button
            onClick={sair}
            className="w-full rounded-lg bg-black p-3 font-semibold text-white"
          >
            Sair
          </button>
        </div>
      </div>
    </main>
  );
}