-- =====================================================================
-- EBA Finance — Update 012: PPh termin diset 0 (sesuai kebijakan EBA)
-- Sebelumnya kolom PPh terisi 11% (tarif PPN) sehingga Beban PPh membengkak.
-- Setelah ini: Pendapatan = DPP, uang masuk Bank Mandiri = DPP, Beban PPh = 0.
-- Jurnal ikut diperbarui otomatis. Aman dijalankan ulang.
-- =====================================================================

-- Pratinjau
select p.kode_eba, p.nama, t.nama as termin, t.nilai_dpp, t.pph as pph_lama
from termin t join proyek p on p.id = t.proyek_id
where t.pph <> 0
order by p.kode_eba;

-- Perbaiki
update termin set pph = 0 where pph <> 0;

-- Cek: total Beban PPh harus 0
select coalesce(sum(debit - kredit), 0) as total_beban_pph
from v_buku_besar where akun_kode = '5900';
