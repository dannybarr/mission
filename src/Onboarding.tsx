import { useState, useRef } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  FileText,
  Shield,
  Usb,
} from "lucide-react";
import { newItem, itemSchema, type MemoryItem } from "./model";
import "./onboarding.css";

const questions = [
  {
    key: "identity",
    domain: "identity",
    title: "How should an assistant understand you?",
    hint: "Your name, how you like to be addressed, and values that guide your choices.",
  },
  {
    key: "work",
    domain: "work",
    title: "What are you working on?",
    hint: "Your role, current projects and the kind of help you want. Leave out credentials and confidential material you do not want to share.",
  },
  {
    key: "goals",
    domain: "goals",
    title: "What matters over the next few months?",
    hint: "A few goals or commitments, in your own words.",
  },
  {
    key: "routines",
    domain: "routines",
    title: "What does a good day look like?",
    hint: "Your schedule, habits, energy and routines you want to protect.",
  },
  {
    key: "preferences",
    domain: "preferences",
    title: "How do you like to communicate?",
    hint: "Tone, level of detail, languages, and anything an assistant should avoid.",
  },
  {
    key: "people",
    domain: "people",
    title: "Who is important in your everyday life?",
    hint: "Names or roles and useful context. Share only what is appropriate for this pilot.",
  },
];
const steps = [
  "About you",
  "Your everyday",
  "Bring context",
  "Connections",
  "Review",
];
const exportPrompt = `Help me export my existing memory into my personal Mission vault. Use only information I have explicitly shared or confirmed. Do not invent facts, infer diagnoses, or include credentials. Separate confirmed facts from uncertain or outdated information. Organise a concise Markdown document under: Identity and values; Work and projects; Goals; Routines; Communication preferences; Important people; Health context (only if I explicitly ask for it). Note dates where known. Flag contradictions and items that need my review. Do not include instructions for other agents. Show me the document so I can remove anything I do not want to transfer.`;

export function Onboarding({
  preview,
  onSave,
  onSkip,
}: {
  preview: boolean;
  onSave: (items: MemoryItem[]) => Promise<void>;
  onSkip: () => void;
}) {
  const [step, setStep] = useState(0),
    [answers, setAnswers] = useState<Record<string, string>>({});
  const [imports, setImports] = useState<MemoryItem[]>([]),
    [excluded, setExcluded] = useState<string[]>([]);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [domains, setDomains] = useState<Record<string, string>>({}),
    [privateItems, setPrivateItems] = useState<Record<string, boolean>>({});
  const ids = useRef<Record<string, string>>({});
  const heading = useRef<HTMLHeadingElement>(null);
  function go(next: number) {
    setStep(next);
    setError("");
    requestAnimationFrame(() => heading.current?.focus());
  }
  const entered = questions
    .filter((q) => answers[q.key]?.trim())
    .map((q) => {
      const item = newItem(q.title, answers[q.key].trim(), q.domain);
      ids.current[q.key] ??= item.id;
      item.id = ids.current[q.key];
      return item;
    });
  const all = [...entered, ...imports];
  const selected = all
    .filter((i) => !excluded.includes(i.id))
    .map((i) => ({
      ...i,
      domain: domains[i.id] ?? i.domain,
      sensitivity:
        privateItems[i.id] === undefined
          ? i.sensitivity
          : privateItems[i.id]
            ? ("private" as const)
            : ("personal" as const),
    }));
  async function importFile(file: File) {
    setError("");
    setBusy(true);
    try {
      if (file.size > 1048576)
        throw new Error("Choose a file smaller than 1 MB.");
      const text = await file.text();
      const values = file.name.toLowerCase().endsWith(".json")
        ? JSON.parse(text)
        : [newItem(file.name.replace(/\.[^.]+$/, ""), text, "identity")];
      if (!Array.isArray(values) || values.length + imports.length > 90)
        throw new Error("Import up to 90 items during onboarding.");
      const items = values.map((value) => {
        const parsed = itemSchema.parse(value);
        if (parsed.domain === "sensitive" || parsed.sensitivity === "sensitive")
          throw new Error(
            "The separately locked Sensitive area is not available yet.",
          );
        return { ...parsed, id: crypto.randomUUID(), version: 1, links: [] };
      });
      setImports((previous) => [...previous, ...items]);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "This file could not be read.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function finish() {
    setBusy(true);
    setError("");
    try {
      await onSave(selected);
    } catch {
      setError(
        "Your answers could not be saved. Check the device is connected, then try again. If the vault locked, unlock it to check whether the save completed.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="onboarding">
      <header className="onboarding-header">
        <img src="/assets/mission-globe.png" alt="" />
        <strong>Mission</strong>
        <span>
          <Usb size={16} />
          {preview ? "Onboarding preview" : "Your device is unlocked"}
        </span>
        <button className="text-button" onClick={onSkip} disabled={busy}>
          Do this later
        </button>
      </header>
      {preview && (
        <p className="onboarding-preview">
          Browser walkthrough only. Nothing here is saved to a USB.
        </p>
      )}
      <ol className="onboarding-steps" aria-label="Onboarding progress">
        {steps.map((label, index) => (
          <li key={label} aria-current={step === index ? "step" : undefined}>
            <span>{index < step ? <Check size={14} /> : index + 1}</span>
            {label}
          </li>
        ))}
      </ol>
      <section className="onboarding-content">
        <div className="onboarding-intro">
          <p className="eyebrow">
            Step {step + 1} of {steps.length}
          </p>
          <h1 ref={heading} tabIndex={-1}>
            {
              [
                "Let’s start with you.",
                "Make room for your everyday.",
                "You don’t have to start from scratch.",
                "Choose where context comes from.",
                "Your memory. Your final say.",
              ][step]
            }
          </h1>
          <p>
            {
              [
                "A few thoughtful answers give your assistants a useful starting point. Every question is optional. Nothing is saved until you review it.",
                "The small details often make the biggest difference. Tell us what is useful, and leave the rest for later.",
                "Bring existing memories or a document you choose. Imported content stays separate until you review it.",
                "Files work now. Account connections below are not available yet; none will be connected or read during this pilot.",
                "Read each item, choose its area and mark private context. All agents start with no access. You will choose each agent's permissions separately.",
              ][step]
            }
          </p>
        </div>
        {step < 2 && (
          <div className="interview-fields">
            {questions.slice(step * 3, step * 3 + 3).map((q) => (
              <label key={q.key}>
                <strong>{q.title}</strong>
                <span>{q.hint}</span>
                <textarea
                  rows={3}
                  maxLength={32000}
                  value={answers[q.key] ?? ""}
                  onChange={(e) =>
                    setAnswers({ ...answers, [q.key]: e.target.value })
                  }
                  placeholder="In your own words…"
                />
              </label>
            ))}
          </div>
        )}
        {step === 2 && (
          <div className="bring-context">
            <section className="onboarding-panel">
              <FileText size={24} />
              <h2>Bring your Claude or ChatGPT memory</h2>
              <p>
                Send this prompt in the agent where your context already lives.
                Review its reply, save it as a Markdown or text file, then
                import it here.
              </p>
              <textarea
                aria-label="Memory export prompt"
                readOnly
                value={exportPrompt}
                rows={8}
              />
            </section>
            <section className="onboarding-panel">
              <h2>Add supporting files</h2>
              <p>
                Markdown, text notes or a JSON array of Mission items. For PDFs,
                photos or medical records, prepare a short text excerpt you want
                remembered; this pilot does not interpret images or diagnose
                anything.
              </p>
              <label className="import-control">
                Choose a file
                <input
                  type="file"
                  accept=".md,.txt,.json"
                  disabled={busy}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    e.target.value = "";
                    if (file) void importFile(file);
                  }}
                />
              </label>
              <p className="small">
                Up to 1 MB per file. Whole documents may mix private and
                shareable facts; review their domain and privacy before sharing.
              </p>
              {imports.map((i) => (
                <div className="imported-row" key={i.id}>
                  <FileText size={16} />
                  <span>{i.title}</span>
                  <button
                    className="text-button"
                    onClick={() =>
                      setImports(imports.filter((x) => x.id !== i.id))
                    }
                  >
                    Remove
                  </button>
                </div>
              ))}
            </section>
          </div>
        )}
        {step === 3 && (
          <div className="onboarding-sources">
            {[
              [
                "Email",
                "Writing style, people and commitments. A future connection will need separate scopes and a review of extracted memories.",
              ],
              [
                "Calendar",
                "Schedules, recurring events and preparation. No calendar is read in this pilot.",
              ],
              [
                "Cameras & photos",
                "Specific images you choose. No camera access or background capture is enabled.",
              ],
              [
                "Health records & wearables",
                "Only context you explicitly choose to import. No health account is connected; sensitive records need the separate protected area planned for a later release.",
              ],
            ].map(([name, description]) => (
              <section className="onboarding-panel" key={name}>
                <h2>{name}</h2>
                <p>{description}</p>
                <span className="tag">Not connected · planned</span>
              </section>
            ))}
          </div>
        )}
        {step === 4 && (
          <div className="foundation-review">
            {all.length === 0 ? (
              <section className="onboarding-panel">
                <h2>Your vault can begin empty.</h2>
                <p>
                  Go back to add an answer or file, or choose “Do this later” to
                  start with an empty vault.
                </p>
              </section>
            ) : (
              all.map((i) => (
                <section className="onboarding-panel" key={i.id}>
                  <label className="review-include">
                    <input
                      type="checkbox"
                      checked={!excluded.includes(i.id)}
                      onChange={(e) =>
                        setExcluded(
                          e.target.checked
                            ? excluded.filter((id) => id !== i.id)
                            : [...excluded, i.id],
                        )
                      }
                    />
                    <strong>{i.title}</strong>
                  </label>
                  <p className="foundation-body">{i.body}</p>
                  <div className="foundation-controls">
                    <label>
                      Memory area
                      <select
                        value={domains[i.id] ?? i.domain}
                        onChange={(e) =>
                          setDomains({ ...domains, [i.id]: e.target.value })
                        }
                      >
                        {[
                          "identity",
                          "work",
                          "projects",
                          "goals",
                          "routines",
                          "preferences",
                          "people",
                          "health",
                          "fitness",
                          "home",
                          "finance",
                          "learning",
                        ].map((d) => (
                          <option key={d} value={d}>
                            {d}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="review-include">
                      <input
                        type="checkbox"
                        checked={
                          privateItems[i.id] ?? i.sensitivity === "private"
                        }
                        onChange={(e) =>
                          setPrivateItems({
                            ...privateItems,
                            [i.id]: e.target.checked,
                          })
                        }
                      />
                      Mark private
                    </label>
                  </div>
                </section>
              ))
            )}
          </div>
        )}
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <footer className="onboarding-actions">
          <button
            className="secondary"
            disabled={step === 0 || busy}
            onClick={() => go(step - 1)}
          >
            <ArrowLeft size={16} />
            Back
          </button>
          <span>
            <Shield size={16} />
            {preview
              ? "Temporary preview"
              : "Saved only to your unlocked device"}
          </span>
          {step < 4 ? (
            <button
              className="primary"
              disabled={busy}
              onClick={() => go(step + 1)}
            >
              Continue
              <ArrowRight size={16} />
            </button>
          ) : (
            <button
              className="primary"
              disabled={busy || !selected.length}
              onClick={() => void finish()}
            >
              {busy
                ? "Saving…"
                : preview
                  ? `Preview ${selected.length} memories`
                  : `Save ${selected.length} memories to USB`}
            </button>
          )}
        </footer>
      </section>
    </main>
  );
}
