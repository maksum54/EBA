-- =====================================================================
-- EBA Finance — Update 003: rincian gaji harian (hari, tarif, lembur)
-- Jalankan SEKALI di Supabase → SQL Editor. Aman dijalankan ulang.
-- =====================================================================

alter table penggajian add column if not exists hari numeric(5,1);
alter table penggajian add column if not exists tarif numeric(16,2);
alter table penggajian add column if not exists lembur numeric(16,2) not null default 0;

-- Data yang sudah tersimpan: isi hari & tarif dari tarif karyawan.
update penggajian g
set tarif = k.tarif,
    hari  = round(g.nominal / nullif(k.tarif, 0), 1)
from karyawan k
where k.id = g.karyawan_id and k.tipe_gaji = 'mingguan' and g.hari is null and k.tarif > 0;

-- Perbaiki label periode minggu pertama (bug zona waktu): 1–6 Nov → 2–8 Nov 2026.
update penggajian set periode = 'Minggu 2 Nov 2026 – 8 Nov 2026'
where periode = 'Minggu 1 Nov 2026 – 6 Nov 2026';

notify pgrst, 'reload schema';
