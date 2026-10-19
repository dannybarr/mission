import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, Shield } from "lucide-react";
import * as bridge from "./bridge";
import { newItem, type MemoryItem } from "./model";
import "./requesty.css";

export function RequestyPilot({
  items,
  preview,
  onDraft,
}: {
  items: MemoryItem[];
  preview: boolean;
  onDraft: (item: MemoryItem) => void;
}) {
  const keyInput = useRef<HTMLInputElement>(null);
  const [ready, setReady] = useState(false);
  const [models, setModels] = useState<string[]>([]);
  const [model, setModel] = useState("");
  const [question, setQuestion] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [approved, setApproved] = useState(false);
  const [answer, setAnswer] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    if (preview) return;
    let active = true;
    void bridge
      .requestyStatus()
      .then((value) => {
        if (active) setReady(value);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [preview]);
  const choices = items.filter(
    (i) => i.domain !== "sensitive" && i.sensitivity !== "sensitive",
  );
  const included = selected
    .map((id) => choices.find((i) => i.id === id))
    .filter((item): item is MemoryItem => !!item);
  const contextSize = included.reduce(
    (n, item) =>
      n + item.title.length + item.body.length + item.domain.length + 30,
    0,
  );

  async function connect() {
    const key = keyInput.current?.value.trim() ?? "";
    if (!key) return;
    setBusy(true);
    setError("");
    try {
      await bridge.setRequestyKey(key);
      if (keyInput.current) keyInput.current.value = "";
      setReady(true);
      try {
        setModels(await bridge.requestyModels());
      } catch (cause) {
        setError(
          `Key held for this session. ${typeof cause === "string" ? cause : "Model discovery is unavailable."} You can enter a Requesty model or policy ID below.`,
        );
      }
    } catch {
      setError(
        "The key could not be accepted. Unlock your USB vault and try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function ask() {
    if (!approved || !model.trim() || !question.trim() || contextSize > 16000)
      return;
    setBusy(true);
    setError("");
    setAnswer("");
    try {
      setAnswer(
        await bridge.requestyAsk(model.trim(), question.trim(), selected),
      );
    } catch (cause) {
      setError(
        `${typeof cause === "string" ? cause : "Requesty could not answer."} Nothing was added to memory.`,
      );
    } finally {
      setBusy(false);
      setApproved(false);
    }
  }

  return (
    <section className="requesty-panel" aria-labelledby="requesty-heading">
      <div className="section-heading">
        <div>
          <span className="requesty-eyebrow">Hosted intelligence · pilot</span>
          <h2 id="requesty-heading">Think with your memory</h2>
          <p>Ask a question using only the memories you choose.</p>
        </div>
        <span className="tag">Requesty</span>
      </div>
      <p className="requesty-disclosure">
        <Shield size={17} /> Your vault stays on the USB. A question and any
        selected memory are sent to Requesty and its model provider when you
        press Ask. Answers stay temporary until you choose to save one.
      </p>
      {preview ? (
        <p className="small">
          Open the desktop app and unlock a USB vault to connect your key.
        </p>
      ) : (
        <>
          <div className="requesty-field">
            <label htmlFor="requesty-key">Requesty API key</label>
            <div className="requesty-inline">
              <input
                ref={keyInput}
                id="requesty-key"
                type="password"
                autoComplete="off"
                placeholder={
                  ready ? "Key active for this session" : "Paste your key"
                }
                disabled={busy}
              />
              <button
                className="secondary"
                type="button"
                onClick={() => void connect()}
                disabled={busy}
              >
                Use key
              </button>
            </div>
            <small>
              {ready
                ? "Key is held in app memory until the vault locks. Enter a new key to replace it."
                : "Your key is never written to the USB or app settings."}
            </small>
          </div>
          <div className="requesty-field">
            <label htmlFor="requesty-model">Model or policy</label>
            <div className="requesty-inline">
              <input
                id="requesty-model"
                list="requesty-models"
                value={model}
                onChange={(e) => {
                  setModel(e.target.value);
                  setApproved(false);
                }}
                placeholder="Choose from the list or enter a Requesty ID"
                disabled={!ready || busy}
              />
              <datalist id="requesty-models">
                {models.map((id) => (
                  <option key={id} value={id} />
                ))}
              </datalist>
              <button
                className="secondary"
                type="button"
                disabled={!ready || busy}
                onClick={() =>
                  void bridge
                    .requestyModels()
                    .then(setModels)
                    .catch(() => setError("Could not refresh Requesty models."))
                }
              >
                Find models
              </button>
            </div>
            <small>
              {models.length
                ? `${models.length} listed by Requesty. Your key's restrictions still decide which can run.`
                : "A configured Requesty policy ID also works. No model has been chosen for you."}
            </small>
          </div>
          <div className="requesty-field">
            <span className="requesty-label">Memory to include</span>
            <div className="requesty-choices">
              {choices.length ? (
                choices.map((item) => (
                  <label key={item.id}>
                    <input
                      type="checkbox"
                      checked={selected.includes(item.id)}
                      disabled={
                        busy ||
                        (!selected.includes(item.id) && selected.length >= 12)
                      }
                      onChange={(e) => {
                        setSelected((previous) =>
                          e.target.checked
                            ? [...previous, item.id]
                            : previous.filter((id) => id !== item.id),
                        );
                        setApproved(false);
                        setAnswer("");
                      }}
                    />
                    <span>
                      {item.title}
                      <small>
                        {item.domain} · {item.sensitivity}
                      </small>
                    </span>
                  </label>
                ))
              ) : (
                <p className="small">
                  No memory yet. You can ask without sending memory, or complete
                  onboarding first.
                </p>
              )}
            </div>
            <small>
              Select up to 12 memories. Nothing is selected by default.
            </small>
          </div>
          <div className="requesty-field">
            <label htmlFor="requesty-question">
              What would you like help thinking through?
            </label>
            <textarea
              id="requesty-question"
              rows={3}
              maxLength={2000}
              value={question}
              onChange={(e) => {
                setQuestion(e.target.value);
                setApproved(false);
              }}
              placeholder="What should I focus on this week?"
              disabled={!ready || busy}
            />
          </div>
          <details className="requesty-preview">
            <summary>
              Review the selected information ({included.length} memories)
            </summary>
            <p>
              <strong>Question:</strong> {question || "No question yet"}
            </p>
            {included.map((item) => (
              <div key={item.id}>
                <strong>
                  {item.domain} · {item.title}
                </strong>
                <p>{item.body}</p>
              </div>
            ))}
          </details>
          <label className="requesty-consent">
            <input
              type="checkbox"
              checked={approved}
              disabled={!ready || busy}
              onChange={(e) => setApproved(e.target.checked)}
            />
            <span>
              I approve sending this question and selected memory to Requesty
              for this request.
            </span>
          </label>
          <button
            className="primary"
            type="button"
            disabled={
              !ready ||
              busy ||
              !approved ||
              !model.trim() ||
              !question.trim() ||
              contextSize > 16000
            }
            onClick={() => void ask()}
          >
            {busy ? "Working…" : "Ask with selected memory"}{" "}
            <ArrowUpRight size={16} />
          </button>
          {contextSize > 16000 && (
            <p className="small">
              Choose less memory for this request (16 KB limit).
            </p>
          )}
          {error && (
            <p role="alert" className="requesty-error">
              {error}
            </p>
          )}
          {answer && (
            <div className="requesty-answer">
              <span className="requesty-eyebrow">Response · not saved</span>
              <p>{answer}</p>
              <button
                className="secondary"
                type="button"
                onClick={() =>
                  onDraft(newItem("AI response to review", answer, "identity"))
                }
              >
                Review as a memory draft
              </button>
            </div>
          )}
        </>
      )}
    </section>
  );
}
