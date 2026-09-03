import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, it } from "vitest";

it("contains no application API, Hono runtime, or observability", () => {
	const root = process.cwd();
	const pkg = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));
	const worker = readFileSync(resolve(root, "src/worker/index.ts"), "utf8");
	const wrangler = JSON.parse(readFileSync(resolve(root, "wrangler.json"), "utf8"));
	expect(pkg.dependencies?.hono).toBeUndefined();
	expect(worker).not.toContain("Hono");
	expect(worker).not.toContain("/api/");
	expect(wrangler.observability).toBeUndefined();
	expect(wrangler.assets.not_found_handling).toBe("single-page-application");
});
