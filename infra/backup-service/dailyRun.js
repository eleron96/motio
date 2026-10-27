'use strict';

// Orchestrates the nightly backup: runs each step in order, reports every
// failure to GlitchTip with the step's name, and pings the heartbeat only when
// all steps succeeded. A missing ping is what tells us the run never happened
// at all (container down, cron stuck) — errors alone cannot say that.

// steps: [{ label, run: async () => any }]
// deps:  { captureException, pingHeartbeat, log }
const runDailyBackup = async (steps, deps) => {
  const { captureException, pingHeartbeat, log } = deps;
  const results = [];
  for (const step of steps) {
    try {
      await step.run();
      results.push({ label: step.label, ok: true });
    } catch (error) {
      const reason = error && error.message ? error.message : String(error);
      log(`Daily backup step "${step.label}" failed: ${reason}`);
      captureException(new Error(`Daily backup step "${step.label}" failed: ${reason}`), {
        tags: { backupStep: step.label },
      });
      results.push({ label: step.label, ok: false, error: reason });
    }
  }

  const ok = results.every((result) => result.ok);
  if (ok) {
    try {
      await pingHeartbeat();
    } catch (error) {
      captureException(new Error(`Backup heartbeat ping failed: ${error.message || error}`), { level: 'warning' });
    }
  }
  return { ok, results };
};

// Heartbeat = an uptime monitor that alerts when it stops hearing from us
// (GlitchTip "Heartbeat" monitor, healthchecks.io, …). Empty URL → no-op.
const createHeartbeat = (url, fetchImpl) => async () => {
  if (!url) return;
  const response = await fetchImpl(url, { method: 'POST' });
  if (!response.ok) {
    throw new Error(`heartbeat answered HTTP ${response.status}`);
  }
};

module.exports = { runDailyBackup, createHeartbeat };
