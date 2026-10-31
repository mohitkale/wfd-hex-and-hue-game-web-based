import {
  answerCard,
  earnedCount,
  practiceRound,
  questionFor,
  recordPracticeDay,
  type Deck,
  type Question,
} from "@hexhue/learn";
import { cardSvg } from "./cardArt";
import { loadDeckProgress, storeDeckProgress } from "./cardStore";
import { loadPractice, localDay, storePractice } from "./practiceStore";

const BADGE = {
  "kitchen-safe": "Kitchen-safe",
  "external-only": "External use only",
  "do-not-use": "Toxic: do not use",
} as const;

/**
 * A deck's page: the collection (earned cards face up, the rest waiting) and a practice round of
 * match questions. Right answers earn and strengthen cards; a wrong one shows the answer and why,
 * and costs nothing earned. Reads the deck from `data-deck`.
 */
export function setupCardGame(root: HTMLElement): void {
  const deck = JSON.parse(root.dataset.deck ?? "null") as Deck | null;
  if (!deck) return;
  const store = (() => {
    try {
      return window.localStorage;
    } catch {
      return null;
    }
  })();
  const grid = root.querySelector<HTMLElement>("[data-grid]")!;
  const count = root.querySelector<HTMLElement>("[data-count]")!;
  const play = root.querySelector<HTMLElement>("[data-play]")!;
  const start = root.querySelector<HTMLButtonElement>("[data-start]")!;

  const drawCollection = () => {
    const progress = loadDeckProgress(deck, store);
    count.textContent = `${earnedCount(deck, progress)} of ${deck.cards.length} cards earned`;
    grid.replaceChildren(
      ...deck.cards.map((c) => {
        const li = document.createElement("li");
        const earned = !!progress[c.id];
        li.className = earned ? "card earned" : "card";
        if (earned) {
          li.innerHTML = `${cardSvg(deck.kind, c.color, 56)}<strong></strong><span class="uses"></span><span class="lore"></span>`;
          li.querySelector("strong")!.textContent = c.name;
          li.querySelector(".uses")!.textContent = c.uses.join(" · ");
          li.querySelector(".lore")!.textContent = c.caution ? `${c.lore} ${c.caution}` : c.lore;
          if (c.safety) {
            const badge = document.createElement("span");
            badge.className = `badge ${c.safety}`;
            badge.textContent = BADGE[c.safety];
            li.append(badge);
          }
        } else {
          li.innerHTML = `${cardSvg(deck.kind, "#4b3b6b", 56)}<strong>?</strong><span class="uses">Match it to earn it</span>`;
        }
        return li;
      }),
    );
  };

  const runRound = () => {
    const day = localDay(new Date());
    const ids = practiceRound(deck, loadDeckProgress(deck, store), day);
    let i = 0;
    let earnedNow = 0;
    const next = () => {
      const id = ids[i];
      // The seed only varies the question's wording and order; any number will do.
      const q = id ? questionFor(deck, id, Math.floor(Math.random() * 2 ** 31)) : null;
      if (!q) {
        finish();
        return;
      }
      ask(q);
    };
    const ask = (q: Question) => {
      const box = document.createElement("div");
      box.className = "question";
      const p = document.createElement("p");
      p.className = "prompt";
      p.textContent = `${i + 1} of ${ids.length}. ${q.prompt}`;
      p.tabIndex = -1;
      const opts = document.createElement("div");
      opts.className = "options";
      const result = document.createElement("p");
      result.className = "result";
      result.setAttribute("aria-live", "polite");
      for (const o of q.options) {
        const b = document.createElement("button");
        b.type = "button";
        b.textContent = o.label;
        b.dataset.id = o.id;
        b.addEventListener("click", () => {
          const right = o.id === q.answer;
          const before = loadDeckProgress(deck, store);
          const after = answerCard(before, q.card, right, day);
          if (!before[q.card] && after[q.card]) earnedNow++;
          storeDeckProgress(deck, after, store);
          storePractice(recordPracticeDay(loadPractice(), day));
          for (const btn of opts.querySelectorAll("button")) {
            btn.disabled = true;
            if (btn.dataset.id === q.answer) {
              btn.classList.add("right");
            }
          }
          if (!right) b.classList.add("wrong");
          result.textContent = right ? `Yes. ${q.teach}` : `Not quite. ${q.teach}`;
          const go = document.createElement("button");
          go.type = "button";
          go.className = "next";
          go.textContent = i + 1 < ids.length ? "Next" : "Finish";
          go.addEventListener("click", () => {
            i++;
            next();
          });
          box.append(go);
          go.focus();
        });
        opts.append(b);
      }
      box.append(p, opts, result);
      play.replaceChildren(box);
      p.focus();
    };
    const finish = () => {
      drawCollection();
      const done = document.createElement("div");
      done.className = "question";
      const p = document.createElement("p");
      p.className = "prompt";
      p.tabIndex = -1;
      p.textContent =
        earnedNow > 0
          ? `Round done: ${earnedNow} new card${earnedNow === 1 ? "" : "s"} earned.`
          : "Round done. The cards you know come back for review over the next days.";
      const again = document.createElement("button");
      again.type = "button";
      again.className = "next";
      again.textContent = "Another round";
      again.addEventListener("click", runRound);
      done.append(p, again);
      play.replaceChildren(done);
      p.focus();
    };
    next();
  };

  start.addEventListener("click", runRound);
  drawCollection();
}
