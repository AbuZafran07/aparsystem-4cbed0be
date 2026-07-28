## Tujuan

Setelah Payment Request (PR) di-Mark as Paid, invoice AP ikut ter-update otomatis (tidak perlu Finance klik "Record Payment" lagi), dan kalau approved lebih kecil dari outstanding, sisanya otomatis dibuatkan PR baru DRAFT. Sekaligus di halaman AP List ditampilkan ringkasan sisa outstanding + daftar PR terkait per invoice supaya jelas kenapa masih "gantung".

## Yang Dibangun

### 1. Auto-sync saat PR Mark as Paid (Point 1)
Ketika Finance klik **Mark as Paid** di halaman Payment Requests, sistem otomatis:
- Buat record `ap_payments` baru (payment_date = hari ini, total = approved_amount PR).
- Buat `ap_payment_allocations` yang menghubungkan payment ke invoice AP.
- Tambah `paid_amount` invoice dan kurangi `outstanding_amount`.
- Set status invoice: `PAID` bila outstanding = 0, `PARTIAL` bila outstanding > 0.
- Tandai PR sebagai `PAID` + isi `paid_at`.
- Kalau `approved_amount < outstanding` (masih ada sisa), otomatis buat **PR baru berstatus DRAFT** untuk invoice yang sama, dengan `submitted_amount = sisa outstanding`, dan catatan "Auto-generated from PR-XXXX (sisa pembayaran)".
- Buat notifikasi in-app untuk Purchasing kalau ada PR sisa baru.

Semua langkah dijalankan atomik di database function `settle_payment_request(request_id, bank_account_id, reference_no)` supaya konsisten (tidak setengah jadi kalau ada error).

Modal "Mark as Paid" ditambah pilihan **Bank Account** (wajib) dan **Reference No** (opsional) sebelum konfirmasi, sesuai kolom `ap_payments`.

### 2. Ringkasan Sisa & PR Terkait di AP List (Point 2)

Di setiap baris invoice AP (khususnya tab Approved/Partial), tambah kolom/badge kecil "PR" yang menampilkan jumlah PR aktif untuk invoice tersebut. Contoh: `PR: 1 Pending · 1 Paid`.

Saat baris invoice diklik atau di-expand, muncul panel ringkas:

```text
Outstanding: Rp 4.000.000  (sisa dari Rp 10.000.000)
Riwayat Pengajuan Pembayaran:
  PR-202607-0001  Submitted 10jt  Approved 6jt   PAID     (06 Jul 2026)
  PR-202607-0007  Submitted 4jt   -              DRAFT    Auto-generated sisa
Aksi disarankan: Submit PR-202607-0007 untuk melunasi sisa.
```

Panel ini juga tampil di dialog Invoice Detail. Semua data diambil dari tabel `payment_requests` yang sudah ada (via join `ap_invoice_id`).

## Detail Teknis

**Database (migration):**
- Buat function `public.settle_payment_request(_request_id uuid, _bank_account_id uuid, _reference_no text)` (SECURITY DEFINER, scoped ke FINANCE/ADMIN/SUPER_ADMIN via has_role check di dalam function). Function ini yang jalankan semua step transaksional di atas.
- Grant EXECUTE ke `authenticated`. Validasi role di body function.

**Frontend:**
- `src/pages/PaymentRequestsPage.tsx`: ganti `handleMarkAsPaid` → panggil RPC `settle_payment_request`. Tambah dialog kecil pilih Bank Account + Reference No.
- `src/pages/ApListPage.tsx`:
  - Fetch related `payment_requests` per invoice (join di query utama).
  - Tampilkan badge PR di kolom Actions/Status.
  - Tambah row expand (atau section di Invoice Detail dialog) yang menampilkan ringkasan sisa + tabel PR terkait.
- `src/pages/ApInvoiceDetailPage.tsx`: tampilkan section "Payment Requests" yang sama.

**Tidak diubah:**
- Flow "Record Payment" manual di AP List tetap ada (untuk kasus pembayaran tanpa PR, misal cash langsung).
- Struktur PR & AP invoice tidak berubah, hanya perilaku Mark as Paid + tampilan tambahan.
