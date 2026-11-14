/**
 * ตรวจสอบเงื่อนไข "พนักงานบันทึกยอดขาย/การเคลื่อนไหวสต็อกได้ไม่เกิน 3 วันนับจากปัจจุบัน"
 * (วันนี้ + ย้อนหลังอีก 2 วัน เช่น วันที่ 11 → บันทึกได้ 9, 10, 11) — ใช้กับ Daily Sales และ Internal Movement
 *
 * วิธีรัน: node _verify_sale_window.js   (ใช้ Playwright เปิดไฟล์ index.html ตรงๆ)
 * ไม่แตะข้อมูลจริงของผู้ใช้ เพราะรันบน browser profile ใหม่ (localStorage ว่าง)
 */
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const { pathToFileURL } = require('url');
const FILE_URL = pathToFileURL(path.join(__dirname, 'index.html')).href;
const OUT_JSON = path.join(__dirname, '_verify_sale_window_result.json');
const OUT_IMG = path.join(__dirname, 'preview_staff_sale_window.png');

let failed = 0;
function check(label, ok, detail) {
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? '  (' + detail + ')' : ''}`);
}

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1500, height: 950 }, deviceScaleFactor: 2 });
  const dialogs = [];
  page.on('dialog', async d => { dialogs.push(d.message()); await d.dismiss(); });

  await page.goto(FILE_URL, { waitUntil: 'load' });
  await page.waitForTimeout(1200);

  // ---------- 1) โหมดพนักงาน ----------
  await page.evaluate(() => { role = 'staff'; applyRole(); });

  const staff = await page.evaluate(() => {
    const el = document.getElementById('sDate');
    const mel = document.getElementById('mDate');
    const off = n => addDaysISO(todayISO(), n);
    return {
      today: todayISO(),
      saleMinISO: saleMinISO(),
      expectedMin: off(-2),
      inputMin: el.min,
      inputMax: el.max,
      hint: (document.getElementById('saleWindowHint') || {}).textContent || '',
      movMin: mel.min,
      movMax: mel.max,
      movHint: (document.getElementById('movWindowHint') || {}).textContent || '',
      window: { [-3]: saleDateInWindow(off(-3)), [-2]: saleDateInWindow(off(-2)), [-1]: saleDateInWindow(off(-1)), 0: saleDateInWindow(off(0)), 1: saleDateInWindow(off(1)) },
      okMinus2: staffDateOk(off(-2), SALE_ENTRY_WINDOW_DAYS),
      okMinus3: staffDateOk(off(-3), SALE_ENTRY_WINDOW_DAYS),
      okTomorrow: staffDateOk(off(1), SALE_ENTRY_WINDOW_DAYS),
      movOkMinus2: staffDateOk(off(-2), SALE_ENTRY_WINDOW_DAYS),
      movOkMinus3: staffDateOk(off(-3), SALE_ENTRY_WINDOW_DAYS)
    };
  });

  console.log('--- โหมดพนักงาน (staff) ---');
  console.log(`วันนี้ = ${staff.today} • ช่วงที่อนุญาต = ${staff.saleMinISO} .. ${staff.today}`);
  check('ช่อง Date ตั้ง min = today-2', staff.inputMin === staff.expectedMin, `${staff.inputMin} / คาด ${staff.expectedMin}`);
  check('ช่อง Date ตั้ง max = today', staff.inputMax === staff.today, staff.inputMax);
  check('แสดงข้อความบอกช่วงวันที่ให้พนักงาน', staff.hint.length > 0);
  check('today อยู่ในช่วง', staff.window[0] === true);
  check('today-1 อยู่ในช่วง', staff.window[-1] === true);
  check('today-2 อยู่ในช่วง (เช่น 11 → 9)', staff.window[-2] === true);
  check('today-3 หลุดช่วง', staff.window[-3] === false);
  check('วันพรุ่งนี้หลุดช่วง', staff.window[1] === false);
  check('staffDateOk(today-2) = true', staff.okMinus2 === true);
  check('staffDateOk(today-3) = false', staff.okMinus3 === false);
  check('staffDateOk(พรุ่งนี้) = false', staff.okTomorrow === false);
  check('ช่อง Date (movement) ตั้ง min = today-2', staff.movMin === staff.expectedMin, `${staff.movMin} / คาด ${staff.expectedMin}`);
  check('ช่อง Date (movement) ตั้ง max = today', staff.movMax === staff.today, staff.movMax);
  check('แสดงข้อความช่วงวันที่ (movement)', staff.movHint.length > 0);
  check('movement: staffDateOk(today-2) = true', staff.movOkMinus2 === true);
  check('movement: staffDateOk(today-3) = false', staff.movOkMinus3 === false);

  // ---------- 2) ทดสอบกดปุ่ม Add sale จริง ----------
  const addTest = await page.evaluate(() => {
    const el = document.getElementById('sDate');
    const item = S.items.length ? S.items[0].name : null;
    const before = S.sales.length;
    const beforePending = pendingSales.length;
    if (!item) return { skipped: true, before };
    // วันที่เก่าเกินกำหนด → ต้องไม่ถูกบันทึก (ไม่เข้า pending และไม่ลง S.sales)
    el.value = addDaysISO(todayISO(), -3);
    document.getElementById('sItem').value = item;
    document.getElementById('sQty').value = '1';
    document.getElementById('sAdd').click();
    const afterInvalid = S.sales.length;
    const afterInvalidPending = pendingSales.length;
    // วันที่อยู่ในช่วง → เข้า pending แล้วกด Save จึงลง S.sales
    el.value = addDaysISO(todayISO(), -2);
    document.getElementById('sItem').value = item;
    document.getElementById('sQty').value = '2';
    document.getElementById('sAdd').click();
    const afterValidPending = pendingSales.length;
    document.getElementById('sSave').click();
    const last = S.sales[S.sales.length - 1];
    return {
      item, before, beforePending, afterInvalid, afterInvalidPending, afterValidPending,
      afterValid: S.sales.length,
      expectedDate: addDaysISO(todayISO(), -2),
      addedDate: last ? last.date : null,
      addedQty: last ? last.qty : null
    };
  });

  console.log('\n--- ทดสอบบันทึกจริงผ่านปุ่ม Add sale + Save ---');
  if (addTest.skipped) {
    console.log('SKIP  ไม่มีรายการเมนูในไฟล์ข้อมูล');
  } else {
    check('วันที่ today-3 ถูกบล็อก (ไม่เข้า pending / ไม่ลง S.sales)',
      addTest.afterInvalid === addTest.before && addTest.afterInvalidPending === addTest.beforePending,
      `sales ${addTest.before}→${addTest.afterInvalid}, pending ${addTest.beforePending}→${addTest.afterInvalidPending}`);
    check('วันที่ today-2 เข้า pending', addTest.afterValidPending === addTest.beforePending + 1, String(addTest.afterValidPending));
    check('กด Save แล้วลง S.sales', addTest.afterValid === addTest.before + 1, `${addTest.afterInvalid} → ${addTest.afterValid}`);
    check('รายการที่บันทึกมีวันที่ถูกต้อง', addTest.addedDate === addTest.expectedDate, `${addTest.addedDate}`);
    check('มี alert แจ้งเงื่อนไขให้พนักงาน', dialogs.some(m => /last 3 days|ย้อนหลัง 3 วัน/.test(m)), dialogs[dialogs.length - 1] || '');
  }

  // ---------- 2b) ทดสอบกดปุ่ม Add movement จริง ----------
  const movTest = await page.evaluate(() => {
    const el = document.getElementById('mDate');
    const ing = S.ingredients.length ? S.ingredients[0].name : null;
    if (!ing) return { skipped: true };
    const before = S.movements.length;
    el.value = addDaysISO(todayISO(), -3);
    document.getElementById('mIng').value = ing;
    document.getElementById('mP').value = '1';
    document.getElementById('mAdd').click();
    const afterInvalid = S.movements.length;
    el.value = addDaysISO(todayISO(), -2);
    document.getElementById('mIng').value = ing;
    document.getElementById('mP').value = '2';
    document.getElementById('mAdd').click();
    const last = S.movements[S.movements.length - 1];
    return {
      before, afterInvalid, afterValid: S.movements.length,
      expectedDate: addDaysISO(todayISO(), -2),
      addedDate: last ? last.date : null,
      addedQty: last ? last.purchase : null
    };
  });

  console.log('\n--- ทดสอบบันทึกจริงผ่านปุ่ม Add movement ---');
  if (movTest.skipped) {
    console.log('SKIP  ไม่มีวัตถุดิบในไฟล์ข้อมูล');
  } else {
    check('movement today-3 ถูกบล็อก (จำนวนไม่เพิ่ม)', movTest.afterInvalid === movTest.before, `${movTest.before} → ${movTest.afterInvalid}`);
    check('movement today-2 บันทึกได้', movTest.afterValid === movTest.before + 1, `${movTest.afterInvalid} → ${movTest.afterValid}`);
    check('movement ที่บันทึกมีวันที่ถูกต้อง', movTest.addedDate === movTest.expectedDate, `${movTest.addedDate}`);
    check('มี alert แจ้งเงื่อนไข movement', dialogs.some(m => /stock movements|การเคลื่อนไหวสต็อก/.test(m)), dialogs[dialogs.length - 1] || '');
  }

  // ---------- 3) โหมดแอดมินต้องไม่ถูกจำกัด ----------
  await page.evaluate(() => { role = 'admin'; applyRole(); });
  const admin = await page.evaluate(() => {
    const el = document.getElementById('sDate');
    const mel = document.getElementById('mDate');
    return {
      min: el.min, max: el.max,
      hintHidden: (document.getElementById('saleWindowHint').style.display === 'none'),
      movMin: mel.min, movMax: mel.max,
      movHintHidden: (document.getElementById('movWindowHint').style.display === 'none')
    };
  });
  console.log('\n--- โหมดแอดมิน (admin) ---');
  check('ไม่มี min/max จำกัด (sales)', admin.min === '' && admin.max === '', `min="${admin.min}" max="${admin.max}"`);
  check('ซ่อนข้อความช่วงวันที่ของพนักงาน (sales)', admin.hintHidden === true);
  check('ไม่มี min/max จำกัด (movement)', admin.movMin === '' && admin.movMax === '', `min="${admin.movMin}" max="${admin.movMax}"`);
  check('ซ่อนข้อความช่วงวันที่ของพนักงาน (movement)', admin.movHintHidden === true);

  // ---------- 4) ภาพหน้าจอ (โหมดพนักงาน) ----------
  await page.evaluate(() => {
    role = 'staff'; applyRole();
    document.querySelectorAll('.view').forEach(v => v.classList.remove('on'));
    const sec = document.getElementById('sec-sales');
    if (sec) sec.classList.add('on');
    const btn = document.querySelector('#tabs button[data-tab="sales"]');
    if (btn) { document.querySelectorAll('#tabs button').forEach(b => b.classList.remove('on')); btn.classList.add('on'); }
    document.getElementById('adminModalBg').classList.remove('active');
    document.body.classList.remove('login-screen', 'force-pw', 'locked');
    renderAll();
  });
  await page.waitForTimeout(600);
  const card = await page.$('#sec-sales .card');
  if (card) await card.screenshot({ path: OUT_IMG });

  fs.writeFileSync(OUT_JSON, JSON.stringify({ staff, addTest, movTest, admin, dialogs }, null, 2), 'utf8');
  await browser.close();
  console.log(`\nสรุป: ${failed === 0 ? 'เงื่อนไข 3 วันทำงานถูกต้อง (staff) และ admin ไม่ถูกจำกัด' : failed + ' รายการไม่ผ่าน'}`);
  process.exit(failed === 0 ? 0 : 1);
})();
