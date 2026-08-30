# AI configuration

The workout logger, persisted plan, progression rules, progress screens, and exercise replacements work locally without an AI credential.

For real onboarding follow-ups, AI plan generation, and arbitrary Coach conversation, copy `.env.example` to `.env`, add a new server-side OpenAI API key, then build and start the included server:

```dotenv
OPENAI_API_KEY=your-new-server-side-key
OPENAI_MODEL=gpt-5-mini
OPENAI_PLAN_MODEL=gpt-5-mini
OPENAI_EXPERT_MODEL=gpt-5-mini
OPENAI_REASONING=low
OPENAI_PLAN_REASONING=medium
OPENAI_EXPERT_REASONING=high
EXPERT_LAB_ENABLED=false
EXPERT_POLICY_ENABLED=true
PORT=4173
```

```powershell
npm.cmd run build
npm.cmd start
```

The start command loads `.env` automatically. `OPENAI_MODEL` is optional and defaults to `gpt-5-mini`. The browser calls `/api/ai`; the key is read only by `server.mjs` and is never included in the Vite bundle. Provider responses use strict JSON Schema output, and generated plans are validated again against schedule, equipment, restrictions, workload, stable exercise IDs, and prescription bounds before persistence.

Without a configured provider, onboarding asks no pretend-AI follow-ups and builds a deterministic personalized local plan. Coach labels its limited state and only answers calculations that can be proven from stored workout data.
