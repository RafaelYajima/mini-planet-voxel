import {
  Boxes,
  CheckCircle2,
  Code2,
  LayoutDashboard,
  Plus,
  Settings,
  XCircle,
} from "lucide-react";
import PlanetScene from "@/components/PlanetScene";
import { db } from "@/db";
import { sql } from "drizzle-orm";

async function getDbStatus() {
  try {
    await db.execute(sql`select 1`);
    return { ok: true };
  } catch {
    return { ok: false };
  }
}

export default async function HomePage() {
  const status = await getDbStatus();

  return (
    <main className="bg-[#05070f] min-h-screen text-slate-100 flex flex-col overflow-hidden">
      {/* Barra de Ferramentas / Header do App */}
      <header className="z-10 border-b border-white/5 bg-slate-950/50 backdrop-blur-md px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-emerald-500/10 border border-emerald-500/20">
              <Boxes className="h-4 w-4 text-emerald-400" />
            </span>
            <h1 className="font-bold tracking-tight text-sm uppercase">
              Mini-planet <span className="text-emerald-400">Voxel</span>
            </h1>
          </div>
          
          <nav className="hidden md:flex items-center gap-1 border-l border-white/10 pl-4">
            <button className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-white/5 text-xs font-medium hover:bg-white/10 transition">
              <Plus className="h-3.5 w-3.5" />
              Novo Planeta
            </button>
            <button className="flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium text-slate-400 hover:text-white transition">
              <LayoutDashboard className="h-3.5 w-3.5" />
              Meus Planetas
            </button>
          </nav>
        </div>

        <div className="flex items-center gap-4">
          {status.ok ? (
            <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-emerald-400 bg-emerald-400/5 px-2.5 py-1 rounded-full border border-emerald-400/10">
              <div className="h-1 w-1 rounded-full bg-emerald-400 animate-pulse" />
              Supabase Online
            </div>
          ) : (
            <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-red-400 bg-red-400/5 px-2.5 py-1 rounded-full border border-red-400/10">
              <XCircle className="h-2 w-2" />
              DB Offline
            </div>
          )}
          
          <button className="p-2 rounded-full hover:bg-white/5 transition text-slate-400 hover:text-white">
            <Settings className="h-4 w-4" />
          </button>
        </div>
      </header>

      {/* Área de Visualização */}
      <div className="relative flex-1 bg-space-glow bg-noise-dots">
        <PlanetScene />
        
        {/* HUD Inferior */}
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-3 px-4 py-2 bg-slate-950/80 border border-white/10 rounded-2xl backdrop-blur shadow-2xl">
          <div className="flex flex-col">
            <span className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">Planeta Atual</span>
            <span className="text-sm font-medium">Planeta Procedural Alpha</span>
          </div>
          <div className="h-8 w-px bg-white/10 mx-2" />
          <button className="px-4 py-2 bg-emerald-500 text-emerald-950 text-xs font-bold rounded-xl hover:bg-emerald-400 transition">
            Salvar no Supabase
          </button>
        </div>

        {/* Créditos Discretos */}
        <div className="absolute bottom-4 right-6 flex items-center gap-4 opacity-30 hover:opacity-100 transition">
          <a href="https://github.com/RafaelYajima/mini-planet-voxel" target="_blank" rel="noreferrer">
            <Code2 className="h-4 w-4" />
          </a>
        </div>
      </div>
    </main>
  );
}
