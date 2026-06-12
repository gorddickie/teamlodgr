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
2. **Share** → Manager picks a hotel → enters their own email + team member emails on share.html
3. **Confirm** → Organizer receives a confirmation email → reviews hotel details → clicks "Confirm & Notify My Team"
4. **Book** → Team members receive invite emails → land on book.html with pre-filled hotel + dates → click "Book 1 Room" on preferred provider
5. **Notify** → Team member clicks "I've Booked" → other team members get a notification with updated count

### Confirmation Email Flow (step 2→3)
- On form submit, team member emails are saved to Supabase immediately
- A `confirm_token` is generated and stored on the `bookings` row
- Organizer gets an email: hotel photo, name, dates, room count, member count
- Email has a single CTA: **"Confirm & Notify My Team"**
- That button hits `/api/confirm?token=XXX`
- `/api/confirm` marks `confirmed_at`, fires `/api/notify` for all team members, redirects organizer to `confirmed.html`
- If the confirm link is clicked a second time, organizer lands on `confirmed.html?alreadySent=1` — no duplicate emails sent

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


## Provider Deep-Link Notes
- **Booking.com** — uses `searchresults.html?ss=hotel+name+city` — shows filtered search (1 result usually). No direct hotel ID without Booking.com affiliate API access.
- **Hotels.com** — CJ affiliate wrapped, `search.do` format with dates
- **Expedia** — CJ affiliate wrapped, CA vs US detection, `Hotel-Search` format
- **Agoda** — uses `textToSearch` + `los` (length of stay) format; `checkOut` param not supported externally
- **Priceline** — path-based format `/relax/in/HOTEL+CITY/from/YYYYMMDD/to/YYYYMMDD/rooms/1`

## Database
- Table: `bookings` (was `group_bookings` in old migrations — all API code now uses `bookings`)
- Table: `team_members` — FK references `bookings.id`
- Key columns added Jun 11, 2026: `confirm_token`, `confirmed_at`, `organizer_name`, `organizer_email`, `tournament_name`, `hotel_photo`

## Next Steps (as of June 11, 2026)
- [ ] Add hotel name warning above Booking.com button on book.html (wrong-hotel risk)
- [ ] Build "I've Booked ✅" button on book.html + /api/booked.js
- [ ] Apply to **Booking.com** on CJ (program opened June 1, 2026)
- [ ] Sign up for **Rakuten Advertising** — needed for Marriott + Hilton affiliate links
- [ ] Apply to **Marriott** + **Hilton** on Rakuten
- [ ] Register **TeamLodgr** trade name under Arlington Development Group (NS Registry ~\$120 CAD)
- [ ] Apply for **IATAN accreditation** under Arlington Development Group (\ $280 USD) once trade name registered
