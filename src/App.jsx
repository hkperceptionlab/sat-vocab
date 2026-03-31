import { useState, useEffect, useMemo } from "react";

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const MODEL = "claude-sonnet-4-20250514";
let generatedBank = [];
let generating = false;
let genResolvers = [];

async function generateMoreWords(startId, count = 8) {
  if (generating) return new Promise(r => genResolvers.push(r));
  generating = true;
  const prompt = `Generate ${count} SAT vocabulary quiz entries starting from word #${startId}.
Focus on HIGH-FREQUENCY SAT polysemous words. Base definitions strictly on Merriam-Webster.
Return ONLY a valid JSON array, no markdown:
[{"id":"006","word":"SANCTION","step1_options":[{"text":"Official permission","correct":true},{"text":"A penalty for breaking a rule","correct":true},{"text":"To officially authorize","correct":true},{"text":"To secretly hide information","correct":false}],"step1_incorrect":"To secretly hide information","step2_sentences":[{"sentence":"The UN imposed economic sanctions on the country.","answer":"A penalty/punishment","options":["Official approval","A penalty/punishment","To authorize"]},{"sentence":"The board sanctioned the new policy after debate.","answer":"To officially authorize","options":["Official approval","A penalty/punishment","To authorize"]},{"sentence":"The experiment had the full sanction of the ethics committee.","answer":"Official approval","options":["Official approval","A penalty/punishment","To authorize"]}],"step3_synonyms":[{"text":"Ratify","correct":true},{"text":"Penalize","correct":true},{"text":"Prohibit","correct":false},{"text":"Ignore","correct":false}],"step3_antonyms":[{"text":"Prohibit / Ban","correct":true},{"text":"Penalize","correct":false},{"text":"Authorize","correct":false},{"text":"Reward","correct":false}],"step4_clues":["'Economic sanctions' → penalties","'Sanctioned by law' → authorized","CAN mean both permission AND punishment"],"simple_popup":"SANCTION = permission OR punishment\\nSAT trap: 'sanctions' often = penalties\\n'Sanctioned' often = officially approved"}]`;
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: MODEL, max_tokens: 6000, messages: [{ role: "user", content: prompt }] })
    });
    const data = await res.json();
    const txt = data.content?.find(b => b.type === "text")?.text || "[]";
    const clean = txt.replace(/```json|```/g, "").trim();
    const words = JSON.parse(clean);
    generatedBank = [...generatedBank, ...words];
    genResolvers.forEach(r => r()); genResolvers = [];
  } catch (e) { console.error(e); }
  generating = false;
}

const STEPS = ["Odd One Out", "Context Match", "Synonym / Antonym", "Invisible Clue"];
const SC = ["#6366f1", "#10b981", "#f59e0b", "#ec4899"];

function speak(word) {
  if (!window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  const utt = new SpeechSynthesisUtterance(word);
  utt.lang = "en-US"; utt.rate = 0.85;
  window.speechSynthesis.speak(utt);
}

function Step3({ word, onComplete, addScore, dark, card, text, sub, border, inputBg }) {
  const [mode, setMode] = useState("synonyms");
  const [synSel, setSynSel] = useState([]);
  const [synRev, setSynRev] = useState(false);
  const [antSel, setAntSel] = useState(null);
  const [antRev, setAntRev] = useState(false);

  const toggleSyn = (i) => { if (synRev) return; setSynSel(p => p.includes(i) ? p.filter(x => x !== i) : [...p, i]); };
  const confirmSyn = () => {
    const correctIdxs = word.step3_synonyms.map((o, i) => o.correct ? i : -1).filter(i => i >= 0);
    const ok = synSel.length === correctIdxs.length && correctIdxs.every(i => synSel.includes(i));
    addScore(ok); setSynRev(true);
  };
  const pickAnt = (i) => {
    if (antRev) return;
    setAntSel(i); addScore(word.step3_antonyms[i].correct); setAntRev(true);
  };

  return (
    <div style={{ background: card, borderRadius: 16, padding: 24, border: `1px solid ${border}` }}>
      <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
        {["synonyms", "antonyms"].map(m => (
          <button key={m} onClick={() => setMode(m)}
            style={{ flex: 1, padding: "10px", border: `2px solid ${mode === m ? SC[2] : border}`, borderRadius: 10, background: mode === m ? SC[2] + "22" : inputBg, color: mode === m ? SC[2] : sub, fontWeight: 700, cursor: "pointer", fontSize: 13, transition: "all 0.2s", position: "relative" }}>
            {m === "synonyms" ? "🔗 Synonyms" : "🔄 Antonyms"}
            {m === "synonyms" && synRev && <span style={{ position: "absolute", top: -6, right: -6, background: "#10b981", borderRadius: "50%", width: 16, height: 16, fontSize: 9, display: "flex", alignItems: "center", justifyContent: "center", color: "white" }}>✓</span>}
            {m === "antonyms" && antRev && <span style={{ position: "absolute", top: -6, right: -6, background: "#10b981", borderRadius: "50%", width: 16, height: 16, fontSize: 9, display: "flex", alignItems: "center", justifyContent: "center", color: "white" }}>✓</span>}
          </button>
        ))}
      </div>

      {mode === "synonyms" && (
        <div>
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4, color: text }}>Select ALL synonyms of <span style={{ color: SC[2] }}>{word.word}</span></div>
          <div style={{ color: sub, fontSize: 13, marginBottom: 16 }}>Multiple answers may be correct.</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {word.step3_synonyms.map((opt, i) => {
              const isSel = synSel.includes(i);
              let bg2 = inputBg, bdr = border;
              if (synRev) { if (opt.correct) { bg2 = "#10b98122"; bdr = "#10b981"; } else if (isSel) { bg2 = "#ef444422"; bdr = "#ef4444"; } }
              return (
                <button key={i} onClick={() => toggleSyn(i)}
                  style={{ background: bg2, border: `2px solid ${isSel && !synRev ? SC[2] : bdr}`, borderRadius: 12, padding: "13px 18px", cursor: synRev ? "default" : "pointer", color: text, textAlign: "left", fontSize: 14, transition: "all 0.2s", display: "flex", justifyContent: "space-between" }}>
                  <span><span style={{ fontWeight: 700, color: SC[2], marginRight: 8 }}>{String.fromCharCode(65 + i)}.</span>{opt.text}</span>
                  {synRev && opt.correct && <span style={{ color: "#10b981", fontWeight: 700, fontSize: 12 }}>✓ Synonym</span>}
                  {synRev && isSel && !opt.correct && <span style={{ color: "#ef4444", fontWeight: 700, fontSize: 12 }}>✗</span>}
                </button>
              );
            })}
          </div>
          {!synRev
            ? <button onClick={confirmSyn} style={{ marginTop: 16, background: SC[2], border: "none", borderRadius: 10, padding: "10px 24px", color: "white", fontWeight: 700, cursor: "pointer", fontSize: 14 }}>Check Answer →</button>
            : <div style={{ marginTop: 16, background: SC[2] + "11", border: `1px solid ${SC[2]}44`, borderRadius: 12, padding: 14 }}>
              <div style={{ fontWeight: 700, color: SC[2], marginBottom: 4 }}>Synonyms: {word.step3_synonyms.filter(o => o.correct).map(o => o.text).join(", ")}</div>
              <div style={{ fontSize: 13, color: sub, marginBottom: 10 }}>Synonyms help you substitute directly in SAT fill-in-the-blank questions.</div>
              {!antRev
                ? <button onClick={() => setMode("antonyms")} style={{ background: SC[2], border: "none", borderRadius: 10, padding: "8px 20px", color: "white", fontWeight: 700, cursor: "pointer", fontSize: 13 }}>Check Antonyms →</button>
                : <button onClick={onComplete} style={{ background: SC[2], border: "none", borderRadius: 10, padding: "10px 24px", color: "white", fontWeight: 700, cursor: "pointer", fontSize: 14 }}>Next Step →</button>}
            </div>}
        </div>
      )}

      {mode === "antonyms" && (
        <div>
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4, color: text }}>Select the ANTONYM of <span style={{ color: SC[2] }}>{word.word}</span></div>
          <div style={{ color: sub, fontSize: 13, marginBottom: 16 }}>Choose one antonym.</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {word.step3_antonyms.map((opt, i) => {
              const isSel = antSel === i;
              let bg2 = inputBg, bdr = border;
              if (antRev) { if (opt.correct) { bg2 = "#10b98122"; bdr = "#10b981"; } else if (isSel) { bg2 = "#ef444422"; bdr = "#ef4444"; } }
              return (
                <button key={i} onClick={() => pickAnt(i)}
                  style={{ background: bg2, border: `2px solid ${bdr}`, borderRadius: 12, padding: "13px 18px", cursor: antRev ? "default" : "pointer", color: text, textAlign: "left", fontSize: 14, transition: "all 0.2s", display: "flex", justifyContent: "space-between" }}>
                  <span><span style={{ fontWeight: 700, color: SC[2], marginRight: 8 }}>{String.fromCharCode(65 + i)}.</span>{opt.text}</span>
                  {antRev && opt.correct && <span style={{ color: "#10b981", fontWeight: 700, fontSize: 12 }}>✓ Antonym</span>}
                  {antRev && isSel && !opt.correct && <span style={{ color: "#ef4444", fontWeight: 700, fontSize: 12 }}>✗</span>}
                </button>
              );
            })}
          </div>
          {antRev && (
            <div style={{ marginTop: 16, background: SC[2] + "11", border: `1px solid ${SC[2]}44`, borderRadius: 12, padding: 14 }}>
              <div style={{ fontWeight: 700, color: SC[2], marginBottom: 4 }}>Antonym: {word.step3_antonyms.find(o => o.correct)?.text}</div>
              <div style={{ fontSize: 13, color: sub, marginBottom: 10 }}>Knowing antonyms helps eliminate wrong answers instantly.</div>
              {!synRev
                ? <button onClick={() => setMode("synonyms")} style={{ background: SC[2], border: "none", borderRadius: 10, padding: "8px 20px", color: "white", fontWeight: 700, cursor: "pointer", fontSize: 13 }}>Check Synonyms →</button>
                : <button onClick={onComplete} style={{ background: SC[2], border: "none", borderRadius: 10, padding: "10px 24px", color: "white", fontWeight: 700, cursor: "pointer", fontSize: 14 }}>Next Step →</button>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ReviewMode({ missedWords, onBack, dark }) {
  const [idx, setIdx] = useState(0);
  const [cleared, setCleared] = useState([]);
  const remaining = missedWords.filter((_, i) => !cleared.includes(i));
  const bg = dark ? "#0f0f1a" : "#f8fafc";
  const card = dark ? "#1e1e2e" : "#ffffff";
  const text = dark ? "#e2e8f0" : "#1e293b";
  const sub = dark ? "#94a3b8" : "#64748b";
  const border = dark ? "#2d2d44" : "#e2e8f0";

  if (remaining.length === 0) return (
    <div style={{ minHeight: "100vh", background: bg, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 20, padding: 20 }}>
      <div style={{ fontSize: 48 }}>🎉</div>
      <div style={{ fontWeight: 800, fontSize: 24, color: text }}>All Cleared!</div>
      <div style={{ color: sub, fontSize: 15 }}>You've reviewed all missed words.</div>
      <button onClick={onBack} style={{ background: SC[0], border: "none", borderRadius: 12, padding: "12px 32px", color: "white", fontWeight: 700, cursor: "pointer", fontSize: 16 }}>Back to Quiz</button>
    </div>
  );

  const cur = remaining[idx % remaining.length];
  return (
    <div style={{ minHeight: "100vh", background: bg, color: text, fontFamily: "'Segoe UI',system-ui,sans-serif" }}>
      <div style={{ background: card, borderBottom: `1px solid ${border}`, padding: "12px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", position: "sticky", top: 0, zIndex: 100 }}>
        <button onClick={onBack} style={{ background: "none", border: `1px solid ${border}`, borderRadius: 8, padding: "6px 14px", cursor: "pointer", color: text, fontSize: 13, fontWeight: 600 }}>← Back to Quiz</button>
        <div style={{ fontWeight: 800, fontSize: 16, color: "#ef4444" }}>🔁 Review Mode</div>
        <div style={{ color: sub, fontSize: 13 }}>{remaining.length} words left</div>
      </div>
      <div style={{ maxWidth: 600, margin: "40px auto", padding: "0 16px" }}>
        <div style={{ background: card, borderRadius: 16, padding: 28, border: `2px solid #ef444444` }}>
          <div style={{ fontSize: 11, color: sub, letterSpacing: 2, textTransform: "uppercase", marginBottom: 8 }}>Missed Word</div>
          <div onClick={() => speak(cur.word)} style={{ fontSize: 40, fontWeight: 900, color: "#ef4444", marginBottom: 6, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 10 }}>
            {cur.word} <span style={{ fontSize: 18 }}>🔊</span>
          </div>
          <div style={{ marginTop: 20, background: dark ? "#2d2d44" : "#f1f5f9", borderRadius: 12, padding: 16, fontSize: 14, lineHeight: 1.9, whiteSpace: "pre-line", color: text }}>{cur.simple_popup}</div>
          <div style={{ marginTop: 16 }}>
            <div style={{ fontWeight: 700, color: sub, fontSize: 12, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>Key Clues</div>
            {cur.step4_clues.map((c, i) => (
              <div key={i} style={{ background: dark ? "#2d2d44" : "#f1f5f9", borderRadius: 10, padding: 12, marginBottom: 8, borderLeft: `4px solid #ef4444`, fontSize: 13 }}>
                <span style={{ color: "#ef4444", fontWeight: 700, marginRight: 6 }}>Trigger {i + 1}:</span>{c}
              </div>
            ))}
          </div>
          <div style={{ display: "flex", gap: 12, marginTop: 24 }}>
            <button onClick={() => setCleared(p => [...p, missedWords.indexOf(cur)])} style={{ flex: 1, background: "#10b98122", border: "2px solid #10b981", borderRadius: 12, padding: "12px", color: "#10b981", fontWeight: 700, cursor: "pointer", fontSize: 14 }}>✓ Got it — Remove</button>
            <button onClick={() => setIdx(i => (i + 1) % remaining.length)} style={{ flex: 1, background: SC[0] + "22", border: `2px solid ${SC[0]}`, borderRadius: 12, padding: "12px", color: SC[0], fontWeight: 700, cursor: "pointer", fontSize: 14 }}>→ Next Missed</button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const [dark, setDark] = useState(true);
  const [wordBank, setWordBank] = useState([]);
  const [wordIndex, setWordIndex] = useState(0);
  const [step, setStep] = useState(0);
  const [selected, setSelected] = useState(null);
  const [revealed, setRevealed] = useState(false);
  const [popup, setPopup] = useState(null);
  const [score, setScore] = useState({ correct: 0, total: 0 });
  const [stepDone, setStepDone] = useState([false, false, false, false]);
  const [loading, setLoading] = useState(true);
  const [s2answers, setS2answers] = useState([null, null, null]);
  const [s2revealed, setS2revealed] = useState([false, false, false]);
  const [missedWords, setMissedWords] = useState([]);
  const [reviewMode, setReviewMode] = useState(false);
  const [wrongThisWord, setWrongThisWord] = useState(false);

  // Load all JSON files on startup
  useEffect(() => {
    async function loadWords() {
      const files = [
        "sat_words_001_100.json",
        "sat_words_101_200.json",
        "sat_words_201_300.json",
        "sat_words_301_400.json",
        "sat_words_401_500.json"
      ];
      let all = [];
      for (const f of files) {
        try {
          const res = await fetch(`/${f}`);
          const data = await res.json();
          all = [...all, ...data];
        } catch (e) { console.warn(`Could not load ${f}`); }
      }
      if (all.length === 0) {
        // fallback: generate with AI
        setLoading(true);
        await generateMoreWords(1, 10);
        all = [...generatedBank];
      }
      all = shuffle(all);
      setWordBank(all);
      generatedBank = all;
      setLoading(false);
    }
    loadWords();
  }, []);

  const word = wordBank[wordIndex % Math.max(wordBank.length, 1)];

  useEffect(() => {
    if (wordBank.length > 0 && wordIndex >= wordBank.length - 3 && !generating) {
      generateMoreWords(wordBank.length + 1, 8).then(() => {
        setWordBank([...generatedBank]);
      });
    }
  }, [wordIndex, wordBank.length]);

  useEffect(() => {
    setSelected(null); setRevealed(false);
    setS2answers([null, null, null]); setS2revealed([false, false, false]);
    setStepDone([false, false, false, false]); setStep(0); setWrongThisWord(false);
  }, [wordIndex]);

  useEffect(() => {
    setSelected(null); setRevealed(false);
    setS2answers([null, null, null]); setS2revealed([false, false, false]);
  }, [step]);

  const bg = dark ? "#0f0f1a" : "#f8fafc";
  const card = dark ? "#1e1e2e" : "#ffffff";
  const text = dark ? "#e2e8f0" : "#1e293b";
  const sub = dark ? "#94a3b8" : "#64748b";
  const border = dark ? "#2d2d44" : "#e2e8f0";
  const inputBg = dark ? "#2d2d44" : "#f1f5f9";

  const markDone = (i) => { const d = [...stepDone]; d[i] = true; setStepDone(d); };
  const addScore = (ok) => {
    setScore(s => ({ correct: s.correct + (ok ? 1 : 0), total: s.total + 1 }));
    if (!ok && !wrongThisWord) {
      setWrongThisWord(true);
      setMissedWords(prev => prev.find(w => w.id === word.id) ? prev : [...prev, word]);
    }
  };

  const goNext = () => { if (step < 3) setStep(s => s + 1); else setWordIndex(i => i + 1); };
  const goPrev = () => {
    if (step > 0) { const d = [...stepDone]; d[step - 1] = false; setStepDone(d); setStep(s => s - 1); }
    else if (wordIndex > 0) { setWordIndex(i => i - 1); setStep(3); }
  };

  const shuffledStep1Options = useMemo(() => word ? shuffle(word.step1_options) : [], [wordIndex, wordBank]);
  const shuffledStep2Sentences = useMemo(() => word ? word.step2_sentences.map(s => ({ ...s, options: shuffle(s.options) })) : [], [wordIndex, wordBank]);

  const accuracy = score.total > 0 ? Math.round(score.correct / score.total * 100) : 0;
  const s2allDone = s2revealed.every(Boolean);

  const SpeakableWord = ({ children, size = 34 }) => (
    <span onClick={() => speak(String(children))}
      style={{ cursor: "pointer", color: SC[step], fontWeight: 900, fontSize: size, letterSpacing: 2, display: "inline-flex", alignItems: "center", gap: 8 }}>
      {children}<span style={{ fontSize: size * 0.4, opacity: 0.7 }}>🔊</span>
    </span>
  );

  const InlineWord = ({ children }) => (
    <span onClick={() => { speak(word.word); setPopup(word.simple_popup); }}
      style={{ cursor: "pointer", color: SC[step], fontWeight: 700, textDecoration: "underline dotted", padding: "0 2px" }}>
      {children}
    </span>
  );

  if (loading || !word) return (
    <div style={{ minHeight: "100vh", background: "#0f0f1a", display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 16 }}>
      <div style={{ fontSize: 32 }}>⚡</div>
      <div style={{ color: "#6366f1", fontWeight: 700, fontSize: 16 }}>Loading SAT Word Bank...</div>
      <div style={{ color: "#94a3b8", fontSize: 13 }}>Please wait</div>
    </div>
  );

  if (reviewMode) return <ReviewMode missedWords={missedWords} onBack={() => setReviewMode(false)} dark={dark} />;

  return (
    <div style={{ minHeight: "100vh", background: bg, color: text, fontFamily: "'Segoe UI',system-ui,sans-serif", transition: "all 0.3s" }}>
      {/* Header */}
      <div style={{ background: card, borderBottom: `1px solid ${border}`, padding: "12px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", position: "sticky", top: 0, zIndex: 100 }}>
        <div>
          <span style={{ fontWeight: 800, fontSize: 18, background: "linear-gradient(90deg,#6366f1,#ec4899)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>SAT 750+</span>
          <span style={{ color: sub, fontSize: 13, marginLeft: 8 }}>4-Step Vocab</span>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          {missedWords.length > 0 && (
            <button onClick={() => setReviewMode(true)}
              style={{ background: "#ef444422", border: "1px solid #ef4444", borderRadius: 8, padding: "6px 12px", cursor: "pointer", color: "#ef4444", fontSize: 12, fontWeight: 700 }}>
              🔁 Review ({missedWords.length})
            </button>
          )}
          <div style={{ textAlign: "center" }}><div style={{ fontSize: 11, color: sub }}>Score</div><div style={{ fontWeight: 700, color: accuracy >= 70 ? "#10b981" : "#f59e0b" }}>{score.correct}/{score.total}</div></div>
          <div style={{ textAlign: "center" }}><div style={{ fontSize: 11, color: sub }}>Word</div><div style={{ fontWeight: 700 }}>#{wordIndex + 1}</div></div>
          <button onClick={() => setDark(d => !d)} style={{ background: border, border: "none", borderRadius: 8, padding: "6px 12px", cursor: "pointer", color: text, fontSize: 13 }}>{dark ? "☀️" : "🌙"}</button>
        </div>
      </div>

      <div style={{ maxWidth: 700, margin: "0 auto", padding: "24px 16px" }}>
        {/* Word Card */}
        <div style={{ background: card, borderRadius: 16, padding: "20px 24px", marginBottom: 16, border: `1px solid ${border}`, position: "relative", overflow: "hidden" }}>
          <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, background: `linear-gradient(90deg,${SC[0]},${SC[1]},${SC[2]},${SC[3]})` }} />
          {wrongThisWord && <div style={{ position: "absolute", top: 8, right: 8, background: "#ef444422", border: "1px solid #ef4444", borderRadius: 6, padding: "2px 8px", fontSize: 11, color: "#ef4444", fontWeight: 700 }}>⚠ Missed</div>}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <div style={{ fontSize: 11, color: sub, letterSpacing: 2, textTransform: "uppercase", marginBottom: 6 }}>Current Word</div>
              <SpeakableWord>{word.word}</SpeakableWord>
              <div style={{ fontSize: 11, color: sub, marginTop: 4 }}>Click word to hear pronunciation & see definition</div>
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              {STEPS.map((_, i) => (
                <div key={i} style={{ width: 30, height: 30, borderRadius: "50%", background: stepDone[i] ? "#10b981" : i === step ? SC[i] : border, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, color: stepDone[i] || i === step ? "white" : sub, border: i === step ? `2px solid ${SC[i]}` : "none", transition: "all 0.3s" }}>
                  {stepDone[i] ? "✓" : i + 1}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Nav + Badge */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <button onClick={goPrev} disabled={wordIndex === 0 && step === 0}
            style={{ background: card, border: `1px solid ${border}`, borderRadius: 10, padding: "7px 14px", cursor: wordIndex === 0 && step === 0 ? "not-allowed" : "pointer", color: wordIndex === 0 && step === 0 ? sub : text, fontSize: 13, fontWeight: 600, opacity: wordIndex === 0 && step === 0 ? 0.4 : 1 }}>
            ← {step === 0 ? "Prev Word" : "Prev Step"}
          </button>
          <div style={{ background: SC[step] + "22", border: `1px solid ${SC[step]}44`, borderRadius: 8, padding: "4px 14px", fontSize: 12, fontWeight: 700, color: SC[step] }}>
            STEP {step + 1}: {STEPS[step].toUpperCase()}
          </div>
        </div>

        {/* STEP 1 */}
        {step === 0 && (
          <div style={{ background: card, borderRadius: 16, padding: 24, border: `1px solid ${border}` }}>
            <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 4 }}>Which is NOT a meaning of <InlineWord>{word.word}</InlineWord>?</div>
            <div style={{ color: sub, fontSize: 13, marginBottom: 20 }}>Select the option that does NOT belong.</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {shuffledStep1Options.map((opt, i) => {
                const isAns = !opt.correct, isSel = selected === i;
                let bg2 = inputBg, bdr = border;
                if (revealed) { if (isAns) { bg2 = "#10b98122"; bdr = "#10b981"; } else if (isSel) { bg2 = "#ef444422"; bdr = "#ef4444"; } }
                return (
                  <button key={i} onClick={() => { if (revealed) return; setSelected(i); setRevealed(true); markDone(0); addScore(isAns); }}
                    style={{ background: bg2, border: `2px solid ${bdr}`, borderRadius: 12, padding: "13px 18px", cursor: "pointer", color: text, textAlign: "left", fontSize: 14, transition: "all 0.2s", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span><span style={{ fontWeight: 700, color: SC[0], marginRight: 8 }}>{String.fromCharCode(65 + i)}.</span>{opt.text}</span>
                    {revealed && isAns && <span style={{ color: "#10b981", fontWeight: 700, fontSize: 12 }}>✓ NOT a meaning</span>}
                    {revealed && isSel && !isAns && <span style={{ color: "#ef4444", fontWeight: 700, fontSize: 12 }}>✗</span>}
                  </button>
                );
              })}
            </div>
            {revealed && (
              <div style={{ marginTop: 20, background: SC[0] + "11", border: `1px solid ${SC[0]}44`, borderRadius: 12, padding: 16 }}>
                <div style={{ fontWeight: 700, color: SC[0], marginBottom: 6 }}>💡 SAT Trap: "{word.step1_incorrect}"</div>
                <div style={{ fontSize: 13, color: text }}>Students scoring 600–700 often pick a real meaning by accident. Know ALL meanings.</div>
                <button onClick={() => { markDone(0); goNext(); }} style={{ marginTop: 12, background: SC[0], border: "none", borderRadius: 10, padding: "10px 24px", color: "white", fontWeight: 700, cursor: "pointer", fontSize: 14 }}>Next Step →</button>
              </div>
            )}
          </div>
        )}

        {/* STEP 2 */}
        {step === 1 && (
          <div style={{ background: card, borderRadius: 16, padding: 24, border: `1px solid ${border}` }}>
            <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 4 }}>Match each sentence to the correct meaning of <InlineWord>{word.word}</InlineWord></div>
            <div style={{ color: sub, fontSize: 13, marginBottom: 20 }}>Which meaning is used in each sentence?</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
              {shuffledStep2Sentences.map((item, si) => {
                const isRev = s2revealed[si];
                return (
                  <div key={si} style={{ background: inputBg, borderRadius: 14, padding: 16, border: `1px solid ${border}` }}>
                    <div style={{ fontStyle: "italic", fontSize: 14, lineHeight: 1.7, marginBottom: 12, borderLeft: `4px solid ${SC[1]}`, paddingLeft: 12, color: text }}>"{item.sentence}"</div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                      {item.options.map((opt, oi) => {
                        const isCorrect = opt === item.answer, isSel = s2answers[si] === opt;
                        let bg2 = dark ? "#3a3a55" : "#e2e8f0", bdr = "transparent";
                        if (isRev) { if (isCorrect) { bg2 = "#10b98122"; bdr = "#10b981"; } else if (isSel) { bg2 = "#ef444422"; bdr = "#ef4444"; } }
                        return (
                          <button key={oi} onClick={() => {
                            if (isRev) return;
                            const na = [...s2answers]; na[si] = opt; setS2answers(na);
                            const nr = [...s2revealed]; nr[si] = true; setS2revealed(nr);
                            addScore(isCorrect);
                            if (nr.every(Boolean)) markDone(1);
                          }}
                            style={{ background: bg2, border: `2px solid ${bdr}`, borderRadius: 10, padding: "8px 14px", cursor: isRev ? "default" : "pointer", color: text, fontSize: 13, fontWeight: 600, transition: "all 0.2s" }}>
                            {opt}{isRev && isCorrect && " ✓"}{isRev && isSel && !isCorrect && " ✗"}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
            {s2allDone && (
              <div style={{ marginTop: 20, background: SC[1] + "11", border: `1px solid ${SC[1]}44`, borderRadius: 12, padding: 16 }}>
                <div style={{ fontWeight: 700, color: SC[1], marginBottom: 4 }}>✅ All 3 contexts checked!</div>
                <div style={{ fontSize: 13, color: sub }}>Context signals in the sentence determine the intended meaning — the core SAT skill.</div>
                <button onClick={() => { markDone(1); goNext(); }} style={{ marginTop: 12, background: SC[1], border: "none", borderRadius: 10, padding: "10px 24px", color: "white", fontWeight: 700, cursor: "pointer", fontSize: 14 }}>Next Step →</button>
              </div>
            )}
          </div>
        )}

        {/* STEP 3 */}
        {step === 2 && (
          <Step3 key={wordIndex} word={word} onComplete={() => { markDone(2); goNext(); }}
            addScore={addScore} dark={dark} card={card} text={text} sub={sub} border={border} inputBg={inputBg} />
        )}

        {/* STEP 4 */}
        {step === 3 && (
          <div style={{ background: card, borderRadius: 16, padding: 24, border: `1px solid ${border}` }}>
            <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 4 }}>🔍 The Invisible Clue</div>
            <div style={{ color: sub, fontSize: 13, marginBottom: 20 }}>These triggers appear in SAT passages and signal the correct meaning of <InlineWord>{word.word}</InlineWord>.</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {word.step4_clues.map((clue, i) => (
                <div key={i} style={{ background: inputBg, borderRadius: 12, padding: 14, borderLeft: `4px solid ${SC[3]}` }}>
                  <span style={{ color: SC[3], fontWeight: 700, marginRight: 8 }}>Trigger {i + 1}:</span>
                  <span style={{ fontSize: 14 }}>{clue}</span>
                </div>
              ))}
            </div>
            <button onClick={() => { markDone(3); goNext(); }}
              style={{ marginTop: 24, width: "100%", background: `linear-gradient(90deg,${SC[3]},${SC[0]})`, border: "none", borderRadius: 12, padding: "16px", color: "white", fontWeight: 800, cursor: "pointer", fontSize: 16, letterSpacing: 1 }}>
              ✅ Word Mastered — Next Word →
            </button>
          </div>
        )}

        {/* Accuracy bar */}
        {score.total > 0 && (
          <div style={{ background: card, borderRadius: 12, padding: 16, marginTop: 20, border: `1px solid ${border}`, display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ fontSize: 13, color: sub, whiteSpace: "nowrap" }}>Session Accuracy</span>
            <div style={{ flex: 1, background: border, borderRadius: 4, height: 8 }}>
              <div style={{ width: `${accuracy}%`, background: "linear-gradient(90deg,#6366f1,#10b981)", height: "100%", borderRadius: 4, transition: "width 0.5s" }} />
            </div>
            <span style={{ fontWeight: 700, color: accuracy >= 70 ? "#10b981" : "#f59e0b", fontSize: 14 }}>{accuracy}%</span>
          </div>
        )}
      </div>

      {/* Popup */}
      {popup && (
        <div onClick={() => setPopup(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 20 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: card, borderRadius: 20, padding: 28, maxWidth: 420, width: "100%", border: `2px solid ${SC[step]}`, boxShadow: `0 0 40px ${SC[step]}44` }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <div style={{ fontWeight: 800, fontSize: 18, color: SC[step] }}>💡 Simple English</div>
              <button onClick={() => setPopup(null)} style={{ background: "none", border: "none", color: sub, cursor: "pointer", fontSize: 22 }}>×</button>
            </div>
            <div onClick={() => speak(word.word)} style={{ fontWeight: 800, fontSize: 24, marginBottom: 12, letterSpacing: 2, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 10 }}>
              {word.word} <span style={{ fontSize: 16 }}>🔊</span>
            </div>
            <div style={{ whiteSpace: "pre-line", fontSize: 14, lineHeight: 1.9, color: text }}>{popup}</div>
            <div style={{ marginTop: 16, padding: 12, background: SC[step] + "11", borderRadius: 10, fontSize: 12, color: sub }}>
              💬 In SAT Reading/Writing, always ask: "Which meaning fits THIS context?"
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
