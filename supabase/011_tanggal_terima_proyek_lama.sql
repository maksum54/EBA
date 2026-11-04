-- =====================================================================
-- EBA Finance — Update 011: pindahkan tanggal pembayaran proyek lama
-- Termin "diterima" milik proyek yang mulai SEBELUM 3 Nov 2026, tapi tanggal
-- terimanya tercatat >= 3 Nov (karena diisi otomatis "hari ini"), dipindah ke
-- tanggal selesai proyek (atau tanggal mulai kalau tanggal selesai kosong / masih di masa depan).
-- Jurnal ikut diperbarui otomatis. Aman dijalankan ulang.
-- =====================================================================

-- Pratinjau: apa yang akan berubah
select p.kode_eba, p.nama, t.nama as termin, t.tgl_terima as tgl_lama,
       case when p.tgl_selesai is not null and p.tgl_selesai <= current_date then p.tgl_selesai else p.tgl_mulai end as tgl_baru
from termin t join proyek p on p.id = t.proyek_id
where t.status = 'diterima' and p.tgl_mulai < '2026-11-03' and t.tgl_terima >= '2026-11-03'
order by tgl_baru;

-- Perbaiki
update termin t
set tgl_terima = x.tgl_baru, tgl_tagih = least(coalesce(t.tgl_tagih, x.tgl_baru), x.tgl_baru)
from (
  select id, case when tgl_selesai is not null and tgl_selesai <= current_date then tgl_selesai else tgl_mulai end as tgl_baru
  from proyek
) x, proyek p
where x.id = t.proyek_id and p.id = t.proyek_id
  and t.status = 'diterima' and p.tgl_mulai < '2026-11-03' and t.tgl_terima >= '2026-11-03';

-- Cek setelah diperbaiki
select p.kode_eba, p.nama, t.tgl_terima, t.nilai_bersih
from termin t join proyek p on p.id = t.proyek_id
where t.status = 'diterima'
order by t.tgl_terima;
