-- =====================================================================
-- EBA Finance — Update 004: lembur per jam
-- Jalankan SEKALI di Supabase → SQL Editor. Aman dijalankan ulang.
-- =====================================================================

-- Tarif lembur per jam di data karyawan.
-- Default awal = tarif harian ÷ 8 jam (bisa diubah per orang di menu Karyawan).
alter table karyawan add column if not exists tarif_lembur numeric(16,2) not null default 0;
update karyawan set tarif_lembur = round(tarif / 8)
where tipe_gaji = 'mingguan' and tarif_lembur = 0 and tarif > 0;

-- Rincian lembur di tiap data gaji: jam × tarif per jam = lembur (Rp)
alter table penggajian add column if not exists jam_lembur numeric(6,1) not null default 0;
alter table penggajian add column if not exists tarif_lembur numeric(16,2) not null default 0;

notify pgrst, 'reload schema';
