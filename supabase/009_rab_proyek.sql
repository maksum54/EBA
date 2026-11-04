-- =====================================================================
-- EBA Finance — Update 009: Anggaran (RAB) biaya per proyek, per kategori akun
-- Jalankan SEKALI di Supabase → SQL Editor (setelah 008). Aman dijalankan ulang.
-- =====================================================================

create table if not exists rab_proyek (
  id bigint generated always as identity primary key,
  proyek_id bigint not null references proyek(id) on delete cascade,
  akun_kode text not null references akun(kode),   -- 5100 / 5200 / 5300 / 5400
  nilai numeric(16,2) not null default 0 check (nilai >= 0),
  unique (proyek_id, akun_kode)
);

alter table rab_proyek enable row level security;
drop policy if exists staf_semua on rab_proyek;
create policy staf_semua on rab_proyek for all to authenticated using (is_staff()) with check (is_staff());

notify pgrst, 'reload schema';
