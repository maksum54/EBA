-- =====================================================================
-- EBA Finance — skema database Supabase (PostgreSQL)
-- PT EBA Karya Mandiri · pembukuan mulai 3 November 2026
--
-- Cara pakai: Supabase Dashboard → SQL Editor → New query →
-- tempel seluruh isi file ini → Run. Aman dijalankan sekali di project baru.
--
-- Prinsip: pengguna cukup mengisi transaksi (termin, pembelian, kasbon,
-- gaji, biaya). Trigger di bawah otomatis membuat JURNAL berpasangan
-- (debit = kredit), sehingga laporan laba rugi & neraca selalu seimbang.
-- =====================================================================

-- ---------- 1. PENGGUNA & PERAN ----------
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nama text not null default '',
  peran text not null default 'admin' check (peran in ('direktur','admin','lapangan')),
  created_at timestamptz default now()
);

-- Profil dibuat otomatis saat user baru didaftarkan.
create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, nama) values (new.id, coalesce(new.raw_user_meta_data->>'nama', new.email));
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function handle_new_user();

-- Direktur & admin = staf keuangan dengan akses penuh.
create or replace function is_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and peran in ('direktur','admin'));
$$;

create or replace function is_direktur() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and peran = 'direktur');
$$;

-- ---------- 2. DAFTAR AKUN (Chart of Accounts, SAK EMKM) ----------
create table if not exists akun (
  kode text primary key,
  nama text not null,
  tipe text not null check (tipe in ('aset','kewajiban','ekuitas','pendapatan','beban'))
);
insert into akun (kode, nama, tipe) values
  ('1100','Bank Mandiri','aset'),
  ('1200','Piutang Usaha','aset'),
  ('1300','Uang Muka Kasbon','aset'),
  ('2100','Utang Usaha (Supplier)','kewajiban'),
  ('3100','Modal Disetor','ekuitas'),
  ('3200','Saldo Awal','ekuitas'),
  ('4100','Pendapatan Proyek','pendapatan'),
  ('4900','Pendapatan Lain-lain','pendapatan'),
  ('5100','Beban Material Proyek','beban'),
  ('5200','Beban Upah Proyek','beban'),
  ('5300','Beban Lapangan Proyek (Kasbon)','beban'),
  ('5400','Beban Proyek Lainnya','beban'),
  ('5900','Beban PPh Final Konstruksi','beban'),
  ('6100','Beban Gaji Kantor','beban'),
  ('6200','Beban Operasional Kantor','beban')
on conflict (kode) do nothing;

-- ---------- 3. MASTER DATA ----------
create table if not exists klien (
  id bigint generated always as identity primary key,
  nama text not null, alamat text, npwp text, created_at timestamptz default now()
);
create table if not exists supplier (
  id bigint generated always as identity primary key,
  nama text not null, kontak text, created_at timestamptz default now()
);
create table if not exists karyawan (
  id bigint generated always as identity primary key,
  nama text not null,
  jabatan text,
  tipe_gaji text not null default 'bulanan' check (tipe_gaji in ('mingguan','bulanan')),
  tarif numeric(16,2) not null default 0,
  aktif boolean not null default true,
  created_at timestamptz default now()
);

-- ---------- 4. PROYEK & TERMIN ----------
create table if not exists proyek (
  id bigint generated always as identity primary key,
  kode_eba text unique,                -- EBA-2026-001 (otomatis saat status Berjalan)
  kode_lpse text,                      -- kode paket SPSE/LPSE, opsional
  nama text not null,
  klien_id bigint references klien(id),
  nilai_kontrak numeric(16,2) not null default 0,   -- termasuk PPN, sesuai kontrak
  tgl_mulai date, tgl_selesai date,
  status text not null default 'tender' check (status in ('tender','berjalan','selesai','batal')),
  catatan text,
  created_at timestamptz default now()
);

-- Kode EBA dibuat otomatis saat proyek mulai berjalan / selesai,
-- supaya paket yang kalah tender tidak memakan nomor urut.
create or replace function proyek_kode_otomatis() returns trigger language plpgsql as $$
declare thn text; urut int;
begin
  if new.kode_eba is null and new.status in ('berjalan','selesai') then
    thn := to_char(coalesce(new.tgl_mulai, current_date), 'YYYY');
    select coalesce(max(split_part(kode_eba,'-',3)::int),0)+1 into urut
      from proyek where kode_eba like 'EBA-'||thn||'-%';
    new.kode_eba := 'EBA-'||thn||'-'||lpad(urut::text,3,'0');
  end if;
  return new;
end $$;
drop trigger if exists trg_proyek_kode on proyek;
create trigger trg_proyek_kode before insert or update on proyek
  for each row execute function proyek_kode_otomatis();

create table if not exists termin (
  id bigint generated always as identity primary key,
  proyek_id bigint not null references proyek(id) on delete cascade,
  nama text not null,                      -- "Uang Muka", "Termin 1 (50%)", "Retensi"
  nilai_dpp numeric(16,2) not null default 0,  -- nilai sebelum PPN
  ppn numeric(16,2) not null default 0,        -- PPN 11% (dipungut klien)
  pph numeric(16,2) not null default 0,        -- PPh dipotong klien
  nilai_bersih numeric(16,2) generated always as (nilai_dpp - pph) stored, -- masuk ke Mandiri
  status text not null default 'rencana' check (status in ('rencana','ditagih','diterima')),
  tgl_tagih date, tgl_terima date,
  no_bukti_potong text,                    -- opsional
  created_at timestamptz default now()
);

-- ---------- 5. TRANSAKSI ----------
create table if not exists pembelian (
  id bigint generated always as identity primary key,
  tanggal date not null default current_date,
  proyek_id bigint references proyek(id),
  supplier_id bigint references supplier(id),
  uraian text not null,
  jumlah numeric(16,2) not null check (jumlah >= 0),
  status_bayar text not null default 'lunas' check (status_bayar in ('lunas','utang')),
  tgl_lunas date,                          -- diisi saat utang dilunasi
  nota_url text,
  created_at timestamptz default now()
);

create table if not exists kasbon (
  id bigint generated always as identity primary key,
  tanggal date not null default current_date,
  karyawan_id bigint references karyawan(id),
  proyek_id bigint references proyek(id),
  keperluan text,
  nominal numeric(16,2) not null check (nominal >= 0),
  status text not null default 'terbuka' check (status in ('terbuka','selesai')),
  tgl_selesai date,
  sisa_kembali numeric(16,2) not null default 0,  -- uang sisa yang disetor balik ke Mandiri
  created_at timestamptz default now()
);
create table if not exists kasbon_realisasi (
  id bigint generated always as identity primary key,
  kasbon_id bigint not null references kasbon(id) on delete cascade,
  tanggal date not null default current_date,
  uraian text not null,
  jumlah numeric(16,2) not null check (jumlah >= 0),
  nota_url text,
  created_at timestamptz default now()
);

create table if not exists penggajian (
  id bigint generated always as identity primary key,
  tanggal date not null default current_date,
  periode text not null,                   -- "Minggu 1 Nov 2026" / "November 2026"
  karyawan_id bigint not null references karyawan(id),
  proyek_id bigint references proyek(id),  -- kosong = gaji kantor
  nominal numeric(16,2) not null check (nominal >= 0),
  created_at timestamptz default now()
);

create table if not exists biaya_lain (
  id bigint generated always as identity primary key,
  tanggal date not null default current_date,
  kategori text not null default 'Operasional',
  uraian text not null,
  proyek_id bigint references proyek(id),  -- kosong = biaya kantor
  jumlah numeric(16,2) not null check (jumlah >= 0),
  created_at timestamptz default now()
);

-- Jurnal umum manual (saldo awal, setoran modal, koreksi).
create table if not exists jurnal_manual (
  id bigint generated always as identity primary key,
  tanggal date not null default current_date,
  keterangan text not null,
  akun_debit text not null references akun(kode),
  akun_kredit text not null references akun(kode),
  jumlah numeric(16,2) not null check (jumlah > 0),
  created_at timestamptz default now()
);

-- ---------- 6. JURNAL (dibuat otomatis) ----------
create table if not exists jurnal (
  id bigint generated always as identity primary key,
  tanggal date not null,
  keterangan text,
  sumber text not null,        -- termin / pembelian / pelunasan / kasbon / ...
  sumber_id bigint not null,
  proyek_id bigint references proyek(id) on delete set null,
  created_at timestamptz default now()
);
create index if not exists jurnal_sumber_idx on jurnal (sumber, sumber_id);
create table if not exists jurnal_baris (
  id bigint generated always as identity primary key,
  jurnal_id bigint not null references jurnal(id) on delete cascade,
  akun_kode text not null references akun(kode),
  debit numeric(16,2) not null default 0,
  kredit numeric(16,2) not null default 0
);

-- Hapus lalu tulis ulang jurnal untuk satu transaksi sumber.
-- baris = '[{"akun":"1100","d":100,"k":0}, ...]'
create or replace function tulis_jurnal(p_sumber text, p_id bigint, p_tgl date,
  p_ket text, p_proyek bigint, p_baris jsonb) returns void language plpgsql as $$
declare jid bigint; b jsonb;
begin
  delete from jurnal where sumber = p_sumber and sumber_id = p_id;
  if p_baris is null or jsonb_array_length(p_baris) = 0 then return; end if;
  insert into jurnal (tanggal, keterangan, sumber, sumber_id, proyek_id)
    values (p_tgl, p_ket, p_sumber, p_id, p_proyek) returning id into jid;
  for b in select * from jsonb_array_elements(p_baris) loop
    if coalesce((b->>'d')::numeric,0) <> 0 or coalesce((b->>'k')::numeric,0) <> 0 then
      insert into jurnal_baris (jurnal_id, akun_kode, debit, kredit)
        values (jid, b->>'akun', coalesce((b->>'d')::numeric,0), coalesce((b->>'k')::numeric,0));
    end if;
  end loop;
end $$;

create or replace function hapus_jurnal(p_sumber text, p_id bigint) returns void language sql as $$
  delete from jurnal where sumber = p_sumber and sumber_id = p_id;
$$;

-- TERMIN diterima: D Bank (bersih) + D Beban PPh ; K Pendapatan (DPP).
-- PPN dipungut langsung oleh instansi, jadi tidak lewat rekening EBA.
create or replace function jurnal_termin() returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then perform hapus_jurnal('termin', old.id); return old; end if;
  if new.status = 'diterima' then
    perform tulis_jurnal('termin', new.id, coalesce(new.tgl_terima, current_date),
      'Penerimaan '||new.nama, new.proyek_id, jsonb_build_array(
        jsonb_build_object('akun','1100','d',new.nilai_dpp - new.pph),
        jsonb_build_object('akun','5900','d',new.pph),
        jsonb_build_object('akun','4100','k',new.nilai_dpp)));
  else
    perform hapus_jurnal('termin', new.id);
  end if;
  return new;
end $$;
drop trigger if exists trg_jurnal_termin on termin;
create trigger trg_jurnal_termin after insert or update or delete on termin
  for each row execute function jurnal_termin();

-- PEMBELIAN: D Beban Material ; K Utang. Jika lunas: D Utang ; K Bank.
create or replace function jurnal_pembelian() returns trigger language plpgsql as $$
declare akun_beban text;
begin
  if tg_op = 'DELETE' then
    perform hapus_jurnal('pembelian', old.id); perform hapus_jurnal('pelunasan', old.id); return old;
  end if;
  akun_beban := case when new.proyek_id is null then '6200' else '5100' end;
  perform tulis_jurnal('pembelian', new.id, new.tanggal, new.uraian, new.proyek_id, jsonb_build_array(
    jsonb_build_object('akun',akun_beban,'d',new.jumlah),
    jsonb_build_object('akun','2100','k',new.jumlah)));
  if new.status_bayar = 'lunas' then
    perform tulis_jurnal('pelunasan', new.id, coalesce(new.tgl_lunas, new.tanggal),
      'Pelunasan: '||new.uraian, new.proyek_id, jsonb_build_array(
        jsonb_build_object('akun','2100','d',new.jumlah),
        jsonb_build_object('akun','1100','k',new.jumlah)));
  else
    perform hapus_jurnal('pelunasan', new.id);
  end if;
  return new;
end $$;
drop trigger if exists trg_jurnal_pembelian on pembelian;
create trigger trg_jurnal_pembelian after insert or update or delete on pembelian
  for each row execute function jurnal_pembelian();

-- KASBON keluar: D Uang Muka Kasbon ; K Bank. Sisa kembali: D Bank ; K Uang Muka.
create or replace function jurnal_kasbon() returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    perform hapus_jurnal('kasbon', old.id); perform hapus_jurnal('kasbon_kembali', old.id); return old;
  end if;
  perform tulis_jurnal('kasbon', new.id, new.tanggal, 'Kasbon: '||coalesce(new.keperluan,''),
    new.proyek_id, jsonb_build_array(
      jsonb_build_object('akun','1300','d',new.nominal),
      jsonb_build_object('akun','1100','k',new.nominal)));
  if new.status = 'selesai' and new.sisa_kembali > 0 then
    perform tulis_jurnal('kasbon_kembali', new.id, coalesce(new.tgl_selesai, current_date),
      'Sisa kasbon dikembalikan', new.proyek_id, jsonb_build_array(
        jsonb_build_object('akun','1100','d',new.sisa_kembali),
        jsonb_build_object('akun','1300','k',new.sisa_kembali)));
  else
    perform hapus_jurnal('kasbon_kembali', new.id);
  end if;
  return new;
end $$;
drop trigger if exists trg_jurnal_kasbon on kasbon;
create trigger trg_jurnal_kasbon after insert or update or delete on kasbon
  for each row execute function jurnal_kasbon();

-- REALISASI KASBON (nota): D Beban Lapangan Proyek ; K Uang Muka Kasbon.
create or replace function jurnal_realisasi() returns trigger language plpgsql as $$
declare pid bigint;
begin
  if tg_op = 'DELETE' then perform hapus_jurnal('realisasi', old.id); return old; end if;
  select proyek_id into pid from kasbon where id = new.kasbon_id;
  perform tulis_jurnal('realisasi', new.id, new.tanggal, new.uraian, pid, jsonb_build_array(
    jsonb_build_object('akun', case when pid is null then '6200' else '5300' end, 'd', new.jumlah),
    jsonb_build_object('akun','1300','k',new.jumlah)));
  return new;
end $$;
drop trigger if exists trg_jurnal_realisasi on kasbon_realisasi;
create trigger trg_jurnal_realisasi after insert or update or delete on kasbon_realisasi
  for each row execute function jurnal_realisasi();

-- GAJI: D Beban Upah Proyek / Gaji Kantor ; K Bank.
create or replace function jurnal_gaji() returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then perform hapus_jurnal('gaji', old.id); return old; end if;
  perform tulis_jurnal('gaji', new.id, new.tanggal, 'Gaji '||new.periode, new.proyek_id, jsonb_build_array(
    jsonb_build_object('akun', case when new.proyek_id is null then '6100' else '5200' end, 'd', new.nominal),
    jsonb_build_object('akun','1100','k',new.nominal)));
  return new;
end $$;
drop trigger if exists trg_jurnal_gaji on penggajian;
create trigger trg_jurnal_gaji after insert or update or delete on penggajian
  for each row execute function jurnal_gaji();

-- BIAYA LAIN: D Beban Proyek Lainnya / Operasional Kantor ; K Bank.
create or replace function jurnal_biaya() returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then perform hapus_jurnal('biaya', old.id); return old; end if;
  perform tulis_jurnal('biaya', new.id, new.tanggal, new.uraian, new.proyek_id, jsonb_build_array(
    jsonb_build_object('akun', case when new.proyek_id is null then '6200' else '5400' end, 'd', new.jumlah),
    jsonb_build_object('akun','1100','k',new.jumlah)));
  return new;
end $$;
drop trigger if exists trg_jurnal_biaya on biaya_lain;
create trigger trg_jurnal_biaya after insert or update or delete on biaya_lain
  for each row execute function jurnal_biaya();

-- JURNAL MANUAL: langsung debit/kredit sesuai pilihan.
create or replace function jurnal_manual_fn() returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then perform hapus_jurnal('manual', old.id); return old; end if;
  perform tulis_jurnal('manual', new.id, new.tanggal, new.keterangan, null, jsonb_build_array(
    jsonb_build_object('akun',new.akun_debit,'d',new.jumlah),
    jsonb_build_object('akun',new.akun_kredit,'k',new.jumlah)));
  return new;
end $$;
drop trigger if exists trg_jurnal_manual on jurnal_manual;
create trigger trg_jurnal_manual after insert or update or delete on jurnal_manual
  for each row execute function jurnal_manual_fn();

-- ---------- 7. VIEW LAPORAN ----------
-- Buku besar: satu baris per debit/kredit, lengkap dengan akun & proyek.
create or replace view v_buku_besar with (security_invoker = true) as
  select j.id as jurnal_id, j.tanggal, j.keterangan, j.sumber, j.proyek_id,
         b.akun_kode, a.nama as akun_nama, a.tipe, b.debit, b.kredit
  from jurnal_baris b join jurnal j on j.id = b.jurnal_id join akun a on a.kode = b.akun_kode;

-- Untung-rugi per proyek.
create or replace view v_proyek_laba with (security_invoker = true) as
  select p.id, p.kode_eba, p.kode_lpse, p.nama, p.status, p.nilai_kontrak,
    coalesce(sum(case when bb.tipe='pendapatan' then bb.kredit - bb.debit end),0) as pendapatan,
    coalesce(sum(case when bb.tipe='beban' then bb.debit - bb.kredit end),0) as biaya,
    coalesce(sum(case when bb.tipe='pendapatan' then bb.kredit - bb.debit end),0)
      - coalesce(sum(case when bb.tipe='beban' then bb.debit - bb.kredit end),0) as laba
  from proyek p left join v_buku_besar bb on bb.proyek_id = p.id
  group by p.id;

-- ---------- 8. KEAMANAN (Row Level Security) ----------
-- Hanya direktur & admin yang bisa membaca/menulis data keuangan.
do $$
declare t text;
begin
  foreach t in array array['akun','klien','supplier','karyawan','proyek','termin','pembelian',
    'kasbon','kasbon_realisasi','penggajian','biaya_lain','jurnal_manual','jurnal','jurnal_baris'] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists staf_semua on %I', t);
    execute format('create policy staf_semua on %I for all to authenticated using (is_staff()) with check (is_staff())', t);
  end loop;
end $$;

alter table profiles enable row level security;
drop policy if exists profil_baca on profiles;
create policy profil_baca on profiles for select to authenticated using (id = auth.uid() or is_staff());
drop policy if exists profil_ubah on profiles;
create policy profil_ubah on profiles for update to authenticated
  using (is_direktur());

-- ---------- 9. DATA AWAL ----------
insert into klien (nama)
  select 'Kementerian ESDM' where not exists (select 1 from klien where nama = 'Kementerian ESDM');

insert into proyek (kode_eba, kode_lpse, nama, klien_id, status)
select v.kode_eba, v.kode_lpse, v.nama, (select id from klien where nama='Kementerian ESDM' limit 1), v.status
from (values
  ('EBA-2026-001','11114252000','Pekerjaan Perbaikan Prasarana Uji Gas CNG (Dana BLU)','selesai'),
  ('EBA-2026-002','11144088000','Pekerjaan Perbaikan Gedung Eksploitasi dan Pagar Roboh Area Gudang Aplikasi','berjalan'),
  (null,'11155335000','Pekerjaan Pemeliharaan Peralatan Jaringan Pompa Air Bersih','tender')
) as v(kode_eba, kode_lpse, nama, status)
where not exists (select 1 from proyek p where p.kode_lpse = v.kode_lpse);

-- Penawaran paket Pompa Air Bersih (dari SPSE): 179.700.000 + PPN 11%.
update proyek set nilai_kontrak = 199467000 where kode_lpse = '11155335000' and nilai_kontrak = 0;

-- =====================================================================
-- SETELAH MENJALANKAN: buat 2 user di Authentication → Users → Add user,
-- lalu jadikan salah satunya direktur:
--   update profiles set peran = 'direktur', nama = 'Nama Direktur'
--   where id = (select id from auth.users where email = 'email-direktur@...');
-- =====================================================================
