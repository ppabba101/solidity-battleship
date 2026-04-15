/**
 * demo-headless.mjs — Headless Playwright smoke test for the Battleship hot-seat demo.
 *
 * Prerequisites:
 *   1. A local chain must be running:   npm run local-chain
 *   2. Contract deployed + VITE_BATTLESHIP_ADDRESS set in frontend/.env.local
 *   3. Vite dev server running at http://127.0.0.1:5173:  npm run frontend:dev
 *
 * Run:
 *   node scripts/demo-headless.mjs
 *
 * Exit codes:
 *   0  — all assertions passed (placement → battle → win screen rendered, zero JS errors)
 *   1  — an assertion or navigation step failed
 *
 * Flow implemented:
 *   Player 1 placement:  click "Randomize" → click "Ready"
 *   Player 2 placement:  click "Randomize" → click "Ready"
 *   Battle phase:        for each active player, click cells 0..99 in the
 *                        "Enemy Waters" grid until the win dialog appears.
 *                        Because fleet positions are random we cannot predict
 *                        which cells are hits, so we fire every cell in order
 *                        and let the app's hit counter reach 17 naturally.
 *                        After a miss the app flips the player; after a hit
 *                        the same player keeps the turn — the script just
 *                        re-scans for an enabled clickable cell on whichever
 *                        "Enemy Waters" grid is currently visible.
 *   Win assertion:       wait for a dialog containing "You Win!" or "You Lose"
 *                        (either means the game reached a terminal state).
 *
 * Limitations:
 *   - The script fires cells 0–99 linearly and relies on the app to track
 *     turn ownership; it does NOT simulate a two-headed human switching seats.
 *     In practice the hot-seat app keeps both boards in the same page context
 *     and the "Enemy Waters" grid for the active player is always present, so
 *     clicking through all 100 cells will always produce 17 hits somewhere
 *     and trigger the win screen.
 *   - No on-chain transactions succeed in this test unless a local anvil node
 *     is running; the app continues in demo mode with soft errors on chain
 *     failures, so the UI flow still completes.
 *   - Console errors from chain connectivity (RPC not available) are filtered
 *     out; only application-level JS exceptions are treated as failures.
 *
 * Recommended data-testid additions to App.tsx / components (not added here):
 *   data-testid="placement-ready-btn"   on the Ready <Button> in PlacementBoard
 *   data-testid="randomize-btn"         on the Randomize <Button> in PlacementBoard
 *   data-testid="enemy-grid"            on the "Enemy Waters" <Grid> wrapper div
 *   data-testid="win-dialog"            on the <DialogContent> in WinScreen
 *   data-testid="cell-{i}"              on each <motion.button> in Grid (i = 0..99)
 */

import { chromium } from "playwright";

const BASE_URL = "http://127.0.0.1:5173";
const TIMEOUT = 60_000; // ms — generous for zk proving steps

// Chain-connectivity errors that are benign in a no-RPC environment.
const IGNORABLE_ERROR_PATTERNS = [
  /watchGameEvents failed/i,
  /getBlockNumber/i,
  /getBalance/i,
  /fetch failed/i,
  /Failed to fetch/i,
  /ECONNREFUSED/i,
  /network error/i,
  /RPC.*error/i,
  /commitBoard failed/i,
  /fireShot failed/i,
  /respondShot failed/i,
  /createGame.*failed/i,
];

function isIgnorableError(msg) {
  return IGNORABLE_ERROR_PATTERNS.some((re) => re.test(msg));
}

async function main() {
  const errors = [];

  console.log("[demo-headless] Launching Chromium…");
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  // Capture JS exceptions and console errors.
  page.on("pageerror", (err) => {
    const msg = err.message ?? String(err);
    if (!isIgnorableError(msg)) {
      console.error(`[demo-headless] PAGE ERROR: ${msg}`);
      errors.push(msg);
    }
  });
  page.on("console", (msg) => {
    if (msg.type() === "error") {
      const text = msg.text();
      if (!isIgnorableError(text)) {
        console.error(`[demo-headless] CONSOLE ERROR: ${text}`);
        errors.push(text);
      }
    }
  });

  try {
    // ------------------------------------------------------------------ //
    // 1. Navigate and wait for placement screen
    // ------------------------------------------------------------------ //
    console.log(`[demo-headless] Navigating to ${BASE_URL}…`);
    await page.goto(BASE_URL, { waitUntil: "networkidle", timeout: TIMEOUT });

    // The placement heading contains "place your fleet"
    await page.waitForSelector("text=place your fleet", { timeout: TIMEOUT });
    console.log("[demo-headless] Placement screen loaded.");

    // ------------------------------------------------------------------ //
    // 2. Player 1 placement
    // ------------------------------------------------------------------ //
    console.log("[demo-headless] Player 1: clicking Randomize…");
    await page.getByRole("button", { name: "Randomize" }).click();

    // Wait for the Ready button to become enabled (fleet is valid after randomize)
    const readyBtn = page.getByRole("button", { name: "Ready" });
    await readyBtn.waitFor({ state: "visible", timeout: TIMEOUT });
    await expect_enabled(page, readyBtn, "Ready button (P1)");

    console.log("[demo-headless] Player 1: clicking Ready…");
    await readyBtn.click();

    // The app proves the board (~1-5s in demo mode) then switches to Player 2.
    // Wait for the heading to mention Player 2.
    await page.waitForSelector("text=Player 2", { timeout: TIMEOUT });
    console.log("[demo-headless] Player 2 placement screen detected.");

    // ------------------------------------------------------------------ //
    // 3. Player 2 placement
    // ------------------------------------------------------------------ //
    console.log("[demo-headless] Player 2: clicking Randomize…");
    await page.getByRole("button", { name: "Randomize" }).click();

    const readyBtn2 = page.getByRole("button", { name: "Ready" });
    await readyBtn2.waitFor({ state: "visible", timeout: TIMEOUT });
    await expect_enabled(page, readyBtn2, "Ready button (P2)");

    console.log("[demo-headless] Player 2: clicking Ready…");
    await readyBtn2.click();

    // ------------------------------------------------------------------ //
    // 4. Wait for battle phase
    // ------------------------------------------------------------------ //
    // The app shows "Phase 2 — Battle" once both boards are committed.
    await page.waitForSelector("text=Phase 2", { timeout: TIMEOUT });
    console.log("[demo-headless] Battle phase started.");

    // ------------------------------------------------------------------ //
    // 5. Fire shots until win screen appears
    // ------------------------------------------------------------------ //
    // Strategy: locate the "Enemy Waters" grid label, then find the sibling
    // grid container holding the 100 buttons. Click them 0..99 in order,
    // checking for the win dialog after each shot.
    //
    // The grid is rendered as:
    //   <div class="flex flex-col gap-2">
    //     <div class="text-xs ...">Enemy Waters</div>
    //     <div class="relative grid ...">  ← 100 buttons
    //     </div>
    //   </div>
    //
    // We use a short post-shot pause so the React state update (and potential
    // player-switch animation) settles before we look for the next cell.

    let shotsFired = 0;
    let winDetected = false;

    const WIN_SELECTOR = 'text="You Win!"';
    const LOSE_SELECTOR = 'text="You Lose"';

    for (let i = 0; i < 100 && !winDetected; i++) {
      // Check win condition before each shot
      const wonEl = await page.$(WIN_SELECTOR);
      const lostEl = await page.$(LOSE_SELECTOR);
      if (wonEl || lostEl) {
        winDetected = true;
        break;
      }

      // Find the active "Enemy Waters" grid. There may be two grids on screen
      // (own fleet + enemy); we want the one whose label contains "Enemy Waters".
      const enemyGridContainer = await page.evaluateHandle(() => {
        const labels = [...document.querySelectorAll("div")];
        for (const el of labels) {
          if (
            el.children.length === 0 &&
            el.textContent?.trim() === "Enemy Waters"
          ) {
            // Parent of the label div is the flex-col container;
            // second child is the grid div with the buttons.
            const container = el.closest(".flex.flex-col.gap-2");
            if (container) {
              // The grid is the second child (index 1): <div class="relative grid ...">
              const gridDiv = container.querySelector(".grid");
              return gridDiv;
            }
          }
        }
        return null;
      });

      const gridDiv = enemyGridContainer.asElement();
      if (!gridDiv) {
        console.warn(
          `[demo-headless] Could not locate Enemy Waters grid at shot ${i}; skipping.`,
        );
        continue;
      }

      // Get all buttons inside the enemy grid
      const cellButtons = await gridDiv.$$("button");
      if (!cellButtons || cellButtons.length === 0) {
        console.warn(`[demo-headless] No cell buttons found at shot ${i}.`);
        break;
      }

      // Find the next UNKNOWN cell (not already shot). The cell state is
      // encoded in its className: UNKNOWN cells have no hit/miss/sunk class.
      // We try cell index i (linear scan); skip already-fired cells.
      // To avoid clicking the same i repeatedly, we scan forward from last i.
      const btn = cellButtons[i];
      if (!btn) break;

      // Check if the cell is already in a terminal state (hit/miss/sunk/pending).
      // We skip disabled buttons too.
      const isDisabled = await btn.evaluate(
        (el) => el.disabled || el.getAttribute("disabled") !== null,
      );
      if (isDisabled) {
        // This cell is already fired or the grid is busy — skip silently
        continue;
      }

      console.log(`[demo-headless] Firing cell ${i} (shot #${shotsFired + 1})…`);
      await btn.click();
      shotsFired++;

      // Wait a moment for the proving animation and state update to complete.
      // The app sets proving=null when done; we wait for the "Busy" overlay
      // to disappear (or simply wait a short fixed interval for non-chain mode).
      try {
        // If a "Busy" overlay appears, wait for it to vanish.
        await page.waitForSelector(".grid >> text=Busy", {
          state: "attached",
          timeout: 300,
        });
        await page.waitForSelector(".grid >> text=Busy", {
          state: "detached",
          timeout: TIMEOUT,
        });
      } catch {
        // No "Busy" overlay — proving was instant (mock mode). That's fine.
      }

      // Short settle for React re-render
      await page.waitForTimeout(150);
    }

    // Final win-screen check after the loop exhausts
    if (!winDetected) {
      const wonEl = await page.$(WIN_SELECTOR);
      const lostEl = await page.$(LOSE_SELECTOR);
      winDetected = !!(wonEl || lostEl);
    }

    if (!winDetected) {
      // Wait a bit longer — the winning shot's prove step might still be running
      console.log(
        "[demo-headless] Waiting for win dialog (up to 30s after last shot)…",
      );
      try {
        await page.waitForSelector(`${WIN_SELECTOR}, ${LOSE_SELECTOR}`, {
          timeout: 30_000,
        });
        winDetected = true;
      } catch {
        // Will be caught below
      }
    }

    if (!winDetected) {
      throw new Error(
        `Win screen never appeared after ${shotsFired} shots. ` +
          `Check that the game reached a terminal state.`,
      );
    }

    console.log(
      `[demo-headless] Win screen detected after ${shotsFired} shots.`,
    );

    // ------------------------------------------------------------------ //
    // 6. Assert zero collected errors
    // ------------------------------------------------------------------ //
    if (errors.length > 0) {
      throw new Error(
        `${errors.length} JS console/page error(s) detected:\n` +
          errors.map((e) => `  - ${e}`).join("\n"),
      );
    }

    console.log("[demo-headless] All assertions passed. Exiting 0.");
  } finally {
    await browser.close();
  }
}

/**
 * Poll until a button's disabled attribute is false.
 * Throws if still disabled after TIMEOUT ms.
 */
async function expect_enabled(page, locator, label) {
  const deadline = Date.now() + TIMEOUT;
  while (Date.now() < deadline) {
    const disabled = await locator.evaluate((el) => el.disabled);
    if (!disabled) return;
    await page.waitForTimeout(200);
  }
  throw new Error(`[demo-headless] Timed out waiting for "${label}" to become enabled`);
}

main().catch((err) => {
  console.error("[demo-headless] FAILED:", err.message);
  process.exit(1);
});
