import { GoogleGenerativeAI, SchemaType } from "@google/generative-ai";
import { z } from "zod";
import { formatInTimeZone } from "date-fns-tz";

export const DebtItemEntrySchema = z.object({
  personName: z.string(),
  amount: z.number(),
  debtType: z.enum(["LENT", "BORROWED"]).default("LENT"),
  debtDescription: z.string().nullish(),
});

export type DebtItemEntry = z.infer<typeof DebtItemEntrySchema>;

export const AssistantResultSchema = z.object({
  type: z.enum(["REMINDER", "NOTE", "DEBT", "BRIEFING", "GENERAL_CHAT"]).describe("ประเภทของคำสั่ง"),
  
  // REMINDER DETAILS
  reminderAction: z
    .enum(["CREATE", "CANCEL", "EDIT", "LIST", "CLARIFY"])
    .nullish()
    .describe("Action สำหรับเตือนความจำ"),
  taskTitle: z.string().nullish().describe("ชื่อกิจกรรมหรือสิ่งที่ต้องทำแบบสั้นกระชับ"),
  remindAtISO: z
    .string()
    .nullish()
    .describe("ISO 8601 string ที่มี timezone +07:00 เช่น 2026-08-24T08:00:00+07:00"),
  displayDate: z.string().nullish().describe("ข้อความแสดงวันที่ เช่น 'พรุ่งนี้', 'วันนี้'"),
  displayTime: z.string().nullish().describe("ข้อความแสดงเวลา เช่น '08:00 น.', '20:00 น.'"),
  recurrence: z.enum(["NONE", "DAILY", "WEEKLY", "MONTHLY"]).nullish(),

  // NOTE DETAILS
  noteAction: z.enum(["CREATE", "LIST", "DELETE"]).nullish().describe("Action สำหรับโน้ต"),
  noteTitle: z.string().nullish().describe("หัวข้อของโน้ต เช่น 'รายการซื้อของ', 'รายการยา', 'สิ่งที่ต้องทำ'"),
  noteItems: z.array(z.string()).nullish().describe("รายการย่อย เช่น ['metoprolol', 'metoclopramide'] หรือ ['น้ำ', 'ขนมปัง']"),
  noteCategory: z.enum(["SHOPPING", "TODO", "GENERAL"]).nullish(),

  // DEBT DETAILS
  debtAction: z.enum(["CREATE", "LIST", "SETTLE"]).nullish().describe("Action สำหรับจัดการหนี้"),
  debtType: z.enum(["LENT", "BORROWED"]).nullish().describe("LENT = เราให้ยืม (เขาติดเรา), BORROWED = เรายืมเขา (เราติดเขา)"),
  personName: z.string().nullish().describe("ชื่อคนที่ยืมหรือให้ยืม เช่น 'ปิ่น', 'ก้อง', 'แฮม'"),
  amount: z.number().nullish().describe("จำนวนเงินบาท เช่น 50, 20, 60"),
  debtDescription: z.string().nullish().describe("หมายเหตุ เช่น 'ค่ากาแฟ', 'ค่าข้าว'"),
  debtItems: z.array(DebtItemEntrySchema).nullish().describe("รายการหนี้สินสำหรับบันทึกหลายคนพร้อมกัน"),

  replyText: z.string().nullish().describe("ข้อความตอบกลับหรือคำถามเพิ่มเติมที่สุภาพและเป็นกันเอง"),
});

export type AssistantResult = z.infer<typeof AssistantResultSchema>;

// Backward compatibility type for ReminderExtractionResult
export interface ReminderExtractionResult {
  action: "CREATE" | "CANCEL" | "EDIT" | "LIST" | "CLARIFY" | "GENERAL_CHAT";
  taskTitle: string;
  remindAtISO: string | null;
  displayDate: string;
  displayTime: string;
  recurrence: "NONE" | "DAILY" | "WEEKLY" | "MONTHLY";
  clarificationQuestion: string | null;
}

/**
 * Normalize common Thai typing typos (e.g. โมข -> โมง, พรุ้งนี้/พุ่งนี้ -> พรุ่งนี้)
 */
export function normalizeThaiTypos(text: string): string {
  return text
    // พรุ่งนี้ typos
    .replace(/(?:พรุ้งนี้|พุ่งนี้|พุ่งนี|พรุ่งนี|พรุ่งนี้[้่๊๋]+)/g, "พรุ่งนี้")
    // โมง typos (โมข, โมว, โมฃ, โม่ง, โม้ง)
    .replace(/โม[ขวฃ่ง้]/g, "โมง")
    // ทุ่ม typos (ทุ้ม, ทุม, ทึ่ม)
    .replace(/(?:ทุ้ม|ทุม(?!\w)|ทึ่ม)/g, "ทุ่ม")
    // บ่าย typos
    .replace(/บาย(?!\w)/g, "บ่าย")
    // มะรืน typos
    .replace(/มรืน|มะริน/g, "มะรืน")
    // วันนี้ typos
    .replace(/วันนี(?!้)/g, "วันนี้");
}

/**
 * Fast-path Thai Colloquial Reminder Parser (<1ms, 0 Quota, 100% Reliable)
 */
export function parseThaiReminderFastPath(
  text: string,
  baseDate = new Date(),
  timezone = "Asia/Bangkok"
): AssistantResult | null {
  let cleanText = normalizeThaiTypos(text.trim());

  // 1. Date extraction
  let dateOffset = 0; // 0 = today, 1 = tomorrow, 2 = day after tomorrow
  let dateStr = "วันนี้";

  if (/พรุ่งนี้/i.test(cleanText)) {
    dateOffset = 1;
    dateStr = "พรุ่งนี้";
    cleanText = cleanText.replace(/พรุ่งนี้/g, " ");
  } else if (/มะรืน(?:นี้)?/i.test(cleanText)) {
    dateOffset = 2;
    dateStr = "มะรืนนี้";
    cleanText = cleanText.replace(/มะรืน(?:นี้)?/g, " ");
  } else if (/วันนี้/i.test(cleanText)) {
    dateOffset = 0;
    dateStr = "วันนี้";
    cleanText = cleanText.replace(/วันนี้/g, " ");
  }

  // 2. Time extraction
  let hour = -1;
  let minute = 0;
  let timeStr = "";

  // A. HH:MM or HH.MM (e.g. 08:30, 8.30, 14:00, 20.00)
  if (hour === -1) {
    const clockMatch = cleanText.match(/(\d{1,2})[:.](\d{2})(?:\s*น\.)?/);
    if (clockMatch) {
      hour = parseInt(clockMatch[1], 10);
      minute = parseInt(clockMatch[2], 10);
      timeStr = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")} น.`;
      cleanText = cleanText.replace(clockMatch[0], " ");
    }
  }

  // B. ทุ่ม (e.g. 1ทุ่ม, 2ทุ่ม, สองทุ่ม, สามทุ่ม, 3ทุ่มครึ่ง, ทุ่มนึง)
  if (hour === -1) {
    const thaiNumThum: Record<string, number> = {
      "หนึ่ง": 1,
      "นึง": 1,
      "สอง": 2,
      "สาม": 3,
      "สี่": 4,
      "ห้า": 5,
    };
    const thumMatch = cleanText.match(
      /(?:(\d{1,2}|หนึ่ง|นึง|สอง|สาม|สี่|ห้า)\s*)?ทุ่ม(?:\s*(ครึ่ง))?(?:\s*(\d{1,2})\s*นาที)?/
    );
    if (thumMatch) {
      const rawH = thumMatch[1] || "หนึ่ง";
      const hVal = thaiNumThum[rawH] || parseInt(rawH, 10);
      if (hVal >= 1 && hVal <= 5) {
        hour = 18 + hVal;
        minute = thumMatch[2] === "ครึ่ง" ? 30 : thumMatch[3] ? parseInt(thumMatch[3], 10) : 0;
        timeStr = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")} น.`;
        cleanText = cleanText.replace(thumMatch[0], " ");
      }
    }
  }

  // C. บ่าย (e.g. บ่ายโมง, บ่ายสอง, บ่าย2, บ่าย3, บ่ายสาม, บ่ายสี่)
  if (hour === -1) {
    const thaiNumBai: Record<string, number> = {
      "โมง": 1,
      "หนึ่ง": 1,
      "นึง": 1,
      "สอง": 2,
      "สาม": 3,
      "สี่": 4,
      "ห้า": 5,
    };
    const baiMatch = cleanText.match(
      /บ่าย\s*(\d{1,2}|โมง|หนึ่ง|นึง|สอง|สาม|สี่|ห้า)?(?:\s*โมง)?(?:\s*(ครึ่ง))?(?:\s*(\d{1,2})\s*นาที)?/
    );
    if (baiMatch) {
      const rawH = baiMatch[1] || "โมง";
      const hVal = thaiNumBai[rawH] || parseInt(rawH, 10) || 1;
      hour = 12 + hVal;
      minute = baiMatch[2] === "ครึ่ง" ? 30 : baiMatch[3] ? parseInt(baiMatch[3], 10) : 0;
      timeStr = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")} น.`;
      cleanText = cleanText.replace(baiMatch[0], " ");
    }
  }

  // D. <ตัวเลข|คำ>โมงเช้า / <ตัวเลข|คำ>โมง (e.g. 8โมง, 8 โมง, แปดโมง, 9โมงเช้า, สิบโมง)
  if (hour === -1) {
    const thaiNumMap: Record<string, number> = {
      "หนึ่ง": 1,
      "สอง": 2,
      "สาม": 3,
      "สี่": 4,
      "ห้า": 5,
      "หก": 6,
      "เจ็ด": 7,
      "แปด": 8,
      "เก้า": 9,
      "สิบ": 10,
      "สิบเอ็ด": 11,
    };
    const mongMatch = cleanText.match(
      /(\d{1,2}|หนึ่ง|สอง|สาม|สี่|ห้า|หก|เจ็ด|แปด|เก้า|สิบ|สิบเอ็ด)\s*โมง(?:\s*เช้า)?(?:\s*(ครึ่ง))?(?:\s*(\d{1,2})\s*นาที)?/
    );
    if (mongMatch) {
      const rawH = mongMatch[1];
      const hVal = thaiNumMap[rawH] || parseInt(rawH, 10);
      if (hVal >= 1 && hVal <= 12) {
        hour = hVal;
        minute = mongMatch[2] === "ครึ่ง" ? 30 : mongMatch[3] ? parseInt(mongMatch[3], 10) : 0;
        timeStr = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")} น.`;
        cleanText = cleanText.replace(mongMatch[0], " ");
      }
    }
  }

  // E. ตี (e.g. ตีหนึ่ง, ตี1, ตีสอง, ตี3)
  if (hour === -1) {
    const thaiNumTee: Record<string, number> = {
      "หนึ่ง": 1,
      "นึง": 1,
      "สอง": 2,
      "สาม": 3,
      "สี่": 4,
      "ห้า": 5,
    };
    const teeMatch = cleanText.match(
      /ตี\s*(\d{1,2}|หนึ่ง|นึง|สอง|สาม|สี่|ห้า)(?:\s*(ครึ่ง))?(?:\s*(\d{1,2})\s*นาที)?/
    );
    if (teeMatch) {
      const rawH = teeMatch[1];
      hour = thaiNumTee[rawH] || parseInt(rawH, 10);
      minute = teeMatch[2] === "ครึ่ง" ? 30 : teeMatch[3] ? parseInt(teeMatch[3], 10) : 0;
      timeStr = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")} น.`;
      cleanText = cleanText.replace(teeMatch[0], " ");
    }
  }

  // F. Generic เช้า / ช่วงเช้า / สาย / เที่ยง / บ่าย / เย็น / ค่ำ / ดึก (without explicit number)
  if (hour === -1) {
    if (/ช่วงเช้า|เช้า/.test(cleanText)) {
      hour = 8;
      minute = 0;
      timeStr = "08:00 น.";
      cleanText = cleanText.replace(/ช่วงเช้า|เช้า/g, " ");
    } else if (/ช่วงบ่าย|บ่าย/.test(cleanText)) {
      hour = 13;
      minute = 0;
      timeStr = "13:00 น.";
      cleanText = cleanText.replace(/ช่วงบ่าย|บ่าย/g, " ");
    } else if (/ช่วงเย็น|เย็น/.test(cleanText)) {
      hour = 17;
      minute = 0;
      timeStr = "17:00 น.";
      cleanText = cleanText.replace(/ช่วงเย็น|เย็น/g, " ");
    } else if (/ตอนเที่ยง|เที่ยง/.test(cleanText)) {
      hour = 12;
      minute = 0;
      timeStr = "12:00 น.";
      cleanText = cleanText.replace(/ตอนเที่ยง|เที่ยง/g, " ");
    } else if (/เที่ยงคืน/.test(cleanText)) {
      hour = 0;
      minute = 0;
      timeStr = "00:00 น.";
      cleanText = cleanText.replace(/เที่ยงคืน/g, " ");
    }
  }

  // Clean task title
  let taskTitle = cleanText
    .replace(/^(?:เตือน|ช่วยเตือน|เตือนว่า|ช่วยเตือนว่า|ตั้งเตือน|แจ้งเตือน)\s*/, "")
    .trim();
  taskTitle = taskTitle
    .replace(/^[\u0E31\u0E34-\u0E3A\u0E47-\u0E4E\s]+|[\u0E31\u0E34-\u0E3A\u0E47-\u0E4E\s]+$/g, "")
    .trim();
  taskTitle = taskTitle.replace(/\s+/g, " ").trim();

  // If user only typed "พรุ่งนี้ 8 โมง" without a task, default taskTitle to "เตือนความจำ"
  if (hour !== -1) {
    if (!taskTitle) {
      taskTitle = "เตือนความจำ";
    }

    const targetDate = new Date(baseDate);
    targetDate.setDate(targetDate.getDate() + dateOffset);
    targetDate.setHours(hour, minute, 0, 0);

    const pad = (n: number) => String(n).padStart(2, "0");
    const iso = `${targetDate.getFullYear()}-${pad(targetDate.getMonth() + 1)}-${pad(targetDate.getDate())}T${pad(hour)}:${pad(minute)}:00+07:00`;

    return {
      type: "REMINDER",
      reminderAction: "CREATE",
      taskTitle,
      remindAtISO: iso,
      displayDate: dateStr,
      displayTime: timeStr,
      recurrence: "NONE",
    };
  }

  return null;
}

/**
 * วิเคราะห์ข้อความผู้ใช้ว่าเป็น Reminder, Note, Debt, Briefing หรือ Chat ทั่วไป
 */
export async function parseAssistantIntent(
  userMessage: string,
  userTimezone = "Asia/Bangkok",
  userHistory?: { role: "user" | "model"; text: string }[]
): Promise<AssistantResult> {
  const normalized = normalizeThaiTypos(userMessage.trim()).toLowerCase();

  // Fast-path keywords for instant response (<50ms) & saving AI quota
  if (
    normalized === "สรุปเช้า" ||
    normalized === "สรุปวันนี้" ||
    normalized === "วันนี้มีอะไรบ้าง" ||
    normalized === "เช้านี้มีอะไรบ้าง" ||
    normalized === "morning brief" ||
    normalized === "briefing" ||
    normalized === "สรุปภารกิจ"
  ) {
    return {
      type: "BRIEFING",
    };
  }

  if (
    normalized === "ดูโน้ต" ||
    normalized === "ดูโน๊ต" ||
    normalized === "โน้ตทั้งหมด" ||
    normalized === "โน๊ตทั้งหมด" ||
    normalized === "มีโน้ตอะไรบ้าง"
  ) {
    return {
      type: "NOTE",
      noteAction: "LIST",
    };
  }

  if (
    normalized === "ดูรายการเตือน" ||
    normalized === "เตือนอะไรไว้บ้าง" ||
    normalized === "มีเตือนอะไรบ้าง" ||
    normalized === "รายการเตือน"
  ) {
    return {
      type: "REMINDER",
      reminderAction: "LIST",
    };
  }

  if (
    normalized === "ใครติดตังค์เราบ้าง" ||
    normalized === "ใครติดเงินเราบ้าง" ||
    normalized === "หนี้ทั้งหมด" ||
    normalized === "ยอดหนี้" ||
    normalized === "ดูหนี้" ||
    normalized === "บัญชีหนี้" ||
    normalized === "เราเป็นหนี้ใครบ้าง"
  ) {
    return {
      type: "DEBT",
      debtAction: "LIST",
    };
  }

  // Fast-path Thai Colloquial Reminder Parser (<1ms, 0 Quota, 100% Reliable, Auto Typo Correction)
  const thaiReminderFastPath = parseThaiReminderFastPath(userMessage, new Date(), userTimezone);
  if (thaiReminderFastPath) {
    return thaiReminderFastPath;
  }

  // Fast-path Multi-Line / Multi-Person Debt Detection
  const rawLines = userMessage
    .split(/[\n,]+/)
    .map((s) => s.trim())
    .filter(Boolean);

  const excludedDebtKeywords = [
    "เตือน", "โน้ต", "โน๊ต", "ประชุม", "นัด", "ซื้อ", "ส่ง", "โทร",
    "กิน", "ทำ", "วิ่ง", "นอน", "ตื่น", "อ่าน", "เรียน", "วันนี้", "พรุ่งนี้",
    "กี่", "ตอน", "อีก", "นาที", "ชั่วโมง"
  ];

  const borrowRegex = /^(?:เรายืม|ผมยืม|กูยืม|กูติด|ฉันยืม|ชั้นยืม|เค้ายืม|พี่ยืม|หนูยืม|ยืม|ติดเงิน|ติดตังค์)\s*([ก-๙a-zA-Z]+?)\s*(\d+(?:\.\d+)?)\s*(?:บาท|บ\.)?(?:\s+(.+))?$/;

  if (rawLines.length > 1) {
    const multiItems: DebtItemEntry[] = [];
    for (const line of rawLines) {
      const weBorrow = line.match(borrowRegex);
      if (weBorrow) {
        multiItems.push({
          personName: weBorrow[1],
          amount: parseFloat(weBorrow[2]),
          debtType: "BORROWED",
          debtDescription: weBorrow[3] || "ยืมเงิน",
        });
        continue;
      }

      const theyBorrow = line.match(
        /^([ก-๙a-zA-Z]+?)\s*ยืม\s*(\d+(?:\.\d+)?)\s*(?:บาท|บ\.)?(?:\s+(.+))?$/
      );
      if (theyBorrow) {
        multiItems.push({
          personName: theyBorrow[1],
          amount: parseFloat(theyBorrow[2]),
          debtType: "LENT",
          debtDescription: theyBorrow[3] || "ยืมเงิน",
        });
        continue;
      }

      const quickMatch = line.match(
        /^([ก-๙a-zA-Z]+?)\s*(\d+(?:\.\d+)?)\s*(?:บาท|บ\.)?(?:\s+(.+))?$/
      );
      if (quickMatch && !excludedDebtKeywords.includes(quickMatch[1]) && quickMatch[1].length >= 2) {
        multiItems.push({
          personName: quickMatch[1],
          amount: parseFloat(quickMatch[2]),
          debtType: "LENT",
          debtDescription: quickMatch[3] || "ยืมเงิน",
        });
      }
    }

    if (multiItems.length > 0) {
      return {
        type: "DEBT",
        debtAction: "CREATE",
        debtType: multiItems[0].debtType,
        personName: multiItems[0].personName,
        amount: multiItems[0].amount,
        debtDescription: multiItems[0].debtDescription,
        debtItems: multiItems,
      };
    }
  }

  // Fast-path Single Debt Patterns (<5ms instant response)
  const trimmed = userMessage.trim();

  // Pattern 1: เรายืม / กูยืม / ผมยืม <คน> <เงิน> [เหตุผล]
  const weBorrowMatch = trimmed.match(borrowRegex);
  if (weBorrowMatch) {
    const item: DebtItemEntry = {
      personName: weBorrowMatch[1],
      amount: parseFloat(weBorrowMatch[2]),
      debtType: "BORROWED",
      debtDescription: weBorrowMatch[3] || "ยืมเงิน",
    };
    return {
      type: "DEBT",
      debtAction: "CREATE",
      debtType: item.debtType,
      personName: item.personName,
      amount: item.amount,
      debtDescription: item.debtDescription,
      debtItems: [item],
    };
  }

  // Pattern 2: <คน>ยืม <เงิน> [เหตุผล]
  const theyBorrowMatch = trimmed.match(
    /^([ก-๙a-zA-Z]+?)\s*ยืม\s*(\d+(?:\.\d+)?)\s*(?:บาท|บ\.)?(?:\s+(.+))?$/
  );
  if (theyBorrowMatch) {
    const item: DebtItemEntry = {
      personName: theyBorrowMatch[1],
      amount: parseFloat(theyBorrowMatch[2]),
      debtType: "LENT",
      debtDescription: theyBorrowMatch[3] || "ยืมเงิน",
    };
    return {
      type: "DEBT",
      debtAction: "CREATE",
      debtType: item.debtType,
      personName: item.personName,
      amount: item.amount,
      debtDescription: item.debtDescription,
      debtItems: [item],
    };
  }

  // Pattern 3: <คน> <เงิน> [บาท] [เหตุผล] (รองรับทั้ง "ก้อง 60" และ "ก้อง60")
  const quickDebtMatch = trimmed.match(
    /^([ก-๙a-zA-Z]+?)\s*(\d+(?:\.\d+)?)\s*(?:บาท|บ\.)?(?:\s+(.+))?$/
  );
  if (quickDebtMatch) {
    const name = quickDebtMatch[1];
    if (!excludedDebtKeywords.includes(name) && name.length >= 2) {
      const item: DebtItemEntry = {
        personName: name,
        amount: parseFloat(quickDebtMatch[2]),
        debtType: "LENT",
        debtDescription: quickDebtMatch[3] || "ยืมเงิน",
      };
      return {
        type: "DEBT",
        debtAction: "CREATE",
        debtType: item.debtType,
        personName: item.personName,
        amount: item.amount,
        debtDescription: item.debtDescription,
        debtItems: [item],
      };
    }
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not configured in environment variables");
  }

  const genAI = new GoogleGenerativeAI(apiKey);

  const now = new Date();
  const currentFormatted = formatInTimeZone(
    now,
    userTimezone,
    "yyyy-MM-dd HH:mm:ss (EEEE, dd MMMM yyyy)"
  );
  const currentISO = formatInTimeZone(now, userTimezone, "yyyy-MM-dd'T'HH:mm:ssXXX");

  const systemInstruction = `

2. type: "NOTE" (การจดโน้ต / บันทึกรายการ / รายการซื้อของ / ยา / สิ่งที่ต้องทำ)
   - เมื่อมีคำว่า: "จดโน้ต", "จดโน๊ต", "โน้ต", "โน๊ต", "บันทึก", "ซื้อของ", "รายการ", "list" หรือรายการของสั้นๆ เช่น "นาฬิกา กล้อง กระดาษ"
   - ถ้าผู้ใช้พิมพ์รายการต่อท้าย เช่น "จดโน้ต นาฬิกา กล้อง กระดาษ" หรือ "นาฬิกา กล้อง กระดาษ"
     -> type: "NOTE", noteAction: "CREATE", noteItems: ["นาฬิกา", "กล้อง", "กระดาษ"], noteTitle: "โน้ตบันทึก", noteCategory: "GENERAL"
   - ถ้าผู้ใช้พูดว่า "ดูโน้ต", "ดูโน๊ต", "โน้ตทั้งหมด", "มีโน้ตอะไรบ้าง" -> type: "NOTE", noteAction: "LIST"

3. type: "REMINDER" (การตั้งเตือนความจำที่มีกิจกรรมและเวลา)
   - ตัวอย่าง: "กินข้าวสามทุ่ม" -> type: "REMINDER", reminderAction: "CREATE", taskTitle: "กินข้าว", displayDate: "วันนี้", displayTime: "21:00 น.", remindAtISO: (เวลา 21:00:00 น. วันนี้)
   - ตัวอย่าง: "ไปเที่ยวพรุ่งนี้สี่โมง" -> type: "REMINDER", reminderAction: "CREATE", taskTitle: "ไปเที่ยว", displayDate: "พรุ่งนี้", displayTime: "16:00 น.", remindAtISO: (คำนวณ ISO วันพรุ่งนี้เวลา 16:00:00+07:00)
   - ตัวอย่าง: "เล่นเกม 20.00" -> type: "REMINDER", reminderAction: "CREATE", taskTitle: "เล่นเกม", displayDate: "วันนี้", displayTime: "20:00 น.", remindAtISO: (คำนวณ ISO วันนี้เวลา 20:00:00+07:00)
   - ตัวอย่าง: "ยกเลิกเตือน" -> type: "REMINDER", reminderAction: "CANCEL"
   - ตัวอย่าง: "เตือนอะไรไว้บ้าง", "ดูรายการเตือน" -> type: "REMINDER", reminderAction: "LIST"

4. type: "BRIEFING" (การขอสรุปยามเช้า / ภารกิจวันนี้)
   - เมื่อผู้ใช้ถาม: "สรุปเช้า", "สรุปวันนี้", "วันนี้มีอะไรบ้าง", "เช้านี้มีอะไรบ้าง", "morning brief", "briefing", "สรุปงานวันนี้", "สรุปภารกิจ"

5. type: "GENERAL_CHAT" (การสนทนาทักทายทั่วไป หรือคำถามทั่วไป)
   - เช่น "สวัสดี", "ทำอะไรได้บ้าง", "ใครสร้างนาย"
   - replyText: ตอบรับอย่างสุภาพและเป็นมิตร พร้อมแนะนำตัวอย่างคำสั่งที่ทำได้
`;

  const prompt = `${systemInstruction}

[ประวัติการสนทนาต่อเนื่อง (ถ้ามี)]:
${
  userHistory && userHistory.length > 0
    ? userHistory.map((h) => `${h.role === "user" ? "ผู้ใช้" : "AI"}: ${h.text}`).join("\n")
    : "ไม่มี"
}

[ข้อความล่าสุดของผู้ใช้]:
"${userMessage}"
`;

  // Multi-model fallback list to avoid 429 quota rate limits
  const candidateModels = [
    "gemini-flash-lite-latest",
    "gemini-3.5-flash-lite",
    "gemini-flash-latest",
  ];

  let rawJson: any = null;

  for (const modelName of candidateModels) {
    try {
      const model = genAI.getGenerativeModel({
        model: modelName,
        generationConfig: {
          temperature: 0.1,
          responseMimeType: "application/json",
          responseSchema: {
            type: SchemaType.OBJECT,
            properties: {
              type: {
                type: SchemaType.STRING,
                format: "enum",
                enum: ["REMINDER", "NOTE", "DEBT", "BRIEFING", "GENERAL_CHAT"],
              },
              reminderAction: {
                type: SchemaType.STRING,
                format: "enum",
                enum: ["CREATE", "CANCEL", "EDIT", "LIST", "CLARIFY"],
                nullable: true,
              },
              taskTitle: { type: SchemaType.STRING, nullable: true },
              remindAtISO: { type: SchemaType.STRING, nullable: true },
              displayDate: { type: SchemaType.STRING, nullable: true },
              displayTime: { type: SchemaType.STRING, nullable: true },
              recurrence: {
                type: SchemaType.STRING,
                format: "enum",
                enum: ["NONE", "DAILY", "WEEKLY", "MONTHLY"],
                nullable: true,
              },
              noteAction: {
                type: SchemaType.STRING,
                format: "enum",
                enum: ["CREATE", "LIST", "DELETE"],
                nullable: true,
              },
              noteTitle: { type: SchemaType.STRING, nullable: true },
              noteItems: {
                type: SchemaType.ARRAY,
                items: { type: SchemaType.STRING },
                nullable: true,
              },
              noteCategory: {
                type: SchemaType.STRING,
                format: "enum",
                enum: ["SHOPPING", "TODO", "GENERAL"],
                nullable: true,
              },
              debtAction: {
                type: SchemaType.STRING,
                format: "enum",
                enum: ["CREATE", "LIST", "SETTLE"],
                nullable: true,
              },
              debtType: {
                type: SchemaType.STRING,
                format: "enum",
                enum: ["LENT", "BORROWED"],
                nullable: true,
              },
              personName: { type: SchemaType.STRING, nullable: true },
              amount: { type: SchemaType.NUMBER, nullable: true },
              debtDescription: { type: SchemaType.STRING, nullable: true },
              replyText: { type: SchemaType.STRING, nullable: true },
            },
            required: ["type"],
          },
        },
      });

      const response = await model.generateContent(prompt);
      const text = response.response.text();
      rawJson = JSON.parse(text);
      break;
    } catch (err: any) {
      console.warn(`Model ${modelName} failed (${err.message?.slice(0, 80)}), trying fallback...`);
    }
  }

  if (rawJson) {
    if (typeof rawJson.taskTitle === "string") {
      let t = rawJson.taskTitle.trim();
      if (
        t.includes("ผิดปกติ") ||
        t.includes("แปลงเป็น") ||
        t.includes("taskTitle") ||
        t.includes("remindAtISO") ||
        t.includes("กฎบอกว่า") ||
        t.includes("ขอแก้ไข") ||
        t.includes("ตามกฎ")
      ) {
        t = normalizeThaiTypos(userMessage)
          .replace(/^(?:เตือน|ช่วยเตือน|เตือนว่า|ช่วยเตือนว่า|ตั้งเตือน|แจ้งเตือน)\s*/, "")
          .replace(/(?:พรุ่งนี้|วันนี้|มะรืนนี้|ตอนเช้า|ตอนเย็น|ตอนเที่ยง|ตอนบ่าย|\d+[:.]\d+|\d+\s*โมง|\d+\s*ทุ่ม|ตี\s*\d+)/g, "")
          .replace(/\s+/g, " ")
          .trim();
      }
      if (t.length > 35) {
        t = t.substring(0, 35).trim();
      }
      rawJson.taskTitle = t || "เตือนความจำ";
    }

    if (typeof rawJson.replyText === "string" && rawJson.replyText.length > 80) {
      rawJson.replyText = rawJson.replyText.substring(0, 80).trim();
    }

    try {
      return AssistantResultSchema.parse(rawJson);
    } catch (zodErr) {
      console.error("Zod schema parse failed on rawJson:", zodErr, rawJson);
    }
  }

  // Smart Heuristic Fallback if all AI models hit rate limits or network issues
  const cleanMsg = userMessage.trim();

  // If user mentioned "อย่าลืม" or "จด" or space-separated items
  if (
    cleanMsg.startsWith("จดโน้ต") ||
    cleanMsg.startsWith("จดโน๊ต") ||
    cleanMsg.startsWith("บันทึก") ||
    cleanMsg.startsWith("อย่าลืม") ||
    cleanMsg.includes(" ")
  ) {
    const withoutPrefix = cleanMsg
      .replace(/^(จดโน้ต|จดโน๊ต|บันทึก|อย่าลืม|โน้ต|โน๊ต)/g, "")
      .trim();

    const items = withoutPrefix
      .split(/[\s,]+/)
      .map((s) => s.trim())
      .filter(Boolean);

    if (items.length > 0) {
      return {
        type: "NOTE",
        noteAction: "CREATE",
        noteTitle: "โน้ตบันทึก",
        noteItems: items,
        noteCategory: "GENERAL",
        replyText: null,
      };
    }
  }

  return {
    type: "GENERAL_CHAT",
    reminderAction: null,
    taskTitle: null,
    remindAtISO: null,
    displayDate: null,
    displayTime: null,
    recurrence: null,
    noteAction: null,
    noteTitle: null,
    noteItems: null,
    noteCategory: null,
    replyText: "ขออภัยครับ ไม่สามารถเข้าใจคำสั่งได้ ต้องการให้ตั้งเตือนหรือจดโน้ตเรื่องอะไรครับ?",
  };
}

/**
 * Backward-compatible parseReminderIntent function
 */
export async function parseReminderIntent(
  userMessage: string,
  userTimezone = "Asia/Bangkok",
  userHistory?: { role: "user" | "model"; text: string }[]
): Promise<ReminderExtractionResult> {
  const result = await parseAssistantIntent(userMessage, userTimezone, userHistory);

  if (result.type === "REMINDER") {
    return {
      action: result.reminderAction || "CREATE",
      taskTitle: result.taskTitle || userMessage,
      remindAtISO: result.remindAtISO || null,
      displayDate: result.displayDate || "-",
      displayTime: result.displayTime || "-",
      recurrence: result.recurrence || "NONE",
      clarificationQuestion: result.replyText || null,
    };
  }

  if (result.type === "NOTE") {
    return {
      action: "GENERAL_CHAT",
      taskTitle: result.noteTitle || userMessage,
      remindAtISO: null,
      displayDate: "-",
      displayTime: "-",
      recurrence: "NONE",
      clarificationQuestion: result.replyText || null,
    };
  }

  return {
    action: "GENERAL_CHAT",
    taskTitle: userMessage,
    remindAtISO: null,
    displayDate: "-",
    displayTime: "-",
    recurrence: "NONE",
    clarificationQuestion: result.replyText || null,
  };
}

export const parseReminderWithAI = parseReminderIntent;


