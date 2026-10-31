import {
  exportPractice,
  importPractice,
  pathProgress,
  practiceDays,
  type Branch,
} from "@hexhue/learn";
import { loadPractice, storePractice } from "./practiceStore";

interface PanelLesson {
  id: string;
  branch: Branch;
  title: string;
  reviewed: boolean;
}

/**
 * "Your path" on the Grimoire hub: practice days, each branch's lessons as lit or unlit nodes, and
 * export / import of the practice file. Reads the lesson list from the panel's `data-lessons`.
 */
export function setupPathPanel(root: HTMLElement): void {
  const lessons = JSON.parse(root.dataset.lessons ?? "[]") as PanelLesson[];
  const names = JSON.parse(root.dataset.branches ?? "{}") as Record<string, string>;
  const preview = root.closest(".grimoire")?.classList.contains("preview") ?? false;
  const visible = lessons.filter((l) => preview || l.reviewed);
  const days = root.querySelector<HTMLElement>("[data-days]");
  const list = root.querySelector<HTMLElement>("[data-branches]");
  const status = root.querySelector<HTMLElement>("[data-status]");
  if (!days || !list || !status) return;
  root.hidden = visible.length === 0;

  const render = () => {
    const save = loadPractice();
    const n = practiceDays(save);
    days.textContent = n === 1 ? "1 practice day" : `${n} practice days`;
    list.replaceChildren(
      ...pathProgress(visible, save).map((b) => {
        const li = document.createElement("li");
        const name = document.createElement("span");
        name.className = "branch-name";
        name.textContent = `${names[b.branch] ?? b.branch} · ${b.lit} of ${b.total}`;
        const nodes = document.createElement("span");
        nodes.className = "nodes";
        nodes.setAttribute("aria-hidden", "true");
        for (const node of b.nodes) {
          const dot = document.createElement("span");
          dot.className = node.lit ? "node lit" : "node";
          dot.title = lessons.find((l) => l.id === node.id)?.title ?? node.id;
          nodes.append(dot);
        }
        li.append(name, nodes);
        return li;
      }),
    );
  };

  root.querySelector("[data-export]")?.addEventListener("click", () => {
    const blob = new Blob([exportPractice(loadPractice())], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "hex-and-hue-practice.json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    status.textContent = "Saved your practice file.";
  });

  const file = root.querySelector<HTMLInputElement>("[data-import]");
  file?.addEventListener("change", async () => {
    const chosen = file.files?.[0];
    file.value = "";
    if (!chosen) return;
    const out = importPractice(loadPractice(), await chosen.text());
    if (!out.ok) {
      status.textContent = out.error;
      return;
    }
    status.textContent = storePractice(out.save)
      ? "Practice file added to this device."
      : "This device would not keep it (storage is blocked).";
    render();
  });

  render();
}
