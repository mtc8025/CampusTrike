# CampusTrike — AFUSTA campus mobility

CampusTrike is a browser-based campus tricycle booking and operations platform for Abdullahi Fodio University of Science and Technology, Aliero.

## Stack
- Frontend: responsive HTML, CSS and JavaScript (Premium Glassmorphism design system)
- API: Node.js + Express + TypeScript
- Database: Supabase PostgreSQL
- Hosting: Vercel (static frontend + Node.js API function)

## Design
- Solid brand colours only (no UI gradients)
- Translucent glass panels with backdrop blur
- Fully responsive with dedicated mobile bottom navigation
- Dark / light theme support

## Main workflows
- **Students**: register/sign in, create and cancel pending bookings, filter/search history, rate completed trips.
- **Drivers**: register for approval, accept requests, progress trips, report cash, register vehicle details.
- **Administrators**: approve/reject/suspend drivers, view operations overview, confirm payments, update fare settings.

## Pages
- Home — hero & live service summary
- Book — ride request form with fare estimate
- My Trips — role-based workspace, stats, filters, actions
- Profile — account details, name update, vehicle form (drivers)
- About — service overview & help

## Quick start
1. Install dependencies from the repository root: `npm install`.
2. Copy `server/.env.example` to `server/.env` and set a PostgreSQL `DATABASE_URL` and strong `JWT_SECRET`.
3. Run `npm run db:migrate` from the root to apply the SQL schema.
4. Run the API locally with `npm run dev:api`.
5. Serve the repository root with a local static server and open the frontend. The browser uses `/api` by default.

## Vercel + Supabase deployment
Follow [DEPLOYMENT_VERCEL_SUPABASE.md](DEPLOYMENT_VERCEL_SUPABASE.md). Required environment variables: `DATABASE_URL`, `JWT_SECRET`, `NODE_ENV=production`.

## Important
This repository is an integration-ready build, not a deployed service. Campus locations and the ₦300 base fare are placeholders pending formal AFUSTA approval. Do not use real student data until the institution approves the service and remaining security, privacy and operational checks are complete.
