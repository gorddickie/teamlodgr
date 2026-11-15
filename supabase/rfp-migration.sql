-- RFP / Bidding System Tables
-- Run this in the Supabase SQL editor

create table rfps (
  id uuid primary key default gen_random_uuid(),
  organizer_email text not null,
  organizer_name text,
  event_name text not null,
  check_in date not null,
  check_out date not null,
  rooms_needed int not null,
  notes text,
  status text default 'open',
  created_at timestamptz default now()
);

create table rfp_hotels (
  id uuid primary key default gen_random_uuid(),
  rfp_id uuid references rfps(id),
  hotel_name text not null,
  hotel_email text not null,
  token text unique default encode(gen_random_bytes(16), 'hex'),
  bid_status text default 'pending',
  created_at timestamptz default now()
);

create table rfp_bids (
  id uuid primary key default gen_random_uuid(),
  rfp_hotel_id uuid references rfp_hotels(id),
  nightly_rate numeric,
  total_estimate numeric,
  cutoff_date date,
  perks text,
  notes text,
  created_at timestamptz default now()
);

create table rfp_messages (
  id uuid primary key default gen_random_uuid(),
  rfp_hotel_id uuid references rfp_hotels(id),
  sender text not null,
  message text not null,
  created_at timestamptz default now()
);
