-- =====================================================================
-- EBA Finance — Update 005: lembur sesuai aturan resmi (PP 35/2021)
-- Jalankan SEKALI di Supabase → SQL Editor. Aman dijalankan ulang.
--
-- Aturan yang dipakai (hari kerja biasa, lembur mulai pukul 17.00):
--   Upah sejam   = 1/173 × upah sebulan
--   Upah sebulan pekerja harian (6 hari kerja/minggu) = upah sehari × 25
--   Jam lembur ke-1 tiap hari = 1,5 × upah sejam
--   Jam ke-2 dst. tiap hari   = 2   × upah sejam
-- =====================================================================

-- Jumlah hari lembur dalam seminggu (untuk membedakan jam ke-1 vs jam berikutnya)
alter table penggajian add column if not exists hari_lembur numeric(4,1) not null default 0;

-- Tarif lembur/jam di data karyawan = UPAH SEJAM resmi (pengali 1,5× / 2× dihitung otomatis)
update karyawan set tarif_lembur = round(tarif * 25 / 173) where tipe_gaji = 'mingguan' and tarif > 0;
update karyawan set tarif_lembur = round(tarif / 173)      where tipe_gaji = 'bulanan'  and tarif > 0;

notify pgrst, 'reload schema';
