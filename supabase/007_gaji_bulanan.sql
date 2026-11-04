-- =====================================================================
-- EBA Finance — Update 007: gaji bulanan (tunjangan & potongan)
-- Jalankan SEKALI di Supabase → SQL Editor. Aman dijalankan ulang.
-- Total gaji bulanan = gaji pokok + tunjangan + lembur − potongan
-- =====================================================================
alter table penggajian add column if not exists tunjangan numeric(16,2) not null default 0;
alter table penggajian add column if not exists potongan  numeric(16,2) not null default 0;
alter table penggajian add column if not exists keterangan text;
notify pgrst, 'reload schema';
