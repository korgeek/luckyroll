import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
	plugins: [react()],
	test: {
		fileParallelism: false,
		environment: "jsdom",
		setupFiles: "./src/react-app/test-setup.ts",
		css: true,
	},
});
