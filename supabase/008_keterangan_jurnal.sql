-- =====================================================================
-- EBA Finance — Update 008: keterangan jurnal lebih jelas (pakai nama)
-- Jalankan SEKALI di Supabase → SQL Editor (setelah 007). Aman dijalankan ulang.
-- Contoh: "Gaji Entis · Minggu 2 Nov 2026 – 8 Nov 2026 · 7 hari + lembur 10 jam"
-- =====================================================================

-- GAJI: sertakan nama karyawan, hari kerja & lembur
create or replace function jurnal_gaji() returns trigger language plpgsql as $$
declare nm text; ket text;
begin
  if tg_op = 'DELETE' then perform hapus_jurnal('gaji', old.id); return old; end if;
  select nama into nm from karyawan where id = new.karyawan_id;
  ket := 'Gaji ' || coalesce(nm, '?') || ' · ' || new.periode
    || case when coalesce(new.hari, 0) > 0 then ' · ' || trim(to_char(new.hari, 'FM990.0')) || ' hari' else '' end
    || case when coalesce(new.jam_lembur, 0) > 0 then ' + lembur ' || trim(to_char(new.jam_lembur, 'FM990.0')) || ' jam' else '' end;
  ket := replace(ket, '.0 ', ' ');
  perform tulis_jurnal('gaji', new.id, new.tanggal, ket, new.proyek_id, jsonb_build_array(
    jsonb_build_object('akun', case when new.proyek_id is null then '6100' else '5200' end, 'd', new.nominal),
    jsonb_build_object('akun','1100','k',new.nominal)));
  return new;
end $$;

-- KASBON: sertakan nama penerima
create or replace function jurnal_kasbon() returns trigger language plpgsql as $$
declare nm text;
begin
  if tg_op = 'DELETE' then
    perform hapus_jurnal('kasbon', old.id); perform hapus_jurnal('kasbon_kembali', old.id); return old;
  end if;
  select nama into nm from karyawan where id = new.karyawan_id;
  perform tulis_jurnal('kasbon', new.id, new.tanggal,
    'Kasbon ' || coalesce(nm, '') || coalesce(' · ' || nullif(new.keperluan, ''), ''),
    new.proyek_id, jsonb_build_array(
      jsonb_build_object('akun','1300','d',new.nominal),
      jsonb_build_object('akun','1100','k',new.nominal)));
  if new.status = 'selesai' and new.sisa_kembali > 0 then
    perform tulis_jurnal('kasbon_kembali', new.id, coalesce(new.tgl_selesai, current_date),
      'Sisa kasbon dikembalikan · ' || coalesce(nm, ''), new.proyek_id, jsonb_build_array(
        jsonb_build_object('akun','1100','d',new.sisa_kembali),
        jsonb_build_object('akun','1300','k',new.sisa_kembali)));
  else
    perform hapus_jurnal('kasbon_kembali', new.id);
  end if;
  return new;
end $$;

-- REALISASI KASBON: sertakan nama penerima kasbon
create or replace function jurnal_realisasi() returns trigger language plpgsql as $$
declare pid bigint; nm text;
begin
  if tg_op = 'DELETE' then perform hapus_jurnal('realisasi', old.id); return old; end if;
  select k.proyek_id, c.nama into pid, nm from kasbon k left join karyawan c on c.id = k.karyawan_id where k.id = new.kasbon_id;
  perform tulis_jurnal('realisasi', new.id, new.tanggal, new.uraian || coalesce(' · ' || nm, ''), pid, jsonb_build_array(
    jsonb_build_object('akun', case when pid is null then '6200' else '5300' end, 'd', new.jumlah),
    jsonb_build_object('akun','1300','k',new.jumlah)));
  return new;
end $$;

-- PEMBELIAN: sertakan nama supplier
create or replace function jurnal_pembelian() returns trigger language plpgsql as $$
declare akun_beban text; sp text;
begin
  if tg_op = 'DELETE' then perform hapus_jurnal('pembelian', old.id); return old; end if;
  select nama into sp from supplier where id = new.supplier_id;
  akun_beban := case when new.proyek_id is null then '6200' when new.kategori = 'Material' then '5100' else '5400' end;
  perform tulis_jurnal('pembelian', new.id, new.tanggal,
    coalesce(new.uraian, new.kategori) || coalesce(' · ' || sp, '') || coalesce(' · nota ' || nullif(new.no_nota, ''), ''),
    new.proyek_id, jsonb_build_array(
      jsonb_build_object('akun',akun_beban,'d',new.jumlah),
      jsonb_build_object('akun','2100','k',new.jumlah)));
  return new;
end $$;

-- Tulis ulang keterangan jurnal yang sudah ada
update penggajian set nominal = nominal;
update kasbon set nominal = nominal;
update kasbon_realisasi set jumlah = jumlah;
update pembelian set jumlah = jumlah;

notify pgrst, 'reload schema';
