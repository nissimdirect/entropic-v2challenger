/**
 * P4.0 measurement runner — THROWAWAY (spike branch only, never merged).
 * Drives the harness in headed Chromium (real GPU compositing on-target) and
 * captures BOTH:
 *   (a) dropped-frame count + rAF cadence from the harness console JSON
 *       (rAF delta is vsync-bound → only "dropped frames" is a valid gate metric)
 *   (b) true per-frame scripting+render work-time from CDP Performance.getMetrics
 *       (Δ ScriptDuration+LayoutDuration+RecalcStyleDuration ÷ frames-in-window)
 * Runs each config 3x; reports worst (max p95-equivalent / max dropped).
 */
const { chromium } = require('playwright');

const URL = 'http://localhost:5199/';
const CONFIGS = [['xyflow', '32'], ['bare-svg', '32'], ['xyflow', '64'], ['bare-svg', '64']];
const RUNS = 3;
const WINDOW_FRAMES = 720; // 120 warmup + 600 measure

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function metricMap(m) {
  const o = {};
  for (const { name, value } of m.metrics) o[name] = value;
  return o;
}

(async () => {
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();
  const client = await page.context().newCDPSession(page);
  await client.send('Performance.enable');
  await page.goto(URL, { waitUntil: 'networkidle' });
  await sleep(800);

  const all = [];

  for (const [impl, variant] of CONFIGS) {
    const runResults = [];
    for (let run = 0; run < RUNS; run++) {
      // select impl + variant
      await page.getByRole('button', { name: impl, exact: true }).click();
      await page.getByRole('button', { name: `${variant}-path`, exact: true }).click();
      await sleep(400); // let scene remount + settle

      // arm console capture for the next result line
      const resultP = new Promise((resolve) => {
        const handler = (msg) => {
          const t = msg.text();
          if (t.includes('[P4.0 perf result]')) {
            const json = t.slice(t.indexOf('{'));
            page.off('console', handler);
            try { resolve(JSON.parse(json)); } catch { resolve(null); }
          }
        };
        page.on('console', handler);
      });

      const m0 = metricMap(await client.send('Performance.getMetrics'));
      await page.getByRole('button', { name: 'Start measurement', exact: true }).click();
      const harness = await Promise.race([resultP, sleep(20000).then(() => null)]);
      const m1 = metricMap(await client.send('Performance.getMetrics'));

      if (!harness) { runResults.push({ error: 'no result (timeout)' }); continue; }

      const dScript = (m1.ScriptDuration - m0.ScriptDuration) * 1000;
      const dLayout = (m1.LayoutDuration - m0.LayoutDuration) * 1000;
      const dStyle = (m1.RecalcStyleDuration - m0.RecalcStyleDuration) * 1000;
      const workPerFrameMs = (dScript + dLayout + dStyle) / WINDOW_FRAMES;

      runResults.push({
        run: run + 1,
        rafP50: harness.p50, rafP95: harness.p95, rafMax: harness.max,
        dropped: harness.droppedFrames, samples: harness.sampleCount,
        workMsPerFrame: +workPerFrameMs.toFixed(3),
        scriptMs: +(dScript / WINDOW_FRAMES).toFixed(3),
        layoutMs: +(dLayout / WINDOW_FRAMES).toFixed(3),
        styleMs: +(dStyle / WINDOW_FRAMES).toFixed(3),
      });
      await sleep(500);
    }

    // worst-of-3: highest workMsPerFrame and highest dropped
    const valid = runResults.filter((r) => !r.error);
    const worst = valid.length
      ? valid.reduce((a, b) => (b.workMsPerFrame > a.workMsPerFrame ? b : a))
      : { error: 'all runs failed' };
    all.push({ impl, variant, worst, runs: runResults });
  }

  console.log('P40_RESULTS_JSON_START');
  console.log(JSON.stringify(all, null, 2));
  console.log('P40_RESULTS_JSON_END');
  await browser.close();
})().catch((e) => { console.error('RUNNER_ERROR', e); process.exit(1); });
