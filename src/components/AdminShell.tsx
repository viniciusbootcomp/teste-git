"use client";

import {
  Boxes,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Gauge,
  LogOut,
  Package,
  PanelLeftClose,
  PanelLeftOpen,
  Tags,
  Truck,
  UserRound,
  Users,
  WalletCards,
  Warehouse,
} from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import {
  ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { supabase } from "@/lib/supabase";
import {
  obterAcessoOperacional,
  type AcessoOperacional,
} from "@/lib/auth/permissoes-operacionais";

type AdminShellProps = {
  children: ReactNode;
};

type PerfilBasico = {
  nome: string | null;
};

type ItemMenu = {
  label: string;
  href: string;
  icon: typeof Gauge;
  mostrar: boolean;
};

export default function AdminShell({
  children,
}: AdminShellProps) {
  const router = useRouter();
  const pathname = usePathname();
  const menuUsuarioRef = useRef<HTMLDivElement | null>(null);

  const [acesso, setAcesso] =
    useState<AcessoOperacional | null>(null);
  const [nome, setNome] = useState("Usuário");
  const [email, setEmail] = useState("");
  const [carregando, setCarregando] = useState(true);
  const [menuAbertoTablet, setMenuAbertoTablet] =
    useState(false);
  const [menuCompacto, setMenuCompacto] = useState(false);
  const [menuUsuarioAberto, setMenuUsuarioAberto] =
    useState(false);

  useEffect(() => {
    const carregar = window.setTimeout(async () => {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        router.replace("/login");
        return;
      }

      try {
        const acessoAtual =
          await obterAcessoOperacional(user.id);

        if (
          !acessoAtual.ativo ||
          acessoAtual.tipoUsuario === "cliente"
        ) {
          if (!acessoAtual.ativo) {
            await supabase.auth.signOut();
            router.replace("/login");
          } else {
            router.replace("/");
          }

          return;
        }

        setAcesso(acessoAtual);
        setEmail(user.email ?? "");

        const { data: perfil } = await supabase
          .from("perfil_cliente")
          .select("nome")
          .eq("user_id", user.id)
          .maybeSingle<PerfilBasico>();

        setNome(
          perfil?.nome?.trim() ||
            user.email?.split("@")[0] ||
            "Usuário"
        );
      } catch {
        router.replace("/login");
        return;
      } finally {
        setCarregando(false);
      }
    }, 0);

    return () => {
      window.clearTimeout(carregar);
    };
  }, [router]);

  useEffect(() => {
    function fecharAoClicarFora(event: MouseEvent) {
      if (
        menuUsuarioRef.current &&
        !menuUsuarioRef.current.contains(
          event.target as Node
        )
      ) {
        setMenuUsuarioAberto(false);
      }
    }

    document.addEventListener(
      "mousedown",
      fecharAoClicarFora
    );

    return () => {
      document.removeEventListener(
        "mousedown",
        fecharAoClicarFora
      );
    };
  }, []);

  useEffect(() => {
    setMenuUsuarioAberto(false);
    setMenuAbertoTablet(false);
  }, [pathname]);

  const itensMenu = useMemo<ItemMenu[]>(() => {
    if (!acesso) {
      return [];
    }

    return [
      {
        label: "Dashboard",
        href: "/admin/dashboard",
        icon: Gauge,
        mostrar: true,
      },
      {
        label: "Pedidos",
        href: "/admin/pedidos",
        icon: ClipboardList,
        mostrar: acesso.podeAcessarPedidos,
      },
      {
        label: "Retirada",
        href: "/admin/retirada/fila",
        icon: Truck,
        mostrar: acesso.podeAcessarFilaRetirada,
      },
      {
        label: "Estoque",
        href: "/admin/estoque",
        icon: Warehouse,
        mostrar: acesso.ehAdmin,
      },
      {
        label: "Inventário",
        href: "/admin/inventario",
        icon: Boxes,
        mostrar: acesso.ehAdmin,
      },
      {
        label: "Financeiro",
        href: "/admin/financeiro",
        icon: WalletCards,
        mostrar: acesso.ehAdmin,
      },
      {
        label: "Produtos",
        href: "/admin/produtos",
        icon: Package,
        mostrar: acesso.ehAdmin,
      },
      {
        label: "Categorias",
        href: "/admin/categorias",
        icon: Tags,
        mostrar: acesso.ehAdmin,
      },
      {
        label: "Usuários",
        href: "/admin/usuarios",
        icon: Users,
        mostrar: acesso.ehAdmin,
      },
    ];
  }, [acesso]);

  async function sair() {
    setMenuUsuarioAberto(false);
    await supabase.auth.signOut();
    router.replace("/login");
  }

  function navegar(href: string) {
    setMenuAbertoTablet(false);
    setMenuUsuarioAberto(false);
    router.push(href);
  }

  function ativo(href: string) {
    if (href === "/admin/dashboard") {
      return pathname === href;
    }

    return pathname === href || pathname.startsWith(`${href}/`);
  }

  if (carregando) {
    return (
      <div className="min-h-screen bg-gray-100 p-8 text-black">
        Carregando área administrativa...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 text-black">
      {menuAbertoTablet && (
        <button
          type="button"
          aria-label="Fechar menu"
          onClick={() => setMenuAbertoTablet(false)}
          className="fixed inset-0 z-40 bg-black/30 lg:hidden"
        />
      )}

      <aside
        className={[
          "fixed inset-y-0 left-0 z-50 flex flex-col border-r border-gray-200 bg-white shadow-sm transition-all",
          menuCompacto ? "lg:w-20" : "lg:w-64",
          "w-72",
          menuAbertoTablet
            ? "translate-x-0"
            : "-translate-x-full lg:translate-x-0",
        ].join(" ")}
      >
        <div className="flex h-16 items-center justify-between border-b border-gray-200 px-4">
          <button
            type="button"
            onClick={() => navegar("/admin/dashboard")}
            className="min-w-0 text-left"
          >
            {!menuCompacto ? (
              <>
                <p className="truncate text-lg font-black">
                  O Box Driver
                </p>
                <p className="truncate text-xs text-gray-500">
                  Administrativo
                </p>
              </>
            ) : (
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-black font-black text-white">
                O
              </div>
            )}
          </button>

          <button
            type="button"
            onClick={() => setMenuCompacto((valor) => !valor)}
            className="hidden rounded-lg p-2 hover:bg-gray-100 lg:block"
            title={
              menuCompacto
                ? "Expandir menu"
                : "Recolher menu"
            }
          >
            {menuCompacto ? (
              <ChevronRight className="h-5 w-5" />
            ) : (
              <ChevronLeft className="h-5 w-5" />
            )}
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto p-3">
          <div className="space-y-1">
            {itensMenu
              .filter((item) => item.mostrar)
              .map((item) => {
                const Icone = item.icon;
                const itemAtivo = ativo(item.href);

                return (
                  <button
                    key={item.href}
                    type="button"
                    onClick={() => navegar(item.href)}
                    title={
                      menuCompacto
                        ? item.label
                        : undefined
                    }
                    className={[
                      "flex w-full items-center rounded-xl px-3 py-3 text-left font-medium transition",
                      menuCompacto
                        ? "lg:justify-center"
                        : "gap-3",
                      itemAtivo
                        ? "bg-black text-white"
                        : "text-gray-700 hover:bg-gray-100",
                    ].join(" ")}
                  >
                    <Icone className="h-5 w-5 shrink-0" />

                    {!menuCompacto && (
                      <span>{item.label}</span>
                    )}
                  </button>
                );
              })}
          </div>
        </nav>

        {!menuCompacto && (
          <div className="border-t border-gray-200 p-4">
            <p className="text-xs font-medium text-gray-400">
              Usuário conectado
            </p>
            <p className="mt-1 truncate text-sm font-semibold">
              {nome}
            </p>
            <p className="truncate text-xs text-gray-500">
              {email}
            </p>
          </div>
        )}
      </aside>

      <div
        className={[
          "min-h-screen transition-all",
          menuCompacto ? "lg:pl-20" : "lg:pl-64",
        ].join(" ")}
      >
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-gray-200 bg-white/95 px-4 backdrop-blur md:px-6">
          <button
            type="button"
            onClick={() =>
              setMenuAbertoTablet((valor) => !valor)
            }
            className="rounded-lg p-2 hover:bg-gray-100 lg:hidden"
            aria-label="Abrir menu"
          >
            {menuAbertoTablet ? (
              <PanelLeftClose className="h-5 w-5" />
            ) : (
              <PanelLeftOpen className="h-5 w-5" />
            )}
          </button>

          <div
            ref={menuUsuarioRef}
            className="relative ml-auto"
          >
            <button
              type="button"
              onClick={() =>
                setMenuUsuarioAberto((valor) => !valor)
              }
              className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold transition hover:bg-gray-100"
              aria-expanded={menuUsuarioAberto}
              aria-haspopup="menu"
            >
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-100">
                <UserRound className="h-4 w-4" />
              </div>

              <span className="hidden max-w-48 truncate sm:inline">
                {nome}
              </span>

              <ChevronDown
                className={[
                  "h-4 w-4 transition-transform",
                  menuUsuarioAberto
                    ? "rotate-180"
                    : "",
                ].join(" ")}
              />
            </button>

            {menuUsuarioAberto && (
              <div
                role="menu"
                className="absolute right-0 mt-2 w-64 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-lg"
              >
                <div className="border-b border-gray-100 px-4 py-3">
                  <p className="truncate text-sm font-bold">
                    {nome}
                  </p>
                  <p className="truncate text-xs text-gray-500">
                    {email}
                  </p>
                </div>

                <div className="p-2">
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() =>
                      navegar("/admin/minha-conta")
                    }
                    className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-medium hover:bg-gray-100"
                  >
                    <UserRound className="h-4 w-4" />
                    Minha conta
                  </button>

                  <button
                    type="button"
                    role="menuitem"
                    onClick={sair}
                    className="mt-1 flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-medium text-red-600 hover:bg-red-50"
                  >
                    <LogOut className="h-4 w-4" />
                    Sair
                  </button>
                </div>
              </div>
            )}
          </div>
        </header>

        <div>{children}</div>
      </div>
    </div>
  );
}
