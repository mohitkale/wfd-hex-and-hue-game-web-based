/**
 * Reads the two header configs (Netlify `_headers`, nginx `add_header`) so tests can keep them in
 * step, and local checks can serve the build with the real headers.
 */
export interface HeaderRule {
  /** "/*", "/_astro/*" or an exact path. */
  path: string;
  headers: Record<string, string>;
}

/** Netlify `_headers`: a path line, then indented `Name: value` lines. */
export function parseNetlifyHeaders(text: string): HeaderRule[] {
  const rules: HeaderRule[] = [];
  for (const raw of text.split("\n")) {
    const line = raw.replace(/\s+$/, "");
    if (!line.trim() || line.trim().startsWith("#")) continue;
    if (!/^\s/.test(line)) {
      rules.push({ path: line.trim(), headers: {} });
      continue;
    }
    const at = line.indexOf(":");
    const rule = rules.at(-1);
    if (!rule || at === -1) throw new Error(`bad _headers line: ${line}`);
    rule.headers[line.slice(0, at).trim()] = line.slice(at + 1).trim();
  }
  return rules;
}

/** `add_header Name "value" always;` lines from an nginx config. */
export function parseNginxAddHeaders(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of text.matchAll(/^\s*add_header\s+(\S+)\s+"([^"]*)"(?:\s+always)?;/gm)) {
    out[m[1]!] = m[2]!;
  }
  return out;
}

/** The headers Netlify would send for `pathname` (later rules add to earlier ones). */
export function headersFor(rules: readonly HeaderRule[], pathname: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const r of rules) {
    const match = r.path.endsWith("*")
      ? pathname.startsWith(r.path.slice(0, -1))
      : pathname === r.path;
    if (match) Object.assign(out, r.headers);
  }
  return out;
}
