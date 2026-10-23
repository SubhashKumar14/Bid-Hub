import { defineConfig } from "@playwright/test";
export default defineConfig({ testDir: "./e2e", timeout: 180000, workers: 1, use: { baseURL: "http://127.0.0.1:5189", actionTimeout: 15000, navigationTimeout: 30000, headless: true, trace: "retain-on-failure" } });
