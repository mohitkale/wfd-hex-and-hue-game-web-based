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
  return { title: "Stuck", detail: "No group can reach the cubes that are left" };
}
