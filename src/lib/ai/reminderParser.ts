import { GoogleGenerativeAI, SchemaType } from "@google/generative-ai";
import { z } from "zod";
import { formatInTimeZone } from "date-fns-tz";

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
 * วิเคราะห์ข้อความผู้ใช้ว่าเป็น Reminder, Note, Debt, Briefing หรือ Chat ทั่วไป
 */
export async function parseAssistantIntent(
  userMessage: string,
  userTimezone = "Asia/Bangkok",
  userHistory?: { role: "user" | "model"; text: string }[]
): Promise<AssistantResult> {
  const normalized = userMessage.trim().toLowerCase();

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

  // Fast-path Regex for Debt Patterns (<5ms instant response)
  const trimmed = userMessage.trim();

  // Pattern 1: เรายืม <คน> <เงิน> [เหตุผล]
  const weBorrowMatch = trimmed.match(
    /^(?:เรายืม|ผมยืม|ยืม|ติดเงิน|ติดตังค์)\s*([ก-๙a-zA-Z]+)\s+(\d+(?:\.\d+)?)\s*(?:บาท|บ\.)?(?:\s+(.+))?$/
  );
  if (weBorrowMatch) {
    return {
      type: "DEBT",
      debtAction: "CREATE",
      debtType: "BORROWED",
      personName: weBorrowMatch[1],
      amount: parseFloat(weBorrowMatch[2]),
      debtDescription: weBorrowMatch[3] || "ยืมเงิน",
    };
  }

  // Pattern 2: <คน>ยืม <เงิน> [เหตุผล]
  const theyBorrowMatch = trimmed.match(
    /^([ก-๙a-zA-Z]+)\s*ยืม\s*(\d+(?:\.\d+)?)\s*(?:บาท|บ\.)?(?:\s+(.+))?$/
  );
  if (theyBorrowMatch) {
    return {
      type: "DEBT",
      debtAction: "CREATE",
      debtType: "LENT",
      personName: theyBorrowMatch[1],
      amount: parseFloat(theyBorrowMatch[2]),
      debtDescription: theyBorrowMatch[3] || "ยืมเงิน",
    };
  }

  // Pattern 3: <คน> <เงิน> [บาท] [เหตุผล]
  const quickDebtMatch = trimmed.match(
    /^([ก-๙a-zA-Z]+)\s+(\d+(?:\.\d+)?)\s*(?:บาท|บ\.)?(?:\s+(.+))?$/
  );
  if (quickDebtMatch) {
    const name = quickDebtMatch[1];
    const excludedKeywords = [
      "เตือน", "โน้ต", "โน๊ต", "ประชุม", "นัด", "ซื้อ", "ส่ง", "โทร",
      "กิน", "ทำ", "วิ่ง", "นอน", "ตื่น", "อ่าน", "เรียน", "วันนี้", "พรุ่งนี้"
    ];
    if (!excludedKeywords.includes(name)) {
      return {
        type: "DEBT",
        debtAction: "CREATE",
        debtType: "LENT",
        personName: name,
        amount: parseFloat(quickDebtMatch[2]),
        debtDescription: quickDebtMatch[3] || "ยืมเงิน",
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
คุณคือ AI Personal Assistant ผู้ช่วยอัจฉริยะสำหรับคนไทยใน LINE รองรับ 4 ระบบหลัก:
1. ระบบเตือนความจำ (Reminders)
2. ระบบจดโน้ต & รายการ (Notes & Lists)
3. ระบบจดหนี้สินและการยืมเงิน (Debt & Lending Tracker)
4. ระบบสรุปยามเช้า (Morning Briefing)

[บริบทวันและเวลาปัจจุบัน (Timezone: ${userTimezone}, UTC+7)]
- วันเวลาปัจจุบัน: ${currentFormatted}
- Current ISO: ${currentISO}

[กฎการแปลงเวลาภาษาไทย (Thai Colloquial Time Conversion)]:
- "ทุ่ม" (กลางคืน): ทุ่มนึง/หนึ่งทุ่ม = 19:00, สองทุ่ม = 20:00, สามทุ่ม = 21:00, สี่ทุ่ม = 22:00, ห้าทุ่ม = 23:00
- "บ่าย": บ่ายโมง = 13:00, บ่ายสอง = 14:00, บ่ายสาม = 15:00, บ่ายสี่ = 16:00
- "เย็น": สี่โมงเย็น = 16:00, ห้าโมงเย็น = 17:00, หกโมงเย็น = 18:00
- "เช้า": หกโมงเช้า = 06:00, เจ็ดโมงเช้า = 07:00, แปดโมงเช้า = 08:00, เก้าโมง/9โมง = 09:00, สิบโมง = 10:00, สิบเอ็ดโมง = 11:00
- "เที่ยง" = 12:00, "เที่ยงคืน" = 00:00
- "ตี": ตีหนึ่ง = 01:00, ตีสอง = 02:00, ตีสาม = 03:00, ตีสี่ = 04:00, ตีห้า = 05:00

[กฎสำคัญในการสกัด Reminder]:
- เมื่อผู้ใช้พิมพ์กิจกรรมคู่กับเวลา เช่น "กินข้าวสามทุ่ม", "ประชุมบ่ายสอง", "กินยาสี่ทุ่ม", "วิ่งห้าโมงเย็น"
  -> ต้องแยกกิจกรรมเป็น taskTitle (เช่น "กินข้าว", "ประชุม", "กินยา", "วิ่ง")
  -> และแปลงเวลาเป็น remindAtISO ให้ถูกต้องตามบริบท (เช่น สามทุ่ม = 21:00 น. วันนี้)
  -> ห้ามนำคำบอกเวลาไปปนใน taskTitle จนลืมใส่วันเวลา remindAtISO เด็ดขาด!

[กฎการจำแนกประเภท (type)]:

1. type: "DEBT" (การจดหนี้ ยืมเงิน คืนเงิน เคลียร์หนี้)
   - "เราให้ยืม / เขาติดเรา" (debtType: "LENT"):
     * ตัวอย่าง: "ปิ่น 50 ค่ากาแฟ", "ปิ่น 50", "ปิ่น 20", "ปิ่น 50 บาท" -> type: "DEBT", debtAction: "CREATE", debtType: "LENT", personName: "ปิ่น", amount: 50/20, debtDescription: "ค่ากาแฟ" หรือ "ยืมเงิน"
     * ตัวอย่าง: "ก้องยืม 20" -> type: "DEBT", debtAction: "CREATE", debtType: "LENT", personName: "ก้อง", amount: 20, debtDescription: "ยืมเงิน"
     * ตัวอย่าง: "ออกให้แฮม 120 ค่าข้าว" -> type: "DEBT", debtAction: "CREATE", debtType: "LENT", personName: "แฮม", amount: 120, debtDescription: "ค่าข้าว"
   - "เรายืมเขา / เราติดเขา" (debtType: "BORROWED"):
     * ตัวอย่าง: "เรายืมแฮม 60" / "ยืมแฮม 60" / "ติดตังค์แฮม 60" -> type: "DEBT", debtAction: "CREATE", debtType: "BORROWED", personName: "แฮม", amount: 60, debtDescription: "ยืมเงิน"
     * ตัวอย่าง: "ติดเงินปิ่น 100 ค่าแท็กซี่" -> type: "DEBT", debtAction: "CREATE", debtType: "BORROWED", personName: "ปิ่น", amount: 100, debtDescription: "ค่าแท็กซี่"
   - "การเคลียร์หนี้ / คืนเงินแล้ว" (debtAction: "SETTLE"):
     * ตัวอย่าง: "ปิ่นคืนแล้ว", "เคลียร์หนี้ปิ่น", "ปิ่นจ่ายแล้ว" -> type: "DEBT", debtAction: "SETTLE", personName: "ปิ่น"
     * ตัวอย่าง: "คืนเงินก้องแล้ว", "เคลียร์หนี้ก้อง" -> type: "DEBT", debtAction: "SETTLE", personName: "ก้อง"
   - "ดูรายการหนี้ทั้งหมด" (debtAction: "LIST"):
     * ตัวอย่าง: "ใครติดตังค์เราบ้าง", "หนี้ทั้งหมด", "ยอดหนี้", "ดูหนี้", "สรุปหนี้" -> type: "DEBT", debtAction: "LIST"

2. type: "NOTE" (การจดโน้ต / บันทึกรายการ / รายการซื้อของ / ยา / สิ่งที่ต้องทำ)
   - เมื่อมีคำว่า: "จดโน้ต", "จดโน๊ต", "โน้ต", "โน๊ต", "บันทึก", "ซื้อของ", "รายการ", "list" หรือรายการของสั้นๆ เช่น "นาฬิกา กล้อง กระดาษ"
   - ถ้าผู้ใช้พิมพ์รายการต่อท้าย เช่น "จดโน้ต นาฬิกา กล้อง กระดาษ" หรือ "นาฬิกา กล้อง กระดาษ"
     -> type: "NOTE", noteAction: "CREATE", noteItems: ["นาชา", "กล้อง", "กระดาษ"], noteTitle: "โน้ตบันทึก", noteCategory: "GENERAL"
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
    "gemini-2.5-flash",
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


