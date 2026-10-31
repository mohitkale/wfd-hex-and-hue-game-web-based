import {
  FRAME_H,
  FRAME_W,
  PATTERNS,
  drawFrame,
  readFamiliar,
  type HapticKind,
} from "@hexhue/game/familiar";
import {
  act,
  altarState,
  lessonProgress,
  lessonSummary,
  recordFinish,
  resumeLesson,
  saveRun,
  startLesson,
  type Action,
  type AltarLayout,
  type AltarTool,
  type GrimoireEntry,
  type LessonRun,
  type Reply,
  type Step,
} from "@hexhue/learn";
import "./altar.css";
import { pressBreath, releaseBreath, startBreaths, type BreathState } from "./breath";
import { circleDirection, isTap, strokeDirection, type Point } from "./gestures";
import { iconSvg } from "./icons";
import { loadPractice, localDay, storePractice } from "../lib/practiceStore";
import { cardFileName, drawRitualCard } from "./card";

/**
 * The altar (F1, Ritual Rehearsal): a full-screen layer over a lesson page where the learner does
 * each step with their hands. Every gesture becomes a lesson `Action`; `act` decides, and the scene
 * only shows the answer: a glow and a light buzz when right, the familiar's gentle hint when not.
 * The altar is redrawn from the lesson and the run (`altarState`), and the run is saved after every
 * move, so leaving and coming back resumes exactly where the learner was.
 */

const VIBRATION_KEY = "hexhue.v3.vibration";
const FAMILIAR_COLOR = "#a77ef0";

interface Ctx {
  entry: GrimoireEntry;
  altar: AltarLayout;
  run: LessonRun;
  root: HTMLElement;
  selected: string | null;
  breath: BreathState;
  onClose: () => void;
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  cls?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

function localStore(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function vibrationOn(): boolean {
  try {
    return window.localStorage.getItem(VIBRATION_KEY) !== "off";
  } catch {
    return true;
  }
}

function buzz(kind: HapticKind): void {
  if (!vibrationOn() || typeof navigator.vibrate !== "function") return;
  if (navigator.userActivation?.hasBeenActive === false) return;
  try {
    navigator.vibrate([...PATTERNS[kind]]);
  } catch {
    /* vibration is texture, never required */
  }
}

const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function toolOf(ctx: Ctx, id: string): AltarTool | undefined {
  return ctx.altar.tools.find((t) => t.id === id);
}

/** Opens the altar for `entry`, resuming a saved run of it if there is one. */
export function openAltar(entry: GrimoireEntry, onClose: () => void = () => {}): () => void {
  const altar = entry.altar;
  if (!altar) return () => {};
  const saved = loadPractice().runs[entry.lesson.id];
  const run = saved ? resumeLesson(entry.lesson, saved) : startLesson(entry.lesson);
  const root = el("div", "altar-layer");
  root.setAttribute("role", "dialog");
  root.setAttribute("aria-modal", "true");
  root.setAttribute("aria-label", `${entry.lesson.title}: the altar`);
  const ctx: Ctx = { entry, altar, run, root, selected: null, breath: startBreaths(), onClose };
  document.body.append(root);
  document.documentElement.classList.add("altar-open");
  const close = () => {
    stopFamiliar();
    root.remove();
    document.documentElement.classList.remove("altar-open");
    document.removeEventListener("keydown", onKey);
    onClose();
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape") close();
  };
  document.addEventListener("keydown", onKey);
  ctx.onClose = close;
  if (run.step === 0 && run.doneInStep.length === 0 && entry.safety.fire) showSafety(ctx);
  else render(ctx);
  return close;
}

/** Before a lesson with a flame: the fire safety, read before the first step. */
function showSafety(ctx: Ctx): void {
  const box = el("div", "altar-intro");
  box.append(
    el("h2", undefined, ctx.entry.lesson.title),
    el("p", "altar-intro-text", ctx.entry.lesson.intro),
  );
  const safety = el("div", "altar-safety");
  safety.append(el("strong", undefined, "Before you light anything for real. "));
  safety.append(document.createTextNode(ctx.entry.safety.fire ?? ""));
  const go = el("button", "altar-primary", "I have read this: begin");
  go.type = "button";
  go.addEventListener("click", () => render(ctx));
  box.append(safety, go);
  ctx.root.replaceChildren(header(ctx), box);
  go.focus();
}

function header(ctx: Ctx): HTMLElement {
  const bar = el("div", "altar-bar");
  const title = el("p", "altar-title", ctx.entry.lesson.title);
  const progress = el("div", "altar-progress");
  progress.setAttribute("role", "progressbar");
  const pct = Math.round(lessonProgress(ctx.entry.lesson, ctx.run) * 100);
  progress.setAttribute("aria-valuenow", String(pct));
  progress.setAttribute("aria-valuemin", "0");
  progress.setAttribute("aria-valuemax", "100");
  progress.setAttribute("aria-label", "Progress");
  progress.style.setProperty("--p", `${pct}%`);
  const vib = el("button", "altar-icon-button");
  vib.type = "button";
  const setVib = () => {
    const on = vibrationOn();
    vib.textContent = on ? "Vibration on" : "Vibration off";
    vib.setAttribute("aria-pressed", String(on));
  };
  setVib();
  vib.addEventListener("click", () => {
    try {
      window.localStorage.setItem(VIBRATION_KEY, vibrationOn() ? "off" : "on");
    } catch {
      /* the toggle just won't be remembered */
    }
    setVib();
  });
  const close = el("button", "altar-icon-button", "Close");
  close.type = "button";
  close.addEventListener("click", () => ctx.onClose());
  bar.append(title, vib, close, progress);
  return bar;
}

// --- the familiar, idling beside the prompt ---------------------------------------------------

let familiarTimer: number | null = null;
function stopFamiliar(): void {
  if (familiarTimer !== null) window.clearInterval(familiarTimer);
  familiarTimer = null;
}

function familiar(): HTMLCanvasElement {
  const canvas = el("canvas", "altar-familiar");
  canvas.width = FRAME_W;
  canvas.height = FRAME_H;
  canvas.setAttribute("aria-hidden", "true");
  const species = readFamiliar(localStore()) ?? "bat";
  const g = canvas.getContext("2d");
  let frame = 0;
  const paint = () => {
    if (!g) return;
    g.clearRect(0, 0, FRAME_W, FRAME_H);
    drawFrame(g, frame % 2 === 0 ? "idle0" : "idle1", FAMILIAR_COLOR, species);
  };
  paint();
  stopFamiliar();
  if (!reducedMotion()) {
    familiarTimer = window.setInterval(() => {
      frame++;
      paint();
    }, 480);
  }
  return canvas;
}

// --- the board ----------------------------------------------------------------------------------

function render(ctx: Ctx, said?: { text: string; tone: "hint" | "right" | "note" }): void {
  const step = ctx.entry.lesson.steps[ctx.run.step];
  if (ctx.run.finished || !step) {
    finish(ctx);
    return;
  }
  const guide = el("div", "altar-guide");
  const bubble = el("p", `altar-bubble ${said?.tone ?? "prompt"}`);
  bubble.setAttribute("aria-live", "polite");
  const total = ctx.entry.lesson.steps.length;
  bubble.textContent = said?.text ?? `Step ${ctx.run.step + 1} of ${total}. I'm right here.`;
  guide.append(familiar(), bubble);
  const prompt = el("p", "altar-prompt", step.prompt);
  ctx.root.replaceChildren(header(ctx), guide, prompt, board(ctx, step), controls(ctx, step));
}

function board(ctx: Ctx, step: Step): HTMLElement {
  const state = altarState(ctx.entry.lesson, ctx.run);
  const wrap = el("div", "altar-board");
  const cloth = el("div", "altar-cloth");
  cloth.setAttribute("aria-label", "The altar cloth");
  const ring = el("div", "altar-ring");
  for (const w of state.walked) ring.classList.add(`walked-${w}`);
  cloth.append(ring);
  const candles = ctx.altar.candles ?? [];
  const lit = new Set(state.lit);

  for (const spot of ctx.altar.spots) {
    const b = el("button", "altar-spot");
    b.type = "button";
    b.dataset.spot = spot.id;
    b.style.left = `${spot.x * 100}%`;
    b.style.top = `${spot.y * 100}%`;
    const standing = candles.find((c) => c.spot === spot.id);
    const toolId = state.placed[spot.id];
    const tool = toolId ? toolOf(ctx, toolId) : undefined;
    const parts: string[] = [];
    let label = spot.label;
    if (standing) {
      parts.push(
        `<span class="altar-piece candle${lit.has(standing.id) ? " lit" : ""}">${iconSvg("candle", 44, standing.color, lit.has(standing.id))}</span>`,
      );
      label += lit.has(standing.id) ? ", candle burning" : ", candle";
    }
    if (tool) {
      const burning = lit.has(tool.id);
      parts.push(
        `<span class="altar-piece${burning ? " lit" : ""}">${iconSvg(tool.icon, 44, tool.color, tool.icon === "candle" ? burning : true)}</span>`,
      );
      label += `, ${tool.label}${burning ? " burning" : ""}`;
    }
    b.innerHTML = `${parts.join("")}<span class="altar-spot-label">${spot.label}</span>`;
    b.setAttribute("aria-label", label);
    cloth.append(b);
  }
  wrap.append(cloth);
  attachCloth(ctx, cloth, step);

  // The tray: tools not standing on the altar, ready to drag or tap.
  const onAltar = new Set(Object.values(state.placed));
  const tray = el("div", "altar-tray");
  tray.setAttribute("aria-label", "Your tools");
  for (const tool of ctx.altar.tools) {
    if (onAltar.has(tool.id)) continue;
    const b = el("button", "altar-tool");
    b.type = "button";
    b.dataset.tool = tool.id;
    b.innerHTML = `${iconSvg(tool.icon, 40, tool.color, tool.icon !== "candle")}<span>${tool.label}</span>`;
    b.setAttribute("aria-pressed", String(ctx.selected === tool.id));
    attachTool(ctx, b, tool, cloth);
    tray.append(b);
  }
  // The tray only shows while a step asks for tools to be set out.
  const placing = step.expects.some((a) => a.kind === "place");
  if (placing && tray.childElementCount > 0) wrap.append(tray);
  return wrap;
}

/** Drag a tool onto a spot, or tap it and then tap a spot (also the keyboard way). */
function attachTool(ctx: Ctx, b: HTMLButtonElement, tool: AltarTool, cloth: HTMLElement): void {
  b.addEventListener("click", () => {
    ctx.selected = ctx.selected === tool.id ? null : tool.id;
    render(
      ctx,
      ctx.selected
        ? { text: `Now tap a spot for the ${tool.label.toLowerCase()}.`, tone: "note" }
        : undefined,
    );
  });
  b.addEventListener("pointerdown", (down) => {
    if (down.button !== 0) return;
    const ghost = el("div", "altar-ghost");
    ghost.innerHTML = iconSvg(tool.icon, 48, tool.color, tool.icon !== "candle");
    let moved = false;
    const at = (e: PointerEvent) => {
      ghost.style.left = `${e.clientX}px`;
      ghost.style.top = `${e.clientY}px`;
    };
    const move = (e: PointerEvent) => {
      if (!moved && Math.hypot(e.clientX - down.clientX, e.clientY - down.clientY) > 8) {
        moved = true;
        document.body.append(ghost);
      }
      if (moved) at(e);
    };
    const up = (e: PointerEvent) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      ghost.remove();
      if (!moved) return; // a plain tap: the click handler selects it
      const spot = spotAt(cloth, e.clientX, e.clientY);
      if (spot) apply(ctx, { kind: "place", item: tool.id, spot });
      else render(ctx, { text: "Drop it on one of the spots on the cloth.", tone: "note" });
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
  });
}

function spotAt(cloth: HTMLElement, x: number, y: number): string | null {
  let best: { id: string; d: number } | null = null;
  for (const s of cloth.querySelectorAll<HTMLElement>(".altar-spot")) {
    const r = s.getBoundingClientRect();
    const d = Math.hypot(x - (r.left + r.width / 2), y - (r.top + r.height / 2));
    if (d <= Math.max(r.width, r.height) && (!best || d < best.d))
      best = { id: s.dataset.spot!, d };
  }
  return best?.id ?? null;
}

/** Taps on spots (place a selected tool, light or snuff), circles round the cloth, strokes. */
function attachCloth(ctx: Ctx, cloth: HTMLElement, step: Step): void {
  let points: Point[] = [];
  let start: string | null = null;
  cloth.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    points = [{ x: e.clientX, y: e.clientY }];
    start = (e.target as HTMLElement).closest<HTMLElement>(".altar-spot")?.dataset.spot ?? null;
    try {
      cloth.setPointerCapture(e.pointerId);
    } catch {
      /* without capture the gesture still works while the finger stays on the cloth */
    }
  });
  cloth.addEventListener("pointermove", (e) => {
    if (points.length > 0) points.push({ x: e.clientX, y: e.clientY });
  });
  const end = () => {
    const pts = points;
    points = [];
    if (pts.length === 0) return;
    if (isTap(pts)) {
      if (start) tapSpot(ctx, start);
      return;
    }
    const r = cloth.getBoundingClientRect();
    const centre = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    const walk = circleDirection(pts, centre, r.width * 0.15);
    if (walk) {
      apply(ctx, { kind: "walk", path: walk });
      return;
    }
    const dir = strokeDirection(pts);
    const trace = (ctx.altar.traces ?? []).find((t) => t.spot === start && t.direction === dir);
    if (trace) {
      apply(ctx, { kind: "trace", shape: trace.id });
      return;
    }
    const wantsWalk = step.expects.some((a) => a.kind === "walk");
    render(ctx, {
      text: wantsWalk
        ? "Keep your finger down and go all the way round the cloth."
        : "Try a short straight stroke on the candle.",
      tone: "note",
    });
  };
  cloth.addEventListener("pointerup", end);
  cloth.addEventListener("pointercancel", () => (points = []));
  // Keyboard and screen readers: Enter or Space on a spot is a tap.
  cloth.addEventListener("click", (e) => {
    if (e.detail !== 0) return; // pointer clicks are handled above
    const spot = (e.target as HTMLElement).closest<HTMLElement>(".altar-spot")?.dataset.spot;
    if (spot) tapSpot(ctx, spot);
  });
}

function tapSpot(ctx: Ctx, spot: string): void {
  if (ctx.selected) {
    const item = ctx.selected;
    ctx.selected = null;
    apply(ctx, { kind: "place", item, spot });
    return;
  }
  const state = altarState(ctx.entry.lesson, ctx.run);
  const lit = new Set(state.lit);
  const flames = [
    ...(ctx.altar.candles ?? []).filter((c) => c.spot === spot).map((c) => c.id),
    ...[state.placed[spot]].filter(
      (id): id is string => !!id && toolOf(ctx, id)?.icon === "candle",
    ),
  ];
  const flame = flames[0];
  if (!flame) {
    render(ctx, {
      text: "Nothing to light there. Drag a tool from the tray onto the cloth.",
      tone: "note",
    });
    return;
  }
  apply(ctx, lit.has(flame) ? { kind: "snuff", item: flame } : { kind: "light", item: flame });
}

// --- the controls under the board ---------------------------------------------------------------

function controls(ctx: Ctx, step: Step): HTMLElement {
  const box = el("div", "altar-controls");
  const kinds = new Set(step.expects.map((a) => a.kind));
  if (kinds.has("choose")) {
    const group = el("div", "altar-options");
    group.setAttribute("role", "group");
    group.setAttribute("aria-label", "Choose one");
    for (const o of step.options ?? []) {
      const b = el("button", "altar-option", o.label);
      b.type = "button";
      b.addEventListener("click", () => apply(ctx, { kind: "choose", option: o.id }));
      group.append(b);
    }
    box.append(group);
  }
  if (kinds.has("breathe")) box.append(breathControl(ctx, step));
  if (kinds.has("continue")) {
    const b = el("button", "altar-primary", "Continue");
    b.type = "button";
    b.addEventListener("click", () => apply(ctx, { kind: "continue" }));
    box.append(b);
  }
  // Gestures have button twins for anyone who cannot draw on the cloth.
  if (kinds.has("walk") || kinds.has("trace")) {
    const assist = el("details", "altar-assist");
    assist.append(el("summary", undefined, "Can't draw on the screen?"));
    const row = el("div", "altar-options");
    if (kinds.has("walk")) {
      for (const [path, label] of [
        ["sunwise", "Walk the circle sunwise"],
        ["widdershins", "Walk the circle widdershins"],
      ] as const) {
        const b = el("button", "altar-option", label);
        b.type = "button";
        b.addEventListener("click", () => apply(ctx, { kind: "walk", path }));
        row.append(b);
      }
    }
    if (kinds.has("trace")) {
      for (const t of ctx.altar.traces ?? []) {
        const b = el("button", "altar-option", t.label);
        b.type = "button";
        b.addEventListener("click", () => apply(ctx, { kind: "trace", shape: t.id }));
        row.append(b);
      }
    }
    assist.append(row);
    box.append(assist);
  }
  return box;
}

function breathControl(ctx: Ctx, step: Step): HTMLElement {
  const want = step.expects.find((a) => a.kind === "breathe");
  const need = want?.kind === "breathe" ? want.breaths : 1;
  const wrap = el("div", "altar-breath");
  const orb = el("div", "altar-orb");
  orb.setAttribute("aria-hidden", "true");
  const count = el("p", "altar-breath-count", `${ctx.breath.count} of ${need} breaths`);
  count.setAttribute("aria-live", "polite");
  const b = el("button", "altar-primary", "Hold to breathe in");
  b.type = "button";
  const press = (e: Event) => {
    e.preventDefault();
    ctx.breath = pressBreath(ctx.breath, performance.now());
    orb.classList.add("in");
    b.textContent = "Breathing in… let go to breathe out";
  };
  const release = () => {
    if (ctx.breath.since === null) return;
    const out = releaseBreath(ctx.breath, performance.now());
    ctx.breath = out.state;
    orb.classList.remove("in");
    b.textContent = "Hold to breathe in";
    if (!out.counted) {
      count.textContent = `A little longer. ${ctx.breath.count} of ${need} breaths`;
      return;
    }
    buzz("collect");
    count.textContent = `${ctx.breath.count} of ${need} breaths`;
    if (ctx.breath.count >= need) {
      const breaths = ctx.breath.count;
      ctx.breath = startBreaths();
      window.setTimeout(() => apply(ctx, { kind: "breathe", breaths }), 300);
    }
  };
  b.addEventListener("pointerdown", press);
  b.addEventListener("pointerup", release);
  b.addEventListener("pointerleave", release);
  b.addEventListener("pointercancel", release);
  b.addEventListener("keydown", (e) => {
    if ((e.key === " " || e.key === "Enter") && !e.repeat) press(e);
  });
  b.addEventListener("keyup", (e) => {
    if (e.key === " " || e.key === "Enter") release();
  });
  b.addEventListener("contextmenu", (e) => e.preventDefault());
  wrap.append(orb, count, b);
  return wrap;
}

// --- answering a move ---------------------------------------------------------------------------

function apply(ctx: Ctx, action: Action): void {
  const out = act(ctx.entry.lesson, ctx.run, action);
  ctx.run = out.run;
  persist(ctx);
  answer(ctx, out.reply);
}

function persist(ctx: Ctx): void {
  let save = loadPractice();
  save = ctx.run.finished
    ? recordFinish(save, ctx.entry.lesson.id, localDay(new Date()))
    : saveRun(save, ctx.run);
  storePractice(save);
}

function answer(ctx: Ctx, reply: Reply): void {
  switch (reply.kind) {
    case "right":
      buzz(reply.stepDone ? "park" : "tap");
      render(ctx, reply.stepDone ? undefined : { text: "Yes, that's it.", tone: "right" });
      if (reply.stepDone) glow(ctx);
      return;
    case "already":
      render(ctx, { text: "That one is done already.", tone: "note" });
      return;
    case "try-again":
      buzz("invalid");
      render(ctx, { text: reply.hint, tone: "hint" });
      if (!reducedMotion()) ctx.root.querySelector(".altar-cloth")?.classList.add("nudge");
      return;
    case "done":
      buzz("win");
      finish(ctx);
      return;
  }
}

function glow(ctx: Ctx): void {
  if (reducedMotion()) return;
  ctx.root.querySelector(".altar-cloth")?.classList.add("glow");
}

// --- the end: the "why" page and the ritual card (M17.4) ----------------------------------------

function finish(ctx: Ctx): void {
  const { lesson } = ctx.entry;
  const page = el("div", "altar-summary");
  page.append(el("p", "altar-done", "Ritual rehearsed"), el("h2", undefined, lesson.title));
  page.append(
    el(
      "p",
      "altar-intro-text",
      "Here is every step and why it is there. Steps marked with a star are worth reading again.",
    ),
  );
  const list = el("ol", "altar-why");
  for (const s of lessonSummary(lesson, ctx.run)) {
    const li = el("li");
    const p = el("p", "altar-why-step", s.prompt);
    if (s.tries > 0) {
      const star = el("span", "altar-star", "✦");
      star.setAttribute("aria-label", "worth reading again");
      star.title = "Worth reading again";
      p.prepend(star, document.createTextNode(" "));
    }
    li.append(p, el("p", "altar-why-text", s.why));
    list.append(li);
  }
  page.append(list);

  const actions = el("div", "altar-end-actions");
  const card = el("button", "altar-primary", "Save ritual card");
  card.type = "button";
  card.addEventListener("click", () => void saveCard(ctx, card));
  const print = el("button", "altar-option", "Print the steps");
  print.type = "button";
  print.addEventListener("click", () => window.print());
  const again = el("button", "altar-option", "Rehearse again");
  again.type = "button";
  again.addEventListener("click", () => {
    ctx.run = startLesson(lesson);
    ctx.breath = startBreaths();
    render(ctx);
  });
  const back = el("button", "altar-option", "Back to the lesson");
  back.type = "button";
  back.addEventListener("click", () => ctx.onClose());
  actions.append(card, print, again, back);
  page.append(actions);
  const status = el("p", "altar-status");
  status.setAttribute("role", "status");
  page.append(status);
  stopFamiliar();
  ctx.root.replaceChildren(header(ctx), page);
  card.focus();
}

async function saveCard(ctx: Ctx, button: HTMLButtonElement): Promise<void> {
  const status = ctx.root.querySelector<HTMLElement>(".altar-status");
  button.disabled = true;
  try {
    const canvas = await drawRitualCard(ctx.entry, {
      day: localDay(new Date()),
      site: window.location.host,
      species: readFamiliar(localStore()) ?? "bat",
      familiarColor: FAMILIAR_COLOR,
    });
    const blob = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, "image/png"));
    if (!blob) throw new Error("no image");
    const file = new File([blob], cardFileName(ctx.entry), { type: "image/png" });
    if (navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: ctx.entry.lesson.title });
        if (status) status.textContent = "Shared.";
        return;
      } catch (e) {
        if ((e as { name?: string }).name === "AbortError") return;
      }
    }
    const a = el("a");
    a.href = URL.createObjectURL(blob);
    a.download = file.name;
    a.click();
    window.setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    if (status) status.textContent = "Saved your ritual card.";
  } catch {
    if (status) status.textContent = "The card could not be made on this device.";
  } finally {
    button.disabled = false;
  }
}
