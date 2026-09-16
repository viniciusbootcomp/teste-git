"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Boxes,
  ClipboardList,
  PackageCheck,
  Truck,
  Users,
  Package,
  Tags,
} from "lucide-react";

import { supabase } from "@/lib/supabase";
import {
  obterAcessoOperacional,
  type AcessoOperacional,
} from "@/lib/auth/permissoes-operacionais";

type ContadoresDashboard = {
  recebido: number;
  em_separacao: number;
  pronto_retirada: number;
  cliente_no_local: number;
};

type PerfilBasico = {
  nome: string | null;
};

const CONTADORES_INICIAIS: ContadoresDashboard = {
  recebido: 0,
  em_separacao: 0,
  pronto_retirada: 0,
  cliente_no_local: 0,
};

export default function AdminDashboardPage() {
  const router = useRouter();

  const [acesso, setAcesso] = useState<AcessoOperacional | null>(null);
  const [nomeUsuario, setNomeUsuario] = useState("");
  const [contadores, setContadores] =
    useState<ContadoresDashboard>(CONTADORES_INICIAIS);

  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");

  useEffect(() => {
    const carregar = window.setTimeout(async () => {
      setCarregando(true);
      setErro("");

      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        router.push("/login");
        return;
      }

      try {
        const acessoAtual = await obterAcessoOperacional(user.id);

        if (!acessoAtual.ativo) {
          await supabase.auth.signOut();
          router.push("/login");
          return;
        }

        if (acessoAtual.tipoUsuario === "cliente") {
          router.push("/");
          return;
        }

        setAcesso(acessoAtual);

        const { data: perfilData } = await supabase
          .from("perfil_cliente")
          .select("nome")
          .eq("user_id", user.id)
          .maybeSingle<PerfilBasico>();

        setNomeUsuario(
          perfilData?.nome?.trim() ||
            user.email?.split("@")[0] ||
            "Usuário"
        );

        const statusParaConsultar = new Set<string>();

        if (
          acessoAtual.ehAdmin ||
          acessoAtual.podeSeparar ||
          acessoAtual.podeAcessarPedidos
        ) {
          statusParaConsultar.add("recebido");
          statusParaConsultar.add("em_separacao");
          statusParaConsultar.add("pronto_retirada");
        }

        if (
          acessoAtual.ehAdmin ||
          acessoAtual.podeRetirar ||
          acessoAtual.podeAcessarFilaRetirada
        ) {
          statusParaConsultar.add("pronto_retirada");
          statusParaConsultar.add("cliente_no_local");
        }

        const novosContadores: ContadoresDashboard = {
          ...CONTADORES_INICIAIS,
        };

        for (const status of statusParaConsultar) {
          const { count, error } = await supabase
            .from("retiradas_pedido")
            .select("id", {
              count: "exact",
              head: true,
            })
            .eq("status", status);

          if (error) {
            throw new Error(
              `Não foi possível carregar o resumo operacional: ${error.message}`
            );
          }

          if (
            status === "recebido" ||
            status === "em_separacao" ||
            status === "pronto_retirada" ||
            status === "cliente_no_local"
          ) {
            novosContadores[status] = count ?? 0;
          }
        }

        setContadores(novosContadores);
      } catch (error) {
        setErro(
          error instanceof Error
            ? error.message
            : "Não foi possível carregar o dashboard."
        );
      } finally {
        setCarregando(false);
      }
    }, 0);

    return () => {
      window.clearTimeout(carregar);
    };
  }, [router]);

  const cards = useMemo(() => {
    if (!acesso) {
      return [];
    }

    const itens = [];

    if (
      acesso.ehAdmin ||
      acesso.podeSeparar ||
      acesso.podeAcessarPedidos
    ) {
      itens.push(
        {
          titulo: "Aguardando separação",
          valor: contadores.recebido,
          descricao: "Retiradas recebidas e ainda não iniciadas.",
          icone: ClipboardList,
          rota: "/admin/pedidos",
        },
        {
          titulo: "Em separação",
          valor: contadores.em_separacao,
          descricao: "Retiradas em conferência e separação.",
          icone: Boxes,
          rota: "/admin/pedidos",
        }
      );
    }

    if (
      acesso.ehAdmin ||
      acesso.podeSeparar ||
      acesso.podeRetirar
    ) {
      itens.push({
        titulo: "Prontos para retirada",
        valor: contadores.pronto_retirada,
        descricao: "Retiradas liberadas para o cliente.",
        icone: PackageCheck,
        rota: acesso.podeAcessarFilaRetirada
          ? "/admin/retirada/fila"
          : "/admin/pedidos",
      });
    }

    if (
      acesso.ehAdmin ||
      acesso.podeRetirar ||
      acesso.podeAcessarFilaRetirada
    ) {
      itens.push({
        titulo: "Clientes no local",
        valor: contadores.cliente_no_local,
        descricao: "Check-in realizado aguardando entrega.",
        icone: Truck,
        rota: "/admin/retirada/fila",
      });
    }

    return itens;
  }, [acesso, contadores]);

  if (carregando) {
    return (
      <main className="min-h-screen bg-gray-50 p-6 text-black md:p-10">
        <div className="mx-auto max-w-7xl">
          <p>Carregando dashboard...</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-50 p-6 text-black md:p-10">
      <div className="mx-auto max-w-7xl">
        <div className="mb-8">
          <p className="text-sm font-medium text-gray-500">
            O Box Driver • Operação
          </p>

          <h1 className="mt-1 text-3xl font-bold">
            Olá, {nomeUsuario}
          </h1>

          <p className="mt-2 text-gray-600">
            Aqui está o resumo da operação disponível para o seu acesso.
          </p>
        </div>

        {erro && (
          <div className="mb-8 rounded-xl border border-red-300 bg-red-50 p-5 text-red-700">
            {erro}
          </div>
        )}

        {cards.length > 0 && (
          <section>
            <h2 className="mb-4 text-xl font-bold">
              Resumo operacional
            </h2>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              {cards.map((card) => {
                const Icone = card.icone;

                return (
                  <button
                    key={card.titulo}
                    type="button"
                    onClick={() => router.push(card.rota)}
                    className="rounded-2xl border border-gray-200 bg-white p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-sm font-semibold text-gray-500">
                          {card.titulo}
                        </p>

                        <p className="mt-2 text-4xl font-bold">
                          {card.valor}
                        </p>
                      </div>

                      <div className="rounded-xl bg-gray-100 p-3">
                        <Icone className="h-5 w-5" />
                      </div>
                    </div>

                    <p className="mt-4 text-sm text-gray-500">
                      {card.descricao}
                    </p>
                  </button>
                );
              })}
            </div>
          </section>
        )}

        <section className="mt-10">
          <h2 className="mb-4 text-xl font-bold">
            Acesso rápido
          </h2>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {acesso?.podeAcessarPedidos && (
              <button
                type="button"
                onClick={() => router.push("/admin/pedidos")}
                className="flex items-center gap-4 rounded-2xl border border-gray-200 bg-white p-5 text-left shadow-sm transition hover:shadow-md"
              >
                <div className="rounded-xl bg-gray-100 p-3">
                  <ClipboardList className="h-5 w-5" />
                </div>

                <div>
                  <p className="font-bold">Pedidos</p>
                  <p className="text-sm text-gray-500">
                    Acompanhar pedidos e retiradas.
                  </p>
                </div>
              </button>
            )}

            {acesso?.podeAcessarFilaRetirada && (
              <button
                type="button"
                onClick={() => router.push("/admin/retirada/fila")}
                className="flex items-center gap-4 rounded-2xl border border-gray-200 bg-white p-5 text-left shadow-sm transition hover:shadow-md"
              >
                <div className="rounded-xl bg-gray-100 p-3">
                  <Truck className="h-5 w-5" />
                </div>

                <div>
                  <p className="font-bold">Fila de retirada</p>
                  <p className="text-sm text-gray-500">
                    Clientes aguardando atendimento.
                  </p>
                </div>
              </button>
            )}

            {acesso?.ehAdmin && (
              <>
                <button
                  type="button"
                  onClick={() => router.push("/admin/produtos")}
                  className="flex items-center gap-4 rounded-2xl border border-gray-200 bg-white p-5 text-left shadow-sm transition hover:shadow-md"
                >
                  <div className="rounded-xl bg-gray-100 p-3">
                    <Package className="h-5 w-5" />
                  </div>

                  <div>
                    <p className="font-bold">Produtos</p>
                    <p className="text-sm text-gray-500">
                      Cadastro e manutenção do catálogo.
                    </p>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => router.push("/admin/categorias")}
                  className="flex items-center gap-4 rounded-2xl border border-gray-200 bg-white p-5 text-left shadow-sm transition hover:shadow-md"
                >
                  <div className="rounded-xl bg-gray-100 p-3">
                    <Tags className="h-5 w-5" />
                  </div>

                  <div>
                    <p className="font-bold">Categorias</p>
                    <p className="text-sm text-gray-500">
                      Organização dos produtos do catálogo.
                    </p>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => router.push("/admin/usuarios")}
                  className="flex items-center gap-4 rounded-2xl border border-gray-200 bg-white p-5 text-left shadow-sm transition hover:shadow-md"
                >
                  <div className="rounded-xl bg-gray-100 p-3">
                    <Users className="h-5 w-5" />
                  </div>

                  <div>
                    <p className="font-bold">Usuários</p>
                    <p className="text-sm text-gray-500">
                      Usuários internos e seus acessos.
                    </p>
                  </div>
                </button>
              </>
            )}
          </div>
        </section>

        <section className="mt-10 rounded-2xl border border-dashed border-gray-300 bg-white p-6">
          <p className="font-bold">
            Próximos módulos administrativos
          </p>

          <p className="mt-2 text-sm text-gray-500">
            Estoque, inventário e financeiro serão incorporados a esta área
            conforme avançarmos nos próximos blocos.
          </p>
        </section>
      </div>
    </main>
  );
}
