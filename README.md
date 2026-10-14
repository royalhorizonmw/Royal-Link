# Royal Link OS

Transport operating system for **Royal Link Transports & Travels**, a branch of Royal Horizon Limited.
Built with Next.js 15, PostgreSQL and Drizzle ORM. Designed to run at `transport.royalhorizonmw.com`.

## What it does

| Area | Who uses it | What's in it |
|---|---|---|
| Dashboard | Manager, Operations, Finance | Collected vs target (today / week / month), vehicles on the road, driver shortfall balance, net profit, 14-day chart, "needs attention" list, profit by vehicle, driver leaderboard |
| Daily targets | Operations, Finance | One row per vehicle per day. Record payments (Airtel Money, TNM Mpamba, cash, bank) with reference, mark rest days, request excuses (manager approves), close the day, shortfall streak alerts, ageing of unpaid shortfalls |
| Haulage jobs | Operations, Finance | Lorry jobs with auto-numbered digital waybills, status flow (quoted → in transit → delivered → invoiced → paid), printable waybill/invoice, client payments |
| Expenses | Operations, Finance | Per-vehicle or company-wide costs by category, filters, totals |
| Fleet | Operations (Finance view) | Vehicle register, earning mode (daily target / per job / both), monthly P&L and target hit per vehicle, send to garage (pauses target) |
| Drivers | Operations (Finance view) | Driver register, vehicle assignment history, balance owed, payments and write-offs, score, phone-app login, starter fuel recorded as onboarding cost |
| Maintenance | Operations | Service schedules by km and/or days, work orders, garage costs booked to the vehicle |
| Compliance | Operations | COF, insurance, road licence, driving and PSV licences, with expiry countdown and renewals |
| Complaints | Operations | Board (new / in progress / resolved), public feedback form, printable QR codes for each bus |
| Payroll & HR | Finance prepares, Manager approves | Staff register, monthly runs with PAYE and pension, bonuses, shortfall deductions for drivers, printable payslips |
| Budgets & targets | Finance, Manager | Monthly income target and spending budget by category, against actuals with pacing |
| Reports | Finance, Manager | P&L, vehicle P&L, driver performance, 6-month trend, CSV exports |
| Settings | Manager | Users and roles, PAYE bands, pension rates, starter fuel litres, rest-day and alert rules, driver payment instructions, activity log |
| Driver app (`/me`) | Drivers | Today's target and status, how to pay, balance owed, score and rank, recent days, payslips, report breakdown (can request excuse) |
| Feedback (`/report`) | Public | Passengers report or compliment a trip, no login |

### Rules built in
- **Vehicle in the garage** → its daily row is excused automatically; no shortfall.
- **Excused days** need a reason; Operations/Finance requests go to the manager to approve.
- **Paying above target** reduces the driver's old balance. Payroll deductions are booked against the balance when the manager approves payroll.
- **Driver score (out of 100)**: target compliance 60, complaints 25 (−10 high, −5 medium, −2 low), valid licences 15. Grades A 85+, B 70+, C 55+, D below.
- **PAYE**: progressive monthly bands from Settings; employee pension is deducted before PAYE. Defaults follow the bands reported effective 1 January 2026 (0% to K170,000; 30% to K1,570,000; 35% to K10,000,000; 40% above) with 5% / 10% pension. **Confirm with MRA and your accountant before the first payroll.**

## Deploy (recommended: one VPS with Docker)

Works on any Ubuntu VPS with 2 GB RAM (DigitalOcean, Hetzner, Contabo, Afrihost…).

1. **DNS**: add an `A` record `transport.royalhorizonmw.com` → your server's IP.
2. **Server**: install Docker, then copy this folder to the server.
3. **Settings**:
   ```bash
   cp .env.example .env
   # set POSTGRES_PASSWORD, SESSION_SECRET (openssl rand -base64 48), APP_URL
   ```
4. **Start**:
   ```bash
   docker compose up -d --build
   ```
   Migrations run automatically on every start.
5. **First manager login**:
   ```bash
   docker compose exec -e ADMIN_EMAIL=you@royalhorizonmw.com -e ADMIN_PASSWORD='a-long-password' -e ADMIN_NAME='Your Name' app node scripts/create-manager.mjs
   ```
6. **HTTPS** with Caddy (simplest):
   ```
   # /etc/caddy/Caddyfile
   transport.royalhorizonmw.com {
     reverse_proxy 127.0.0.1:3000
   }
   ```
7. Sign in, then: **Settings** (PAYE, payment instructions, users) → **Fleet** → **Drivers** → **Compliance** documents → **Payroll & HR** staff → **Budgets**.

### Backups (do this on day one)
```bash
# daily at 02:00, keep 30 days
0 2 * * * docker compose -f /path/docker-compose.yml exec -T db pg_dump -U royallink royallink | gzip > /backups/royallink-$(date +\%F).sql.gz && find /backups -mtime +30 -delete
```
Copy backups off the server too (e.g. to Google Drive with rclone).

## Alternative: Vercel + managed Postgres
1. Create a Postgres database on Neon or Supabase; copy its connection string.
2. Import the repo into Vercel; set `DATABASE_URL`, `DATABASE_SSL=true`, `SESSION_SECRET`, `APP_URL`.
3. Locally: `DATABASE_URL=... DATABASE_SSL=true npm run db:migrate` and `npm run create-manager` (with the ADMIN_* variables).
4. In Vercel, add the domain `transport.royalhorizonmw.com` and follow its DNS instructions.

## Local development
```bash
npm install
cp .env.example .env        # point DATABASE_URL at a local Postgres
npm run db:migrate
npm run demo                # optional sample data; logins below
npm run dev
```
Demo logins (password `royallink123`): `manager@demo.royallink`, `ops@demo.royallink`, `finance@demo.royallink`, `driver@demo.royallink`. **Never load demo data into the live database.**

Changing the database: edit `src/db/schema.ts`, run `npm run db:generate`, commit the new file in `drizzle/`, deploy.

## Project layout
```
src/app/(app)/      staff pages (dashboard, ledger, jobs, expenses, vehicles, drivers, maintenance,
                    compliance, complaints, payroll, budgets, reports, settings)
src/app/me/         driver phone portal
src/app/report/     public feedback form (QR codes point here)
src/app/login/      sign in
src/db/schema.ts    database tables
src/lib/calc.ts     business rules: balances, P&L, scores, PAYE, maintenance due dates
src/lib/settings.ts defaults for PAYE, pension, rules
scripts/            migrate, create-manager, demo data
```

## Security notes
- Passwords are hashed with bcrypt; sessions are signed, httpOnly cookies (7 days).
- Every page and action checks the user's role on the server.
- All changes to money, approvals and users are written to the activity log (Settings).
- Keep `SESSION_SECRET` private; changing it signs everyone out.
