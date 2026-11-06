// Explicit synthetic harness. Never imported by pnpm dev or the live API entrypoint.
import { Store } from "../apps/api/src/store.js";
import { createServer } from "../apps/api/src/server.js";
import { syntheticConfig, seedApproved } from "../fixtures/service.js";
const store = new Store({...syntheticConfig(), publicUrl: "http://127.0.0.1:5186"});
seedApproved(store);
const app = createServer(store, {
  writer: "fixture-writer-token-01234567890123456789",
  stage: "fixture-stage-token-01234567890123456789",
});
await app.listen({ host: "127.0.0.1", port: 4310 });
console.info(
  "SYNTHETIC BROWSER FIXTURE SERVER. Not Switch, not human rehearsal.",
);
for (const signal of ["SIGINT", "SIGTERM"])
  process.once(signal, () => {
    void app.close().then(() => process.exit(0));
  });
