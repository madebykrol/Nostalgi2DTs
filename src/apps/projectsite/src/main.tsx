import React, { useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import "./style.css";
import { motion } from "framer-motion";
import { Rocket, Cpu, Network, BookText, Code2, TerminalSquare, Github } from "lucide-react";

// --- Utility: simple cx ---
const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

// --- Theme Tokens ---
const theme = {
  bg: "#070b14",
  panel: "rgba(14, 20, 35, 0.8)",
  text: "#e6f0ff",
  neon: {
    cyan: "#08f7fe",
    magenta: "#fe53bb",
    purple: "#9d4edd",
  },
};


const App = () => {

  const [page, setPage] = useState<"home" | "docs" | "api" | "tutorials">("home");

  return (
    <div
      className="w-screen h-screen text-slate-200 overflow-hidden"
      style={{
        backgroundColor: theme.bg,
        backgroundImage:
          "radial-gradient(1200px 800px at -10% -20%, rgba(8, 247, 254, 0.12), transparent 60%)," +
          "radial-gradient(1000px 700px at 120% 10%, rgba(254, 83, 187, 0.12), transparent 60%)," +
          "radial-gradient(800px 600px at 50% 120%, rgba(157, 78, 221, 0.10), transparent 60%)",
      }}
    >
      <TopNav current={page} onNavigate={setPage} />

      {/* Main viewport is FULLSCREEN and scrolls independently */}
      <main className="h-[calc(100vh-64px)] overflow-y-auto">
        {page === "home" && <Home onNavigate={setPage} />}
        {page === "docs" && <Docs />}
        {page === "api" && <Api />}
        {page === "tutorials" && <Tutorials />}
      </main>

      <Footer />
    </div>
  );
}

// --- Top Navigation (edge-to-edge, no max-width) ---
function TopNav({
  current,
  onNavigate,
}: {
  current: "home" | "docs" | "api" | "tutorials";
  onNavigate: (p: "home" | "docs" | "api" | "tutorials") => void;
}) {
  const NavButton = ({ id, label, icon: Icon }: { id: any; label: string; icon: any }) => (
    <button
      onClick={() => onNavigate(id)}
      className={cx(
        "group relative inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition border bg-black/40 border-white/10",
        current === id
          ? "text-white border-cyan-400 shadow-[0_0_8px_rgba(8,247,254,0.8)]"
          : "text-slate-300 hover:text-white hover:border-cyan-400 hover:shadow-[0_0_8px_rgba(8,247,254,0.8)]"
      )}
    >
      <Icon className="h-4 w-4 opacity-90" />
      {label}
    </button>
  );

  return (
    <header className="h-16 sticky top-0 z-40 backdrop-blur border-b border-white/10">
      <div className="h-full px-4 md:px-6 lg:px-8 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="h-8 w-8 rounded-xl bg-gradient-to-br from-cyan-400 via-fuchsia-500 to-violet-500 shadow-[0_0_24px_4px_rgba(14,165,233,0.45)]" />
          </div>
          <div className="text-lg font-semibold text-white tracking-wide">
            <span className="drop-shadow-[0_0_14px_rgba(8,247,254,0.55)]">Nostalgi</span>
            <span className="text-fuchsia-300 drop-shadow-[0_0_16px_rgba(254,83,187,0.55)]">2D</span>
          </div>
        </div>

        <nav className="hidden md:flex items-center gap-2">
          <NavButton id="home" label="Home" icon={Rocket} />
          <NavButton id="docs" label="Docs" icon={BookText} />
          <NavButton id="api" label="API" icon={Code2} />
          <NavButton id="tutorials" label="Tutorials" icon={TerminalSquare} />
        </nav>

        <div className="flex items-center gap-3">
          <a
            className="rounded-xl border border-white/10 px-3 py-2 text-xs text-slate-300 hover:text-white hover:border-cyan-400 hover:shadow-[0_0_8px_rgba(8,247,254,0.8)] transition inline-flex items-center gap-2 bg-black/40"
            href="#"
            onClick={(e) => e.preventDefault()}
            title="GitHub"
          >
            <Github className="h-4 w-4" /> Repo
          </a>
        </div>
      </div>

      <div className="md:hidden border-t border-white/10">
        <div className="px-4 py-2 flex items-center gap-2 overflow-x-auto">
          <Tab id="home" label="Home" current={current} onNavigate={onNavigate} />
          <Tab id="docs" label="Docs" current={current} onNavigate={onNavigate} />
          <Tab id="api" label="API" current={current} onNavigate={onNavigate} />
          <Tab id="tutorials" label="Tutorials" current={current} onNavigate={onNavigate} />
        </div>
      </div>
    </header>
  );
}

function Tab({ id, label, current, onNavigate }: any) {
  const active = current === id;
  return (
    <button
      onClick={() => onNavigate(id)}
      className={cx(
        "rounded-lg px-3 py-1.5 text-sm border bg-black/40",
        active
          ? "text-white border-cyan-400 shadow-[0_0_8px_rgba(8,247,254,0.8)]"
          : "text-slate-300 hover:text-white hover:border-cyan-400 hover:shadow-[0_0_8px_rgba(8,247,254,0.8)]"
      )}
    >
      {label}
    </button>
  );
}

// --- HOME: full screen hero + full width sections ---
function Home({ onNavigate }: { onNavigate: (p: any) => void }) {
  return (
    <div className="w-full">
      {/* HERO occupies full viewport height */}
      <section className="relative min-h-[calc(100vh-64px)] w-full overflow-hidden">
        <NeonBackdrop />
        <div className="relative z-10 h-full flex flex-col items-center justify-center px-6">
          <motion.h1
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="text-center text-5xl md:text-7xl font-extrabold tracking-tight text-white"
          >
            Build bold 2D worlds with <span className="text-cyan-300">Nostalgi2D</span>
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.15 }}
            className="mt-6 max-w-3xl text-center text-base md:text-lg text-slate-300"
          >
            A TypeScript-first, multiplayer-ready 2D engine for speed, clarity and creative flow.
            From prototypes to persistent worlds — ship faster with an authoritative server model and ergonomic APIs.
          </motion.p>
          <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
            <CTA onClick={() => onNavigate("docs")}>
              <Rocket className="h-4 w-4" /> Read the Docs
            </CTA>
            <GhostButton onClick={() => onNavigate("tutorials")}>Quickstart Tutorial</GhostButton>
          </div>
        </div>
      </section>

      {/* 3 CONCEPTS: full width grid, responsive */}
      <section className="w-full px-4 md:px-6 lg:px-10 py-12">
        <ThreeConcepts />
      </section>

      {/* PITCH: full width panel */}
      <section className="w-full px-4 md:px-6 lg:px-10 pb-20">
        <Pitch />
      </section>
    </div>
  );
}

function NeonBackdrop() {
  return (
    <div
      aria-hidden
      className="absolute inset-0"
      style={{
        background:
          "radial-gradient(600px 400px at 20% 20%, rgba(8,247,254,0.18), transparent 60%)," +
          "radial-gradient(700px 500px at 80% 30%, rgba(254,83,187,0.16), transparent 60%)," +
          "radial-gradient(800px 500px at 60% 90%, rgba(157,78,221,0.14), transparent 60%)",
      }}
    >
      <div
        className="absolute inset-0 opacity-20"
        style={{
          backgroundImage:
            "linear-gradient(to right, rgba(255,255,255,0.08) 1px, transparent 1px)," +
            "linear-gradient(to bottom, rgba(255,255,255,0.08) 1px, transparent 1px)",
          backgroundSize: "36px 36px",
        }}
      />
    </div>
  );
}

function CTA(
  props: React.PropsWithChildren<{ onClick?: () => void; className?: string }>
) {
  return (
    <button
      onClick={props.onClick}
      className={cx(
        "relative inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold text-slate-200 border border-white/10 bg-black/40",
        "hover:border-cyan-400 hover:shadow-[0_0_8px_rgba(8,247,254,0.8)] hover:text-white",
        "transition focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/70",
        props.className
      )}
    >
      {props.children}
    </button>
  );
}

function GhostButton(
  props: React.PropsWithChildren<{ onClick?: () => void; className?: string }>
) {
  return (
    <button
      onClick={props.onClick}
      className={cx(
        "rounded-xl px-4 py-2 text-sm text-slate-200 border border-white/10 bg-black/30",
        "hover:border-fuchsia-400 hover:shadow-[0_0_8px_rgba(254,83,187,0.8)] hover:text-white transition"
      )}
    >
      {props.children}
    </button>
  );
}

// --- Three Concepts ---
function ThreeConcepts() {
  const items = useMemo(
    () => [
      {
        title: "Performance",
        desc: "Deterministic loops, zero-GC hot paths, and smart culling keep your frame times razor sharp.",
        icon: Cpu,
        color: theme.neon.cyan,
      },
      {
        title: "Modularity",
        desc: "Composable systems with clean boundaries — opt-in physics, rendering, input, and netcode modules.",
        icon: Rocket,
        color: theme.neon.magenta,
      },
      {
        title: "Multiplayer",
        desc: "Authoritative server, client prediction, and rollback-ready state replication out of the box.",
        icon: Network,
        color: theme.neon.purple,
      },
    ],
    []
  );

  return (
    <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((x, i) => (
        <motion.div
          key={x.title}
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-50px" }}
          transition={{ duration: 0.45, delay: i * 0.08 }}
          className="relative overflow-hidden rounded-2xl border border-white/10 bg-white/5 p-6"
        >
          <CardAura color={x.color} />
          <div className="relative z-10">
            <div className="mb-3 inline-flex h-11 w-11 items-center justify-center rounded-xl bg-black/30 ring-1 ring-white/10">
              <x.icon className="h-5 w-5" />
            </div>
            <h3 className="text-lg font-semibold text-white">{x.title}</h3>
            <p className="mt-1 text-sm leading-relaxed text-slate-300">{x.desc}</p>
          </div>
        </motion.div>
      ))}
    </div>
  );
}

function CardAura({ color }: { color: string }) {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute -inset-12 opacity-40 blur-3xl"
      style={{ background: `radial-gradient(500px 300px at 20% 10%, ${color}, transparent 60%)` }}
    />
  );
}

// --- Pitch ---
function Pitch() {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
      <h2 className="text-2xl md:text-3xl font-bold text-white">Why Nostalgi2D?</h2>
      <div className="mt-4 grid gap-6 md:grid-cols-3">
        <ul className="space-y-2 text-sm text-slate-300">
          <li>• TypeScript-first APIs with strong typing across server and client.</li>
          <li>• Pluggable ECS that stays out of your way until you need it.</li>
          <li>• Asset-light build pipeline; hot reload where it matters.</li>
        </ul>
        <ul className="space-y-2 text-sm text-slate-300">
          <li>• Authoritative netcode with prediction hooks and reconciliation helpers.</li>
          <li>• Deterministic simulation options for competitive modes.</li>
          <li>• Headless server support; spin up bots for load and QA.</li>
        </ul>
        <ul className="space-y-2 text-sm text-slate-300">
          <li>• Batteries-included docs, tutorials, and API references.</li>
          <li>• Modular: pick rendering (Pixi/Three/Canvas) without rewiring core.</li>
          <li>• Friendly ergonomics with escape hatches for experts.</li>
        </ul>
      </div>
    </div>
  );
}

// --- Docs (edge-to-edge layout) ---
function Docs() {
  const sections = [
    { id: "intro", title: "Introduction", summary: "Overview, concepts, and mental model." },
    { id: "install", title: "Installation", summary: "Set up CLI, templates, and your first project." },
    { id: "engine", title: "Engine Core", summary: "Game loop, timing, ECS, scenes, and input." },
    { id: "netcode", title: "Networking", summary: "Authoritative server, replication, and prediction." },
    { id: "rendering", title: "Rendering", summary: "Adapters for Pixi, Canvas2D, and Three.js." },
  ];

  return (
    <div className="min-h-[calc(100vh-64px)] w-full grid grid-cols-1 lg:grid-cols-[280px_1fr]">
      <aside className="sticky top-16 hidden lg:block h-[calc(100vh-64px)] border-r border-white/10 p-6">
        <h3 className="mb-3 text-sm font-semibold tracking-wide text-white/90">Documentation</h3>
        <nav className="space-y-1">
          {sections.map((s) => (
            <a key={s.id} href={`#${s.id}`} className="block rounded-lg px-3 py-2 text-sm text-slate-300 hover:text-white hover:bg-white/5">
              {s.title}
            </a>
          ))}
        </nav>
      </aside>

      <div className="px-4 md:px-6 lg:px-10 py-10 space-y-8">
        {sections.map((s, i) => (
          <section key={s.id} id={s.id} className="scroll-mt-24">
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.45, delay: i * 0.03 }}
              className="rounded-2xl border border-white/10 bg-white/5 p-6"
            >
              <h4 className="text-xl font-bold text-white">{s.title}</h4>
              <p className="mt-1 text-sm text-slate-300">{s.summary}</p>
              <div className="mt-4 text-sm leading-relaxed text-slate-300">
                <p>
                  Replace this with your real docs content. Use code blocks, examples, and diagrams to explain each concept.
                </p>
              </div>
            </motion.div>
          </section>
        ))}
      </div>
    </div>
  );
}

// --- API ---
function Api() {
  const entries = [
    { name: "Engine", desc: "Create, configure, and run the main loop." },
    { name: "World", desc: "Entity storage, systems registration, and queries." },
    { name: "Network", desc: "Server/client adapters, RPC, and replication." },
    { name: "Renderer", desc: "Abstractions for different rendering backends." },
  ];

  return (
    <section className="min-h-[calc(100vh-64px)] w-full px-4 md:px-6 lg:px-10 py-10 space-y-6">
      <header>
        <h2 className="text-3xl font-bold text-white">API Reference</h2>
        <p className="mt-1 text-sm text-slate-300">High-level modules and their surface areas.</p>
      </header>

      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
        {entries.map((e, i) => (
          <motion.div
            key={e.name}
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.4, delay: i * 0.05 }}
            className="relative overflow-hidden rounded-2xl border border-white/10 bg-white/5 p-6"
          >
            <CardAura color={i % 2 ? theme.neon.cyan : theme.neon.magenta} />
            <div className="relative z-10">
              <h3 className="text-lg font-semibold text-white">{e.name}</h3>
              <p className="mt-1 text-sm text-slate-300">{e.desc}</p>
              <pre className="mt-4 rounded-xl bg-black/40 p-4 text-[12px] leading-relaxed text-slate-200 ring-1 ring-white/10 overflow-x-auto">
{`import { ${e.name} } from "@nostalgi2d/engine";

const ${e.name.toLowerCase()} = new ${e.name}();
// ...`}
              </pre>
            </div>
          </motion.div>
        ))}
      </div>
    </section>
  );
}

// --- Tutorials ---
function Tutorials() {
  return (
    <section className="min-h-[calc(100vh-64px)] w-full px-4 md:px-6 lg:px-10 py-10 space-y-6">
      <h2 className="text-3xl font-bold text-white">Tutorials</h2>
      <p className="text-sm text-slate-300">Follow step-by-step guides to build your first prototype.</p>

      <div className="grid gap-6 md:grid-cols-3">
        <TutorialCard
          title="00 • Hello World"
          summary="Create a window, draw a sprite, and wire a basic update loop."
          color={theme.neon.cyan}
        />
        <TutorialCard
          title="01 • Input & Physics"
          summary="Capture WASD, apply forces, and collide with the world."
          color={theme.neon.magenta}
        />
        <TutorialCard
          title="02 • Multiplayer"
          summary="Spin up an authoritative server and replicate player state."
          color={theme.neon.purple}
        />
      </div>
    </section>
  );
}

function TutorialCard({ title, summary, color }: { title: string; summary: string; color: string }) {
  return (
    <motion.article
      initial={{ opacity: 0, y: 12 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.45 }}
      className="relative overflow-hidden rounded-2xl border border-white/10 bg-white/5 p-6"
    >
      <CardAura color={color} />
      <div className="relative z-10">
        <h3 className="text-lg font-semibold text-white">{title}</h3>
        <p className="mt-1 text-sm text-slate-300">{summary}</p>
      </div>
    </motion.article>
  );
}

// --- Footer ---
function Footer() {
  return (
    <footer className="h-0 md:h-0" aria-hidden />
  );
}



createRoot(document.getElementById("app")!).render(<App />);  