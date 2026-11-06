import { runWorker } from '@two-hands/agent-runtime';

try { await runWorker('stage'); }
catch (error) {
  console.error(JSON.stringify({ role: 'stage', event: 'startup_failed', message: error instanceof Error && /Missing worker configuration|must contain at least|API_URL|Local API unavailable|Switch recovery blocked/.test(error.message) ? error.message : 'Stage engineer could not start. Check .env, the local API, Switch registration and operation discovery.' }));
  process.exitCode = 1;
}
