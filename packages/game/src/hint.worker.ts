/// <reference lib="webworker" />
import type { SimState } from "@hexhue/core";
import { hintMove } from "./hint";

/** Runs hint searches off the main thread so a slow solve never delays a tap. */
self.onmessage = (e: MessageEvent<{ id: number; state: SimState }>) => {
  self.postMessage({ id: e.data.id, move: hintMove(e.data.state) });
};
