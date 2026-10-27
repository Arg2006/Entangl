# Entangl

Point it at a public GitHub repo, get a security review.

The app picks up to 10 security relevant source files (auth, sessions, routes, queries, uploads, config), has Claude review them line by line, and checks `package.json` dependencies against the OSV vulnerability database.

## Run locally

```bash
npm install
cp .env.example .env.local   # then add your ANTHROPIC_API_KEY
npm run dev
```

Open http://localhost:3000 and click **Run review**.

## Environment variables

| Name | Required | Notes |
| --- | --- | --- |
| `ANTHROPIC_API_KEY` | Yes | From platform.claude.com. Billed per review, a few cents each. |
| `GITHUB_TOKEN` | No | Raises the GitHub API limit from 60 to 5,000 requests per hour. Read only access to public repos is enough. |

On Vercel, add the same variables under Project Settings, Environment Variables, then redeploy.

## How it works

- `app/page.tsx` is the UI.
- `app/api/review/route.ts` fetches the repo tree, filters and downloads files, sends them to `claude-sonnet-5-5`, parses the JSON findings and runs the OSV check in parallel.
- `lib/types.ts` holds the shared types.
