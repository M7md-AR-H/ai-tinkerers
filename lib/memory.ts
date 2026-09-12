import fs from "node:fs/promises";
import path from "node:path";

export type Memory = { facts: string[]; log: { at: string; event: string }[] };

// Must be absolute: Trigger.dev runs tasks from its own build dir, so cwd is not the project root there.
const DIR = process.env.DATA_DIR || path.join(process.cwd(), "data");

function file(id: string) {
  if (!/^[a-z0-9-]+$/i.test(id)) throw new Error(`Invalid object id: ${id}`);
  return path.join(DIR, `${id}.json`);
}

export async function loadMemory(id: string): Promise<Memory> {
  try {
    const m = JSON.parse(await fs.readFile(file(id), "utf8"));
    return { facts: Array.isArray(m.facts) ? m.facts : [], log: Array.isArray(m.log) ? m.log : [] };
  } catch {
    return { facts: [], log: [] };
  }
}

export async function saveMemory(id: string, m: Memory) {
  await fs.mkdir(DIR, { recursive: true });
  await fs.writeFile(file(id), JSON.stringify(m, null, 2));
}

export async function addFact(id: string, fact: string) {
  const m = await loadMemory(id);
  if (!m.facts.includes(fact)) m.facts.push(fact);
  await saveMemory(id, m);
}

export async function addLog(id: string, event: string) {
  const m = await loadMemory(id);
  m.log.unshift({ at: new Date().toISOString(), event });
  m.log = m.log.slice(0, 20);
  await saveMemory(id, m);
}
