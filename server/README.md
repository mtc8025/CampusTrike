# CampusTrike API

This is a real API foundation backed by PostgreSQL. It is not live until you configure a PostgreSQL database, set secrets, run migrations and deploy it.

## Setup
1. Install Node.js 20+ and PostgreSQL 15+.
2. `cd server && npm install`
3. Copy `.env.example` to `.env` and set `DATABASE_URL`, a long random `JWT_SECRET`, and the allowed frontend origin.
4. Create the database and database user; do not use a superuser in production.
5. `npm run db:migrate`
6. `npm run dev`
7. Check `GET http://localhost:4000/api/health`.

## API
- `POST /api/auth/register` (student or driver; drivers require admin approval)
- `POST /api/auth/login`
- `GET /api/me`
- `GET /api/locations`
- `GET /api/fares`
- `POST /api/bookings` (student)
- `GET /api/bookings` (role-filtered)
- `PATCH /api/bookings/:id/accept` (driver)
- `PATCH /api/bookings/:id/status` (assigned driver or admin)
- `PATCH /api/bookings/:id/payment` (driver/admin cash status)
- `GET /api/admin/overview` (admin)
- `PATCH /api/admin/fares` (admin)

## Important production work still required
- Bootstrap the first administrator securely (do not expose public admin registration).
- Add driver approval and vehicle-management endpoints/UI.
- Add automated integration tests, CSRF/session strategy if using cookies, email/password reset, audit logging coverage and operational monitoring.
- Review CORS, TLS, secrets, database backups, privacy notice, retention and Nigerian data-protection obligations before deployment.
- Connect the existing frontend to these API endpoints; the current `index.html` remains a browser-only prototype and must not be represented as connected to this API.

Never put `.env` or production credentials in Git.
