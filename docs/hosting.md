# Repository and hosted scope

Source: https://github.com/himanshu748/two-hands-one-stage

The user authorized repository creation and hosting on November 6, 2026. The source repository is public. Credentials, databases, worktrees, private transport records and generated real-scene exports are ignored and excluded. No license was added on the user's behalf; public visibility alone does not grant a new software license.

Vercel project `two-hands-one-stage` uses the user's verified Hobby team. The deployment includes the Vite landing page, explicitly synthetic collaboration walkthrough at `/example`, and offline HTML examples. It runs no API, agent worker or model inference. The full stateful app remains the README's local setup, requiring Switch/Mattermost, server credentials and a bounded usage allowance. No paid plan, add-on, custom domain or cloud restart was created.

Production is public; previews retain authentication. Node 22.x is pinned in project settings; CI uses Ubuntu 24.04. `/studio` redirects to the labelled `/example` only in public hosting. The example is an explicit route, never a fallback from a failed live API.

Build: `pnpm build:public-demo`. The initial deployment uses Vercel CLI 50.4.9 from an isolated staging directory containing only allowlisted `apps/web/dist` static output and routing settings. The Vercel connector created the project and verified deployment status; CLI handled filesystem upload. No runtime secrets or database are uploaded. Automatic Git deployment linkage is not assumed; a source push alone does not establish deployment.

Official references: https://vercel.com/docs/rest-api/deployments/create-a-new-deployment and https://vercel.com/docs/plans/hobby.

The secret-scan skill checked full staged files. Its 16 findings were intentional synthetic credential literals in tests/process fixtures, reviewed by location. No actual configured credential value appeared in staged content. `.env`, `work/`, `outputs/`, SQLite files, dependencies and build directories were not staged. This covers known patterns and configured values, not every unknown secret or future commit.

Production alias: https://two-hands-one-stage.vercel.app (public example: `/example`). Initial deployment reached READY and anonymous HTTP checks returned 200 for the landing page, example, snapshot and both HTML files. The `/studio` redirect ends at `/example`. Production source: an allowlisted local static build; the Git repository is not automatically linked. Future deployment from the source repository must use its Vercel configuration and excluded-path rules. No project runtime environment variables were created.
