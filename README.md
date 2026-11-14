# Bar Stock Control

แอปจัดการสต๊อกบาร์ / ร้านอาหาร: ขายรายวัน, ต้นทุนผูกกับสูตร (recipe-linked cost), Top Sales, Forecast,
การเคลื่อนไหวสต๊อก, Stock Card, ปิดงบรายเดือน และ export/import Excel
ทั้งหมดอยู่ในไฟล์เดียว (`index.html`) เปิดในเบราว์เซอร์ได้ทันที ไม่ต้องติดตั้งอะไรเพิ่ม

This is a single-file web app (`index.html`) plus a tiny local Node server that mirrors every save
into an Excel file. No build step, no runtime dependencies.

## ไฟล์ในโปรเจกต์

| ไฟล์ | หน้าที่ | ขึ้น GitHub |
|---|---|---|
| `index.html` | ตัวแอปทั้งหมด (UI, logic, คำนวณต้นทุน, export/import `.xlsx`, 2 ภาษา) | ✅ จำเป็น |
| `auto_excel_server.js` | local server (port `8765`) รับไฟล์ `.xlsx` จากหน้าเว็บแล้วเขียนทับ `Bar_Stock_Control_Auto.xlsx` | ✅ จำเป็น |
| `start_excel_sync.bat` | ดับเบิลคลิกเพื่อเปิดแอป + สตาร์ทเซิร์ฟเวอร์ (Windows) | ✅ จำเป็น |
| `.gitignore` | กันไฟล์ข้อมูล/ไฟล์สำรอง/ไฟล์ทดสอบไม่ให้ขึ้น repo | ✅ |
| `README.md` | ไฟล์นี้ | ✅ |
| `package.json` | มีไว้รันชุดทดสอบเท่านั้น (`devDependencies: playwright`) | ✅ (ไม่บังคับ) |
| `_verify_sale_window.js` | ชุดทดสอบ: เงื่อนไขการบันทึกย้อนหลังไม่เกิน 3 วัน | ออปชัน |
| `_verify_sale_save_flow.js` | ชุดทดสอบ: flow Add sale → Save → log | ออปชัน |
| `Bar_Stock_Control_Auto.xlsx` | **ข้อมูลจริง** ที่เซิร์ฟเวอร์เขียนทับอัตโนมัติ | ❌ อย่าขึ้น (อยู่ใน `.gitignore`) |
| `index.html.bak-*` | ไฟล์สำรองก่อนแก้แต่ละครั้ง | ❌ |
| `preview_*.png`, `_verify_*_result.json` | ผลลัพธ์ที่สคริปต์ทดสอบสร้างขึ้น | ❌ |
| `_patch_me.py` | สคริปต์ patch ครั้งเดียว (path ในเครื่อง) ไม่ได้ใช้แล้ว | ❌ |

## วิธีใช้

1. (เฉพาะ Excel auto-save) ติดตั้ง Node.js — https://nodejs.org
2. ดับเบิลคลิก **`start_excel_sync.bat`** → จะเปิด `index.html` และสตาร์ทเซิร์ฟเวอร์ที่พอร์ต 8765
   (หน้าต่างดำต้องเปิดค้างไว้ระหว่างใช้งาน)
3. หรือเปิด `index.html` ตรง ๆ ก็ได้ แอปทำงานครบทุกอย่าง แต่จะไม่ sync ลง Excel
4. ครั้งแรกต้องตั้งรหัส Admin และ Staff ของตัวเอง (ขั้นต่ำ 8 ตัวอักษร)

## ข้อมูลเก็บที่ไหน

- **localStorage** (`barStockControl.v1`) ในเบราว์เซอร์ = ข้อมูลหลักของแอป
- **`Bar_Stock_Control_Auto.xlsx`** = สำเนา Excel ที่เซิร์ฟเวอร์เขียนจากทุกครั้งที่กด Save
- แนะนำให้กด **Data / Backup → export** เก็บไฟล์สำรองไว้เป็นระยะ (localStorage ล้างได้ถ้าล้าง browser data)

## ชุดทดสอบ (ออปชัน)

```bash
npm install          # ติดตั้ง playwright (dev เท่านั้น)
npx playwright install chromium
npm test             # รัน _verify_sale_window.js + _verify_sale_save_flow.js
```

สคริปต์จะเปิด `index.html` ด้วย browser profile ใหม่ (localStorage ว่าง) จึงไม่แตะข้อมูลจริง
และเขียนผลลัพธ์เป็น `preview_*.png` / `_verify_*_result.json` (ถูก ignore ไว้แล้ว)

## หมายเหตุด้านความปลอดภัย

- รหัสผ่านเก็บเป็น SHA-256 hash ไม่เก็บ plain text ส่วนค่า default ใน `index.html` เป็นเพียงค่า bootstrap
  และแอปบังคับให้ตั้งรหัสใหม่ตอนใช้งานครั้งแรก
- `index.html` มีข้อมูล seed (เมนู, ราคา, ต้นทุนวัตถุดิบ) ของร้านอยู่ ถ้าไม่ต้องการเปิดเผย
  ให้ตั้ง repository เป็น **Private**
