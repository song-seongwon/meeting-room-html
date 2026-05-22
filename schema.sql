-- ============================================================
-- 63빌딩 3층 회의실 예약 시스템 - Supabase 스키마
-- Supabase Dashboard → SQL Editor 에 붙여넣고 한 번 실행하세요.
-- ============================================================

-- 시간 범위 중복(겹침)을 DB 차원에서 막기 위해 필요한 확장
create extension if not exists btree_gist;

-- 예약 테이블
create table if not exists public.reservations (
  id            uuid primary key default gen_random_uuid(),
  room          text not null check (room in ('3', '4', '5', '7')),
  res_date      date not null,
  start_time    time not null,
  end_time      time not null,
  reserver_name text not null,
  department    text,
  title         text,
  -- 날짜 + 시간을 합친 구간(겹침 검사용). 자동 생성 컬럼.
  during        tsrange generated always as (
                  tsrange((res_date + start_time)::timestamp,
                          (res_date + end_time)::timestamp)
                ) stored,
  created_at    timestamptz not null default now(),
  constraint valid_time_range check (end_time > start_time)
);

-- 같은 회의실에서 시간대가 겹치는 예약을 원천 차단 (이중예약 방지)
alter table public.reservations
  drop constraint if exists reservations_no_overlap;
alter table public.reservations
  add constraint reservations_no_overlap
  exclude using gist (room with =, during with &&);

-- 날짜로 조회가 잦으므로 인덱스
create index if not exists reservations_date_idx
  on public.reservations (res_date);

-- ------------------------------------------------------------
-- RLS: 로그인 없이 누구나 조회 / 예약 / 취소 (사내 신뢰 환경 가정)
-- ------------------------------------------------------------
alter table public.reservations enable row level security;

drop policy if exists "anyone can read"   on public.reservations;
drop policy if exists "anyone can insert" on public.reservations;
drop policy if exists "anyone can delete" on public.reservations;

create policy "anyone can read"   on public.reservations for select using (true);
create policy "anyone can insert" on public.reservations for insert with check (true);
create policy "anyone can delete" on public.reservations for delete using (true);

-- ------------------------------------------------------------
-- 실시간 구독 활성화 (여러 명이 동시에 봐도 자동 새로고침)
-- 이미 추가돼 있으면 에러가 날 수 있는데 무시해도 됩니다.
-- ------------------------------------------------------------
do $$
begin
  alter publication supabase_realtime add table public.reservations;
exception when others then
  null;
end $$;
