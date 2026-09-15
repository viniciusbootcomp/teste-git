"use client";

import Link from "next/link";
import { Search, User } from "lucide-react";
import NotificacoesSino from "@/components/NotificacoesSino";

type CabecalhoCatalogoClienteProps = {
  valorBusca: string;
  onBuscaChange: (valor: string) => void;
  nomeUsuario?: string | null;
  fotoUrl?: string | null;
};

export default function CabecalhoCatalogoCliente({
  valorBusca,
  onBuscaChange,
  nomeUsuario,
  fotoUrl,
}: CabecalhoCatalogoClienteProps) {
  const iniciais =
    nomeUsuario?.trim()?.slice(0, 1)?.toUpperCase() || null;

  return (
    <div className="sticky top-0 z-30 border-b border-gray-200 bg-white/95 backdrop-blur">
      <div className="mx-auto flex w-full max-w-7xl items-center gap-3 px-4 py-3 md:px-6">
        {/* Atalho Área do Cliente */}
        <Link
          href="/area-cliente"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-gray-300 bg-white shadow-sm transition hover:bg-gray-50"
          title="Área do Cliente"
        >
          {fotoUrl ? (
            // Futuramente você pode trocar por next/image se quiser
            <img
              src={fotoUrl}
              alt="Perfil do cliente"
              className="h-full w-full rounded-full object-cover"
            />
          ) : iniciais ? (
            <span className="text-sm font-semibold text-black">
              {iniciais}
            </span>
          ) : (
            <User className="h-5 w-5 text-black" />
          )}
        </Link>

        {/* Busca */}
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={valorBusca}
            onChange={(e) => onBuscaChange(e.target.value)}
            placeholder="Buscar produtos"
            className="h-11 w-full rounded-full border border-gray-300 bg-white pl-10 pr-4 text-sm outline-none transition focus:border-black"
          />
        </div>

        {/* Notificações */}
        <div className="shrink-0">
          <NotificacoesSino />
        </div>
      </div>
    </div>
  );
}