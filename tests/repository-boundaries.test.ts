import { readFile, readdir } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const repositoryRoot = resolve(import.meta.dirname, "..");
const sourceRoot = resolve(repositoryRoot, "src");

async function typescriptFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map((entry) => {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) return typescriptFiles(path);
    return entry.isFile() && entry.name.endsWith(".ts") ? [path] : [];
  }));
  return nested.flat();
}

describe("repository architecture boundaries", () => {
  it("keeps shippable source independent from demo, tests, scripts, and evidence", async () => {
    const violations: string[] = [];
    for (const file of await typescriptFiles(sourceRoot)) {
      const content = await readFile(file, "utf8");
      const specifiers = [...content.matchAll(/(?:from\s+|import\s*)["']([^"']+)["']/g)].map((match) => match[1]!);
      for (const specifier of specifiers.filter((candidate) => candidate.startsWith("."))) {
        const importedPath = resolve(dirname(file), specifier);
        if (importedPath !== sourceRoot && !importedPath.startsWith(`${sourceRoot}\\`) && !importedPath.startsWith(`${sourceRoot}/`)) {
          violations.push(`${relative(repositoryRoot, file)} imports ${specifier}`);
        }
      }
    }
    expect(violations).toEqual([]);
  });

  it("keeps production replay and invocation paths free of model-provider dependencies", async () => {
    const files = [
      ...(await typescriptFiles(resolve(sourceRoot, "replay"))),
      ...await typescriptFiles(resolve(sourceRoot, "api")),
    ];
    const violations: string[] = [];
    for (const file of files) {
      const content = await readFile(file, "utf8");
      if (/from\s+["']openai["']|agent\/openai-model/.test(content)) violations.push(relative(repositoryRoot, file));
    }
    expect(violations).toEqual([]);
  });
});
