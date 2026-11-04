-- =====================================================================
-- EBA Finance — Update 010: tanggal gaji dipindah ke akhir periodenya
-- Contoh: "Minggu 19 Okt 2026 – 25 Okt 2026" yang diinput 4 Nov → tanggal 25 Okt 2026
--         "Bulan Oktober 2026"                                 → tanggal 31 Okt 2026
-- Kalau periodenya belum selesai, tanggal tidak diubah (tidak boleh di masa depan).
-- Jurnal ikut diperbarui otomatis oleh trigger. Aman dijalankan ulang.
-- =====================================================================

create or replace function akhir_periode_gaji(p text) returns date language plpgsql immutable as $$
declare
  bln text[] := array['jan','feb','mar','apr','mei','jun','jul','agu','sep','okt','nov','des'];
  bpanjang text[] := array['januari','februari','maret','april','mei','juni','juli','agustus','september','oktober','november','desember'];
  m text[]; i int;
begin
  -- Mingguan: ambil tanggal sesudah tanda "–"
  m := regexp_match(p, '–\s*(\d{1,2})\s+([A-Za-z]+)\.?\s+(\d{4})');
  if m is not null then
    i := array_position(bln, lower(left(m[2], 3)));
    if i is null then return null; end if;
    return make_date(m[3]::int, i, m[1]::int);
  end if;
  -- Bulanan: "Bulan November 2026"
  m := regexp_match(p, '^Bulan\s+([A-Za-z]+)\s+(\d{4})');
  if m is not null then
    i := array_position(bpanjang, lower(m[1]));
    if i is null then return null; end if;
    return (make_date(m[2]::int, i, 1) + interval '1 month - 1 day')::date;
  end if;
  return null;
end $$;

-- Pratinjau dulu (opsional): apa yang akan berubah
select id, periode, tanggal as tanggal_lama, akhir_periode_gaji(periode) as tanggal_baru
from penggajian
where akhir_periode_gaji(periode) is not null
  and akhir_periode_gaji(periode) <= current_date
  and tanggal <> akhir_periode_gaji(periode)
order by periode;

-- Perbaiki
update penggajian
set tanggal = akhir_periode_gaji(periode)
where akhir_periode_gaji(periode) is not null
  and akhir_periode_gaji(periode) <= current_date
  and tanggal <> akhir_periode_gaji(periode);
