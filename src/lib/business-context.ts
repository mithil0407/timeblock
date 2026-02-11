import { readFile } from "node:fs/promises";
import { join } from "node:path";

const CONTEXT_FILES = ["context", "marketingcontext", "financecontext"];
let cachedContext: string | null = null;

export async function loadBusinessContext(): Promise<string> {
    if (cachedContext) return cachedContext;

    const baseDir = process.cwd();
    const contents = await Promise.all(
        CONTEXT_FILES.map(async (file) => {
            const filePath = join(baseDir, file);
            const text = await readFile(filePath, "utf8");
            return `=== ${file.toUpperCase()} ===\n${text.trim()}`;
        })
    );

    cachedContext = contents.join("\n\n");
    return cachedContext;
}
