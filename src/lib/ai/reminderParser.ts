import { GoogleGenerativeAI, SchemaType } from "@google/generative-ai";
import { z } from "zod";
import { formatInTimeZone } from "date-fns-tz";

export const AssistantResultSchema = z.object({
  type: z.enum(["REMINDER", "NOTE", "BRIEFING", "GENERAL_CHAT"]).describe("ประเภทของคำสั่ง"),
  
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
 * วิเคราะห์ข้อความผู้ใช้ว่าเป็น Reminder, Note หรือ Chat ทั่วไป
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
คุณคือ AI Personal Assistant ผู้ช่วยอัจฉริยะสำหรับผู้ใช้งานคนไทยใน LINE รองรับทั้งระบบเตือนความจำ (Reminders), ระบบจดโน้ต (Notes & Lists) และระบบสรุปยามเช้า (Morning Briefing)
หน้าที่ของคุณคือวิเคราะห์ข้อความของผู้ใช้ แล้วแปลงเป็น JSON โครงสร้างตาม Schema อย่างแม่นยำ

[บริบทวันและเวลาปัจจุบัน (Timezone: ${userTimezone}, UTC+7)]
- วันเวลาปัจจุบัน: ${currentFormatted}
- Current ISO: ${currentISO}

[กฎการจำแนกประเภท (type)]:
1. type: "NOTE" (การจดโน้ต / บันทึกรายการ / รายการซื้อของ / ยา / สิ่งที่ต้องทำ)
   - เมื่อมีคำว่า: "จดโน้ต", "จดโน๊ต", "โน้ต", "โน๊ต", "บันทึก", "ซื้อของ", "รายการ", "list" หรือรายการของสั้นๆ เช่น "นาฬิกา กล้อง กระดาษ"
   - ถ้าผู้ใช้พิมพ์รายการต่อท้าย เช่น "จดโน้ต นาฬิกา กล้อง กระดาษ" หรือ "นาฬิกา กล้อง กระดาษ"
     -> type: "NOTE", noteAction: "CREATE", noteItems: ["นาฬิกา", "กล้อง", "กระดาษ"], noteTitle: "โน้ตบันทึก", noteCategory: "GENERAL"
   - ถ้าเป็นของกิน/ของสด/ของใช้ในบ้าน -> noteCategory: "SHOPPING", noteTitle: "รายการซื้อของ"
   - ถ้าผู้ใช้พูดว่า "ดูโน้ต", "ดูโน๊ต", "โน้ตทั้งหมด", "มีโน้ตอะไรบ้าง" -> type: "NOTE", noteAction: "LIST"

2. type: "REMINDER" (การตั้งเตือนความจำที่มีกิจกรรมและเวลา)
   - เมื่อมีคำบอกเวลา เช่น "พรุ่งนี้", "วันนี้", "สี่โมง", "16:00", "20.00", "2 ทุ่ม", "9 โมง", "อย่าลืม..."
   - ตัวอย่าง: "ไปเที่ยวพรุ่งนี้สี่โมง" -> type: "REMINDER", reminderAction: "CREATE", taskTitle: "ไปเที่ยว", displayDate: "พรุ่งนี้", displayTime: "16:00 น.", remindAtISO: (คำนวณ ISO วันพรุ่งนี้เวลา 16:00:00+07:00)
   - ตัวอย่าง: "เล่นเกม 20.00" -> type: "REMINDER", reminderAction: "CREATE", taskTitle: "เล่นเกม", displayDate: "วันนี้", displayTime: "20:00 น.", remindAtISO: (คำนวณ ISO วันนี้เวลา 20:00:00+07:00)
   - ตัวอย่าง: "อย่าลืมกินยา 2 ทุ่ม" -> type: "REMINDER", reminderAction: "CREATE", taskTitle: "กินยา", displayDate: "วันนี้", displayTime: "20:00 น."
   - การแปลงคำบอกเวลาไทย:
     * "สี่โมง" / "สี่โมงเย็น" / "บ่าย 4" -> 16:00 น.
     * "บ่าย 3" / "บ่ายสาม" -> 15:00 น., "บ่าย 2" -> 14:00 น., "บ่ายโมง" -> 13:00 น.
     * "5 โมงเย็น" / "ห้าโมงเย็น" -> 17:00 น., "6 โมงเย็น" -> 18:00 น.
     * "1 ทุ่ม" -> 19:00 น., "2 ทุ่ม" -> 20:00 น., "3 ทุ่ม" -> 21:00 น., "4 ทุ่ม" -> 22:00 น.
     * "20.00", "20.00 น.", "20:00" -> 20:00 น.

3. type: "BRIEFING" (การขอสรุปยามเช้า / ภารกิจวันนี้)
   - เมื่อผู้ใช้ถาม: "สรุปเช้า", "สรุปวันนี้", "วันนี้มีอะไรบ้าง", "เช้านี้มีอะไรบ้าง", "morning brief", "briefing", "สรุปงานวันนี้", "สรุปภารกิจ"

4. type: "GENERAL_CHAT" (การสนทนาทักทายทั่วไป หรือคำถามทั่วไป)
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
                enum: ["REMINDER", "NOTE", "BRIEFING", "GENERAL_CHAT"],
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


