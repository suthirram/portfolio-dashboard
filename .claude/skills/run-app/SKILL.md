---
name: run-app
description: Launch and drive the Portfolio Dashboard (Go backend + Vite frontend + MongoDB) as a real user, including the auth + snapshot-seed flow needed to verify data-driven UI (History charts). Use when asked to run the app, screenshot a page, or confirm a frontend change works against the live stack.
---

# Running the Portfolio Dashboard

Full stack: MongoDB (docker) → Go backend on `:8080` → Vite frontend on
`:3000`. The frontend proxies `/api` → `:8080`. Every authed page needs a
session cookie; every data-driven page (History charts, dashboard) needs
rows in Mongo. This skill captures the verified launch + auth + seed flow —
don't rediscover it.

## 1. Bring the stack up

```bash
# Mongo (skip if `docker ps` already shows portfolio_mongo_dev)
make dev-db

# Backend — must be free on :8080 (bind fails loudly if already running)
cd backend && go run . serve > /tmp/pd-backend.log 2>&1 &

# Frontend — Vite picks the next port if :3000 is taken; read the log
cd frontend && npm run dev > /tmp/pd-frontend.log 2>&1 &
```

Confirm backend: `curl -s -o /dev/null -w '%{http_code}' http://localhost:8080/api/specs/openapi.yaml` → `200`.
Read `/tmp/pd-frontend.log` for the actual Vite URL (`:3000` or `:3001`).

**Gotcha:** launching `go run . serve` when a backend is already bound to
`:8080` logs `bind: address already in use` and that process exits — the
*existing* one keeps serving. Don't assume your instance is the live one.

## 2. Authenticate (throwaway user via API)

Signup is public but the form needs 3 security answers; drive it with curl,
not the UI. CSRF header is mandatory on every state-changing request.

```bash
curl -s -c /tmp/pd_cookies.txt -X POST http://localhost:8080/api/auth/signup \
  -H 'Content-Type: application/json' -H 'X-Requested-With: portfolio-dashboard' \
  -d '{"name":"Chart Demo","username":"chartdemo","password":"Passw0rd!23","region":"india",
       "security_answers":[{"question_id":"favourite_movie","answer":"x"},
                           {"question_id":"favourite_book","answer":"y"},
                           {"question_id":"first_programming_lang","answer":"z"}]}'
```

Returns `201` + the user JSON (grab `id`). Session cookie lands in
`/tmp/pd_cookies.txt` as `pd_session`. Valid `question_id`s come from
`GET /api/auth/security-questions`.

## 3. Seed data (History needs snapshots)

The History charts read `portfolio_snapshots` per (user, date). Insert rows
directly — bson field names matter (`user_id` ObjectID, `date` Date,
`regions` map, `source: "cron"`).

```bash
docker exec -i portfolio_mongo_dev mongosh portfolio --quiet --eval '
const uid = ObjectId("<USER_ID_FROM_STEP_2>");
const docs = [];
const start = new Date(Date.UTC(2024,0,1));
for (let i=0;i<400;i++){
  const d = new Date(start.getTime() + i*86400000);
  const invested = 400000 + i*500;
  const current  = invested * (1 + 0.15*Math.sin(i/18) + i*0.0006);
  docs.push({ user_id: uid, date: d, currency: "INR",
    regions: { INR: { invested, current: Math.round(current), source: "cron" } },
    holdings: [], totals: { invested_total: invested, current_total: Math.round(current), pnl_pct: 0 },
    created_at: d, updated_at: d });
}
db.portfolio_snapshots.insertMany(docs);
print("inserted " + db.portfolio_snapshots.countDocuments({user_id: uid}));'
```

Verify: `curl -s -b /tmp/pd_cookies.txt "http://localhost:8080/api/history?from=2000-01-01&to=2025-12-31"`.

## 4. Drive with Playwright + screenshot

Playwright is already in `frontend/node_modules`. **It is CommonJS** — a named
`import { chromium }` fails; use the default export. Inject the `pd_session`
cookie from the curl jar (domain `localhost`).

```js
import pw from '<repo>/frontend/node_modules/playwright/index.js'
const { chromium } = pw
import fs from 'node:fs'
const sessionVal = fs.readFileSync('/tmp/pd_cookies.txt','utf8')
  .split('\n').find(l => l.includes('pd_session')).split('\t').pop().trim()
const BASE = 'http://localhost:3001' // ← the port from /tmp/pd-frontend.log
const ctx = await (await chromium.launch()).newContext({ viewport:{width:1280,height:900} })
await ctx.addCookies([{ name:'pd_session', value:sessionVal, domain:'localhost', path:'/' }])
const page = await ctx.newPage()
await page.goto(`${BASE}/history/chart/INR`, { waitUntil:'networkidle' })
await page.screenshot({ path:'/tmp/pd-chart.png' })
```

Run with `node script.mjs`. **Look at the screenshot** — a blank frame = a
failed load, not a pass. Recharts under jsdom needs `ResizeObserver`; the
real browser doesn't, so screenshots are the honest check.

## 5. Clean up

```bash
docker exec portfolio_mongo_dev mongosh portfolio --quiet --eval '
  db.portfolio_snapshots.deleteMany({user_id:ObjectId("<USER_ID>")});
  db.users.deleteMany({username:"chartdemo"});
  db.sessions.deleteMany({user_id:ObjectId("<USER_ID>")})'
lsof -ti tcp:3001 | xargs kill   # only the Vite instance you started
rm -f /tmp/pd_cookies.txt /tmp/pd-*.png /tmp/pd-*.log
```

Leave a pre-existing `:8080` backend / `:3000` Vite alone — they're the
user's, not yours.
