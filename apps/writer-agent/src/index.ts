import { runWorker } from '@two-hands/agent-runtime';

try { await runWorker('writer'); }
catch (error) {
  // Startup errors produced by this runtime are sanitized and name missing variables, never values.
  console.error(JSON.stringify({ role: 'writer', event: 'startup_failed', message: error instanceof Error && /Missing worker configuration|must contain at least|API_URL|Local API unavailable|Switch recovery blocked/.test(error.message) ? error.message : 'Writer could not start. Check .env, the local API, Switch registration and operation discovery.' }));
  process.exitCode = 1;
}
