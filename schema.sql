-- Run this in your Supabase SQL Editor

create table if not exists inventory (
  id uuid default gen_random_uuid() primary key,
  square_item_id text unique not null,
  sku text,
  name text,
  quantity integer not null default 0,
  updated_at timestamp with time zone default timezone('utc'::text, now())
);

-- Optional: Enable RLS
alter table inventory enable row level security;

-- Policy to allow full access to Service Role (which the script uses)
-- Note: Service role bypasses RLS by default, but you might want policies for other users.
create policy "Allow read access to authenticated users" 
on inventory for select 
to authenticated 
using (true);
