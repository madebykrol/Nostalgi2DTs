import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import "./style.css";
import { motion } from "framer-motion";
import { Rocket, Cpu, Network, BookText, Code2, TerminalSquare, Github } from "lucide-react";
import { 
  Navigation, 
  HomeContent, 
  DocsContent, 
  ApiContent, 
  TutorialsContent 
} from "./types/content";
import { loadContentCached } from "./utils/contentLoader";

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

// Icon mapping
const iconMap: Record<string, any> = {
  Rocket,
  Cpu,
  Network,
  BookText,
  Code2,
  TerminalSquare,
  Github,
};

const App = () => {
  const [navigation, setNavigation] = useState<Navigation | null>(null);
  const [page, setPage] = useState<string>("home");

  useEffect(() => {
    loadContentCached<Navigation>("navigation.json").then(setNavigation);
  }, []);

  if (!navigation) {
    return (
      <div className="w-screen h-screen flex items-center justify-center" style={{ backgroundColor: theme.bg }}>
        <div className="text-slate-200">Loading...</div>
      </div>
    );
  }

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
      <TopNav navigation={navigation} current={page} onNavigate={setPage} />

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
  navigation,
  current,
  onNavigate,
}: {
  navigation: Navigation;
  current: string;
  onNavigate: (p: string) => void;
}) {
  const NavButton = ({ id, label, icon }: { id: string; label: string; icon: string }) => {
    const Icon = iconMap[icon];
    return (
      <button
        onClick={() => onNavigate(id)}
        className={cx(
          "group relative inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition border bg-black/40 border-white/10",
          current === id
            ? "text-white border-cyan-400 shadow-[0_0_8px_rgba(8,247,254,0.8)]"
            : "text-slate-300 hover:text-white hover:border-cyan-400 hover:shadow-[0_0_8px_rgba(8,247,254,0.8)]"
        )}
      >
        {Icon && <Icon className="h-4 w-4 opacity-90" />}
        {label}
      </button>
    );
  };

  return (
    <header className="h-16 sticky top-0 z-40 backdrop-blur border-b border-white/10">
      <div className="h-full px-4 md:px-6 lg:px-8 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="h-8 w-8 rounded-xl bg-gradient-to-br from-cyan-400 via-fuchsia-500 to-violet-500 shadow-[0_0_24px_4px_rgba(14,165,233,0.45)]" />
          </div>
          <div className="text-lg font-semibold text-white tracking-wide">
            <span className="drop-shadow-[0_0_14px_rgba(8,247,254,0.55)]">{navigation.brand.name.substring(0, navigation.brand.name.length - 2)}</span>
            <span className="text-fuchsia-300 drop-shadow-[0_0_16px_rgba(254,83,187,0.55)]">{navigation.brand.name.substring(navigation.brand.name.length - 2)}</span>
          </div>
        </div>

        <nav className="hidden md:flex items-center gap-2">
          {navigation.routes.map(route => (
            <NavButton key={route.id} id={route.id} label={route.label} icon={route.icon} />
          ))}
        </nav>

        <div className="flex items-center gap-3">
          {navigation.externalLinks.map(link => {
            const Icon = iconMap[link.icon];
            return (
              <a
                key={link.id}
                className="rounded-xl border border-white/10 px-3 py-2 text-xs text-slate-300 hover:text-white hover:border-cyan-400 hover:shadow-[0_0_8px_rgba(8,247,254,0.8)] transition inline-flex items-center gap-2 bg-black/40"
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                title={link.label}
              >
                {Icon && <Icon className="h-4 w-4" />} {link.label}
              </a>
            );
          })}
        </div>
      </div>

      <div className="md:hidden border-t border-white/10">
        <div className="px-4 py-2 flex items-center gap-2 overflow-x-auto">
          {navigation.routes.map(route => (
            <Tab key={route.id} id={route.id} label={route.label} current={current} onNavigate={onNavigate} />
          ))}
        </div>
      </div>
    </header>
  );
}

function Tab({ id, label, current, onNavigate }: { id: string; label: string; current: string; onNavigate: (p: string) => void }) {
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
function Home({ onNavigate }: { onNavigate: (p: string) => void }) {
  const [content, setContent] = useState<HomeContent | null>(null);

  useEffect(() => {
    loadContentCached<HomeContent>("home.json").then(setContent);
  }, []);

  if (!content) {
    return (
      <div className="w-full h-full flex items-center justify-center">
        <div className="text-slate-200">Loading...</div>
      </div>
    );
  }

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
            {content.hero.title}
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.15 }}
            className="mt-6 max-w-3xl text-center text-base md:text-lg text-slate-300"
          >
            {content.hero.subtitle}
          </motion.p>
          <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
            {content.hero.cta.map((button, idx) => {
              const Icon = button.icon ? iconMap[button.icon] : null;
              if (button.style === "primary") {
                return (
                  <CTA key={idx} onClick={() => button.target && onNavigate(button.target)}>
                    {Icon && <Icon className="h-4 w-4" />} {button.label}
                  </CTA>
                );
              }
              return (
                <GhostButton key={idx} onClick={() => button.target && onNavigate(button.target)}>
                  {button.label}
                </GhostButton>
              );
            })}
          </div>
        </div>
      </section>

      {/* 3 CONCEPTS: full width grid, responsive */}
      <section className="w-full px-4 md:px-6 lg:px-10 py-12">
        <ThreeConcepts features={content.features} />
      </section>

      {/* PITCH: full width panel */}
      <section className="w-full px-4 md:px-6 lg:px-10 pb-20">
        <Pitch pitch={content.pitch} />
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
function ThreeConcepts({ features }: { features: any[] }) {
  return (
    <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
      {features.map((x, i) => {
        const Icon = iconMap[x.icon];
        return (
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
                {Icon && <Icon className="h-5 w-5" />}
              </div>
              <h3 className="text-lg font-semibold text-white">{x.title}</h3>
              <p className="mt-1 text-sm leading-relaxed text-slate-300">{x.description}</p>
            </div>
          </motion.div>
        );
      })}
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
function Pitch({ pitch }: { pitch: any }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
      <h2 className="text-2xl md:text-3xl font-bold text-white">{pitch.title}</h2>
      <div className="mt-4 grid gap-6 md:grid-cols-3">
        {pitch.columns.map((column: string[], idx: number) => (
          <ul key={idx} className="space-y-2 text-sm text-slate-300">
            {column.map((item: string, itemIdx: number) => (
              <li key={itemIdx}>• {item}</li>
            ))}
          </ul>
        ))}
      </div>
    </div>
  );
}

// --- Docs (edge-to-edge layout) ---
function Docs() {
  const [content, setContent] = useState<DocsContent | null>(null);

  useEffect(() => {
    loadContentCached<DocsContent>("docs.json").then(setContent);
  }, []);

  if (!content) {
    return (
      <div className="w-full h-full flex items-center justify-center">
        <div className="text-slate-200">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-64px)] w-full grid grid-cols-1 lg:grid-cols-[280px_1fr]">
      <aside className="sticky top-16 hidden lg:block h-[calc(100vh-64px)] border-r border-white/10 p-6">
        <h3 className="mb-3 text-sm font-semibold tracking-wide text-white/90">{content.title}</h3>
        <nav className="space-y-1">
          {content.sections.map((s) => (
            <a key={s.id} href={`#${s.id}`} className="block rounded-lg px-3 py-2 text-sm text-slate-300 hover:text-white hover:bg-white/5">
              {s.title}
            </a>
          ))}
        </nav>
      </aside>

      <div className="px-4 md:px-6 lg:px-10 py-10 space-y-8">
        {content.sections.map((s, i) => (
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
              <div className="mt-4 text-sm leading-relaxed text-slate-300 space-y-4">
                {s.content.map((block, idx) => (
                  <ContentBlockRenderer key={idx} block={block} />
                ))}
              </div>
            </motion.div>
          </section>
        ))}
      </div>
    </div>
  );
}

function ContentBlockRenderer({ block }: { block: any }) {
  if (block.type === "paragraph") {
    return <p>{block.text}</p>;
  }
  if (block.type === "heading") {
    const level = block.level || 3;
    if (level === 3) return <h3 className="font-bold text-white mt-4">{block.text}</h3>;
    if (level === 4) return <h4 className="font-bold text-white mt-4">{block.text}</h4>;
    if (level === 5) return <h5 className="font-bold text-white mt-4">{block.text}</h5>;
    return <h3 className="font-bold text-white mt-4">{block.text}</h3>;
  }
  if (block.type === "list") {
    return (
      <ul className="list-disc list-inside space-y-1">
        {block.items?.map((item: string, idx: number) => (
          <li key={idx}>{item}</li>
        ))}
      </ul>
    );
  }
  if (block.type === "code") {
    return (
      <pre className="rounded-xl bg-black/40 p-4 text-[12px] leading-relaxed text-slate-200 ring-1 ring-white/10 overflow-x-auto">
        <code>{block.code}</code>
      </pre>
    );
  }
  return null;
}

// --- API ---
function Api() {
  const [content, setContent] = useState<ApiContent | null>(null);

  useEffect(() => {
    loadContentCached<ApiContent>("api.json").then(setContent);
  }, []);

  if (!content) {
    return (
      <div className="w-full h-full flex items-center justify-center">
        <div className="text-slate-200">Loading...</div>
      </div>
    );
  }

  return (
    <section className="min-h-[calc(100vh-64px)] w-full px-4 md:px-6 lg:px-10 py-10 space-y-6">
      <header>
        <h2 className="text-3xl font-bold text-white">{content.title}</h2>
        <p className="mt-1 text-sm text-slate-300">{content.subtitle}</p>
      </header>

      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
        {content.modules.map((e, i) => (
          <motion.div
            key={e.name}
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.4, delay: i * 0.05 }}
            className="relative overflow-hidden rounded-2xl border border-white/10 bg-white/5 p-6"
          >
            <CardAura color={e.color} />
            <div className="relative z-10">
              <h3 className="text-lg font-semibold text-white">{e.name}</h3>
              <p className="mt-1 text-sm text-slate-300">{e.description}</p>
              <pre className="mt-4 rounded-xl bg-black/40 p-4 text-[12px] leading-relaxed text-slate-200 ring-1 ring-white/10 overflow-x-auto">
                {e.example}
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
  const [content, setContent] = useState<TutorialsContent | null>(null);

  useEffect(() => {
    loadContentCached<TutorialsContent>("tutorials.json").then(setContent);
  }, []);

  if (!content) {
    return (
      <div className="w-full h-full flex items-center justify-center">
        <div className="text-slate-200">Loading...</div>
      </div>
    );
  }

  return (
    <section className="min-h-[calc(100vh-64px)] w-full px-4 md:px-6 lg:px-10 py-10 space-y-6">
      <h2 className="text-3xl font-bold text-white">{content.title}</h2>
      <p className="text-sm text-slate-300">{content.subtitle}</p>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {content.tutorials.map((tutorial, idx) => (
          <TutorialCard key={idx} tutorial={tutorial} />
        ))}
      </div>
    </section>
  );
}

function TutorialCard({ tutorial }: { tutorial: any }) {
  return (
    <motion.article
      initial={{ opacity: 0, y: 12 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.45 }}
      className="relative overflow-hidden rounded-2xl border border-white/10 bg-white/5 p-6"
    >
      <CardAura color={tutorial.color} />
      <div className="relative z-10">
        <h3 className="text-lg font-semibold text-white">{tutorial.title}</h3>
        <p className="mt-1 text-sm text-slate-300">{tutorial.summary}</p>
        {tutorial.steps && (
          <ol className="mt-4 space-y-1 text-xs text-slate-400">
            {tutorial.steps.map((step: string, idx: number) => (
              <li key={idx}>{idx + 1}. {step}</li>
            ))}
          </ol>
        )}
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
