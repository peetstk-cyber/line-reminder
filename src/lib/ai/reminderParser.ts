import { GoogleGenerativeAI, SchemaType } from "@google/generative-ai";
import { z } from "zod";
import { formatInTimeZone } from "date-fns-tz";

export const ReminderExtractionSchema = z.object({
  action: z
    .enum(["CREATE", "CANCEL", "EDIT", "LIST", "CLARIFY", "GENERAL_CHAT"])
    .describe("Action ที่ผู้ใช้ต้องการทำ"),
  taskTitle: z.string().describe("ชื่อกิจกรรมหรือสิ่งที่ต้องทำแบบสั้นกระชับ"),
  remindAtISO: z
    .string()
    .nullable()
    .describe("ISO 8601 string ที่มี timezone +07:00 เช่น 2026-08-24T08:00:00+07:00 หากไม่มีเวลาให้เป็น null"),
  displayDate: z
    .string()
    .describe("ข้อความแสดงวันที่สำหรับคนอ่าน เช่น 'พรุ่งนี้', 'วันนี้', '17 ก.ค.', '24 ส.ค.'"),
  displayTime: z
    .string()
    .describe("ข้อความแสดงเวลาสำหรับคนอ่าน เช่น '08:00 น.', '20:00 น.', '15:00 น.'"),
  recurrence: z
    .enum(["NONE", "DAILY", "WEEKLY", "MONTHLY"])
    .describe("รูปแบบการเตือนซ้ำ"),
  clarificationQuestion: z
    .string()
    .nullable()
    .describe("คำถามกลับกรณีข้อมูลไม่ครบหรือต้องการความชัดเจน เป็นภาษาไทยสุภาพและเป็นกันเอง"),
});

export type ReminderExtractionResult = z.infer<typeof ReminderExtractionSchema>;

/**
 * แปลงข้อความภาษาธรรมชาติภาษาไทยของผู้ใช้เป็น Action และ JSON DateTime ที่แม่นยำ
 * @param userMessage ข้อความจากผู้ใช้
 * @param userTimezone Timezone ของผู้ใช้ (Default: "Asia/Bangkok")
 * @param userHistory ประวัติการสนทนาสั้นๆ สำหรับบริบทคำถามต่อเนื่อง (ถ้ามี)
 */
export async function parseReminderIntent(
  userMessage: string,
  userTimezone = "Asia/Bangkok",
  userHistory?: { role: "user" | "model"; text: string }[]
): Promise<ReminderExtractionResult> {
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
          action: {
            type: SchemaType.STRING,
            format: "enum",
            enum: ["CREATE", "CANCEL", "EDIT", "LIST", "CLARIFY", "GENERAL_CHAT"],
          },
          taskTitle: { type: SchemaType.STRING },
          remindAtISO: { type: SchemaType.STRING, nullable: true },
          displayDate: { type: SchemaType.STRING },
          displayTime: { type: SchemaType.STRING },
          recurrence: {
            type: SchemaType.STRING,
            format: "enum",
            enum: ["NONE", "DAILY", "WEEKLY", "MONTHLY"],
          },
          clarificationQuestion: { type: SchemaType.STRING, nullable: true },
        },
        required: [
          "action",
          "taskTitle",
          "displayDate",
          "displayTime",
          "recurrence",
        ],
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
คุณคือ AI Smart Reminder Assistant สำหรับผู้ใช้งานคนไทยใน LINE
หน้าที่ของคุณคือวิเคราะห์ข้อความของผู้ใช้ แล้วแปลงเป็น JSON โครงสร้างตาม Schema ที่กำหนด

[บริบทวันและเวลาปัจจุบัน (Timezone: ${userTimezone}, UTC+7)]
- วันเวลาปัจจุบัน: ${currentFormatted}
- Current ISO: ${currentISO}

[กฎการแปลงวันและเวลาภาษาไทยที่สำคัญ]:
1. การแปลงคำบอกเวลาไทยเป็น 24-hour Time:
   - "8 โมง" / "8 โมงเช้า" / "แปดโมง" -> 08:00 น.
   - "9 โมง" / "เก้าโมงเช้า" -> 09:00 น.
   - "10 โมง" / "สายๆ" -> 10:00 น.
   - "11 โมง" -> 11:00 น.
   - "เที่ยง" / "ตอนเที่ยง" -> 12:00 น.
   - "บ่ายโมง" / "บ่าย 1" -> 13:00 น.
   - "บ่าย 2" / "บ่ายสอง" -> 14:00 น.
   - "บ่าย 3" / "บ่ายสาม" -> 15:00 น.
   - "บ่าย 4" / "สี่โมงเย็น" -> 16:00 น.
   - "5 โมงเย็น" / "ห้าโมงเย็น" -> 17:00 น.
   - "6 โมงเย็น" / "หกโมงเย็น" -> 18:00 น.
   - "1 ทุ่ม" -> 19:00 น.
   - "2 ทุ่ม" -> 20:00 น.
   - "3 ทุ่ม" -> 21:00 น.
   - "4 ทุ่ม" -> 22:00 น.
   - "5 ทุ่ม" -> 23:00 น.
   - "เที่ยงคืน" -> 00:00 น.
   - "ตี 1" -> 01:00 น., "ตี 2" -> 02:00 น., "ตี 3" -> 03:00 น., "ตี 4" -> 04:00 น., "ตี 5" -> 05:00 น., "6 โมงเช้า" -> 06:00 น.
   - "อีก 15 นาที" / "อีก X นาที" -> บวกเพิ่ม X นาที จากเวลาปัจจุบัน (${currentFormatted})
   - "อีก 1 ชั่วโมง" / "อีก X ชั่วโมง" -> บวกเพิ่ม X ชั่วโมง จากเวลาปัจจุบัน

2. การแปลงคำบอกวันที่:
   - "วันนี้" -> วันปัจจุบัน
   - "พรุ่งนี้" -> วันถัดไป (+1 วัน)
   - "มะรืนนี้" -> 2 วันถัดไป (+2 วัน)
   - "จันทร์หน้า", "ศุกร์นี้" -> คำนวณวันให้สัมพันธ์กับวันปัจจุบันในสัปดาห์

3. การระบุ Action:
   - CREATE: เมื่อมีทั้งกิจกรรมและวันเวลาที่ครบถ้วน (remindAtISO ต้องเป็น ISO-8601 สมบูรณ์)
   - CLARIFY: เมื่อผู้ใช้ต้องการตั้งเตือนแต่ขาดวันหรือเวลา (เช่น บอกแค่ "โทรหาแม่", "พรุ่งนี้ช่วยเตือนหน่อย") -> ตั้ง action: "CLARIFY", remindAtISO: null และสร้าง clarificationQuestion ถามข้อมูลที่ขาดไปอย่างสุภาพ
   - CANCEL: ผู้ใช้ต้องการยกเลิกการแจ้งเตือน
   - EDIT: ผู้ใช้ต้องการแก้ไขข้อมูลหรือเลื่อนเวลา
   - LIST: ผู้ใช้ต้องการดูรายการเตือนทั้งหมด เช่น "มีเตือนอะไรบ้าง", "ดูรายการ", "เตือนอะไรไว้บ้าง"
   - GENERAL_CHAT: ข้อความทักทายหรือสนทนาทั่วไป -> clarificationQuestion ให้ใส่คำตอบรับที่สุภาพ

4. Recurrence:
   - "ทุกวัน" -> DAILY
   - "ทุกสัปดาห์" / "ทุกวันจันทร์" -> WEEKLY
   - "ทุกเดือน" -> MONTHLY
   - เตือนครั้งเดียว -> NONE
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
    return ReminderExtractionSchema.parse(rawJson);
  } catch (err) {
    console.error("Error parsing Gemini response:", err, "Raw response:", text);
    return {
      action: "CLARIFY",
      taskTitle: userMessage,
      remindAtISO: null,
      displayDate: "-",
      displayTime: "-",
      recurrence: "NONE",
      clarificationQuestion: "ขออภัยครับ ไม่สามารถเข้าใจเวลาได้ชัดเจน ต้องการให้เตือนเรื่องนี้ในวันและเวลาไหนครับ?",
    };
  }
}

// Alias for backward compatibility
export const parseReminderWithAI = parseReminderIntent;
