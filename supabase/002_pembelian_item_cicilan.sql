-- =====================================================================
-- EBA Finance — Update 002: Pembelian per item, cicilan, foto nota
-- Jalankan SEKALI di Supabase → SQL Editor (setelah schema.sql).
-- Aman dijalankan ulang.
-- =====================================================================

-- ---------- 1. Header pembelian: kolom baru ----------
alter table pembelian add column if not exists no_nota text;
alter table pembelian add column if not exists kategori text not null default 'Material';
alter table pembelian add column if not exists jatuh_tempo date;
alter table pembelian add column if not exists foto jsonb not null default '[]'::jsonb; -- daftar URL Cloudinary
alter table pembelian alter column uraian drop not null;

-- Foto nota di realisasi kasbon
alter table kasbon_realisasi add column if not exists foto jsonb not null default '[]'::jsonb;

-- ---------- 2. Rincian item per nota ----------
create table if not exists pembelian_item (
  id bigint generated always as identity primary key,
  pembelian_id bigint not null references pembelian(id) on delete cascade,
  nama text not null,
  volume numeric(14,3) not null default 1,
  satuan text not null default 'unit',
  harga_satuan numeric(16,2) not null default 0,
  subtotal numeric(16,2) generated always as (round(volume * harga_satuan, 2)) stored
);

-- ---------- 3. Pembayaran ke supplier (bisa dicicil) ----------
create table if not exists pembayaran_supplier (
  id bigint generated always as identity primary key,
  pembelian_id bigint not null references pembelian(id) on delete cascade,
  tanggal date not null default current_date,
  jumlah numeric(16,2) not null check (jumlah > 0),
  catatan text,
  created_at timestamptz default now()
);

-- Pindahkan data lama: pembelian berstatus "lunas" jadi satu pembayaran penuh.
insert into pembayaran_supplier (pembelian_id, tanggal, jumlah, catatan)
select p.id, coalesce(p.tgl_lunas, p.tanggal), p.jumlah, 'Migrasi data lama'
from pembelian p
where p.status_bayar = 'lunas' and p.jumlah > 0
  and not exists (select 1 from pembayaran_supplier s where s.pembelian_id = p.id);
-- Data lama tanpa item: buat satu item dari uraian + jumlah.
insert into pembelian_item (pembelian_id, nama, volume, satuan, harga_satuan)
select p.id, coalesce(p.uraian, 'Pembelian'), 1, 'paket', p.jumlah
from pembelian p
where p.jumlah > 0 and not exists (select 1 from pembelian_item i where i.pembelian_id = p.id);
delete from jurnal where sumber = 'pelunasan';

-- ---------- 4. Total nota = jumlah subtotal item (otomatis) ----------
create or replace function hitung_total_pembelian() returns trigger language plpgsql as $$
declare pid bigint := coalesce(new.pembelian_id, old.pembelian_id);
begin
  update pembelian set jumlah = coalesce((select sum(subtotal) from pembelian_item where pembelian_id = pid), 0)
  where id = pid;
  return null;
end $$;
drop trigger if exists trg_total_pembelian on pembelian_item;
create trigger trg_total_pembelian after insert or update or delete on pembelian_item
  for each row execute function hitung_total_pembelian();

-- ---------- 5. Jurnal pembelian (versi baru) ----------
-- Nota dicatat: D Beban ; K Utang Usaha. Pembayaran dicatat terpisah.
create or replace function jurnal_pembelian() returns trigger language plpgsql as $$
declare akun_beban text;
begin
  if tg_op = 'DELETE' then perform hapus_jurnal('pembelian', old.id); return old; end if;
  akun_beban := case
    when new.proyek_id is null then '6200'
    when new.kategori = 'Material' then '5100'
    else '5400' end;
  perform tulis_jurnal('pembelian', new.id, new.tanggal,
    coalesce(new.kategori,'') || coalesce(' · ' || new.no_nota, '') || coalesce(' · ' || new.uraian, ''),
    new.proyek_id, jsonb_build_array(
      jsonb_build_object('akun',akun_beban,'d',new.jumlah),
      jsonb_build_object('akun','2100','k',new.jumlah)));
  return new;
end $$;

-- Pembayaran supplier: D Utang Usaha ; K Bank Mandiri.
create or replace function jurnal_bayar_supplier() returns trigger language plpgsql as $$
declare p record;
begin
  if tg_op = 'DELETE' then perform hapus_jurnal('bayar_supplier', old.id); return old; end if;
  select proyek_id, no_nota into p from pembelian where id = new.pembelian_id;
  perform tulis_jurnal('bayar_supplier', new.id, new.tanggal,
    'Bayar supplier' || coalesce(' · nota ' || p.no_nota, ''), p.proyek_id, jsonb_build_array(
      jsonb_build_object('akun','2100','d',new.jumlah),
      jsonb_build_object('akun','1100','k',new.jumlah)));
  return new;
end $$;
drop trigger if exists trg_jurnal_bayar_supplier on pembayaran_supplier;
create trigger trg_jurnal_bayar_supplier after insert or update or delete on pembayaran_supplier
  for each row execute function jurnal_bayar_supplier();

-- Tulis ulang jurnal semua pembelian lama dengan logika baru.
update pembelian set jumlah = jumlah;

-- ---------- 6. View: status bayar & sisa utang ----------
create or replace view v_pembelian with (security_invoker = true) as
  select p.*,
    coalesce(b.dibayar, 0) as dibayar,
    p.jumlah - coalesce(b.dibayar, 0) as sisa,
    case when p.jumlah > 0 and coalesce(b.dibayar,0) >= p.jumlah then 'lunas'
         when coalesce(b.dibayar,0) > 0 then 'dicicil'
         else 'belum' end as status,
    (p.jatuh_tempo is not null and p.jatuh_tempo < current_date
      and p.jumlah - coalesce(b.dibayar,0) > 0) as lewat_tempo
  from pembelian p
  left join (select pembelian_id, sum(jumlah) as dibayar from pembayaran_supplier group by 1) b
    on b.pembelian_id = p.id;

-- ---------- 7. Keamanan ----------
do $$
declare t text;
begin
  foreach t in array array['pembelian_item','pembayaran_supplier'] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists staf_semua on %I', t);
    execute format('create policy staf_semua on %I for all to authenticated using (is_staff()) with check (is_staff())', t);
  end loop;
end $$;
