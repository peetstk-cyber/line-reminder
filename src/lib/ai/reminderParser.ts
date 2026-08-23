import { GoogleGenerativeAI, SchemaType } from "@google/generative-ai";
import { z } from "zod";
import { formatInTimeZone } from "date-fns-tz";

export const AssistantResultSchema = z.object({
  type: z.enum(["REMINDER", "NOTE", "GENERAL_CHAT"]).describe("ประเภทของคำสั่ง"),
  
  // REMINDER DETAILS
  reminderAction: z
    .enum(["CREATE", "CANCEL", "EDIT", "LIST", "CLARIFY"])
    .nullable()
    .describe("Action สำหรับเตือนความจำ"),
  taskTitle: z.string().nullable().describe("ชื่อกิจกรรมหรือสิ่งที่ต้องทำแบบสั้นกระชับ"),
  remindAtISO: z
    .string()
    .nullable()
    .describe("ISO 8601 string ที่มี timezone +07:00 เช่น 2026-08-24T08:00:00+07:00"),
  displayDate: z.string().nullable().describe("ข้อความแสดงวันที่ เช่น 'พรุ่งนี้', 'วันนี้'"),
  displayTime: z.string().nullable().describe("ข้อความแสดงเวลา เช่น '08:00 น.', '20:00 น.'"),
  recurrence: z.enum(["NONE", "DAILY", "WEEKLY", "MONTHLY"]).nullable(),

  // NOTE DETAILS
  noteAction: z.enum(["CREATE", "LIST", "DELETE"]).nullable().describe("Action สำหรับโน้ต"),
  noteTitle: z.string().nullable().describe("หัวข้อของโน้ต เช่น 'รายการซื้อของ', 'สิ่งที่ต้องทำ'"),
  noteItems: z.array(z.string()).nullable().describe("รายการย่อย เช่น ['น้ำ', 'ขนมปัง', 'สาหร่าย']"),
  noteCategory: z.enum(["SHOPPING", "TODO", "GENERAL"]).nullable(),

  replyText: z.string().nullable().describe("ข้อความตอบกลับหรือคำถามเพิ่มเติมที่สุภาพและเป็นกันเอง"),
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
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not configured in environment variables");
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: "gemini-2.5-flash",
    generationConfig: {
      temperature: 0.1,
      responseMimeType: "application/json",
      responseSchema: {
        type: SchemaType.OBJECT,
        properties: {
          type: {
            type: SchemaType.STRING,
            format: "enum",
            enum: ["REMINDER", "NOTE", "GENERAL_CHAT"],
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

  const now = new Date();
  const currentFormatted = formatInTimeZone(
    now,
    userTimezone,
    "yyyy-MM-dd HH:mm:ss (EEEE, dd MMMM yyyy)"
  );
  const currentISO = formatInTimeZone(now, userTimezone, "yyyy-MM-dd'T'HH:mm:ssXXX");

  const systemInstruction = `
คุณคือ AI Personal Assistant สำหรับผู้ใช้งานคนไทยใน LINE (รองรับทั้งระบบเตือนความจำ และระบบจดโน้ต/รายการซื้อของ)
หน้าที่ของคุณคือวิเคราะห์ข้อความของผู้ใช้ แล้วแปลงเป็น JSON โครงสร้างตาม Schema

[บริบทวันและเวลาปัจจุบัน (Timezone: ${userTimezone}, UTC+7)]
- วันเวลาปัจจุบัน: ${currentFormatted}
- Current ISO: ${currentISO}

[เกณฑ์การจำแนกประเภท (type)]:
1. type: "NOTE" (การจดโน้ต / รายการซื้อของ / รายการสิ่งที่ต้องทำ)
   - เมื่อผู้ใช้พูดว่า "จดโน้ต...", "โน้ต...", "ซื้อของ...", "รายการซื้อ...", "บันทึก...", "จดไว้...", "ลิสต์..."
   - หรือผู้ใช้พิมพ์รายการสิ่งของหรืออาหารสั้นๆ หลายรายการ เช่น "น้ำ ขนมปัง สาหร่าย", "ไข่ไก่ นม มาม่า", "ของต้องซื้อ: แชมพู สบู่"
   - noteAction: "CREATE" (สร้างโน้ตใหม่), "LIST" (ดูโน้ต เช่น "ดูโน้ต", "โน้ตมีอะไรบ้าง"), "DELETE" (ลบโน้ต)
   - noteCategory: 
     * "SHOPPING" ถ้าเป็นของกิน ของใช้ วัตถุดิบ สิ่งของที่ต้องซื้อ
     * "TODO" ถ้าเป็นสิ่งที่ต้องทำหรือภารกิจ
     * "GENERAL" อื่นๆ ทั่วไป
   - noteTitle: ตั้งชื่อให้กระชับ เช่น "รายการซื้อของ", "รายการของใช้", "บันทึกทั่วไป"
   - noteItems: แยกเป็น Array ของ string สำหรับแต่ละไอเทม เช่น ["น้ำ", "ขนมปัง", "สาหร่าย"]

2. type: "REMINDER" (การตั้งเตือนความจำที่มีวัน/เวลา หรือเจตนาให้บอทแจ้งเตือน)
   - เมื่อผู้ใช้ระบุเวลา เช่น "พรุ่งนี้ 9 โมง...", "เตือนตอน...", "อีก 15 นาที...", "2 ทุ่ม..."
   - แปลงเวลาไทยเป็น 24h ISO 8601 และ displayDate/displayTime
   - reminderAction: "CREATE", "CANCEL", "EDIT", "LIST", "CLARIFY"

3. type: "GENERAL_CHAT" (การสนทนาทักทายทั่วไป)
   - replyText: ข้อความตอบรับที่เป็นมิตร
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

  const response = await model.generateContent(prompt);
  const text = response.response.text();

  try {
    const rawJson = JSON.parse(text);
    return AssistantResultSchema.parse(rawJson);
  } catch (err) {
    console.error("Error parsing Gemini assistant response:", err, "Raw response:", text);
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
      remindAtISO: result.remindAtISO,
      displayDate: result.displayDate || "-",
      displayTime: result.displayTime || "-",
      recurrence: result.recurrence || "NONE",
      clarificationQuestion: result.replyText,
    };
  }

  if (result.type === "NOTE") {
    // If called via old interface, return clarify/general
    return {
      action: "GENERAL_CHAT",
      taskTitle: result.noteTitle || userMessage,
      remindAtISO: null,
      displayDate: "-",
      displayTime: "-",
      recurrence: "NONE",
      clarificationQuestion: result.replyText,
    };
  }

  return {
    action: "GENERAL_CHAT",
    taskTitle: userMessage,
    remindAtISO: null,
    displayDate: "-",
    displayTime: "-",
    recurrence: "NONE",
    clarificationQuestion: result.replyText,
  };
}

export const parseReminderWithAI = parseReminderIntent;
