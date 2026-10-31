/** The text of an end card: what happened and, for a loss, why (in words a player can act on). */
export function endCardText(o: {
  won: boolean;
  lossReason: "slotsFull" | "deadlock" | null;
  delivered: number;
}): {
  title: string;
  detail: string;
} {
  if (o.won) return { title: "Every cube collected!", detail: `Delivered ${o.delivered} cubes` };
  if (o.lossReason === "slotsFull")
    return { title: "Out of slots", detail: "A group ran out of cubes with every slot full" };
  // With shared trays a deadlock is every tray holding a box whose colour is still buried.
  return {
    title: "Stuck",
    detail:
      "Every tray holds a box whose cubes are still buried.\nAn extra tray or a free Retry gets you going",
  };
}
