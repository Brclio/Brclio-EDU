/** Optional test-only relay: current local UI, existing real isolated compiler service.
 * No execution responses are mocked. Omit AUDIT_RUNNER_ORIGIN for same-origin deployments.
 */
export async function installRuntimeRelay(context, report) {
  const origin = process.env.AUDIT_RUNNER_ORIGIN;
  if (!origin) return;
  const upstream = new URL('/api/run', origin);
  report.executionRelay = { upstream: upstream.href, requests: [], note: 'Only API transport is proxied; current local UI and real isolated runtime execute every source program.' };
  let lastStart = 0;
  await context.route('**/api/run', async route => {
    const delay = Math.max(0, lastStart + 13000 - Date.now());
    if (delay) await new Promise(resolve => setTimeout(resolve, delay));
    lastStart = Date.now();
    const response = await context.request.post(upstream.href, { headers: { 'Content-Type': 'application/json', Origin: upstream.origin, 'Sec-Fetch-Site': 'same-origin' }, data: route.request().postData(), timeout: 65000 });
    const result = await response.json();
    report.executionRelay.requests.push({ at: new Date().toISOString(), status: response.status(), exitCode: result.exitCode, timedOut: result.timedOut, error: result.error, stdout: result.stdout?.slice(0,160) });
    await route.fulfill({ response });
  });
}
