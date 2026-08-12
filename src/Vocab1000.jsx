import { useState, useEffect, useMemo, useCallback } from "react";

const PART_SIZE = 250;   // 250단어 × 4파트
const SET_SIZE = 50;     // 파트 안에서 50단어 묶음으로도 학습 가능
const STORE_KEY = "sat1000_v1";

const MODES = [
  { id: "flash", label: "📇 플래시카드", desc: "단어 → 뜻 떠올리고 뒤집기", color: "#6366f1" },
  { id: "def2word", label: "🎯 뜻 → 단어", desc: "정의를 보고 단어 고르기", color: "#10b981" },
  { id: "word2def", label: "📖 단어 → 뜻", desc: "단어를 보고 정의 고르기", color: "#f59e0b" },
  { id: "cloze", label: "✍️ 예문 빈칸", desc: "예문 빈칸에 들어갈 단어", color: "#ec4899" },
  { id: "spell", label: "⌨️ 스펠링", desc: "뜻을 보고 직접 타이핑", color: "#06b6d4" },
  { id: "mix", label: "🔀 랜덤 믹스", desc: "객관식 3종 + 스펠링 섞기", color: "#8b5cf6" },
];

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function speak(word) {
  if (!window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  const utt = new SpeechSynthesisUtterance(word);
  utt.lang = "en-US"; utt.rate = 0.85;
  window.speechSynthesis.speak(utt);
}

function loadStore() {
  try { return JSON.parse(localStorage.getItem(STORE_KEY)) || { stats: {}, missed: [] }; }
  catch { return { stats: {}, missed: [] }; }
}
function saveStore(s) {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(s)); } catch { /* quota */ }
}

// "abase" → abased / abasing 같은 활용형까지 빈칸 처리
function blankOut(sentence, word) {
  const stem = word.length > 4 ? word.replace(/(e|y)$/i, "") : word;
  const esc = stem.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`\\b${esc}\\w*`, "gi");
  const out = sentence.replace(re, "______");
  return out === sentence ? `${sentence}  (→ ______)` : out;
}

// 같은 품사에서 오답 3개 (부족하면 전체에서)
function pickDistractors(pool, entry, pos, n = 3) {
  const same = pool.filter(e => e.id !== entry.id && e.senses.some(s => s.pos === pos));
  const src = same.length >= n ? same : pool.filter(e => e.id !== entry.id);
  const picked = [], used = new Set();
  let guard = 0;
  while (picked.length < n && guard++ < 200) {
    const c = src[Math.floor(Math.random() * src.length)];
    if (!c || used.has(c.id)) continue;
    used.add(c.id);
    const s = c.senses.find(x => x.pos === pos) || c.senses[0];
    picked.push({ word: c.word, def: s.def });
  }
  return picked;
}

function buildItem(entry, pool, mode) {
  const sense = entry.senses[Math.floor(Math.random() * entry.senses.length)];
  const kind = mode === "mix"
    ? ["def2word", "word2def", "cloze", "spell"][Math.floor(Math.random() * 4)]
    : mode;
  if (kind === "flash" || kind === "spell") return { kind, entry, sense };
  const d = pickDistractors(pool, entry, sense.pos);
  if (kind === "word2def") return {
    kind, entry, sense, prompt: entry.word, sub: `(${sense.pos}.)`,
    options: shuffle([sense.def, ...d.map(x => x.def)]), answer: sense.def,
  };
  if (kind === "cloze") return {
    kind, entry, sense, prompt: blankOut(sense.ex, entry.word), sub: "",
    options: shuffle([entry.word, ...d.map(x => x.word)]), answer: entry.word,
  };
  return {
    kind: "def2word", entry, sense, prompt: sense.def, sub: `(${sense.pos}.)`,
    options: shuffle([entry.word, ...d.map(x => x.word)]), answer: entry.word,
  };
}

export default function Vocab1000({ onExit, dark }) {
  const [words, setWords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [store, setStore] = useState(loadStore);
  const [view, setView] = useState("parts");     // parts | part | session | result
  const [part, setPart] = useState(0);
  const [mode, setMode] = useState("flash");
  const [items, setItems] = useState([]);
  const [label, setLabel] = useState("");
  const [idx, setIdx] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [picked, setPicked] = useState(null);
  const [typed, setTyped] = useState("");
  const [result, setResult] = useState({ correct: 0, wrong: [] });
  const [lastList, setLastList] = useState([]);

  const bg = dark ? "#0f0f1a" : "#f8fafc";
  const card = dark ? "#1e1e2e" : "#ffffff";
  const text = dark ? "#e2e8f0" : "#1e293b";
  const sub = dark ? "#94a3b8" : "#64748b";
  const border = dark ? "#2d2d44" : "#e2e8f0";
  const inputBg = dark ? "#2d2d44" : "#f1f5f9";

  useEffect(() => {
    fetch("/sat1000.json").then(r => r.json())
      .then(d => { setWords(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const parts = useMemo(() => {
    const out = [];
    for (let i = 0; i < words.length; i += PART_SIZE) out.push(words.slice(i, i + PART_SIZE));
    return out;
  }, [words]);

  const partWords = useMemo(() => parts[part] || [], [parts, part]);
  const partMissed = useMemo(
    () => partWords.filter(w => store.missed.includes(w.id)),
    [partWords, store.missed]
  );

  const record = useCallback((wordId, ok) => {
    setStore(prev => {
      const st = { ...prev.stats };
      const cur = st[wordId] || { c: 0, w: 0 };
      st[wordId] = ok ? { ...cur, c: cur.c + 1 } : { ...cur, w: cur.w + 1 };
      let missed = prev.missed;
      if (!ok && !missed.includes(wordId)) missed = [...missed, wordId];
      if (ok && missed.includes(wordId) && st[wordId].c >= 2) missed = missed.filter(x => x !== wordId);
      const next = { stats: st, missed };
      saveStore(next);
      return next;
    });
  }, []);

  const startSession = (list, m, lbl) => {
    if (!list.length) return;
    setItems(shuffle(list).map(e => buildItem(e, words, m)));
    setLastList(list); setLabel(lbl); setMode(m);
    setIdx(0); setPicked(null); setFlipped(false); setTyped("");
    setResult({ correct: 0, wrong: [] });
    setView("session");
  };

  const answer = (ok, entry) => {
    record(entry.id, ok);
    setResult(r => ({
      correct: r.correct + (ok ? 1 : 0),
      wrong: ok || r.wrong.some(w => w.id === entry.id) ? r.wrong : [...r.wrong, entry],
    }));
  };

  const next = () => {
    if (idx + 1 >= items.length) { setView("result"); return; }
    setIdx(i => i + 1); setPicked(null); setFlipped(false); setTyped("");
  };

  const Btn = ({ children, onClick, color = "#6366f1", ghost, disabled, style }) => (
    <button onClick={onClick} disabled={disabled} style={{
      background: ghost ? "transparent" : color, border: ghost ? `1px solid ${border}` : "none",
      borderRadius: 10, padding: "10px 18px", color: ghost ? text : "#fff",
      fontWeight: 700, fontSize: 14, cursor: disabled ? "not-allowed" : "pointer",
      opacity: disabled ? 0.45 : 1, ...style
    }}>{children}</button>
  );

  const partStat = (list) => {
    const seen = list.filter(w => store.stats[w.id]).length;
    const miss = list.filter(w => store.missed.includes(w.id)).length;
    return { seen, miss, pct: list.length ? Math.round(seen / list.length * 100) : 0 };
  };

  if (loading) return (
    <div style={{ minHeight: "100vh", background: bg, display: "flex", alignItems: "center", justifyContent: "center", color: sub }}>
      단어집 불러오는 중…
    </div>
  );

  /* ================= 파트 선택 ================= */
  if (view === "parts") {
    const all = partStat(words);
    return (
      <div style={{ minHeight: "100vh", background: bg, color: text, fontFamily: "'Segoe UI',system-ui,sans-serif" }}>
        <div style={{ background: card, borderBottom: `1px solid ${border}`, padding: "12px 20px", display: "flex", justifyContent: "space-between", alignItems: "center", position: "sticky", top: 0, zIndex: 100 }}>
          <Btn ghost onClick={onExit} style={{ fontSize: 13, padding: "6px 14px" }}>← 모드 선택</Btn>
          <div style={{ fontWeight: 800 }}>1000 SAT Words</div>
          <div style={{ fontSize: 12, color: sub }}>{all.seen}/{words.length} · 오답 {all.miss}</div>
        </div>

        <div style={{ maxWidth: 720, margin: "0 auto", padding: "24px 16px" }}>
          <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 4 }}>파트를 골라 학습하세요</div>
          <div style={{ color: sub, fontSize: 13, marginBottom: 18 }}>
            {words.length}단어를 250개씩 4파트로 나눴습니다. 파트마다 오답노트가 따로 쌓입니다.
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))", gap: 12 }}>
            {parts.map((p, i) => {
              const st = partStat(p);
              return (
                <button key={i} onClick={() => { setPart(i); setView("part"); }} style={{
                  background: card, border: `1px solid ${border}`, borderRadius: 16, padding: 18,
                  cursor: "pointer", color: text, textAlign: "left"
                }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div style={{ fontWeight: 800, fontSize: 17 }}>Part {i + 1}</div>
                    <div style={{ fontSize: 12, color: sub }}>{p.length}단어</div>
                  </div>
                  <div style={{ fontSize: 12, color: sub, margin: "6px 0 12px" }}>
                    #{p[0].id}–{p[p.length - 1].id} · {p[0].word} — {p[p.length - 1].word}
                  </div>
                  <div style={{ background: border, borderRadius: 4, height: 7 }}>
                    <div style={{ width: `${st.pct}%`, height: "100%", borderRadius: 4, background: "linear-gradient(90deg,#6366f1,#10b981)" }} />
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", marginTop: 7, fontSize: 12 }}>
                    <span style={{ color: sub }}>{st.seen}/{p.length} 학습 ({st.pct}%)</span>
                    {st.miss > 0 && <span style={{ color: "#ef4444", fontWeight: 700 }}>오답 {st.miss}</span>}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  /* ================= 파트 상세 ================= */
  if (view === "part") {
    const sets = [];
    for (let i = 0; i < partWords.length; i += SET_SIZE) sets.push(partWords.slice(i, i + SET_SIZE));
    const st = partStat(partWords);
    return (
      <div style={{ minHeight: "100vh", background: bg, color: text, fontFamily: "'Segoe UI',system-ui,sans-serif" }}>
        <div style={{ background: card, borderBottom: `1px solid ${border}`, padding: "12px 20px", display: "flex", justifyContent: "space-between", alignItems: "center", position: "sticky", top: 0, zIndex: 100 }}>
          <Btn ghost onClick={() => setView("parts")} style={{ fontSize: 13, padding: "6px 14px" }}>← 파트 목록</Btn>
          <div style={{ fontWeight: 800 }}>Part {part + 1}</div>
          <div style={{ fontSize: 12, color: sub }}>{st.seen}/{partWords.length}</div>
        </div>

        <div style={{ maxWidth: 720, margin: "0 auto", padding: "24px 16px" }}>
          {/* 오답 재연습 */}
          <div style={{ background: card, border: `2px solid ${partMissed.length ? "#ef444455" : border}`, borderRadius: 16, padding: 18, marginBottom: 22 }}>
            <div style={{ fontWeight: 800, color: partMissed.length ? "#ef4444" : sub, marginBottom: 4 }}>
              🔁 Part {part + 1} 오답노트 — {partMissed.length}개
            </div>
            <div style={{ fontSize: 13, color: sub, marginBottom: partMissed.length ? 14 : 0 }}>
              {partMissed.length
                ? "틀리거나 몰랐던 단어만 모았습니다. 2번 연속 맞히면 목록에서 빠집니다."
                : "아직 오답이 없습니다. 학습을 시작해 보세요."}
            </div>
            {partMissed.length > 0 && (
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <Btn color="#ef4444" onClick={() => startSession(partMissed, "flash", `Part ${part + 1} 오답 · 플래시카드`)}>
                  플래시카드로 복습
                </Btn>
                <Btn color="#ef4444" onClick={() => startSession(partMissed, "mix", `Part ${part + 1} 오답 · 문제풀이`)}>
                  문제로 복습
                </Btn>
              </div>
            )}
          </div>

          {/* 학습 방식 */}
          <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 10 }}>학습 방식</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))", gap: 10, marginBottom: 24 }}>
            {MODES.map(m => (
              <button key={m.id} onClick={() => setMode(m.id)} style={{
                background: mode === m.id ? m.color + "22" : card, textAlign: "left",
                border: `2px solid ${mode === m.id ? m.color : border}`, borderRadius: 14,
                padding: 13, cursor: "pointer", color: text
              }}>
                <div style={{ fontWeight: 700, marginBottom: 3, fontSize: 14 }}>{m.label}</div>
                <div style={{ fontSize: 12, color: sub }}>{m.desc}</div>
              </button>
            ))}
          </div>

          {/* 범위 */}
          <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 10 }}>
            범위 <span style={{ fontWeight: 400, color: sub, fontSize: 13 }}>(선택한 방식으로 진행)</span>
          </div>
          <Btn color={MODES.find(m => m.id === mode)?.color}
            onClick={() => startSession(partWords, mode, `Part ${part + 1} 전체`)}
            style={{ width: "100%", padding: "14px", fontSize: 15, marginBottom: 12 }}>
            Part {part + 1} 전체 {partWords.length}단어 한 번에 →
          </Btn>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(150px,1fr))", gap: 10 }}>
            {sets.map((s, i) => {
              const ss = partStat(s);
              return (
                <button key={i} onClick={() => startSession(s, mode, `Part ${part + 1} · ${i + 1}묶음`)} style={{
                  background: card, border: `1px solid ${border}`, borderRadius: 14, padding: 13,
                  cursor: "pointer", color: text, textAlign: "left"
                }}>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>{i + 1}묶음 · {s.length}단어</div>
                  <div style={{ fontSize: 11, color: sub, margin: "4px 0 8px" }}>#{s[0].id}–{s[s.length - 1].id} · {s[0].word} – {s[s.length - 1].word}</div>
                  <div style={{ background: border, borderRadius: 4, height: 5 }}>
                    <div style={{ width: `${ss.pct}%`, height: "100%", borderRadius: 4, background: "linear-gradient(90deg,#6366f1,#10b981)" }} />
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  /* ================= 결과 ================= */
  if (view === "result") {
    const total = items.length;
    const acc = total ? Math.round(result.correct / total * 100) : 0;
    return (
      <div style={{ minHeight: "100vh", background: bg, color: text, fontFamily: "'Segoe UI',system-ui,sans-serif", padding: 20 }}>
        <div style={{ maxWidth: 580, margin: "40px auto", background: card, border: `1px solid ${border}`, borderRadius: 20, padding: 28 }}>
          <div style={{ fontSize: 40, textAlign: "center" }}>{acc >= 80 ? "🎉" : acc >= 50 ? "💪" : "📚"}</div>
          <div style={{ textAlign: "center", fontWeight: 800, fontSize: 22, margin: "8px 0 4px" }}>
            {mode === "flash" ? `${total}단어 학습 완료` : `${result.correct} / ${total} · ${acc}%`}
          </div>
          <div style={{ textAlign: "center", color: sub, fontSize: 13, marginBottom: 20 }}>{label}</div>

          {result.wrong.length > 0 && (
            <div style={{ marginBottom: 20, maxHeight: 320, overflowY: "auto" }}>
              <div style={{ fontWeight: 700, fontSize: 13, color: "#ef4444", marginBottom: 8 }}>
                {mode === "flash" ? "몰랐던 단어" : "틀린 단어"} {result.wrong.length}개 — 오답노트에 저장됨
              </div>
              {result.wrong.map((w, i) => (
                <div key={i} style={{ background: inputBg, borderRadius: 10, padding: 12, marginBottom: 8, borderLeft: "4px solid #ef4444" }}>
                  <span onClick={() => speak(w.word)} style={{ fontWeight: 800, cursor: "pointer" }}>{w.word} 🔊</span>
                  <span style={{ color: sub, fontSize: 13 }}> — {w.senses.map(s => `(${s.pos}.) ${s.def}`).join(" / ")}</span>
                </div>
              ))}
            </div>
          )}

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {result.wrong.length > 0 && (
              <Btn color="#ef4444" onClick={() => startSession(result.wrong, mode, `${label} · 틀린 것만`)}>
                틀린 것만 다시 ({result.wrong.length})
              </Btn>
            )}
            <Btn onClick={() => startSession(lastList, mode, label)}>같은 범위 다시</Btn>
            {partMissed.length > 0 && (
              <Btn color="#f59e0b" onClick={() => startSession(partMissed, "mix", `Part ${part + 1} 오답 · 문제풀이`)}>
                Part {part + 1} 오답 전체 ({partMissed.length})
              </Btn>
            )}
            <Btn ghost onClick={() => setView("part")}>Part {part + 1} 메뉴</Btn>
          </div>
        </div>
      </div>
    );
  }

  /* ================= 세션 ================= */
  const it = items[idx];
  if (!it) return null;
  const mColor = MODES.find(m => m.id === mode)?.color || "#6366f1";
  const answered = picked !== null;
  const pct = Math.round((idx + (answered || flipped ? 1 : 0)) / items.length * 100);

  const submitSpell = () => {
    if (answered || !typed.trim()) return;
    const ok = typed.trim().toLowerCase() === it.entry.word.toLowerCase();
    setPicked(typed.trim());
    answer(ok, it.entry);
  };

  return (
    <div style={{ minHeight: "100vh", background: bg, color: text, fontFamily: "'Segoe UI',system-ui,sans-serif" }}>
      <div style={{ background: card, borderBottom: `1px solid ${border}`, padding: "12px 20px", position: "sticky", top: 0, zIndex: 100 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, gap: 8 }}>
          <Btn ghost onClick={() => setView("part")} style={{ fontSize: 13, padding: "6px 14px" }}>← 나가기</Btn>
          <div style={{ fontSize: 12, fontWeight: 700, color: mColor, textAlign: "center", flex: 1 }}>{label}</div>
          <div style={{ fontSize: 13, color: sub, whiteSpace: "nowrap" }}>{idx + 1} / {items.length}</div>
        </div>
        <div style={{ background: border, borderRadius: 4, height: 5 }}>
          <div style={{ width: `${pct}%`, height: "100%", borderRadius: 4, background: mColor, transition: "width .3s" }} />
        </div>
      </div>

      <div style={{ maxWidth: 640, margin: "0 auto", padding: "28px 16px" }}>
        {/* --- 플래시카드 --- */}
        {it.kind === "flash" && (
          <div style={{ background: card, border: `1px solid ${border}`, borderRadius: 20, padding: 32, minHeight: 300, display: "flex", flexDirection: "column", justifyContent: "center" }}>
            <div onClick={() => speak(it.entry.word)} style={{ fontSize: 38, fontWeight: 900, color: mColor, cursor: "pointer", textAlign: "center" }}>
              {it.entry.word} <span style={{ fontSize: 18 }}>🔊</span>
            </div>
            <div style={{ textAlign: "center", color: sub, fontSize: 13, marginTop: 6 }}>({it.sense.pos}.)</div>
            {!flipped ? (
              <Btn onClick={() => setFlipped(true)} color={mColor} style={{ marginTop: 28, alignSelf: "center", padding: "12px 32px" }}>
                뜻 확인하기
              </Btn>
            ) : (
              <>
                <div style={{ marginTop: 24, background: inputBg, borderRadius: 14, padding: 18 }}>
                  <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 12 }}>{it.sense.def}</div>
                  <div style={{ fontSize: 14, fontStyle: "italic", color: sub, lineHeight: 1.7, borderLeft: `3px solid ${mColor}`, paddingLeft: 12 }}>
                    "{it.sense.ex}"
                  </div>
                  {it.entry.senses.length > 1 && (
                    <div style={{ fontSize: 12, color: sub, marginTop: 12 }}>
                      다른 뜻: {it.entry.senses.filter(s => s !== it.sense).map(s => `(${s.pos}.) ${s.def}`).join(" / ")}
                    </div>
                  )}
                </div>
                <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
                  <Btn color="#ef4444" style={{ flex: 1 }} onClick={() => { answer(false, it.entry); next(); }}>😵 몰랐음</Btn>
                  <Btn color="#10b981" style={{ flex: 1 }} onClick={() => { answer(true, it.entry); next(); }}>😎 알았음</Btn>
                </div>
              </>
            )}
          </div>
        )}

        {/* --- 스펠링 --- */}
        {it.kind === "spell" && (
          <div style={{ background: card, border: `1px solid ${border}`, borderRadius: 20, padding: 26 }}>
            <div style={{ fontSize: 11, letterSpacing: 2, textTransform: "uppercase", color: sub, marginBottom: 10 }}>이 뜻을 가진 단어를 입력하세요</div>
            <div style={{ fontSize: 20, fontWeight: 700, lineHeight: 1.6 }}>{it.sense.def}</div>
            <div style={{ color: sub, fontSize: 13, marginTop: 6 }}>
              ({it.sense.pos}.) · 첫 글자 <b style={{ color: mColor }}>{it.entry.word[0]}</b> · {it.entry.word.length}글자
            </div>
            <input value={typed} onChange={e => setTyped(e.target.value)} disabled={answered} autoFocus
              onKeyDown={e => { if (e.key === "Enter") answered ? next() : submitSpell(); }}
              placeholder="단어 입력 후 Enter"
              style={{
                width: "100%", marginTop: 18, padding: "14px 16px", fontSize: 18, borderRadius: 12,
                background: inputBg, color: text, boxSizing: "border-box",
                border: `2px solid ${!answered ? border : picked.toLowerCase() === it.entry.word.toLowerCase() ? "#10b981" : "#ef4444"}`,
              }} />
            {!answered
              ? <Btn color={mColor} onClick={submitSpell} disabled={!typed.trim()} style={{ marginTop: 14 }}>확인 →</Btn>
              : (
                <div style={{ marginTop: 16, background: mColor + "11", border: `1px solid ${mColor}44`, borderRadius: 12, padding: 16 }}>
                  <div onClick={() => speak(it.entry.word)} style={{ fontWeight: 800, fontSize: 18, cursor: "pointer", marginBottom: 6 }}>
                    {picked.toLowerCase() === it.entry.word.toLowerCase() ? "✅ " : "❌ "}{it.entry.word} 🔊
                  </div>
                  <div style={{ fontSize: 13, fontStyle: "italic", color: sub, lineHeight: 1.7 }}>"{it.sense.ex}"</div>
                  <Btn color={mColor} onClick={next} style={{ marginTop: 14 }}>
                    {idx + 1 >= items.length ? "결과 보기 →" : "다음 →"}
                  </Btn>
                </div>
              )}
          </div>
        )}

        {/* --- 객관식 3종 --- */}
        {(it.kind === "def2word" || it.kind === "word2def" || it.kind === "cloze") && (
          <div style={{ background: card, border: `1px solid ${border}`, borderRadius: 20, padding: 26 }}>
            <div style={{ fontSize: 11, letterSpacing: 2, textTransform: "uppercase", color: sub, marginBottom: 10 }}>
              {it.kind === "def2word" ? "이 뜻을 가진 단어는?" : it.kind === "word2def" ? "이 단어의 뜻은?" : "빈칸에 알맞은 단어는?"}
            </div>
            <div style={{ fontSize: it.kind === "cloze" ? 16 : 22, fontWeight: 700, lineHeight: 1.6, fontStyle: it.kind === "cloze" ? "italic" : "normal" }}>
              {it.kind === "word2def"
                ? <span onClick={() => speak(it.entry.word)} style={{ cursor: "pointer", color: mColor }}>{it.prompt} 🔊</span>
                : it.prompt}
            </div>
            {it.sub && <div style={{ color: sub, fontSize: 13, marginTop: 6 }}>{it.sub}</div>}

            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 22 }}>
              {it.options.map((opt, i) => {
                const isAns = opt === it.answer, isSel = picked === opt;
                let bg2 = inputBg, bdr = border;
                if (answered) {
                  if (isAns) { bg2 = "#10b98122"; bdr = "#10b981"; }
                  else if (isSel) { bg2 = "#ef444422"; bdr = "#ef4444"; }
                }
                return (
                  <button key={i} disabled={answered}
                    onClick={() => { setPicked(opt); answer(opt === it.answer, it.entry); }}
                    style={{
                      background: bg2, border: `2px solid ${bdr}`, borderRadius: 12, padding: "13px 18px",
                      cursor: answered ? "default" : "pointer", color: text, textAlign: "left", fontSize: 15
                    }}>
                    <span style={{ fontWeight: 700, color: mColor, marginRight: 8 }}>{String.fromCharCode(65 + i)}.</span>
                    {opt}
                    {answered && isAns && <span style={{ color: "#10b981", fontWeight: 700, fontSize: 12, marginLeft: 8 }}>✓</span>}
                    {answered && isSel && !isAns && <span style={{ color: "#ef4444", fontWeight: 700, fontSize: 12, marginLeft: 8 }}>✗</span>}
                  </button>
                );
              })}
            </div>

            {answered && (
              <div style={{ marginTop: 20, background: mColor + "11", border: `1px solid ${mColor}44`, borderRadius: 12, padding: 16 }}>
                <div onClick={() => speak(it.entry.word)} style={{ fontWeight: 800, cursor: "pointer", marginBottom: 6 }}>
                  {it.entry.word} 🔊 <span style={{ color: sub, fontWeight: 400, fontSize: 13 }}>({it.sense.pos}.) {it.sense.def}</span>
                </div>
                <div style={{ fontSize: 13, fontStyle: "italic", color: sub, lineHeight: 1.7 }}>"{it.sense.ex}"</div>
                <Btn color={mColor} onClick={next} style={{ marginTop: 14 }}>
                  {idx + 1 >= items.length ? "결과 보기 →" : "다음 →"}
                </Btn>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
