# Official local Switch deployment

`compose.yaml` is the unmodified official standalone Compose contract from Switch tag `switch-v0.31.0`, commit `7e57cd433a922bc91a00150c106e6ef1f15b1057`.

Source: https://github.com/sandbox-quantum/switch/blob/switch-v0.31.0/deploy/local/standalone-docker-compose.yml

Its upstream license is preserved as `UPSTREAM-LICENSE`. This attribution does not select a license for the Two Hands application.

The tag and published ARM64 Core image were verified on November 4, 2026. Image availability alone does not establish runtime capability; see `docs/switch-compatibility.md` for actual live checks. We do not run Switch Console or infer a compatible Console/Core pair.

Only the official `collab` and `gateway` profiles are used. The project override supplies the user-facing Mattermost URL to the setup container. Secrets are generated into ignored `work/local-switch/.env` with mode 0600 and never printed. Existing values are preserved.
