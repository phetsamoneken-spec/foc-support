# ລາຍງານ Supabase Phase 1 — REVIEW ONLY

ກວດ repository ຈາກ commit `73d664de62bece11ff39cdf4fc1e2f09d5f036ac` ແລະກຽມ branch `feature/supabase-phase1-schema-rls-review`.

## ສິ່ງທີ່ກຽມ

- `docs/supabase-phase1-audit.md`: architecture, ລາຍການໄຟລ໌, field mapping ຄົບຈາກ model ແລະຄວາມສ່ຽງ.
- `supabase/migrations/20261102031505_foc_phase1_schema.sql`: 13 tables + totals view, RLS ແລະ checked RPC. **NOT APPLIED ໃສ່ Supabase**.
- `docs/supabase-rls-permissions.md`: ສິດ Admin/B1–B7 ແລະຂໍ້ຈຳກັດ.
- `docs/supabase-import-plan.md`: ກວດ Excel, backup, pending writes, financial reconciliation ແລະ rollback.
- `docs/supabase-react-adapter-plan.md`: ແຜນປັບ frontend/Auth ໂດຍຍັງຮັກສາ GAS.
- `supabase/tests/phase1-regression.sql`, `supabase/review/run-local.mjs`, `supabase/review/rollback-empty.sql`, `docs/supabase-testing.md`: ການທົດສອບແລະວິທີກວດຊ້ຳ.
- `package.json`, `.gitignore`: ປັບ build ໃຫ້ຮັກສາເອກະສານ Markdown ແລະບໍ່ຄັດລອກ dist ມາທັບ docs. Pages ຍັງໃຊ້ dist ຕາມ workflow ເກົ່າ.

## ຜົນກວດ

Lint ຜ່ານ; GAS tests 31 ຂໍ້ ແລະ TS test files 15 ໄຟລ໌ຜ່ານ; ກວດວັນທີສອງ timezone ຜ່ານ; build ຜ່ານ (ມີ chunk-size warning). SQL ຜ່ານ 163 assertions (136 regression + 27 workflows) ໃນ PGlite ພ້ອມ schema replay ແລະ rollback guard. Auth tables/JWT functions ໃນ harness ເປັນ stub ຈຳລອງ.

**NOT RUN:** Supabase Auth/PostgREST ຈິງ, hosted advisors, financial reconciliation ຂໍ້ມູນຈິງ. Excel ກວດແລ້ວ 578 ລາຍການ/578 ລະຫັດບໍ່ຊ້ຳ ແຕ່ບໍ່ມີຄໍລຳມູນຄ່າງົບ. ບໍ່ໄດ້ທົດສອບ login ໃນເວັບຈິງ ຫຼືອ້າງວ່າຍ້າຍ backend ສຳເລັດແລ້ວ.

## ສິ່ງທີ່ຕ້ອງຕັດສິນກ່ອນ cutover

1. Excel ໄດ້ກວດໂຄງສ້າງແລ້ວ; ຍັງຕ້ອງກວດມູນຄ່າງົບ/ລາຍຈ່າຍຈາກ GAS/Sheets ທີ່ຖືກຕ້ອງ. SQL draft ເກົ່າຍັງບໍ່ໄດ້ກວດ.
2. ເລືອກ email/password ຫຼື username adapter ທີ່ປອດໄພ. ຍັງບໍ່ສ້າງ Auth users.
3. ຢືນຢັນວ່າການແກ້ງົບແມ່ນປີທີ່ເລືອກ ຫຼືລາມໄປປີຕໍ່ໄປ. Draft ນີ້ແກ້ສະເພາະປີທີ່ເລືອກ.
4. Admin account/config/import backend ແລະ frontend adapter ຍັງເປັນແຜນ, ບໍ່ແມ່ນຟັງຊັນ production ທີ່ພ້ອມໃຊ້.
5. ຕ້ອງກວດ unsynced browser data, ງົບທີ່ຂາດມູນຄ່າ ແລະປະຫວັດນອກໄລຍະສັນຍາໂດຍບໍ່ລຶບຂໍ້ມູນ.

**ບໍ່ໄດ້ປ່ຽນ Supabase Database, GitHub main ຫຼື deployment.** ແອັບຈິງຍັງໃຊ້ GAS ຄືເກົ່າ. ສະຖານະ Draft PR ຈະຢູ່ໃນຄຳຕອບສົ່ງມອບພ້ອມລິ້ງ; ບໍ່ Merge.

Follow-up: ເພີ່ມ workflow tests 27 ຂໍ້, read-only workbook audit script, native concurrency runner ແລະ review-only CI. Native runner ຮັນບໍ່ໄດ້ໃນເຄື່ອງນີ້ເພາະ root-only, ແຕ່ CI ຜ່ານແລ້ວເທິງ PostgreSQL 17.11: SQL 163 assertions ແລະ native checks 9 ລາຍການ. ເບິ່ງ `docs/supabase-ci-results.md`. ບໍ່ໄດ້ປ່ຽນ migration schema ຫຼືໂຄດ frontend/GAS ໃນ follow-up ນີ້.
