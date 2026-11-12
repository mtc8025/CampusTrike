# CampusTrike project status

## Design
- Matches report screenshots: left sidebar (Driver Hub / Trike Rides / Admin), clean white cards, green accents
- Public homepage with hero + Book / Become a Driver
- Profile layout similar to Figure 4.7

## Features
### Student
- **Quick request** — any online driver can accept
- **Choose driver** — select from available (online) drivers + optional date & time
- Cancel pending, track status, filter/search, rate completed trips
- In-app notifications

### Driver
- **Go Online / Go Offline** toggle in sidebar
- New ride requests with Accept / Decline style actions
- Progress trips, report cash, vehicle registration
- Notifications for directed and open requests

### Admin
- Driver approvals, fare settings, richer stats, recent activity with ratings

### Account
- Profile, settings, change password, notifications panel

## Schema additions
- users.is_online
- bookings.preferred_driver_id, bookings.scheduled_at
- vehicles, ratings, notifications (from earlier)

## API additions
- PATCH /api/me/online
- GET /api/drivers/available
- Booking create accepts preferredDriverId + scheduledAt
- Notifications created on booking / status changes

## Outstanding
- Connect real Supabase + Vercel
- Enforce preferred-driver-only accept (optional strict mode)
- GPS, push/SMS, formal student ID
- AFUSTA confirmation of locations and pricing
