@AGENTS.md

## Logging in to the local dev server

Every app page redirects to `/login`. When you need to see the app in a browser (preview, critique, audit, visual checks), sign in yourself; don't ask the user to do it:

1. Start the server with `preview_start` (`dev` from `.claude/launch.json`, http://localhost:3000).
2. Read `APP_PASSWORD` from `.env.local` (a local dev-only password, owner-approved for this use; it is not a production credential).
3. Fill it into the Password field on `/login` and submit. The session cookie is shared across browser-pane tabs, so subagents' new tabs are already signed in.

Use this only on localhost. Never use it against a Vercel Preview or Production deployment, and don't repeat the value in chat or commit it anywhere.
