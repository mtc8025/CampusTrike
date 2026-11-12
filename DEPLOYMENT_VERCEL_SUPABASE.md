# CampusTrike deployment: Vercel + Supabase

## Current implementation state
- The browser client now calls `/api` and uses server-issued JWT sessions held in `sessionStorage`.
- Express routes are exposed through the Vercel Node.js function at `api/index.ts`.
- PostgreSQL schema and seed data are in `server/sql/001_init.sql`.
- Driver approval, student cancellation, booking acceptance, trip progression, cash-payment reporting, admin overview and fare update routes are included.
- The UI no longer writes bookings or fares to browser `localStorage`.

This is an integration-ready source build, not a deployed service. It has not been connected to an actual Supabase project or tested against live credentials.

## 1. Create the Supabase database
1. Create a Supabase project in your own account.
2. Open **SQL Editor** and run `server/sql/001_init.sql` once.
3. Confirm that `users`, `vehicles`, `locations`, `fare_settings`, `bookings`, `payment_records` and `audit_logs` exist.
4. The initial locations and ₦300 base fare are illustrative placeholders. Replace them with values formally approved by AFUSTA before launch.
5. Copy the PostgreSQL connection string from **Project Settings → Database → Connection string**. Use the Session Pooler if direct IPv6 connectivity is unavailable. Keep the password private.

## 2. Deploy to Vercel
1. Push this project to a private GitHub repository, or import the project folder into Vercel.
2. Set the Vercel project root to the repository root (the folder containing `index.html`, `app.js`, `api/`, and `vercel.json`).
3. Add these server-side environment variables in Vercel Project Settings → Environment Variables:
   - `DATABASE_URL` — Supabase PostgreSQL connection string
   - `JWT_SECRET` — a unique random secret of at least 32 characters
   - `NODE_ENV` — `production`
4. Do not prefix either secret with `VITE_` or expose it to browser JavaScript.
5. Deploy. Vercel should serve the static frontend and route `/api/*` to the Node function.
6. Test `https://YOUR-VERCEL-DOMAIN/api/health`. It should return `{ "status": "ok", "database": "connected" }` only after the database is configured.

## 3. Create the first administrator securely
Public registration intentionally allows only student and driver roles. Never add an admin option to the public sign-up form.

Generate a bcrypt hash for a strong one-time administrator password using the backend's `bcryptjs` dependency, then insert the account directly in the Supabase SQL Editor:

```sql
INSERT INTO users (full_name, email, password_hash, role, status)
VALUES ('CampusTrike System Administrator', 'admin@your-approved-domain.example', '$2a$12$REPLACE_WITH_BCRYPT_HASH', 'admin', 'active');
```

Use an approved institutional address and replace the example values. Do not put the plaintext password or hash in source control.

## 4. First acceptance tests
- Register a student, sign in, create a booking, sign out, and sign in again. The booking should remain in the database.
- Register a driver. An administrator should see it under Driver approvals and approve it before the driver can sign in.
- Sign in as the approved driver, accept a pending request, move it through arriving → in progress → completed, then report cash received.
- Sign in as admin and confirm the cash payment; change the fare and verify that the new fare appears for future bookings.
- Verify that one student cannot read another student's bookings and that a driver cannot accept the same booking after another driver has accepted it.

## Known limits before public launch
- No actual Supabase project or Vercel deployment has been provisioned from this workspace.
- Fare estimate currently uses the configured base fare only. Per-zone pricing is stored but route distance/zone calculation is not yet implemented.
- Vehicle registration/approval, GPS tracking, notifications, formal student identity checks, automated backups/monitoring and full automated tests remain outstanding.
- Confirm campus pickup points, fare policy, driver eligibility, data retention, privacy notice and operating responsibility with AFUSTA. Review compliance with the Nigeria Data Protection Act before collecting real student data.
- The current API uses a signed JWT in session storage. Complete a security review, add token revocation/refresh and operational monitoring before production use.
