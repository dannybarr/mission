import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  ArrowDownLeft,
  ArrowUpRight,
  BookOpen,
  Check,
  ChevronRight,
  Command,
  Compass,
  Database,
  FileText,
  Fingerprint,
  History,
  Inbox,
  KeyRound,
  Link2,
  Lock,
  Menu,
  Plus,
  Search,
  Settings2,
  Shield,
  Unplug,
  Usb,
  Users,
  X,
} from "lucide-react";
import * as bridge from "./bridge";
import { agentSetup, formatAgentConfig } from "./agent-setup";
import { Onboarding } from "./Onboarding";
import {
  agents,
  domains,
  emptyGrant,
  itemSchema,
  levels,
  newItem,
  projectItem,
  type Device,
  type Grant,
  type MemoryItem,
  type Snapshot,
} from "./model";

type Page =
  "Overview" | "Memory" | "Agents" | "Review inbox" | "Sources" | "Security";
const navigation = [
  ["Overview", Compass],
  ["Memory", BookOpen],
  ["Agents", Users],
  ["Review inbox", Inbox],
  ["Sources", Link2],
  ["Security", Shield],
] as const;
const empty: Snapshot = { items: [], grants: [], proposals: [], audit: [] };

export function App() {
  const [data, setData] = useState<Snapshot>(empty),
    [open, setOpen] = useState(false),
    [demo, setDemo] = useState(false);
  const [page, setPage] = useState<Page>("Overview"),
    [available, setAvailable] = useState<Device[]>([]),
    [device, setDevice] = useState("");
  const [pass, setPass] = useState(""),
    [create, setCreate] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [domain, setDomain] = useState("all"),
    [query, setQuery] = useState(""),
    [selected, setSelected] = useState<string | null>(null);
  const [editor, setEditor] = useState<MemoryItem | null>(null),
    [agent, setAgent] = useState("Claude Desktop"),
    [agentView, setAgentView] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [onboarding, setOnboarding] = useState(false);
  const [connectionConfig, setConnectionConfig] = useState("");
  useEffect(() => {
    setConnectionConfig("");
  }, [agent]);
  const [mobileNav, setMobileNav] = useState(false);
  const [revisions, setRevisions] = useState<MemoryItem[]>([]);
  useEffect(() => {
    setRevisions([]);
    setShowHistory(false);
  }, [selected]);
  const epoch = useRef(0);
  async function importFile(file: File) {
    const generation = epoch.current;
    setBusy(true);
    setError("");
    try {
      if (file.size > 1024 * 1024)
        throw new Error("Choose a file smaller than 1 MB.");
      const text = await file.text();
      const parsed = file.name.toLowerCase().endsWith(".json")
        ? JSON.parse(text)
        : [newItem(file.name.replace(/\.[^.]+$/, ""), text)];
      if (!Array.isArray(parsed) || !parsed.length || parsed.length > 100)
        throw new Error("Import 1–100 memory items at a time.");
      const items = parsed.map((value: unknown) => itemSchema.parse(value));
      if (
        items.some(
          (i) => i.domain === "sensitive" || i.sensitivity === "sensitive",
        )
      )
        throw new Error("Sensitive memory is not available in this build.");
      if (generation !== epoch.current) return;
      if (demo)
        setData((d) => ({
          ...d,
          proposals: [
            ...d.proposals,
            ...items.map((i) => ({
              id: crypto.randomUUID(),
              agent: "File import",
              item: { ...i, id: crypto.randomUUID(), version: 1, links: [] },
              reason:
                "Review this imported memory before adding it to your vault.",
            })),
          ],
        }));
      else {
        await bridge.stageImport(items);
        await refresh();
      }
      if (generation === epoch.current) setPage("Review inbox");
    } catch (err) {
      if (generation === epoch.current)
        setError(
          err instanceof Error
            ? err.message
            : "The file could not be imported.",
        );
    } finally {
      setBusy(false);
    }
  }
  async function reviewProposal(id: string, accept: boolean) {
    setBusy(true);
    setError("");
    try {
      if (demo)
        setData((d) => {
          const proposal = d.proposals.find((p) => p.id === id);
          return {
            ...d,
            proposals: d.proposals.filter((p) => p.id !== id),
            items:
              accept && proposal
                ? [
                    { ...proposal.item, source: { kind: "file-import" } },
                    ...d.items,
                  ]
                : d.items,
          };
        });
      else {
        await bridge.reviewProposal(id, accept);
        await refresh();
      }
    } catch {
      setError(
        "This suggestion could not be reviewed. Check your device and try again.",
      );
    } finally {
      setBusy(false);
    }
  }
  function clear() {
    epoch.current++;
    setOpen(false);
    setDemo(false);
    setData(empty);
    setEditor(null);
    setSelected(null);
    setQuery("");
    setPass("");
    setError("");
    setAgentView(false);
    setShowHistory(false);
    setRevisions([]);
    setPage("Overview");
    setOnboarding(false);
    setConnectionConfig("");
    setMobileNav(false);
  }
  async function refresh() {
    const generation = epoch.current;
    const next = await bridge.snapshot();
    if (generation === epoch.current) setData(next);
  }
  async function disconnect() {
    clear();
    try {
      await bridge.lock();
    } catch {
      setError(
        "The interface is locked. Close the desktop app to ensure its session is stopped.",
      );
    }
  }
  useEffect(() => {
    if (!bridge.native) return;
    let active = true;
    const poll = async () => {
      try {
        const found = await bridge.devices();
        if (active) setAvailable(found);
      } catch {
        if (active)
          setError(
            "Device discovery is unavailable. No vault has been opened.",
          );
      }
    };
    void poll();
    const timer = setInterval(poll, 2000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);
  useEffect(() => {
    if (!device && available.length === 1) {
      setDevice(available[0].id);
      setCreate(!available[0].hasVault);
    }
  }, [available, device]);
  useEffect(() => {
    if (!open || demo) return;
    let running = false;
    const generation = epoch.current;
    const timer = setInterval(async () => {
      if (running) return;
      running = true;
      try {
        await bridge.checkSession();
      } catch {
        if (epoch.current === generation) clear();
      } finally {
        running = false;
      }
    }, 250);
    return () => clearInterval(timer);
  }, [open, demo]);
  useEffect(() => {
    function key(event: KeyboardEvent) {
      if (event.key === "Escape") setEditor(null);
      if ((event.metaKey || event.ctrlKey) && event.key === "k" && open) {
        event.preventDefault();
        setEditor(newItem("", "", "identity"));
      }
    }
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [open]);
  async function unlock(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const generation = epoch.current;
    try {
      await bridge.unlock(device, pass, create);
      setPass("");
      const next = await bridge.snapshot();
      if (generation === epoch.current) {
        setData(next);
        setOpen(true);
        setOnboarding(next.items.length === 0);
      }
    } catch {
      setError(
        "Could not open this vault. Check the device and passphrase, then try again.",
      );
      setPass("");
    } finally {
      setBusy(false);
    }
  }
  function startDemo() {
    epoch.current++;
    setDemo(true);
    setData({ items: [], grants: [], proposals: [], audit: [] });
    setOpen(true);
    setError("");
  }
  async function save(item: MemoryItem) {
    const previous = data.items.find((i) => i.id === item.id);
    const at = new Date().toISOString();
    const next = {
      ...item,
      version: (previous?.version ?? 0) + 1,
      updatedAt: at,
      provenance: { actor: "owner", at },
    };
    const checked = itemSchema.safeParse(next);
    if (!checked.success) {
      setError(checked.error.issues[0].message);
      return;
    }
    setBusy(true);
    setError("");
    try {
      if (demo)
        setData((d) => ({
          ...d,
          items: [next, ...d.items.filter((i) => i.id !== next.id)],
          audit: [
            {
              at,
              actor: "owner",
              action: previous ? "Updated memory" : "Created memory",
              itemId: next.id,
            },
            ...d.audit,
          ],
        }));
      else {
        await bridge.saveItem(next);
        await refresh();
      }
      setEditor(null);
      setSelected(next.id);
    } catch {
      setError(
        "The change was not saved. Check that your device is still connected.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function updateGrant(grant: Grant) {
    setError("");
    try {
      if (demo)
        setData((d) => ({
          ...d,
          grants: [...d.grants.filter((g) => g.agent !== grant.agent), grant],
        }));
      else {
        await bridge.saveGrant(grant);
        await refresh();
      }
    } catch {
      setError("Access settings were not saved.");
    }
  }
  const currentGrant =
    data.grants.find((g) => g.agent === agent) ?? emptyGrant(agent);
  const filtered = data.items.filter(
    (i) =>
      (domain === "all" || i.domain === domain) &&
      `${i.title} ${i.body}`.toLowerCase().includes(query.toLowerCase()),
  );
  const item = data.items.find((i) => i.id === selected);

  if (!open)
    return (
      <div className="locked-shell">
        <div className="reference-haze" aria-hidden="true" />
        <div className="reference-glow" aria-hidden="true" />
        <header className="locked-header">
          <Brand />
          <span className="status">
            <span /> Vault locked
          </span>
        </header>
        <main className="locked-main">
          <div className="mission-logo-art">
            <img src="/assets/mission-globe.png" alt="Mission globe logo" />
          </div>
          <div className="locked-copy">
            <h1>Plug in your Mission.</h1>
            <p>
              A home for everything that makes you, you.
              <br />
              Connect your device to bring your memory into view.
            </p>
          </div>
          {bridge.native ? (
            <form className="unlock-form" onSubmit={unlock}>
              <label>
                Device
                <select
                  required
                  value={device}
                  onChange={(e) => {
                    setDevice(e.target.value);
                    setCreate(
                      !available.find((d) => d.id === e.target.value)?.hasVault,
                    );
                  }}
                >
                  <option value="">
                    {available.length
                      ? "Choose a removable device"
                      : "Waiting for a removable device…"}
                  </option>
                  {available.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.label} · {d.path}
                    </option>
                  ))}
                </select>
              </label>
              {device && (
                <>
                  <label>
                    Passphrase
                    <input
                      autoComplete="off"
                      type="password"
                      minLength={create ? 14 : 1}
                      required
                      value={pass}
                      onChange={(e) => setPass(e.target.value)}
                    />
                  </label>
                  {create && (
                    <p className="small">
                      Create an encrypted vault on this device. Use at least 14
                      characters. Recovery is not available in this development
                      build.
                    </p>
                  )}
                  <button className="primary" disabled={busy}>
                    {busy
                      ? "Opening…"
                      : create
                        ? "Create vault"
                        : "Unlock vault"}
                    <KeyRound size={16} />
                  </button>
                </>
              )}
            </form>
          ) : (
            <div className="preview-entry">
              <h2>Enter Mission</h2>
              <p>
                This browser cannot open a USB vault.
                <br />
                Preview the empty interface. Use the desktop app for real
                memory.
              </p>
              <button className="primary" onClick={startDemo}>
                Explore Mission <ArrowUpRight size={16} />
              </button>
              <button
                className="text-button"
                onClick={() => {
                  startDemo();
                  setOnboarding(true);
                }}
              >
                Preview onboarding
              </button>
              <span className="small">
                Preview changes are temporary and disappear on lock.
              </span>
            </div>
          )}
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
          <div className="locked-principles">
            <span>
              <Database size={16} /> Stored on your device
            </span>
            <span>
              <Fingerprint size={16} /> Access you control
            </span>
            <span>
              <Unplug size={16} /> Disconnect to lock
            </span>
          </div>
        </main>
        <footer className="locked-footer">
          <span>
            Mission Core <span className="muted">/ Development build</span>
          </span>
          <span>One memory. On your terms.</span>
        </footer>
      </div>
    );

  if (onboarding)
    return (
      <div className="app-shell">
        <div className="reference-haze" aria-hidden="true" />
        <div className="reference-glow" aria-hidden="true" />
        <Onboarding
          preview={demo}
          onSkip={() => setOnboarding(false)}
          onSave={async (items) => {
            const generation = epoch.current;
            if (demo) setData((d) => ({ ...d, items: [...items, ...d.items] }));
            else {
              await bridge.saveFoundation(items);
              await refresh();
            }
            if (generation === epoch.current) {
              setOnboarding(false);
              setPage("Agents");
            }
          }}
        />
      </div>
    );
  return (
    <div className="app-shell">
      <div className="reference-haze" aria-hidden="true" />
      <div className="reference-glow" aria-hidden="true" />
      <aside
        className={"sidebar" + (mobileNav ? " mobile-open" : "")}
        id="mission-navigation"
      >
        <Brand />
        <div className="vault-tag">
          <span className="connection-dot" />
          <div>
            <strong>{demo ? "Empty preview" : "Mission vault"}</strong>
            <span>
              {demo ? "Temporary · this tab only" : "Device connected"}
            </span>
          </div>
          <Lock size={13} />
        </div>
        <nav aria-label="Main navigation">
          {navigation.map(([name, Icon]) => (
            <button
              key={name}
              className={page === name ? "nav-item active" : "nav-item"}
              aria-current={page === name ? "page" : undefined}
              onClick={() => {
                setPage(name);
                setMobileNav(false);
                setAgentView(false);
              }}
            >
              <Icon size={18} />
              {name}
              {name === "Review inbox" && (
                <span className="nav-count">{data.proposals.length}</span>
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="privacy-note">
            <Shield size={18} />
            <p>
              {demo ? "A space to explore." : "Your device is the key."}
              <span>
                {demo
                  ? "No real memory is connected."
                  : "Lock before unplugging to finish pending writes."}
              </span>
            </p>
          </div>
          <button className="nav-item" onClick={() => void disconnect()}>
            <Unplug size={18} />
            {demo ? "Close preview" : "Lock vault"}
          </button>
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <button
            className="mobile-menu"
            aria-label="Main menu"
            aria-expanded={mobileNav}
            aria-controls="mission-navigation"
            onClick={() => setMobileNav(!mobileNav)}
          >
            <Menu size={22} />
          </button>
          <div>
            <Brand /> <ChevronRight size={13} />
            <span>{page}</span>
          </div>
          <div>
            <span className="mode-label">
              {demo ? "Browser preview" : "USB pilot"}
            </span>
            <button
              className="capture-button"
              onClick={() => setEditor(newItem("", "", "identity"))}
            >
              <Plus size={15} /> Quick capture <kbd>Ctrl K</kbd>
            </button>
          </div>
        </header>
        {demo && (
          <div className="demo-banner">
            Browser preview only. Use the desktop app to store memory on USB.{" "}
            <button onClick={() => void disconnect()}>
              Exit preview <X size={13} />
            </button>
          </div>
        )}
        <main
          className={"content " + (page === "Memory" ? "memory-content" : "")}
        >
          {error && (
            <div className="error" role="alert">
              {error}
              <button onClick={() => setError("")} aria-label="Dismiss error">
                <X size={14} />
              </button>
            </div>
          )}
          {page === "Overview" && (
            <>
              <div className="page-heading">
                <div>
                  <span className="eyebrow">
                    A little context goes a long way.
                  </span>
                  <h1>A clearer picture of you.</h1>
                  <p>Keep what matters close. Choose who gets to see it.</p>
                </div>
                <button
                  className="secondary"
                  onClick={() => {
                    setPage("Memory");
                    setDomain("all");
                  }}
                >
                  Open memory <ArrowUpRight size={16} />
                </button>
              </div>
              <div className="overview-grid">
                {data.items.length === 0 && (
                  <section className="onboarding-panel start-onboarding">
                    <h2>Build your first memories</h2>
                    <p>
                      A guided interview, your existing agent memories, and
                      files you choose. Review everything before it stays.
                    </p>
                    <button
                      className="primary"
                      onClick={() => setOnboarding(true)}
                    >
                      Start guided onboarding
                    </button>
                  </section>
                )}
                <section className="daily-brief">
                  <div className="section-label">
                    <Compass size={17} /> Your daily perspective{" "}
                    <span className="tag">{demo ? "Preview" : "Local"}</span>
                  </div>
                  <h2>
                    {data.items.length
                      ? "A good foundation starts\nwith the everyday."
                      : "Start with what matters to you."}
                  </h2>
                  <p>
                    {demo
                      ? "Your morning focus, the habits you return to, the things you want to build. Bring those details together, then decide which parts your assistants can use."
                      : "Add a few useful facts or preferences. Local AI briefs will appear here once the Ollama integration is available."}
                  </p>
                  <button
                    className="text-button"
                    onClick={() => setEditor(newItem("", "", "identity"))}
                  >
                    Add something about yourself <Plus size={15} />
                  </button>
                  <div className="brief-footer">
                    <span className="line-icon">
                      <Fingerprint size={38} />
                    </span>
                    <span>
                      {demo
                        ? "Start with an empty vault"
                        : "Built from your context"}
                      <small>
                        {demo
                          ? "No AI analysis has run."
                          : "No cloud inference."}
                      </small>
                    </span>
                  </div>
                </section>
                <section className="ownership-panel">
                  <div className="section-label">
                    <Shield size={17} /> In your hands
                  </div>
                  <div className="ownership-count">
                    <strong>
                      {data.items.length.toString().padStart(2, "0")}
                    </strong>
                    <span>pieces of context</span>
                  </div>
                  <div className="ownership-row">
                    <span>Domains with memory</span>
                    <strong>
                      {new Set(data.items.map((i) => i.domain)).size} / 13
                    </strong>
                  </div>
                  <div className="ownership-row">
                    <span>Agents with saved permissions</span>
                    <strong>
                      {
                        data.grants.filter((g) =>
                          Object.values(g.domains).some(
                            (level) => level !== "none",
                          ),
                        ).length
                      }
                    </strong>
                  </div>
                  <div className="ownership-row">
                    <span>Pending suggestions</span>
                    <strong>{data.proposals.length}</strong>
                  </div>
                  <p className="small">
                    {demo
                      ? "No agent can access this browser preview."
                      : "Generate a local MCP connection in Agents after choosing permissions."}
                  </p>
                  <button
                    className="text-button"
                    onClick={() => setPage("Agents")}
                  >
                    Review access <ArrowUpRight size={15} />
                  </button>
                </section>
              </div>
              <section className="domain-section">
                <div className="section-heading">
                  <div>
                    <h2>The shape of your memory</h2>
                    <p>Build context a little at a time.</p>
                  </div>
                  <span className="small">Coverage by domain</span>
                </div>
                <div className="domain-grid">
                  {domains
                    .filter((d) => d[0] !== "sensitive")
                    .map(([id, label, description]) => {
                      const count = data.items.filter(
                        (i) => i.domain === id,
                      ).length;
                      return (
                        <button
                          className="domain-card"
                          key={id}
                          onClick={() => {
                            setDomain(id);
                            setPage("Memory");
                          }}
                        >
                          <div>
                            <span className="domain-symbol">
                              {label.slice(0, 1)}
                            </span>
                            <ArrowUpRight size={15} />
                          </div>
                          <h3>{label}</h3>
                          <p>{description}</p>
                          <div className="coverage">
                            <span style={{ width: count ? "25%" : "0%" }} />
                          </div>
                          <small>
                            {count
                              ? `${count} ${count === 1 ? "memory" : "memories"} · A starting point`
                              : "Ready when you are"}
                          </small>
                        </button>
                      );
                    })}
                </div>
              </section>
              <section className="recent-section">
                <div className="section-heading">
                  <h2>Recently remembered</h2>
                  <button
                    className="text-button"
                    onClick={() => setPage("Memory")}
                  >
                    View all <ArrowUpRight size={14} />
                  </button>
                </div>
                {data.items.slice(0, 3).map((i) => (
                  <button
                    className="recent-row"
                    key={i.id}
                    onClick={() => {
                      setSelected(i.id);
                      setPage("Memory");
                    }}
                  >
                    <FileText size={18} />
                    <div>
                      <strong>{i.title}</strong>
                      <span>{domains.find((d) => d[0] === i.domain)?.[1]}</span>
                    </div>
                    <span className="tag">{i.source.kind}</span>
                    <ChevronRight size={16} />
                  </button>
                ))}
              </section>
            </>
          )}

          {page === "Memory" && (
            <>
              <div className="page-heading">
                <div>
                  <h1>Your memory</h1>
                  <p>Useful context. In your own words.</p>
                </div>
                <button
                  className="primary"
                  onClick={() =>
                    setEditor(
                      newItem("", "", domain === "all" ? "identity" : domain),
                    )
                  }
                >
                  <Plus size={16} /> Add memory
                </button>
              </div>
              <div className="memory-toolbar">
                <label className="search">
                  <Search size={17} />
                  <input
                    placeholder="Search your memory"
                    aria-label="Search your memory"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                </label>
                <label className="sr-only" htmlFor="domain-filter">
                  Domain
                </label>
                <select
                  id="domain-filter"
                  value={domain}
                  onChange={(e) => {
                    setDomain(e.target.value);
                    setSelected(null);
                  }}
                >
                  <option value="all">All domains</option>
                  {domains.map((d) => (
                    <option key={d[0]} value={d[0]}>
                      {d[1]}
                    </option>
                  ))}
                </select>
              </div>
              <div className="memory-layout">
                <div className="memory-list">
                  {filtered.map((i) => (
                    <button
                      key={i.id}
                      className={
                        "memory-row " + (selected === i.id ? "selected" : "")
                      }
                      onClick={() => {
                        setSelected(i.id);
                        setShowHistory(false);
                      }}
                    >
                      <div>
                        <span className="eyebrow">
                          {domains.find((d) => d[0] === i.domain)?.[1]}
                        </span>
                        <span className="small">v{i.version}</span>
                      </div>
                      <h3>{i.title}</h3>
                      <p>{i.body}</p>
                      <span className="small">
                        {i.type} · {i.sensitivity}
                      </span>
                    </button>
                  ))}
                  {!filtered.length && (
                    <Empty
                      icon={BookOpen}
                      title="A little context starts here."
                      text="Add a fact, preference or note. You can come back and refine it any time."
                    />
                  )}
                </div>
                <section className="memory-detail">
                  {item ? (
                    <>
                      <div className="detail-top">
                        <span className="tag">{item.type}</span>
                        <button
                          className="text-button"
                          onClick={() => setEditor({ ...item })}
                        >
                          Edit memory <ArrowUpRight size={14} />
                        </button>
                      </div>
                      <h2>{item.title}</h2>
                      <p className="memory-body">{item.body}</p>
                      <dl className="metadata">
                        <div>
                          <dt>Source</dt>
                          <dd>{item.source.kind}</dd>
                        </div>
                        <div>
                          <dt>Confidence</dt>
                          <dd>{Math.round(item.confidence * 100)}%</dd>
                        </div>
                        <div>
                          <dt>Visibility</dt>
                          <dd>{item.sensitivity}</dd>
                        </div>
                        <div>
                          <dt>Updated by</dt>
                          <dd>{item.provenance.actor}</dd>
                        </div>
                        <div>
                          <dt>Revision</dt>
                          <dd>{item.version}</dd>
                        </div>
                      </dl>
                      <div className="detail-actions">
                        <button
                          className="secondary"
                          onClick={() => setAgentView(!agentView)}
                        >
                          <Command size={15} /> View as agent
                        </button>
                        <button
                          className="secondary"
                          onClick={async () => {
                            const generation = epoch.current;
                            setShowHistory(!showHistory);
                            if (!showHistory && !demo) {
                              try {
                                const history = await bridge.itemHistory(
                                  item.id,
                                );
                                if (generation === epoch.current)
                                  setRevisions(history);
                              } catch {
                                if (generation === epoch.current)
                                  setError(
                                    "Revision history could not be loaded.",
                                  );
                              }
                            }
                          }}
                        >
                          <History size={15} /> Activity
                        </button>
                      </div>
                      {agentView && (
                        <div className="agent-json">
                          <label>
                            Preview access for
                            <select
                              value={agent}
                              onChange={(e) => setAgent(e.target.value)}
                            >
                              {agents.map((a) => (
                                <option key={a}>{a}</option>
                              ))}
                            </select>
                          </label>
                          <pre>
                            {JSON.stringify(
                              projectItem(item, currentGrant) ?? {
                                withheld: "No access to this item",
                              },
                              null,
                              2,
                            )}
                          </pre>
                          <p className="small">
                            Permission preview. No data is sent to this agent.
                          </p>
                        </div>
                      )}
                      {showHistory && (
                        <div className="activity-list">
                          {revisions
                            .filter((r) => r.id === item.id)
                            .map((revision) => (
                              <div
                                key={revision.version}
                                className="revision-row"
                              >
                                <p>
                                  <strong>Revision {revision.version}</strong> ·{" "}
                                  {revision.title}
                                  <small>
                                    {new Date(
                                      revision.updatedAt,
                                    ).toLocaleString()}
                                  </small>
                                </p>
                                {revision.version < item.version && (
                                  <button
                                    disabled={busy}
                                    className="secondary"
                                    onClick={async () => {
                                      setBusy(true);
                                      setError("");
                                      const generation = epoch.current;
                                      try {
                                        await bridge.restoreRevision(
                                          item.id,
                                          revision.version,
                                          item.version,
                                        );
                                        await refresh();
                                        const history =
                                          await bridge.itemHistory(item.id);
                                        if (generation === epoch.current)
                                          setRevisions(history);
                                      } catch {
                                        if (generation === epoch.current)
                                          setError(
                                            "The revision was not restored. Refresh the vault and try again.",
                                          );
                                      } finally {
                                        setBusy(false);
                                      }
                                    }}
                                  >
                                    Restore as new revision
                                  </button>
                                )}
                              </div>
                            ))}
                          {data.audit
                            .filter((a) => a.itemId === item.id)
                            .map((a, n) => (
                              <p key={n}>
                                {a.action}
                                <small>
                                  {a.actor} ·{" "}
                                  {new Date(a.at).toLocaleTimeString()}
                                </small>
                              </p>
                            ))}
                          {!data.audit.some((a) => a.itemId === item.id) && (
                            <p className="small">
                              No changes recorded in this session.
                            </p>
                          )}
                        </div>
                      )}
                    </>
                  ) : (
                    <Empty
                      icon={FileText}
                      title="The details belong here."
                      text="Choose a memory to read its story, source and access preview."
                    />
                  )}
                </section>
              </div>
            </>
          )}

          {page === "Agents" && (
            <>
              <div className="page-heading">
                <div>
                  <h1>One memory. Your boundaries.</h1>
                  <p>
                    Give each assistant the context it needs, and nothing more.
                  </p>
                </div>
                <button
                  className="secondary danger"
                  onClick={async () => {
                    setError("");
                    try {
                      if (demo) setData((d) => ({ ...d, grants: [] }));
                      else {
                        await bridge.revokeAll();
                        await refresh();
                      }
                    } catch {
                      setError(
                        "Revocation could not be confirmed. Lock the vault to stop access.",
                      );
                    }
                  }}
                >
                  Revoke all access
                </button>
              </div>
              <div className="notice">
                <Shield size={18} />
                <p>
                  {demo
                    ? "Agent connections require an unlocked USB vault in the desktop app."
                    : "The local MCP pilot supports search and read. Each request checks the current permissions and vault session."}{" "}
                  Summary access withholds detailed items. Agent writes are not
                  enabled in this pilot.
                </p>
              </div>
              <div className="agent-layout">
                <div className="agent-list">
                  {agents.map((a) => (
                    <button
                      className={"agent-row " + (agent === a ? "selected" : "")}
                      key={a}
                      onClick={() => setAgent(a)}
                    >
                      <span className="agent-avatar">{a.slice(0, 1)}</span>
                      <span>
                        {a}
                        <small>
                          {agentSetup(a).supported
                            ? "Local MCP · read pilot"
                            : "Permissions only · adapter pending"}
                        </small>
                      </span>
                      <ChevronRight size={14} />
                    </button>
                  ))}
                </div>
                <section className="agent-settings">
                  <div className="section-heading">
                    <div>
                      <h2>{agent}</h2>
                      <p>Default access is none.</p>
                    </div>
                    <span className="tag">
                      {connectionConfig
                        ? "Configuration ready"
                        : "Connection not configured"}
                    </span>
                  </div>
                  <div className="mcp-setup">
                    <h3>Connect {agent}</h3>
                    <p>{agentSetup(agent).instructions}</p>
                    <p>
                      Choose the memory this agent may read below, then generate
                      its connection. The key expires when you lock or
                      disconnect the vault.
                    </p>
                    <button
                      className="secondary"
                      disabled={demo || busy || !agentSetup(agent).supported}
                      onClick={async () => {
                        const generation = epoch.current;
                        setBusy(true);
                        setError("");
                        try {
                          const config = await bridge.mcpConfig(agent);
                          if (generation === epoch.current)
                            setConnectionConfig(
                              formatAgentConfig(agent, config),
                            );
                        } catch {
                          setError(
                            "Could not generate a connection. Unlock your USB vault in the desktop app first.",
                          );
                        } finally {
                          setBusy(false);
                        }
                      }}
                    >
                      Generate MCP configuration
                    </button>
                    {connectionConfig && (
                      <>
                        <p className="small">
                          Keep Mission unlocked. Node.js must be installed.
                          Regenerating replaces this agent’s previous key.
                        </p>
                        <textarea
                          aria-label="MCP configuration"
                          readOnly
                          value={connectionConfig}
                          rows={12}
                          spellCheck={false}
                        />
                        <p className="small">
                          This configuration contains a temporary access key. It
                          contains no vault passphrase or memory.
                        </p>
                      </>
                    )}
                  </div>
                  <div className="preset-row">
                    <button
                      className="secondary"
                      onClick={() =>
                        void updateGrant({
                          ...emptyGrant(agent),
                          domains: {
                            work: "read",
                            projects: "suggest",
                            routines: "read",
                          },
                        })
                      }
                    >
                      Work assistant
                    </button>
                    <button
                      className="secondary"
                      onClick={() =>
                        void updateGrant({
                          ...emptyGrant(agent),
                          domains: { health: "read", fitness: "read" },
                        })
                      }
                    >
                      Health coach
                    </button>
                    <button
                      className="secondary"
                      onClick={() => void updateGrant(emptyGrant(agent))}
                    >
                      Minimal
                    </button>
                  </div>
                  <div className="permissions-table">
                    {domains.map(([id, label]) => (
                      <div className="permission-row" key={id}>
                        <span>
                          {label}
                          {id === "sensitive" && <Lock size={12} />}
                        </span>
                        <select
                          aria-label={`${label} access`}
                          disabled={id === "sensitive"}
                          value={currentGrant.domains[id] ?? "none"}
                          onChange={(e) =>
                            void updateGrant({
                              ...currentGrant,
                              domains: {
                                ...currentGrant.domains,
                                [id]: e.target
                                  .value as Grant["domains"][string],
                              },
                            })
                          }
                        >
                          {levels.map((l) => (
                            <option key={l} value={l}>
                              {
                                {
                                  none: "None",
                                  summary: "Summary only",
                                  read: "Read",
                                  suggest: "Read + suggest",
                                  write: "Read + write",
                                }[l]
                              }
                            </option>
                          ))}
                        </select>
                      </div>
                    ))}
                  </div>
                  <div className="fine-controls">
                    <label>
                      Sensitivity ceiling
                      <select
                        value={currentGrant.ceiling}
                        onChange={(e) =>
                          void updateGrant({
                            ...currentGrant,
                            ceiling: e.target.value as Grant["ceiling"],
                          })
                        }
                      >
                        <option value="public">Public</option>
                        <option value="personal">Personal</option>
                        <option value="private">Private</option>
                      </select>
                    </label>
                    <label>
                      Grant duration
                      <select
                        value={currentGrant.expiresAt ? "hour" : "session"}
                        onChange={(e) =>
                          void updateGrant({
                            ...currentGrant,
                            expiresAt:
                              e.target.value === "hour"
                                ? new Date(Date.now() + 3600000).toISOString()
                                : null,
                          })
                        }
                      >
                        <option value="session">Until revoked</option>
                        <option value="hour">1 hour from now</option>
                      </select>
                    </label>
                  </div>
                  <p className="small">
                    Mission can stop future access. It cannot erase information
                    an agent has already received. Use your provider’s temporary
                    chat or memory settings where available.
                  </p>
                </section>
              </div>
            </>
          )}

          {page === "Review inbox" && (
            <>
              <div className="page-heading">
                <div>
                  <h1>A second look, before it stays.</h1>
                  <p>
                    Suggestions from your assistants and connected sources
                    belong here.
                  </p>
                </div>
                <span className="tag">{data.proposals.length} to review</span>
              </div>
              {data.proposals.length === 0 && (
                <Empty
                  icon={Inbox}
                  title="Nothing waiting for your say."
                  text="Import a note from Sources. It will wait here until you choose to keep it."
                />
              )}
              <div className="proposal-list">
                {data.proposals.map((proposal) => (
                  <section className="source-card" key={proposal.id}>
                    <span className="tag">
                      {proposal.agent} · {proposal.item.domain}
                    </span>
                    <h2>{proposal.item.title}</h2>
                    <p className="proposal-body">{proposal.item.body}</p>
                    <p className="small">{proposal.reason}</p>
                    <div className="detail-actions">
                      <button
                        disabled={busy}
                        className="primary"
                        onClick={() => void reviewProposal(proposal.id, true)}
                      >
                        Keep this memory
                      </button>
                      <button
                        disabled={busy}
                        className="secondary"
                        onClick={() => void reviewProposal(proposal.id, false)}
                      >
                        Dismiss
                      </button>
                    </div>
                  </section>
                ))}
              </div>
              <div className="review-principles">
                <div>
                  <ArrowDownLeft size={22} />
                  <h3>Arrives as a suggestion</h3>
                  <p>Each change will carry a source and a reason.</p>
                </div>
                <div>
                  <Search size={22} />
                  <h3>You see what changes</h3>
                  <p>Compare the old and new context before deciding.</p>
                </div>
                <div>
                  <Check size={22} />
                  <h3>You make the call</h3>
                  <p>Keep or dismiss. The choice stays yours.</p>
                </div>
              </div>
            </>
          )}
          {page === "Sources" && (
            <>
              <div className="page-heading">
                <div>
                  <h1>Context from your everyday.</h1>
                  <p>
                    Bring useful signals together, with a clear boundary around
                    each.
                  </p>
                </div>
              </div>
              <div className="notice">
                <Link2 size={18} />
                <p>
                  Connectors are planned. No accounts are connected and no
                  information is being fetched.
                </p>
              </div>
              <div className="sources-grid">
                <section className="source-card">
                  <div className="source-icon">
                    <FileText size={23} />
                  </div>
                  <h2>Bring a note with you</h2>
                  <p>
                    Choose a Markdown or text note, or a JSON array of Mission
                    memory items. Every item goes to your review inbox first.
                  </p>
                  <label className="import-control">
                    Choose a file
                    <input
                      aria-label="Import memory file"
                      disabled={busy}
                      type="file"
                      accept=".md,.txt,.json"
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        event.target.value = "";
                        if (file) void importFile(file);
                      }}
                    />
                  </label>
                  <p className="small">Up to 1 MB · 100 items per import</p>
                </section>
                {[
                  [
                    "Gmail & Google Calendar",
                    "Appointments and commitments, ready for your review.",
                  ],
                  [
                    "Apple Reminders & Calendar",
                    "Your plans and reminders, through the macOS app.",
                  ],
                  [
                    "Notion",
                    "Selected pages and projects, with explicit permissions.",
                  ],
                  [
                    "WHOOP",
                    "Sleep, recovery and activity. A later integration.",
                  ],
                  ["Ollama", "A chief of staff that runs on your own machine."],
                ].map(([title, description]) => (
                  <section className="source-card" key={title}>
                    <div className="source-icon">
                      <Link2 size={23} />
                    </div>
                    <h2>{title}</h2>
                    <p>{description}</p>
                    <span className="tag">Planned</span>
                  </section>
                ))}
              </div>
            </>
          )}
          {page === "Security" && (
            <>
              <div className="page-heading">
                <div>
                  <h1>Trust should be specific.</h1>
                  <p>What this build does, and what still needs proving.</p>
                </div>
                <Shield size={32} />
              </div>
              <section className="security-summary">
                <Lock size={25} />
                <div>
                  <h2>
                    {demo
                      ? "No device is connected."
                      : "Development vault session"}
                  </h2>
                  <p>
                    {demo
                      ? "This browser preview holds temporary data in this tab. It does not test USB storage or encryption."
                      : "The native core uses Argon2id, authenticated key wrapping and SQLCipher. Release security validation is still required."}
                  </p>
                </div>
              </section>
              {[
                [
                  "Storage",
                  "The desktop core targets the removable device. OS paging, crash dumps and WebView behaviour still require platform testing.",
                ],
                [
                  "On disconnect",
                  "The design revokes new access and clears the view. The one-second removal target has not been verified with physical hardware.",
                ],
                [
                  "Already shared context",
                  "Information already delivered to an agent may remain in its conversation, logs or provider systems.",
                ],
                [
                  "Sensitive memories",
                  "Sensitive storage is disabled until the separate-unlock boundary is implemented.",
                ],
                [
                  "Recovery",
                  "Recovery kits are not implemented. Do not store irreplaceable information in this development build.",
                ],
                [
                  "External services",
                  "No telemetry, remote agent transport or account connections are enabled.",
                ],
              ].map(([title, description]) => (
                <div className="security-row" key={title}>
                  <h3>{title}</h3>
                  <p>{description}</p>
                </div>
              ))}
            </>
          )}
        </main>
        <footer className="workspace-footer">
          <span>
            <span className="connection-dot" />
            {demo
              ? "Browser preview · no device connected"
              : "Device session active"}
          </span>
          <span>Mission Core / 0.1 development</span>
        </footer>
      </div>
      {editor && (
        <Editor
          item={editor}
          busy={busy}
          error={error}
          onClose={() => setEditor(null)}
          onSave={save}
        />
      )}
    </div>
  );
}
function Brand() {
  return (
    <div className="brand">
      <span>Mission</span>
    </div>
  );
}
function Empty({
  icon: Icon,
  title,
  text,
}: {
  icon: typeof BookOpen;
  title: string;
  text: string;
}) {
  return (
    <div className="empty">
      <Icon size={32} strokeWidth={1.25} />
      <h2>{title}</h2>
      <p>{text}</p>
    </div>
  );
}
function Editor({
  item,
  busy,
  error,
  onClose,
  onSave,
}: {
  item: MemoryItem;
  busy: boolean;
  error: string;
  onClose: () => void;
  onSave: (i: MemoryItem) => void;
}) {
  const [draft, setDraft] = useState(item);
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    dialog.current?.showModal();
    return () => dialog.current?.close();
  }, []);
  return (
    <dialog ref={dialog} className="editor-dialog" onCancel={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSave(draft);
        }}
      >
        <div className="section-heading">
          <div>
            <span className="eyebrow">A little more context</span>
            <h2>{item.title ? "Edit memory" : "Remember something."}</h2>
          </div>
          <button
            type="button"
            className="icon-button"
            aria-label="Close editor"
            onClick={onClose}
          >
            <X size={20} />
          </button>
        </div>
        <label>
          Title
          <input
            autoFocus
            required
            maxLength={160}
            value={draft.title}
            placeholder="What would you like to remember?"
            onChange={(e) => setDraft({ ...draft, title: e.target.value })}
          />
        </label>
        <label>
          In your words
          <textarea
            rows={6}
            maxLength={32000}
            value={draft.body}
            placeholder="The details, the reason, the things an assistant should know…"
            onChange={(e) => setDraft({ ...draft, body: e.target.value })}
          />
        </label>
        <div className="form-columns">
          <label>
            Domain
            <select
              value={draft.domain}
              onChange={(e) => setDraft({ ...draft, domain: e.target.value })}
            >
              {domains
                .filter((d) => d[0] !== "sensitive")
                .map((d) => (
                  <option key={d[0]} value={d[0]}>
                    {d[1]}
                  </option>
                ))}
            </select>
          </label>
          <label>
            Type
            <select
              value={draft.type}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  type: e.target.value as MemoryItem["type"],
                })
              }
            >
              {[
                "note",
                "fact",
                "preference",
                "goal",
                "event",
                "person",
                "place",
                "document-ref",
                "health-observation",
              ].map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </label>
        </div>
        <label>
          Visibility
          <select
            value={draft.sensitivity}
            onChange={(e) =>
              setDraft({
                ...draft,
                sensitivity: e.target.value as MemoryItem["sensitivity"],
              })
            }
          >
            <option value="public">Public</option>
            <option value="personal">Personal</option>
            <option value="private">Private</option>
          </select>
        </label>
        <p className="small">
          Visibility sets a ceiling. Each agent still needs permission for this
          domain.
        </p>
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        <div className="dialog-actions">
          <button type="button" className="secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="primary" disabled={busy}>
            {busy ? "Saving…" : "Save memory"}
            <Check size={15} />
          </button>
        </div>
      </form>
    </dialog>
  );
}
