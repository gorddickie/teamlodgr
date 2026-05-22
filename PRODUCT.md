# TeamLodgr — Product Reference

## What It Does
Group hotel booking for sports teams. A Organizer searches for hotels, picks the best option, and shares a link. Each Team Member books their own room through their preferred booking site — dates and hotel are pre-filled.

## User Types

### 🧑‍💼 Organizer
- Searches for hotels by city, dates, and number of rooms needed
- Picks the best hotel from the results
- Sends invite links to team members via email
- Monitors how many team members have booked
- Receives reply emails from team members
- Identified by `organizer_email` — no account required

### 👤 Team Member
- Receives an email invite link from the Organizer
- Lands on TeamLodgr share page — sees the hotel, dates, and booking options
- Clicks through to book their own 1 room on their preferred provider (Booking.com, Hotels.com, etc.) with dates pre-filled
- Clicks "I've Booked" to mark themselves as booked and notify other team members
- Identified by `email` param in their invite link — no login needed

## Typical Group Size
~15 rooms per booking (may come from multiple providers)

## Key Flows
1. **Search** → Manager enters city, dates, rooms needed → sees top hotels with availability confirmed across providers
2. **Share** → Manager picks a hotel → enters team emails → members get an email with a TeamLodgr link
3. **Book** → Team member lands on share page → clicks "Book 1 Room" on their preferred provider → books directly
4. **Notify** → Team member clicks "I've Booked" → other team members get a notification with updated count

## Data Model (Supabase)
- `bookings` — one per hotel selection (hotel, dates, rooms needed, organizer info, share token)
- `team_members` — one per invited player (booking_id, email, notified_at, booked_at)

## Tech Stack
- Frontend: Vanilla HTML/CSS/JS — hosted on Vercel via GitHub (teamlodgr.com)
- Backend: Vercel serverless functions (`/api/`)
- Database: Supabase (Postgres)
- Email: Resend API
- Hotel Data: RapidAPI (Booking.com, Priceline, Agoda wrappers) — transitioning to direct APIs
- Affiliate: CJ (Commission Junction) — Booking.com program opens June 1, 2026; Hotels.com + Expedia Canada applied

## Affiliate Notes
- Booking.com via CJ: opens June 1, 2026
- Hotels.com (1702763): applied May 21, 2026
- Expedia Canada (5261370): applied May 21, 2026
- Each provider deeplink uses `rooms=1` for individual team member booking
