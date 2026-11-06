# Controller shutdown documentation correction

[PR #1618](https://github.com/sandbox-quantum/switch/pull/1618) is open for review from `himanshu748:feat/controller-lifetime-guide`, commit `f52803d20050c0698fe9686d0beedc55ae0884d4`.

The agent-controller README said that stopping the controller stops all its agents and sessions. Current code deliberately leaves detached hosts and Linux per-agent systemd units running. The correction explains the three runtime lifetimes and distinguishes ordinary controller shutdown, an agent stop/removal applied by a connected controller, and received controller revocation.

Only `console/packages/agent-controller/README.md` changed (21 additions, 5 deletions). This is related to hackathon issue #807, not an implementation or closure of its full guide requirement. No new commands, dependencies or runtime behavior were introduced.

Validation in the isolated checkout: offline frozen install, controller dependency build, package lint/typecheck and diff checks passed; the controller suite reported 412 passed and 2 skipped. Skips were Linux/systemd integration and Windows filesystem permissions. Those platform behaviors were checked against existing source/tests, not newly exercised on this Mac. Full repository acceptance is not claimed. The GitHub connector lacked permission to open a PR; the existing authenticated GitHub CLI completed creation and readback verified the exact head and single changed file. Hosted checks were pending at initial readback.

Private local evidence: `work/switch-807-evidence/` and `work/switch-807-{build,tests,lint,typecheck}.log`. The contribution is submitted for review, not merged or accepted for the hackathon.
