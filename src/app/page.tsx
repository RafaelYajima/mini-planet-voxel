import {
  ArrowRight,
  Boxes,
  CheckCircle2,
  Database,
  GitBranch,
  Rocket,
  ShieldCheck,
  Sparkles,
  Triangle,
  XCircle,
} from "lucide-react";
import PlanetScene from "@/components/PlanetScene";
import { db } from "@/db";
import { sql } from "drizzle-orm";

async function DbStatus() {
  try {
    await db.execute(sql`select 1`);
    return (
      <div className="inline-flex items-center gap-2 rounded-full border border-sky-400/25 bg-sky-400/10 px-3.5 py-1.5 text-xs font-medium text-sky-300">
        <CheckCircle2 className="h-3.5 w-3.5" />
        Supabase Conectado
      </div>
    );
  } catch {
    return (
      <div className="inline-flex items-center gap-2 rounded-full border border-red-400/25 bg-red-400/10 px-3.5 py-1.5 text-xs font-medium text-red-300">
        <XCircle className="h-3.5 w-3.5" />
        Erro no Banco
      </div>
    );
  }
}

// O lucide removeu ícones de marca — usamos o GitHub mark como SVG inline.
function GithubMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      className={className}
    >
      <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
    </svg>
  );
}

const pipeline = [
  {
    icon: GithubMark,
    title: "GitHub",
    desc: "Push ao fim de cada sessão. CI com typecheck + build a cada commit.",
    status: "Configurado",
    statusClass: "border-emerald-400/30 bg-emerald-400/10 text-emerald-300",
  },
  {
    icon: Triangle,
    title: "Vercel",
    desc: "Deploy automático da branch main. Preview deploys em cada PR.",
    status: "Falta importar o repo",
    statusClass: "border-amber-400/30 bg-amber-400/10 text-amber-300",
  },
  {
    icon: Database,
    title: "Supabase",
    desc: "Schema aplicado via GitHub Actions (drizzle-kit push) quando muda.",
    status: "Falta conectar a URL",
    statusClass: "border-sky-400/30 bg-sky-400/10 text-sky-300",
  },
];

const fluxo = [
  {
    icon: GitBranch,
    title: "1. Push",
    desc: "Você descreve, eu codifico e envio pro GitHub com scripts/push.sh.",
  },
  {
    icon: ShieldCheck,
    title: "2. CI",
    desc: "GitHub Actions roda typecheck e build para validar cada commit.",
  },
  {
    icon: Rocket,
    title: "3. Deploy",
    desc: "A Vercel detecta o push na main e publica a nova versão sozinha.",
  },
  {
    icon: Database,
    title: "4. Migração",
    desc: "Mudou o schema? A Action aplica no Supabase sem você tocar em nada.",
  },
];

export default async function HomePage() {
  const dbStatus = await (async () => {
    try {
      await db.execute(sql`select 1`);
      return (
        <div className="inline-flex items-center gap-2 rounded-full border border-sky-400/25 bg-sky-400/10 px-3.5 py-1.5 text-xs font-medium text-sky-300">
          <CheckCircle2 className="h-3.5 w-3.5" />
          Supabase Conectado
        </div>
      );
    } catch {
      return (
        <div className="inline-flex items-center gap-2 rounded-full border border-red-400/25 bg-red-400/10 px-3.5 py-1.5 text-xs font-medium text-red-300">
          <XCircle className="h-3.5 w-3.5" />
          Erro no Banco
        </div>
      );
    }
  })();

  return (
    <main className="bg-space-glow relative min-h-screen overflow-hidden">
      <div className="bg-noise-dots pointer-events-none absolute inset-0 opacity-60" />

      {/* Header */}
      <header className="relative z-10 mx-auto flex max-w-7xl items-center justify-between px-6 py-6 lg:px-10">
        <div className="flex items-center gap-3">
          <span className="grid h-9 w-9 place-items-center rounded-xl border border-emerald-400/30 bg-emerald-400/10">
            <Boxes className="h-4.5 w-4.5 text-emerald-300" />
          </span>
          <span className="text-sm font-semibold tracking-wide text-slate-200">
            Mini-planet <span className="text-emerald-300">Voxel</span>
          </span>
        </div>
        <nav className="flex items-center gap-5 text-sm text-slate-400">
          <a href="#pipeline" className="transition hover:text-slate-100">
            Pipeline
          </a>
          <a
            href="https://github.com/new"
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-1.5 text-slate-200 transition hover:border-white/25 hover:bg-white/10"
          >
            <GithubMark className="h-4 w-4" />
            <span className="hidden sm:inline">Criar repo</span>
          </a>
        </nav>
      </header>

      {/* Hero */}
      <section className="relative z-10 mx-auto grid max-w-7xl items-center gap-10 px-6 pt-8 pb-16 lg:grid-cols-[1.02fr_1fr] lg:px-10 lg:pt-4">
        <div>
          <div className="flex flex-wrap gap-2">
            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-400/25 bg-emerald-400/10 px-3.5 py-1.5 text-xs font-medium text-emerald-300">
              <Sparkles className="h-3.5 w-3.5" />
              Ambiente dev configurado · v0.1
            </div>
            {dbStatus}
          </div>

          <h1 className="mt-6 text-[clamp(2.75rem,6vw,4.75rem)] leading-[0.98] font-semibold tracking-tight text-slate-50">
            Mini-planet
            <span className="block bg-gradient-to-r from-emerald-300 via-sky-400 to-violet-400 bg-clip-text text-transparent">
              VOXEL
            </span>
          </h1>

          <p className="mt-6 max-w-xl text-base leading-relaxed text-slate-400 sm:text-lg">
            Um mini-planeta de voxels flutuando no espaço — gerado
            proceduralmente, pronto para ser editado bloco a bloco. Ao lado, a
            prova de que o ambiente está de pé:{" "}
            <span className="text-slate-200">
              GitHub, Vercel e Supabase ligados no mesmo pipeline.
            </span>
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-4">
            <a
              href="#pipeline"
              className="group inline-flex items-center gap-2 rounded-full bg-emerald-400 px-6 py-3 text-sm font-semibold text-emerald-950 transition hover:bg-emerald-300"
            >
              Ver o pipeline
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </a>
            <a
              href="https://github.com/new"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-6 py-3 text-sm font-semibold text-slate-200 transition hover:border-white/30 hover:bg-white/10"
            >
              <GithubMark className="h-4 w-4" />
              Criar repositório
            </a>
          </div>

          <div className="mt-10 flex flex-wrap gap-x-6 gap-y-2 text-xs text-slate-500">
            <span>Next.js 16 · React 19</span>
            <span>three.js + react-three-fiber</span>
            <span>Drizzle ORM + PostgreSQL</span>
          </div>
        </div>

        {/* Planeta */}
        <div className="relative">
          <div className="pointer-events-none absolute inset-10 rounded-full bg-[radial-gradient(circle,rgba(61,139,253,0.16),transparent_65%)] blur-2xl" />
          <div className="relative h-[420px] sm:h-[520px] lg:h-[620px]">
            <PlanetScene />
            <div className="absolute bottom-4 left-4 flex items-center gap-2 rounded-full border border-white/10 bg-slate-950/60 px-3.5 py-1.5 text-[11px] text-slate-400 backdrop-blur">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
              raio 6 · geração procedural · arraste para orbitar
            </div>
          </div>
        </div>
      </section>

      {/* Pipeline */}
      <section
        id="pipeline"
        className="relative z-10 mx-auto max-w-7xl px-6 pb-20 lg:px-10"
      >
        <div className="flex items-end justify-between gap-6">
          <div>
            <p className="text-xs font-semibold tracking-[0.2em] text-emerald-300 uppercase">
              Automação
            </p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight text-slate-50 sm:text-4xl">
              Do código ao deploy, sem tocar em nada
            </h2>
          </div>
        </div>

        <div className="mt-10 grid gap-4 md:grid-cols-3">
          {pipeline.map((item) => (
            <div
              key={item.title}
              className="group rounded-2xl border border-white/10 bg-white/[0.04] p-6 backdrop-blur transition hover:border-white/20 hover:bg-white/[0.07]"
            >
              <div className="flex items-center justify-between">
                <span className="grid h-11 w-11 place-items-center rounded-xl border border-white/10 bg-white/5 text-slate-200">
                  <item.icon className="h-5 w-5" />
                </span>
                <span
                  className={`rounded-full border px-2.5 py-1 text-[10px] font-medium ${item.statusClass}`}
                >
                  {item.status}
                </span>
              </div>
              <h3 className="mt-5 text-lg font-semibold text-slate-100">
                {item.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-400">
                {item.desc}
              </p>
            </div>
          ))}
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {fluxo.map((step) => (
            <div
              key={step.title}
              className="rounded-2xl border border-white/[0.07] bg-slate-950/40 p-5"
            >
              <step.icon className="h-5 w-5 text-emerald-300" />
              <h4 className="mt-4 text-sm font-semibold text-slate-100">
                {step.title}
              </h4>
              <p className="mt-1.5 text-xs leading-relaxed text-slate-500">
                {step.desc}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer className="relative z-10 border-t border-white/[0.06]">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-3 px-6 py-8 text-xs text-slate-500 sm:flex-row lg:px-10">
          <span>
            Mini-planet Voxel — Next.js, three.js, Drizzle e muito café.
          </span>
          <span>
            Cada push na <span className="text-slate-300">main</span> vira
            deploy. Mudou o schema? O Supabase é atualizado pela Action.
          </span>
        </div>
      </footer>
    </main>
  );
}
