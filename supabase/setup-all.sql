-- Mar Latrice Styles: the whole booking setup in one file.
-- Make a NEW Supabase project for her (never share Kenya's: each owner's login must only reach her own data).
-- Then paste this whole file into Supabase > SQL Editor > New query, with nothing highlighted, and Run.
-- Safe to run again. It copies in her current menu (33 services), 10 policies, 7 photos and a few FAQ answers.
--
-- Her panel login is built from her texting number: p + 10 digits + @mariahhairpage.vercel.app.
-- Change the number on the owners line below if she will sign in with a different one.
-- Text that shows on her site may not contain < > " ` or backslashes. The site strips them too.

-- 1. Who may change things
create table if not exists public.owners (email text primary key check (email = lower(email)));
alter table public.owners enable row level security;
revoke all on public.owners from anon, authenticated;
create or replace function public.is_owner()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.owners where email = lower(coalesce(auth.jwt() ->> 'email', '')));
$$;
revoke all on function public.is_owner() from public;
grant execute on function public.is_owner() to anon, authenticated;
insert into public.owners (email) values ('p4149358785@mariahhairpage.vercel.app') on conflict do nothing;

-- 2. Her open times
create table if not exists public.availability (
  id          uuid primary key default gen_random_uuid(),
  date        date not null,
  start_time  time not null,
  end_time    time not null,
  status      text not null default 'open' check (status in ('open', 'booked', 'closed')),
  note        text check (char_length(note) <= 200),
  created_at  timestamptz not null default now(),
  constraint availability_end_after_start check (end_time > start_time),
  constraint availability_one_per_start unique (date, start_time)
);
create index if not exists availability_date_idx on public.availability (date);

-- 3. The menu: categories, then services inside them. Add-ons sit in a category marked addon.
create table if not exists public.service_categories (
  id          text primary key check (id ~ '^[a-z0-9-]{2,24}$'),
  name        text not null check (char_length(name) between 1 and 40 and name !~ '[<>"`\\]'),
  note        text not null default '' check (char_length(note) <= 120 and note !~ '[<>"`\\]'),
  addon       boolean not null default false,
  hidden      boolean not null default false,
  sort        integer not null default 0,
  updated_at  timestamptz not null default now()
);
create table if not exists public.services (
  id           uuid primary key default gen_random_uuid(),
  slug         text not null unique check (slug ~ '^[a-z0-9-]{2,60}$'),
  category_id  text not null references public.service_categories (id),
  name         text not null check (char_length(name) between 1 and 60 and name !~ '[<>"`\\]'),
  price        integer not null check (price between 0 and 3000),
  plus         boolean not null default false,
  deposit      integer check (deposit between 0 and 500),
  duration     text not null check (char_length(duration) between 1 and 30 and duration !~ '[<>"`\\]'),
  minutes      integer not null check (minutes between 0 and 1440),
  description  text not null default '' check (char_length(description) <= 1500 and description !~ '[<>"`\\]'),
  hidden       boolean not null default false,
  sort         integer not null default 0,
  updated_at   timestamptz not null default now()
);
create index if not exists services_cat_idx on public.services (category_id, sort);

-- 4. Gallery: her own photo files (builtin:work-01) or ones she uploads (uploads/<id>)
create table if not exists public.gallery_photos (
  id          uuid primary key default gen_random_uuid(),
  src         text not null unique check (src ~ '^(builtin:[a-z0-9-]+|uploads/[a-f0-9-]+)$'),
  caption     text not null default '' check (char_length(caption) <= 80 and caption !~ '[<>"`\\]'),
  posted      text not null default '' check (char_length(posted) <= 20 and posted !~ '[<>"`\\]'),
  link        text check (link is null or link ~ '^https://(www\.)?instagram\.com/[A-Za-z0-9_./-]{1,120}$'),
  width       integer,
  height      integer,
  hidden      boolean not null default false,
  sort        integer not null default 0,
  created_at  timestamptz not null default now()
);

-- 5. Policies, FAQ and reviews
create table if not exists public.site_policies (
  id          uuid primary key default gen_random_uuid(),
  big         text not null check (char_length(big) between 1 and 14 and big !~ '[<>"`\\]'),
  title       text not null check (char_length(title) between 1 and 40 and title !~ '[<>"`\\]'),
  body        text not null check (char_length(body) between 1 and 700 and body !~ '[<>"`\\]'),
  hidden      boolean not null default false,
  sort        integer not null default 0,
  updated_at  timestamptz not null default now()
);
create table if not exists public.faq_items (
  id          uuid primary key default gen_random_uuid(),
  q           text not null check (char_length(q) between 1 and 120 and q !~ '[<>"`\\]'),
  a           text not null check (char_length(a) between 1 and 500 and a !~ '[<>"`\\]'),
  hidden      boolean not null default false,
  sort        integer not null default 0,
  updated_at  timestamptz not null default now()
);
create table if not exists public.reviews (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(name) between 1 and 40 and name !~ '[<>"`\\]'),
  body        text not null check (char_length(body) between 1 and 400 and body !~ '[<>"`\\]'),
  stars       smallint check (stars between 1 and 5),
  service     text not null default '' check (char_length(service) <= 40 and service !~ '[<>"`\\]'),
  source      text not null default '' check (source in ('', 'Text', 'Instagram', 'Facebook', 'Google', 'Square', 'In person')),
  hidden      boolean not null default false,
  sort        integer not null default 0,
  created_at  timestamptz not null default now()
);

-- 6. Row Level Security: anyone reads the public tables, only the owner writes
alter table public.availability enable row level security;
do $$
declare t text;
begin
  foreach t in array array['availability','service_categories','services','gallery_photos','site_policies','faq_items','reviews'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "Anyone can read" on public.%I', t);
    execute format('drop policy if exists "Owner can add" on public.%I', t);
    execute format('drop policy if exists "Owner can change" on public.%I', t);
    execute format('drop policy if exists "Owner can delete" on public.%I', t);
    execute format('create policy "Owner can add" on public.%I for insert to authenticated with check (public.is_owner())', t);
    execute format('create policy "Owner can change" on public.%I for update to authenticated using (public.is_owner()) with check (public.is_owner())', t);
    execute format('create policy "Owner can delete" on public.%I for delete to authenticated using (public.is_owner())', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    if t = 'reviews' then
      execute format('create policy "Anyone can read" on public.%I for select to anon, authenticated using (hidden = false or public.is_owner())', t);
    else
      execute format('create policy "Anyone can read" on public.%I for select to anon, authenticated using (true)', t);
    end if;
    if t = 'availability' then
      execute 'grant select (id, date, start_time, end_time, status) on public.availability to anon';
    else
      execute format('grant select on public.%I to anon', t);
    end if;
  end loop;
end $$;

-- 7. Photo storage: anyone views, only the owner adds or deletes. Photos are shrunk on her phone first.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('gallery', 'gallery', true, 5242880, array['image/webp','image/jpeg'])
on conflict (id) do update set public = true, file_size_limit = 5242880, allowed_mime_types = array['image/webp','image/jpeg'];
drop policy if exists "Owner can upload gallery photos" on storage.objects;
drop policy if exists "Owner can replace gallery photos" on storage.objects;
drop policy if exists "Owner can delete gallery photos" on storage.objects;
create policy "Owner can upload gallery photos" on storage.objects
  for insert to authenticated with check (bucket_id = 'gallery' and public.is_owner());
create policy "Owner can replace gallery photos" on storage.objects
  for update to authenticated using (bucket_id = 'gallery' and public.is_owner()) with check (bucket_id = 'gallery' and public.is_owner());
create policy "Owner can delete gallery photos" on storage.objects
  for delete to authenticated using (bucket_id = 'gallery' and public.is_owner());

-- 8. Booking requests. Visitors send them only through submit_booking_request(). Only she reads them.
create table if not exists public.booking_requests (
  id               uuid primary key default gen_random_uuid(),
  created_at       timestamptz not null default now(),
  status           text not null default 'new' check (status in ('new', 'confirmed', 'done', 'declined')),
  name             text not null check (char_length(name) between 1 and 60 and name !~ '[<>"`\\]'),
  phone            text not null check (phone ~ '^[0-9]{10}$'),
  style            text not null check (char_length(style) between 1 and 90 and style !~ '[<>"`\\]'),
  addons           text not null default '' check (char_length(addons) <= 200 and addons !~ '[<>"`\\]'),
  appt_date        date not null,
  appt_time        time not null,
  duration_min     integer not null check (duration_min between 15 and 1440),
  total            integer not null check (total between 0 and 5000),
  total_plus       boolean not null default false,
  deposit          integer check (deposit between 0 and 500),
  notes            text not null default '' check (char_length(notes) <= 400 and notes !~ '[<>"`\\]'),
  paid_said        boolean not null default false,
  sent_by          text not null default 'text' check (sent_by in ('text', 'deposit')),
  deposit_paid     boolean not null default false,
  deposit_paid_at  timestamptz,
  deposit_cents    integer,
  stripe_session   text,
  notified_at      timestamptz,
  updated_at       timestamptz not null default now()
);
create index if not exists booking_requests_created_idx on public.booking_requests (created_at desc);
create index if not exists booking_requests_phone_idx on public.booking_requests (phone, appt_date);
alter table public.booking_requests enable row level security;
drop policy if exists "Owner can read requests" on public.booking_requests;
drop policy if exists "Owner can change requests" on public.booking_requests;
drop policy if exists "Owner can delete requests" on public.booking_requests;
create policy "Owner can read requests" on public.booking_requests for select to authenticated using (public.is_owner());
create policy "Owner can change requests" on public.booking_requests for update to authenticated using (public.is_owner()) with check (public.is_owner());
create policy "Owner can delete requests" on public.booking_requests for delete to authenticated using (public.is_owner());
revoke all on public.booking_requests from anon, authenticated;
grant select, update, delete on public.booking_requests to authenticated;

-- 9. Visit counts: one number per day per kind. No names, no cookies.
create table if not exists public.visit_stats (
  day   date not null,
  kind  text not null check (kind in ('visit', 'booking', 'request')),
  n     integer not null default 0,
  primary key (day, kind)
);
alter table public.visit_stats enable row level security;
drop policy if exists "Owner can read stats" on public.visit_stats;
create policy "Owner can read stats" on public.visit_stats for select to authenticated using (public.is_owner());
revoke all on public.visit_stats from anon, authenticated;
grant select on public.visit_stats to authenticated;
create or replace function public.track_visit(p_kind text)
returns void language plpgsql volatile security definer set search_path = public as $$
begin
  if p_kind not in ('visit', 'booking') then return; end if;
  insert into visit_stats (day, kind, n) values ((now() at time zone 'America/Chicago')::date, p_kind, 1)
  on conflict (day, kind) do update set n = least(visit_stats.n + 1, 1000000);
end;
$$;
revoke all on function public.track_visit(text) from public;
grant execute on function public.track_visit(text) to anon, authenticated;

create or replace function public.submit_booking_request(
  p_name text, p_phone text, p_style text, p_addons text, p_date date, p_time time,
  p_duration_min integer, p_total integer, p_total_plus boolean, p_deposit integer, p_notes text,
  p_paid_said boolean, p_sent_by text, p_website text default ''
)
returns uuid language plpgsql volatile security definer set search_path = public as $$
declare
  v_phone text := regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g');
  v_today date := (now() at time zone 'America/Chicago')::date;
  v_id uuid;
begin
  if coalesce(p_website, '') <> '' then return null; end if;
  if char_length(v_phone) = 11 and left(v_phone, 1) = '1' then v_phone := substr(v_phone, 2); end if;
  if char_length(v_phone) <> 10 then raise exception 'bad phone' using errcode = '22023'; end if;
  if p_date is null or p_time is null or p_date < v_today or p_date > v_today + 120 then
    raise exception 'bad date' using errcode = '22023';
  end if;
  if not exists (select 1 from availability where date = p_date and start_time = p_time and status = 'open') then
    raise exception 'time not open' using errcode = 'P0001';
  end if;
  select id into v_id from booking_requests
   where phone = v_phone and appt_date = p_date and appt_time = p_time and created_at > now() - interval '2 days';
  if v_id is not null then
    if p_paid_said then update booking_requests set paid_said = true where id = v_id; end if;
    return v_id;
  end if;
  if (select count(*) from booking_requests where phone = v_phone and created_at > now() - interval '1 day') >= 4
     or (select count(*) from booking_requests where created_at > now() - interval '1 hour') >= 40 then
    raise exception 'too many requests' using errcode = 'P0001';
  end if;
  delete from booking_requests where appt_date < v_today - 90; -- client details don't pile up
  insert into booking_requests (name, phone, style, addons, appt_date, appt_time, duration_min, total, total_plus, deposit, notes, paid_said, sent_by)
  values (trim(p_name), v_phone, trim(p_style), trim(coalesce(p_addons, '')), p_date, p_time, p_duration_min, p_total,
          coalesce(p_total_plus, false), p_deposit, trim(coalesce(p_notes, '')), coalesce(p_paid_said, false), coalesce(p_sent_by, 'text'))
  returning id into v_id;
  insert into visit_stats (day, kind, n) values (v_today, 'request', 1) on conflict (day, kind) do update set n = visit_stats.n + 1;
  return v_id;
end;
$$;
revoke all on function public.submit_booking_request(text, text, text, text, date, time, integer, integer, boolean, integer, text, boolean, text, text) from public;
grant execute on function public.submit_booking_request(text, text, text, text, date, time, integer, integer, boolean, integer, text, boolean, text, text) to anon, authenticated;

-- 10. Request alerts: the phones she turned alerts on for
create table if not exists public.push_subscriptions (
  id          uuid primary key default gen_random_uuid(),
  endpoint    text not null unique check (endpoint ~ '^https://' and char_length(endpoint) <= 1000),
  p256dh      text not null check (char_length(p256dh) between 60 and 120),
  auth        text not null check (char_length(auth) between 16 and 40),
  created_at  timestamptz not null default now()
);
alter table public.push_subscriptions enable row level security;
drop policy if exists "Owner can read alerts" on public.push_subscriptions;
drop policy if exists "Owner can add alerts" on public.push_subscriptions;
drop policy if exists "Owner can remove alerts" on public.push_subscriptions;
create policy "Owner can read alerts" on public.push_subscriptions for select to authenticated using (public.is_owner());
create policy "Owner can add alerts" on public.push_subscriptions for insert to authenticated with check (public.is_owner());
create policy "Owner can remove alerts" on public.push_subscriptions for delete to authenticated using (public.is_owner());
revoke all on public.push_subscriptions from anon, authenticated;
grant select, insert, delete on public.push_subscriptions to authenticated;

-- 11. Copy in what her site shows today (each block skipped if anything is already there)
insert into public.service_categories (id, name, note, addon, sort) values
  ('new', 'New Clients + Consultation', 'First time in the chair? Start here.', false, 10),
  ('healthy', 'Healthy Hair Collection', 'Silk presses, wash days and natural styling.', false, 20),
  ('weave', 'Quick Weaves', 'Hair is not included.', false, 30),
  ('pony', 'Ponytails', 'Extension hair is not included.', false, 40),
  ('braids', 'Braids', 'Starting prices include mid-back length.', false, 50),
  ('color', 'Color Experience', 'Established clients only. Finished style books separately.', false, 60),
  ('addons', 'Add-Ons', 'Please read for all appointments. Add-ons attach to an eligible service.', true, 70)
on conflict (id) do nothing;

insert into public.services (slug, category_id, name, price, plus, deposit, duration, minutes, description, sort)
select * from (values
  ('new-client-healthy-hair-experience', 'new', 'New Client Healthy Hair Experience', 85, false, 25, '1 hr 30 min', 90, 'First time at Mar Latrice Styles? Start here. This service introduces me to your hair, your routine, your concerns and your healthy-hair goals.

Includes an in-person hair and scalp assessment, consultation, shampoo, conditioning treatment, trim and blow dry. We go through your hair history, current concerns and home-care routine.

**Styling is not included.** A styling service books separately.', 10),
  ('in-person-hair-consultation', 'new', 'In-Person Hair Consultation', 20, false, 20, '30 min', 30, 'Not sure what to book? Come in for a professional assessment of your hair and scalp. We cover your hair history, current concerns, goals, maintenance routine and which services fit.

This appointment does not include shampoo, treatment or styling.

**Color consultations follow a separate process, and color services are for established clients only.**', 20),
  ('signature-silk-press', 'healthy', 'Signature Silk Press', 85, false, 20, '1 hr 30 min', 90, 'The Mar Latrice signature. A healthy-hair focused silk press that leaves your hair clean, smooth, bouncy and full of movement.

Includes shampoo, conditioning, blow dry, silk press and trim. Trims up to 1 inch are included. More than 1 inch counts as a haircut and adds $15+.

Extra long or dense hair may need extra time and an applicable add-on.', 10),
  ('luxe-silk-press', 'healthy', 'Luxe Silk Press', 110, false, 20, '2 hr 15 min', 135, 'Your Signature Silk Press with extra care for hair that needs hydration, restoration and more attention.

Includes shampoo, a customized deep-conditioning or hydration treatment, scalp care, blow dry, silk press and trim. The treatment is chosen based on the condition of your hair that day.

Trims up to 1 inch are included. More than 1 inch adds $15+.', 20),
  ('silk-press-maintenance', 'healthy', 'Silk Press Maintenance', 65, false, 20, '1 hr', 60, 'Refreshes and extends a Mar Latrice Styles silk press. Includes shampoo, conditioning, blow dry and restyling, with a trim when needed.

For established clients maintaining a recent silk press. It does not replace the Signature Silk Press when your hair needs the full service.', 30),
  ('wash-blow-dry', 'healthy', 'Wash + Blow Dry', 50, false, 20, '1 hr', 60, 'Sometimes your hair needs a reset. Includes a thorough shampoo, conditioning, detangling and blow dry.

**No finished style is included.**', 40),
  ('just-a-style', 'healthy', 'Just a Style!', 45, false, 20, '1 hr', 60, 'Already washed and only need the finish? Choose a flat-iron finish or curls on clean, dry, previously blow-dried hair.

**Shampoo, conditioning and blow dry are not included.** Hair that needs cleansing or heavy detangling changes to the right service, depending on availability.', 50),
  ('refresh-reset', 'healthy', 'Refresh + Reset', 65, true, 20, '3 hr', 180, 'Let me handle the part nobody wants to do. Professional takedown of your protective style, followed by detangling, shampoo, conditioning and blow dry.

Pricing starts at $65 and depends on the style being removed, length, buildup, matting and takedown time. **Finished styling is not included.**', 60),
  ('natural-style', 'healthy', 'Natural Style', 75, true, 20, '3 hr', 180, 'A wash-and-style appointment for clients wearing their natural texture: two-strand twists, flat twists, braid styles and similar looks.

Pricing and timing depend on length, density and the style you pick, so include your desired style when booking. **Added hair is not included.**', 70),
  ('classic-quick-weave', 'weave', 'Classic Quick Weave', 100, false, 20, '2 hr 30 min', 150, 'A traditional quick weave customized to the look you want. Includes shampoo, conditioning, blow dry, braid down, protective molding, installation, cut and finished style.

**Hair is not included.**', 10),
  ('flip-over-quick-weave', 'weave', 'Flip-Over Quick Weave', 115, false, 20, '3 hr', 180, 'A versatile, natural-looking quick weave built for flexible parting and easy volume. Includes shampoo, conditioning, blow dry, braid down, protective molding, installation, blending, cut and finished style.

**Hair is not included.**', 20),
  ('half-up-half-down-quick-weave', 'weave', 'Half Up/Half Down Quick Weave', 125, false, 20, '3 hr', 180, 'A polished half-up, half-down install pairing a sleek upper style with a full quick weave in the back. Includes shampoo, conditioning, blow dry, braid down, protective molding, installation and finished style.

**Hair is not included.**', 30),
  ('quick-weave-w-natural-hair-braids', 'weave', 'Quick Weave w/ Natural Hair Braids', 125, true, 20, '3 hr 30 min', 210, 'A quick weave paired with braids in your natural hair. Includes the wash, braid down, install and finished style.

**Hair is not included.** Final pricing depends on braid work and time.', 40),
  ('sleek-ponytail', 'pony', 'Sleek Ponytail', 100, false, 20, '2 hr 15 min', 135, 'A sleek, polished ponytail at the placement you want: high, mid or low. Includes shampoo, conditioning, blow dry, molding, ponytail installation and finished style.

**Extension hair is not included.**', 10),
  ('ponytail-w-bang-s', 'pony', 'Ponytail w/ Bang(s)', 110, false, null, '2 hr 30 min', 150, 'A sleek ponytail paired with a customized bang. Includes shampoo, conditioning, blow dry, molding, ponytail installation, bang customization and finished style.

**Extension hair is not included.**', 20),
  ('jumbo-knotless', 'braids', 'Jumbo Knotless', 125, true, 25, '4 hr', 240, 'A bold knotless install with larger sections for a lightweight, polished protective style.

Starting price includes **mid-back length**. Longer lengths and specialty finishes cost more.', 10),
  ('large-knotless', 'braids', 'Large Knotless', 200, true, 25, '5 hr', 300, 'A full knotless install with large sections for a clean, lightweight style.

Starting price includes **mid-back length**. Longer lengths and specialty finishes cost more.', 20),
  ('medium-knotless', 'braids', 'Medium Knotless', 275, true, 25, '6 hr 30 min', 390, 'A full medium knotless install that balances fullness, versatility and longevity.

Starting price includes **mid-back length**. Longer lengths and specialty finishes cost more.', 30),
  ('smedium-knotless', 'braids', 'Smedium Knotless', 325, true, null, '7 hr 30 min', 450, 'Smaller, more detailed sections than medium for added fullness and styling range.

Starting price includes **mid-back length**. Longer lengths and specialty finishes cost more.', 40),
  ('small-knotless', 'braids', 'Small Knotless', 375, true, 25, '8 hr 30 min', 510, 'The most detailed knotless install on the menu, with the smallest sections.

Starting price includes **mid-back length**. Longer lengths and specialty finishes cost more.', 50),
  ('root-retouch', 'color', 'Root Retouch', 35, true, 15, '1 hr', 60, 'Refreshes up to two inches of new growth to maintain an existing single-process color. Includes color application, processing, shampoo and conditioning treatment.

**For existing color maintenance only.** Major color changes or more than two inches of regrowth need a different color service. Finished style books separately.', 10),
  ('gloss-tone', 'color', 'Gloss + Tone', 60, true, 20, '30 min', 30, 'A color refresh that enhances tone, restores richness and shine, or refines previously colored hair. Good between larger color appointments.

Includes application, processing, shampoo and conditioning. Finished style books separately.', 20),
  ('single-process-color', 'color', 'Single Process Color', 75, true, 20, '1 hr 30 min', 90, 'An all-over color service that deepens, refreshes or enhances your color in one process. Includes customized formulation, application, processing, shampoo and deep conditioning treatment.

Pricing depends on length, density and product used. Finished style books separately.', 30),
  ('partial-highlights', 'color', 'Partial Highlights', 100, true, 20, '2 hr', 120, 'Placed highlights that add brightness, dimension and movement while keeping depth through the hair. Includes lightener, customized toner, shampoo and deep conditioning treatment.

Pricing depends on placement, density and product used. Finished style books separately.', 40),
  ('full-highlights', 'color', 'Full Highlights', 125, true, 20, '2 hr', 120, 'A full-head highlighting service that builds brightness and dimension throughout. Includes customized placement, lightener, toner, shampoo and deep conditioning treatment.

Additional product or corrective work raises the price. Finished style books separately.', 50),
  ('signature-blonding', 'color', 'Signature Blonding', 125, false, 20, '2 hr', 120, 'A customized lightening service for an all-over blonde or a significantly lighter result. Includes lightener application, customized toner, shampoo and deep conditioning treatment.

**The price reflects one lightening session.** More sessions may be needed to reach your result safely. Finished style books separately.', 60),
  ('color-correction-by-request-only', 'color', 'Color Correction (by request only)', 100, true, 20, '2 hr 30 min', 150, 'Corrective color for previously colored hair that needs major tonal adjustment, removal of unwanted color, evening out, banding fixes or other specialized work.

**The starting price is not a guaranteed total.** Final pricing and the service plan are set after consultation, based on hair history, condition, your goal and the processes required. More than one appointment may be needed.', 70),
  ('haircut-major-trim', 'addons', 'Haircut / Major Trim', 20, true, null, '30 min', 30, 'For hair that needs more than the maintenance trim included with select Healthy Hair services: extra shaping or removal beyond about one inch.

Signature and Luxe Silk Press already include your regular trim. This one is for “girl, these ends need to GO.”

**Must be added to an eligible service.**', 10),
  ('detailed-styling', 'addons', 'Detailed Styling', 20, false, null, '30 min', 30, 'For styling that needs more time than the standard finish included with your service: detailed curls, crimps and specialty finishing. Signature curls are already included in all complete hair services.', 20),
  ('long-dense-hair', 'addons', 'Long / Dense Hair', 15, false, null, '30 min', 30, 'Added when extra length or density needs significantly more product, detangling, drying or styling time.', 30),
  ('deep-conditioning-treatment', 'addons', 'Deep Conditioning Treatment', 20, false, null, '30 min', 30, 'A moisture-focused conditioning treatment customized to replenish hydration, softness and manageability.', 40),
  ('strengthening-treatment', 'addons', 'Strengthening Treatment', 25, false, null, '30 min', 30, 'A strengthening treatment for hair showing weakness, excessive shedding or breakage, chosen based on what your hair needs that day.

**Must be added to an eligible shampoo service.**', 50),
  ('scalp-detox-treatment', 'addons', 'Scalp Detox Treatment', 25, false, null, '30 min', 30, 'A targeted scalp treatment that removes excess buildup and creates a balanced foundation for healthy hair.

**Must be added to an eligible shampoo service.**', 60)
) as v(slug, category_id, name, price, plus, deposit, duration, minutes, description, sort)
where not exists (select 1 from public.services);

insert into public.gallery_photos (src, caption, posted, link, width, height, sort) values
  ('builtin:work-02', 'Natural with a pony', 'Feb 2, 2026', 'https://www.instagram.com/marlatricestyles/p/DUEErFoEbAu/', 800, 799, 10),
  ('builtin:work-03', 'Curls with blonde highlights', 'Feb 1, 2026', 'https://www.instagram.com/marlatricestyles/p/DUO0isUEYeX/', 800, 1067, 20),
  ('builtin:work-04', 'Voluminous layered blowout curls', 'Jan 28, 2026', 'https://www.instagram.com/marlatricestyles/p/DUEEoynEd-E/', 800, 1067, 30),
  ('builtin:work-05', 'Sleek and straight, back view', 'Jan 27, 2026', 'https://www.instagram.com/marlatricestyles/p/DUCJF-kkZEt/', 800, 795, 40),
  ('builtin:work-06', 'Side-swept with copper highlights', 'Jan 26, 2026', 'https://www.instagram.com/marlatricestyles/p/DT-7EIYkTQ8/', 800, 1067, 50),
  ('builtin:work-07', 'Long, straight and sleek', 'Jan 25, 2026', 'https://www.instagram.com/marlatricestyles/p/DT8WP7ckfwO/', 800, 1067, 60),
  ('builtin:work-01', 'Honey-blonde curled bob', 'May 10, 2024', 'https://www.instagram.com/marlatricestyles/p/C6y9_ezuuL5/', 800, 800, 70)
on conflict (src) do nothing;

insert into public.site_policies (big, title, body, sort)
select * from (values
  ('Online only', 'Booking', 'Book only through the booking site. No walk-ins unless advertised. For questions, text (414) 935-8785. Text only, no calls.', 10),
  ('Deposit first', 'Deposits + payment', 'Each service has its own non-refundable deposit, shown at booking. Your appointment is not secured until the deposit is paid and you receive a confirmation. The deposit applies to your final balance, and the remaining balance is due at the end of your appointment.', 20),
  ('48 hrs', 'Cancel or reschedule', 'Give at least 48 hours’ notice. Reschedule within the notice period and your deposit transfers one time. With less than 48 hours’ notice, the deposit is forfeited and a new deposit is needed.', 30),
  ('No-show', 'No-call / no-show', 'A no-call/no-show forfeits the deposit. Future bookings may require full prepayment, and repeated no-shows may lose booking privileges.', 40),
  ('10 min', 'Running late', 'There is a 10-minute grace period. After that, a $15 late fee applies, and your service may be modified or canceled if there isn’t enough time. Text if you’re running late.', 50),
  ('Arrive ready', 'Hair prep', 'Arrive with your natural hair fully detangled; free of braids, extensions, wigs or previous styles, unless a takedown is booked; and free of heavy oils, creams, gels, edge control and buildup. Extra detangling, matting or buildup may cost more or change the service. Need a takedown? Book Refresh + Reset.', 60),
  ('Limit guests', 'Guests + children', 'Children are welcome for eligible services at regular pricing. There is no separate kids’ pricing. Please limit guests; non-clients shouldn’t come unless approved.', 70),
  ('Starting at', 'Pricing', 'A + means a starting price. Your final price depends on length, density, product, prep, desired length, specialty hair, custom color, complexity and extra time.', 80),
  ('72 hrs', 'Service adjustments', 'Review your hair before you leave. Concerns about the original service need to come in within 72 hours. Not covered: preference changes, a different color or style, damage at home, improper maintenance, later heat or chemical services, or late reports.', 90),
  ('Text first', 'Squeeze-ins', 'Appointments outside online availability are at the stylist’s discretion and may carry a convenience fee. Text first.', 100)
) as v(big, title, body, sort)
where not exists (select 1 from public.site_policies);

insert into public.faq_items (q, a, sort)
select * from (values
  ('I’m new. What should I book?', 'Start with the New Client Healthy Hair Experience. It covers a hair and scalp assessment, consultation, shampoo, conditioning treatment, trim and blow dry. Styling books separately.', 10),
  ('Is hair included?', 'No. Hair is not included for quick weaves, ponytails or natural styles with added hair. Text (414) 935-8785 with questions about what to bring.', 20),
  ('Can I book color as a new client?', 'Color services are for established clients only. Color consultations follow a separate process.', 30),
  ('When is my appointment confirmed?', 'Once your deposit is paid and Mar Latrice texts you a confirmation. Sending a request alone does not hold the time.', 40),
  ('How can I pay?', 'Cash App, Apple Pay, Google Pay, Visa, Mastercard, American Express, Discover and JCB. The deposit applies to your total, and the balance is due at the end of your appointment.', 50)
) as v(q, a, sort)
where not exists (select 1 from public.faq_items);

select (select count(*) from public.services) as services, (select count(*) from public.site_policies) as policies,
       (select count(*) from public.gallery_photos) as photos, (select count(*) from public.faq_items) as faq;
