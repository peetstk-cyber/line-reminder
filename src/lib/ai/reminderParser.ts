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
  noteCategory: z.enum(["SHOPPING", "TODO", "GENERAL", "LINK", "READING"]).nullish(),

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
 * Check if string is a phone number
 */
export function isPhoneNumber(str: string): boolean {
  const digits = str.replace(/[-\s]/g, "");
  return /^0[1-9]\d{7,8}$/.test(digits) || (digits.startsWith("0") && (digits.length === 9 || digits.length === 10));
}

/**
 * Fast-path Thai Colloquial Reminder Parser (<1ms, 0 Quota, 100% Reliable)
 */
export function parseThaiReminderFastPath(
  text: string,
  baseDate = new Date(),
  timezone = "Asia/Bangkok"
): AssistantResult | null {
  const rawTrimmed = text.trim();
  const rawLower = rawTrimmed.toLowerCase();

  let cleanText = normalizeThaiTypos(rawTrimmed);

  const thaiNumberWords: Record<string, number> = {
    "หนึ่ง": 1,
    "นึง": 1,
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
    "สิบห้า": 15,
    "ยี่สิบ": 20,
    "สามสิบ": 30,
    "สี่สิบห้า": 45,
  };

  // -------------------------------------------------------------
  // FAST PATH 0: Relative Time Phrases (เช่น "อีก10นาที", "อีก 10 นาที", "อีก 1 ชม", "อีกครึ่งชั่วโมง", "ในอีก 15 นาที")
  // -------------------------------------------------------------
  let relativeOffsetMinutes = -1;

  // 0.1 อีกครึ่งชั่วโมง / อีกครึ่งชม
  const halfHourMatch = cleanText.match(/(?:^|\s+)(?:ใน)?อีก\s*ครึ่ง\s*(?:ชั่วโมง|ชม\.?)(?:\s+|$)/i);
  if (halfHourMatch) {
    relativeOffsetMinutes = 30;
    cleanText = cleanText.replace(halfHourMatch[0], " ");
  }

  // 0.2 อีก X ชั่วโมง / อีก X ชม [ครึ่ง / Y นาที] (e.g. "อีก1ชม", "อีก 2 ชั่วโมง", "อีก 1 ชมครึ่ง")
  if (relativeOffsetMinutes === -1) {
    const hourMatch = cleanText.match(
      /(?:^|\s+)(?:ใน)?อีก\s*(\d+|หนึ่ง|นึง|สอง|สาม|สี่|ห้า|หก|เจ็ด|แปด|เก้า|สิบ)\s*(?:ชม\.?|ชั่วโมง)(?:\s*(ครึ่ง|(\d+)\s*นาที))?(?:\s+|$)/i
    );
    if (hourMatch) {
      const rawH = hourMatch[1];
      const hVal = thaiNumberWords[rawH] || parseInt(rawH, 10);
      const extraMin = hourMatch[2] === "ครึ่ง" ? 30 : hourMatch[3] ? parseInt(hourMatch[3], 10) : 0;
      relativeOffsetMinutes = hVal * 60 + extraMin;
      cleanText = cleanText.replace(hourMatch[0], " ");
    }
  }

  // 0.3 อีก X นาที (e.g. "อีก10นาที", "อีก 10 นาที", "ในอีก 5 นาที", "อีก 45 นาที")
  if (relativeOffsetMinutes === -1) {
    const minMatch = cleanText.match(
      /(?:^|\s+)(?:ใน)?อีก\s*(\d+|หนึ่ง|นึง|สอง|สาม|สี่|ห้า|หก|เจ็ด|แปด|เก้า|สิบ|สิบห้า|ยี่สิบ|สามสิบ|สี่สิบห้า)\s*นาที(?:\s+|$)/i
    );
    if (minMatch) {
      const rawM = minMatch[1];
      relativeOffsetMinutes = thaiNumberWords[rawM] || parseInt(rawM, 10);
      cleanText = cleanText.replace(minMatch[0], " ");
    }
  }

  // If relative time was found, calculate target time and return immediately!
  if (relativeOffsetMinutes > 0) {
    const targetDate = new Date(baseDate.getTime() + relativeOffsetMinutes * 60 * 1000);
    const targetDay = formatInTimeZone(targetDate, timezone, "yyyy-MM-dd");
    const baseDay = formatInTimeZone(baseDate, timezone, "yyyy-MM-dd");

    let dateStr = "วันนี้";
    if (targetDay !== baseDay) {
      dateStr = formatInTimeZone(targetDate, timezone, "d MMM");
    }

    const timeStr = formatInTimeZone(targetDate, timezone, "HH:mm น.");
    const remindAtISO = formatInTimeZone(targetDate, timezone, "yyyy-MM-dd'T'HH:mm:ssXXX");

    let taskTitle = cleanText
      .replace(/^(?:เตือน|ช่วยเตือน|เตือนว่า|ช่วยเตือนว่า|ตั้งเตือน|แจ้งเตือน)\s*/, "")
      .replace(/(?:^|\s+)(?:ตอน|ช่วง|เวลา)?\s*$/, "")
      .trim();
    taskTitle = taskTitle
      .replace(/^[\u0E31\u0E34-\u0E3A\s]+|[\u0E31\u0E34-\u0E3A\s]+$/g, "")
      .trim();
    taskTitle = taskTitle.replace(/\s+/g, " ").trim();

    if (!taskTitle) {
      taskTitle = "เตือนความจำ";
    }

    return {
      type: "REMINDER",
      reminderAction: "CREATE",
      taskTitle,
      remindAtISO,
      displayDate: dateStr,
      displayTime: timeStr,
      recurrence: "NONE",
    };
  }

  // If message explicitly starts with a note/shopping/phone prefix (and had no relative time), do NOT treat as reminder fast-path
  if (
    /^(?:จดงาน|จด|o\s|o:|๐\s|todo|to-do|สิ่งที่ต้องทำ|งาน|ซื้อของ|ซื้อ|ช้อปปิ้ง|รายการซื้อ|อ่านหนังสือ|อ่านว่า|ทบทวน|reading|read|book|หนังสือ|โน้ต|โน๊ต|บันทึก|เบอร์|โทร|contact|phone)/i.test(
      rawLower
    )
  ) {
    return null;
  }

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

  // C. บ่าย (e.g. บ่ายโมง, บ่ายสอง, บ่าย2, บ่าย3, บ่ายสาม, บ่ายสี่) - ต้องมีตัวเลข หรือคำว่า "โมง"
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
      /(?:^|\s+)บ่าย\s*(\d{1,2}|โมง|หนึ่ง|นึง|สอง|สาม|สี่|ห้า)(?:\s*โมง)?(?:\s*(ครึ่ง))?(?:\s*(\d{1,2})\s*นาที)?(?:\s+|$)/
    );
    if (baiMatch) {
      const rawH = baiMatch[1];
      const hVal = thaiNumBai[rawH] || parseInt(rawH, 10);
      if (hVal >= 1 && hVal <= 5) {
        hour = 12 + hVal;
        minute = baiMatch[2] === "ครึ่ง" ? 30 : baiMatch[3] ? parseInt(baiMatch[3], 10) : 0;
        timeStr = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")} น.`;
        cleanText = cleanText.replace(baiMatch[0], " ");
      }
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

  // F. Generic เช้า / ช่วงเช้า / สาย / เที่ยง / บ่าย / เย็น / ค่ำ / ดึก (เมื่อเว้นวรรคชัดเจน หรือมีคำว่า ตอน/ช่วง/เวลา)
  if (hour === -1) {
    // 1. มีคำระบุเจาะจง เช่น ตอนเช้า, ช่วงบ่าย, ตอนเย็น, ตอนเที่ยง, เที่ยงคืน
    const particleMatch = cleanText.match(
      /(?:^|\s+)(?:ตอน|ช่วง|เวลา)?\s*(เที่ยงคืน|ตอนเที่ยง|ช่วงเที่ยง|ตอนเช้า|ช่วงเช้า|ตอนบ่าย|ช่วงบ่าย|ตอนเย็น|ช่วงเย็น|ตอนค่ำ|ช่วงค่ำ|ตอนดึก|ช่วงดึก)(?:\s+|$)/
    );
    if (particleMatch) {
      const phrase = particleMatch[1];
      if (phrase.includes("เช้า")) {
        hour = 8;
        minute = 0;
        timeStr = "08:00 น.";
      } else if (phrase.includes("บ่าย")) {
        hour = 13;
        minute = 0;
        timeStr = "13:00 น.";
      } else if (phrase.includes("เย็น")) {
        hour = 17;
        minute = 0;
        timeStr = "17:00 น.";
      } else if (phrase.includes("ค่ำ")) {
        hour = 19;
        minute = 0;
        timeStr = "19:00 น.";
      } else if (phrase.includes("ดึก")) {
        hour = 22;
        minute = 0;
        timeStr = "22:00 น.";
      } else if (phrase === "เที่ยงคืน") {
        hour = 0;
        minute = 0;
        timeStr = "00:00 น.";
      } else if (phrase.includes("เที่ยง")) {
        hour = 12;
        minute = 0;
        timeStr = "12:00 น.";
      }
      cleanText = cleanText.replace(particleMatch[0], " ");
    } else {
      // 2. คำบอกเวลาเดี่ยวๆ ที่เว้นวรรคแยกจากชื่อกิจกรรมชัดเจน (เช่น "สลับเวรเช้าบ่าย เที่ยง")
      const standaloneMatch = cleanText.match(/(?:^|\s+)(เที่ยง|เที่ยงวัน|สาย)(?:\s+|$)/);
      if (standaloneMatch) {
        const word = standaloneMatch[1];
        if (word === "เที่ยง" || word === "เที่ยงวัน") {
          hour = 12;
          minute = 0;
          timeStr = "12:00 น.";
        } else if (word === "สาย") {
          hour = 9;
          minute = 30;
          timeStr = "09:30 น.";
        }
        cleanText = cleanText.replace(standaloneMatch[0], " ");
      }
    }
  }

  // Clean task title
  let taskTitle = cleanText
    .replace(/^(?:เตือน|ช่วยเตือน|เตือนว่า|ช่วยเตือนว่า|ตั้งเตือน|แจ้งเตือน)\s*/, "")
    .trim();
  taskTitle = taskTitle
    .replace(/^[\u0E31\u0E34-\u0E3A\s]+|[\u0E31\u0E34-\u0E3A\s]+$/g, "")
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
  const trimmed = userMessage.trim();
  const normalized = normalizeThaiTypos(trimmed).toLowerCase();

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

  // Fast-path for Phone Number / Contact Note (<1ms instant response): e.g. "พีท 0802264741", "เบอร์หมอ 091-234-5678"
  const phoneMatch = trimmed.match(
    /^(?:เบอร์(?:โทร)?|โทร|contact|phone)?\s*([ก-๙a-zA-Z0-9_\-]+)\s*[:=\-]?\s*(0\d{1,2}[-\s]?\d{3,4}[-\s]?\d{3,4}|0\d{8,9})(?:\s+(.*))?$/
  );
  if (phoneMatch) {
    const rawDigits = phoneMatch[2].replace(/[-\s]/g, "");
    if (rawDigits.startsWith("0") && (rawDigits.length === 9 || rawDigits.length === 10)) {
      return {
        type: "NOTE",
        noteAction: "CREATE",
        noteTitle: "โน้ตบันทึก",
        noteCategory: "GENERAL",
        noteItems: [trimmed],
      };
    }
  }

  // Fast-path for TODO Notes (<1ms instant response): จด, จดงาน, o, O, ๐, todo, to-do, สิ่งที่ต้องทำ, งาน
  const todoPrefixMatch = trimmed.match(
    /^(?:จดงาน|จด|o|O|๐|todo|to-do|สิ่งที่ต้องทำ|งาน)(?:\s+|:)([\s\S]+)$/i
  );
  if (todoPrefixMatch) {
    const rawContent = todoPrefixMatch[1].trim();
    const items = rawContent
      .split(/[\n,;]|(?:\s*-\s*)|\s*•\s*/)
      .map((s) => s.trim())
      .filter(Boolean);

    return {
      type: "NOTE",
      noteAction: "CREATE",
      noteTitle: "สิ่งที่ต้องทำ",
      noteCategory: "TODO",
      noteItems: items.length > 0 ? items : [rawContent],
    };
  }

  // Fast-path for SHOPPING Notes: ซื้อของ, ซื้อ, ช้อปปิ้ง, รายการซื้อ
  const shoppingPrefixMatch = trimmed.match(
    /^(?:ซื้อของ|ซื้อ|ช้อปปิ้ง|รายการซื้อ)(?:\s+|:)([\s\S]+)$/i
  );
  if (shoppingPrefixMatch) {
    const rawContent = shoppingPrefixMatch[1].trim();
    const items = rawContent
      .split(/[\n,;]|(?:\s*-\s*)|\s*•\s*/)
      .map((s) => s.trim())
      .filter(Boolean);

    return {
      type: "NOTE",
      noteAction: "CREATE",
      noteTitle: "รายการซื้อของ",
      noteCategory: "SHOPPING",
      noteItems: items.length > 0 ? items : [rawContent],
    };
  }

  // Fast-path for READING Notes: อ่าน, อ่านหนังสือ, ทบทวน, reading, read, book, หนังสือ
  const readingPrefixMatch = trimmed.match(
    /^(?:อ่านหนังสือ|อ่านว่า|อ่าน|ทบทวน|reading|read|book|หนังสือ)(?:\s+|:)([\s\S]+)$/i
  );
  if (readingPrefixMatch) {
    const rawContent = readingPrefixMatch[1].trim();
    const items = rawContent
      .split(/[\n,;]|(?:\s*-\s*)|\s*•\s*/)
      .map((s) => s.trim())
      .filter(Boolean);

    return {
      type: "NOTE",
      noteAction: "CREATE",
      noteTitle: "หัวข้อที่ต้องอ่าน",
      noteCategory: "READING",
      noteItems: items.length > 0 ? items : [rawContent],
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
      if (weBorrow && !isPhoneNumber(weBorrow[2])) {
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
      if (theyBorrow && !isPhoneNumber(theyBorrow[2])) {
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
      if (
        quickMatch &&
        !excludedDebtKeywords.includes(quickMatch[1]) &&
        quickMatch[1].length >= 2 &&
        !isPhoneNumber(quickMatch[2])
      ) {
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
  // Pattern 1: เรายืม / กูยืม / ผมยืม <คน> <เงิน> [เหตุผล]
  const weBorrowMatch = trimmed.match(borrowRegex);
  if (weBorrowMatch && !isPhoneNumber(weBorrowMatch[2])) {
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
  if (theyBorrowMatch && !isPhoneNumber(theyBorrowMatch[2])) {
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
    const rawAmount = quickDebtMatch[2];
    if (!excludedDebtKeywords.includes(name) && name.length >= 2 && !isPhoneNumber(rawAmount)) {
      const item: DebtItemEntry = {
        personName: name,
        amount: parseFloat(rawAmount),
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
คุณคือ Assistant AI อัจฉริยะสำหรับ LINE OA ที่ช่วยแยกแยะคำสั่งภาษาไทยของผู้ใช้ให้ถูกต้องและแม่นยำที่สุด
เวลาปัจจุบันของผู้ใช้ (Timezone: ${userTimezone}): ${currentFormatted} (ISO: ${currentISO})

จงจำแนกประเภทของข้อความ (type) เป็น 5 ประเภทดังต่อไปนี้:

1. type: "DEBT" (การบันทึกหนี้สิน / ยืมเงิน / คืนเงิน / ทวงเงิน)
   - กรณีเราให้คนอื่นยืม (เขาติดเรา): debtType: "LENT"
     * ตัวอย่าง: "ก้อง 60 ค่าข้าว" -> type: "DEBT", debtAction: "CREATE", debtType: "LENT", personName: "ก้อง", amount: 60, debtDescription: "ค่าข้าว"
     * ตัวอย่าง: "ปิ่นยืม 150 ค่ากาแฟ" -> type: "DEBT", debtAction: "CREATE", debtType: "LENT", personName: "ปิ่น", amount: 150, debtDescription: "ค่ากาแฟ"
   - กรณีเรายืมคนอื่น (เราติดเขา): debtType: "BORROWED"
     * ตัวอย่าง: "เรายืมก้อง 500" -> type: "DEBT", debtAction: "CREATE", debtType: "BORROWED", personName: "ก้อง", amount: 500
   - ข้อควรระวัง: ตัวเลขที่ขึ้นต้นด้วย 0 และยาว 9-10 หลัก (เช่น 0802264741, 0912345678) คือ "เบอร์โทรศัพท์" ห้ามตีจำเป็นยอดเงินติดหนี้เด็ดขาด!

2. type: "NOTE" (การจดโน้ต / บันทึกรายการ / รายการซื้อของ / ยา / สิ่งที่ต้องทำ / การอ่าน / เบอร์โทรศัพท์)
   - กรณีเบอร์โทรศัพท์ (เช่น "พีท 0802264741", "หมอน้ำ 091-234-5678", "เบอร์ช่าง 0891234567"):
     * ตัวเลขที่ขึ้นต้นด้วย 0 และมีความยาว 9-10 หลัก คือ "เบอร์โทรศัพท์" ไม่ใช่จำนวนเงินติดหนี้เด็ดขาด!
     * ให้จัดเป็น type: "NOTE", noteAction: "CREATE", noteTitle: "โน้ตบันทึก", noteCategory: "GENERAL", noteItems: ["พีท 0802264741"]
   - Category: "TODO" (สิ่งที่ต้องทำ)
     * เมื่อขึ้นต้นด้วยคำว่า: "จด", "จดงาน", "o", "O", "todo", "to do", "สิ่งที่ต้องทำ", "งาน"
     * ตัวอย่าง: "จด สลับเวรเช้าบ่าย" -> type: "NOTE", noteAction: "CREATE", noteItems: ["สลับเวรเช้าบ่าย"], noteTitle: "สิ่งที่ต้องทำ", noteCategory: "TODO"
     * ตัวอย่าง: "จด ทำ reflection" -> type: "NOTE", noteAction: "CREATE", noteItems: ["ทำ reflection"], noteTitle: "สิ่งที่ต้องทำ", noteCategory: "TODO"
     * ตัวอย่าง: "จดงาน ส่งเอกสาร ทำสไลด์" -> type: "NOTE", noteAction: "CREATE", noteItems: ["ส่งเอกสาร", "ทำสไลด์"], noteTitle: "สิ่งที่ต้องทำ", noteCategory: "TODO"
     * ตัวอย่าง: "o ซักผ้า ล้างจาน" -> type: "NOTE", noteAction: "CREATE", noteItems: ["ซักผ้า", "ล้างจาน"], noteTitle: "สิ่งที่ต้องทำ", noteCategory: "TODO"
   - Category: "SHOPPING" (ซื้อของ)
     * เมื่อขึ้นต้นด้วย: "ซื้อของ", "ซื้อ", "ช้อปปิ้ง", "รายการซื้อ" เช่น "ซื้อของ นม ไข่ไก่"
   - Category: "READING" (หัวข้อการอ่าน / หนังสือ / ทบทวนความรู้)
     * เมื่อขึ้นต้นด้วยคำว่า: "อ่าน", "อ่านหนังสือ", "ทบทวน", "reading", "read", "book", "หนังสือ"
   - Category: "GENERAL" (โน้ตทั่วไป / บันทึกความรู้ / บันทึกข้อมูล)
     * เมื่อขึ้นต้นด้วย: "โน้ต", "โน๊ต", "บันทึก" หรือบันทึกเบอร์โทร

3. type: "REMINDER" (การตั้งเตือนความจำที่มีกิจกรรมและเวลา)
   - รองรับเวลานับถอยหลัง / เวลาสัมพัทธ์ (Relative Time):
     * "อ่านแคล อีก10นาที" -> type: "REMINDER", reminderAction: "CREATE", taskTitle: "อ่านแคล", remindAtISO: (เวลาปัจจุบัน + 10 นาที)
     * "กินยา อีก 5 นาที" -> type: "REMINDER", reminderAction: "CREATE", taskTitle: "กินยา", remindAtISO: (เวลาปัจจุบัน + 5 นาที)
     * "ประชุม อีก 1 ชม" -> type: "REMINDER", reminderAction: "CREATE", taskTitle: "ประชุม", remindAtISO: (เวลาปัจจุบัน + 1 ชั่วโมง)
     * "พักผ่อน อีกครึ่งชั่วโมง" -> type: "REMINDER", reminderAction: "CREATE", taskTitle: "พักผ่อน", remindAtISO: (เวลาปัจจุบัน + 30 นาที)
   - ข้อควรระวังเรื่องคำว่า เช้า/บ่าย/เย็น ในชื่อกิจกรรม:
     * หากเป็นคำประสมหรือคำทั่วไป เช่น "สลับเวรเช้าบ่าย", "อาหารเช้า", "เวรบ่าย" โดยไม่ได้มีเจตนาบอกเวลาแยกต่างหาก (ไม่ได้เว้นวรรคบอกเวลา หรือไม่ได้ระบุเวลาชัดเจน) อย่าตีความเป็นเวลา
     * ตัวอย่าง: "สลับเวรเช้าบ่าย เที่ยง" -> มีการเว้นวรรคระบุเวลา "เที่ยง" ชัดเจน -> type: "REMINDER", reminderAction: "CREATE", taskTitle: "สลับเวรเช้าบ่าย", displayTime: "12:00 น.", remindAtISO: (เวลา 12:00:00 น.)
     * ตัวอย่าง: "กินข้าวสามทุ่ม" -> type: "REMINDER", reminderAction: "CREATE", taskTitle: "กินข้าว", displayDate: "วันนี้", displayTime: "21:00 น.", remindAtISO: (เวลา 21:00:00 น. วันนี้)
     * ตัวอย่าง: "ไปเที่ยวพรุ่งนี้สี่โมง" -> type: "REMINDER", reminderAction: "CREATE", taskTitle: "ไปเที่ยว", displayDate: "พรุ่งนี้", displayTime: "16:00 น.", remindAtISO: (คำนวณ ISO วันพรุ่งนี้เวลา 16:00:00+07:00)
     * ตัวอย่าง: "เล่นเกม 20.00" -> type: "REMINDER", reminderAction: "CREATE", taskTitle: "เล่นเกม", displayDate: "วันนี้", displayTime: "20:00 น.", remindAtISO: (คำนวณ ISO วันนี้เวลา 20:00:00+07:00)
     * ตัวอย่าง: "ยกเลิกเตือน" -> type: "REMINDER", reminderAction: "CANCEL"
     * ตัวอย่าง: "เตือนอะไรไว้บ้าง", "ดูรายการเตือน" -> type: "REMINDER", reminderAction: "LIST"

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
                enum: ["SHOPPING", "TODO", "GENERAL", "LINK", "READING"],
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


