import { chromium } from "@playwright/test";
const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 1600, height: 1120 },
  deviceScaleFactor: 1,
});
await page.goto("http://127.0.0.1:42719");
await page.locator(".os-event").first().waitFor();
await page.screenshot({ path: "../openschedule-preview.png", fullPage: true });
await page.getByLabel("Calendar view").selectOption("resourceDay");
await page.screenshot({ path: "../../work/resource-day.png", fullPage: true });
await page.setViewportSize({ width: 390, height: 844 });
await page.screenshot({ path: "../../work/mobile.png", fullPage: true });
await browser.close();
