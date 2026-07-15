import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("document notes", () => {
  it("stores notes as annotations and records only their content change", () => {
    const actions = readFileSync(path.join(process.cwd(), "src/server/actions/documents.ts"), "utf8");
    const start = actions.indexOf("export async function createDocumentNoteAction");
    const end = actions.indexOf("export async function bulkDocumentAction");
    const notes = actions.slice(start, end);

    expect(notes).toContain('kind: "note"');
    expect(notes).toContain('kind: "comment_changed"');
    expect(notes).toContain('action: "created"');
    expect(notes).toContain('action: "deleted"');
  });
});
