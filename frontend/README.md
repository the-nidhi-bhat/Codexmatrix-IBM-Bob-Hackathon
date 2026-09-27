# Legacy Code Whisperer frontend

The existing interface is a React 19, TypeScript, and Vite single-page application. Its entry point is `src/main.tsx`; `src/App.tsx` coordinates repository entry, workflow screens, state, and in-app navigation. The API client is `src/api/workflowApi.ts`, and execute/checkpoint request state is managed by `src/workflow/useModernization.ts`.

Screens include landing and repository entry, architecture, overview, risk, plan, execution, verification, rollback, and report. Styling is hand-written CSS with light and dark themes. Navigation uses React state; routes are not reflected in the URL. Some overview/report presentation data is illustrative mock data, while repository analysis and execute/checkpoint actions use the backend API.

## Local development

From this directory:

```sh
npm ci
npm run dev
```

Vite serves the UI at `http://localhost:5173` and proxies `/api` to `http://localhost:3001`. Start the backend separately; see [../backend/README.md](../backend/README.md).

## Checks

```sh
npm test
npm run build
npm run lint
```

The contract test exercises checkpoint API response handling. The production build runs the TypeScript project build followed by Vite. The lint command uses oxlint.
