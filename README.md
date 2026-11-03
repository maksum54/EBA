# EBA Finance

Website keuangan internal **PT EBA Karya Mandiri**: untung-rugi per proyek, termin, pembelian material,
kasbon lapangan, gaji mingguan/bulanan, dan laporan formal (Laba Rugi, Neraca, Buku Besar) dengan kop EBA.

Pembukuan dimulai **3 November 2026**. Setiap transaksi otomatis membuat jurnal debit-kredit di database.

## Teknologi
React + Vite + TypeScript + Tailwind · Supabase (database + login) · Vercel (hosting)

## Setup pertama kali

1. **Supabase**: buat project baru di https://supabase.com (misal `eba-finance`, region Singapore).
2. Buka **SQL Editor → New query**, tempel isi [`supabase/schema.sql`](supabase/schema.sql), klik **Run**.
3. **Authentication → Users → Add user**: buat akun direktur & admin keuangan.
4. Jadikan direktur (di SQL Editor):
   ```sql
   update profiles set peran = 'direktur', nama = 'Nama Direktur'
   where id = (select id from auth.users where email = 'email-direktur@contoh.com');
   ```
   User lain otomatis berperan `admin`.
5. Salin `.env.example` → `.env.local`, isi dari **Project Settings → API** (Project URL & anon public key).
6. Jalankan:
   ```bash
   npm install
   npm run dev
   ```

## Deploy ke Vercel
Import repo di https://vercel.com/new, lalu tambahkan Environment Variables
`VITE_SUPABASE_URL` dan `VITE_SUPABASE_ANON_KEY` (nilai sama dengan `.env.local`). **Jangan** commit `.env.local`.

## Alur pencatatan
| Transaksi | Jurnal otomatis |
|---|---|
| Termin **Diterima** | D Bank Mandiri (DPP − PPh) · D Beban PPh Final · K Pendapatan Proyek (DPP) |
| Pembelian | D Beban Material (proyek) / Operasional (kantor) · K Utang; jika Lunas: D Utang · K Bank |
| Kasbon keluar | D Uang Muka Kasbon · K Bank |
| Realisasi kasbon (nota) | D Beban Lapangan Proyek · K Uang Muka Kasbon |
| Sisa kasbon kembali | D Bank · K Uang Muka Kasbon |
| Gaji | D Beban Upah Proyek / Gaji Kantor · K Bank |
| Biaya lain | D Beban Proyek Lainnya / Operasional · K Bank |
| Jurnal manual | Bebas (saldo awal, modal, koreksi) |

PPN 11% dipungut langsung oleh instansi, sehingga dicatat sebagai informasi di termin dan tidak lewat rekening EBA.

## Kode proyek
`EBA-YYYY-NNN` dibuat otomatis saat status proyek menjadi **Berjalan**. Kode LPSE disimpan terpisah.
Paket yang masih **Tender** tidak memakan nomor urut.
