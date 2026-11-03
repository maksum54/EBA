-- =====================================================================
-- EBA Finance — Update 006: input lembur pakai JAM PULANG
-- Jalankan SEKALI di Supabase → SQL Editor (setelah 005). Aman dijalankan ulang.
-- Jam lembur per hari = jam pulang − 17.00
-- =====================================================================
alter table penggajian add column if not exists jam_pulang text;  -- contoh '22:00'
notify pgrst, 'reload schema';
