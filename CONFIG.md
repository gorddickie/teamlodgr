# TeamLodgr — Config & Accounts Reference

## Project Overview
Group hotel booking platform for sports teams.
- **Live site:** https://teamlodgr.com
- **Repo:** github.com/gorddickie/teamlodgr
- **Hosting:** Vercel (auto-deploys from GitHub main branch)
- **Local repo:** `/Users/gorddickie/.openclaw/workspace/teamlodgr/`

---

## Stack

| Layer | Service |
|-------|---------|
| Frontend | Vanilla HTML/CSS/JS |
| Serverless functions | Vercel (`/api/*.js`) |
| Database | Supabase |
| Email | Resend |
| Hotel data | RapidAPI (Booking.com, Priceline, Agoda wrappers) |

---

## Accounts

### Vercel
- Site: teamlodgr.com
- Deploys from: github.com/gorddickie/teamlodgr (main branch)

### Supabase
- Used for: booking tokens, team member tracking
- Client: `supabase.js`

### Resend
- Used for: sending invite emails to team members
- Function: `api/notify.js`

### RapidAPI
- Used for: hotel search data
- APIs: Booking.com, Priceline, Agoda wrappers
- Search logic: `search.js`

---

## Affiliate Program (CJ)

- **CJ Publisher ID:** 101756333
- **CJ Account:** ACTIVE ✅

### Approved Programs

| Program | Status | Affiliate Link Base |
|---------|--------|---------------------|
| Hotels.com CA | ✅ APPROVED | `tkqlhce.com/click-101756333-15042853` |
| Hotels.com US | ✅ APPROVED | `anrdoezrs.net/click-101756333-15042852` |
| Expedia Canada | ✅ APPROVED | `dpbolvw.net/click-101756333-13859169` |
| Expedia USA | ✅ APPROVED | `kqzyfj.com/click-101756333-15042831` |
| Booking.com via CJ | ⏳ Apply June 1, 2026 | TBD |

### CA/US Detection
- Live in `book.html` — detects Canada vs USA based on province/city name match
- CA links used for Canadian bookings, US links for American bookings

---

## Key Files

| File | Purpose |
|------|---------|
| `index.html` | Main search page |
| `search.js` | Hotel search logic (RapidAPI) |
| `share.html` | Organizer share page — team members see "Book Your Room" buttons |
| `book.html` | Team member booking page (`?token=X&email=Y`) |
| `api/notify.js` | Vercel function — sends Resend emails to team members |
| `supabase.js` | Supabase client |
| `PRODUCT.md` | User types, flows, affiliate notes |
| `CONFIG.md` | This file |

---

## User Flows

**Organizer:**
1. Search hotels on teamlodgr.com
2. Pick a hotel
3. Send invite link/email to team members

**Team Member:**
1. Receives email with unique link (`?token=X&email=Y`)
2. Lands on `book.html`
3. Sees "Book Your Room" buttons (per provider)
4. Books 1 room via chosen provider (affiliate link)

Typical group size: ~15 rooms, can span multiple providers.

---

## TODO / Next Up

- [ ] Build "I've Booked ✅" button on `book.html`
- [ ] Build `/api/booked.js` to notify other team members when someone books
- [ ] Apply to Booking.com on CJ (opens June 1, 2026)
- [ ] Transition hotel data from RapidAPI to direct APIs once Booking.com affiliate approved
