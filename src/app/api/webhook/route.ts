import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { WebhookRequestBody, WebhookEvent, PostbackEvent } from "@line/bot-sdk";
import { db } from "@/lib/db";
import { getLineMessagingClient } from "@/lib/line";
import { parseAssistantIntent } from "@/lib/ai/reminderParser";
import { createReminderSuccessCard, createNoteSuccessCard } from "@/lib/line/flexTemplates";
import { formatInTimeZone } from "date-fns-tz";
import { neon } from "@neondatabase/serverless";

export const dynamic = "force-dynamic";

function getSql() {
  return neon(process.env.DATABASE_URL!);
}

async function logWebhook(rawBody: string, signature: string, stage: string, error?: string) {
  try {
    const sql = getSql();
    await sql`
      INSERT INTO "webhook_logs" ("id", "rawBody", "signature", "stage", "error", "receivedAt")
      VALUES (gen_random_uuid()::text, ${rawBody}, ${signature}, ${stage}, ${error || null}, CURRENT_TIMESTAMP);
    `;
  } catch (e) {
    console.error("Failed to insert into webhook_logs:", e);
  }
}

function verifySignature(body: string, signature: string, secret: string): boolean {
  if (!signature || !secret) return false;
  const hash = crypto.createHmac("SHA256", secret).update(body).digest("base64");
  return hash === signature;
}

export async function GET() {
  return NextResponse.json({
    status: "ok",
    message: "LINE Webhook Server is Running 🌿",
    timestamp: new Date().toISOString(),
  });
}

export async function POST(req: NextRequest) {
  const channelSecret = process.env.LINE_CHANNEL_SECRET;
  const signature = req.headers.get("x-line-signature") || "";
  const rawBody = await req.text();

  console.log("=== INCOMING WEBHOOK ===");
  console.log("Signature:", signature);
  console.log("Body:", rawBody);

  await logWebhook(rawBody, signature, "RECEIVED");

  if (channelSecret && signature) {
    const isValid = verifySignature(rawBody, signature, channelSecret);
    if (!isValid) {
      console.warn("Invalid signature. Secret:", channelSecret.slice(0, 5) + "...");
      await logWebhook(rawBody, signature, "SIGNATURE_INVALID");
      // Don't reject immediately for debugging, but log it
    }
  }

  let body: WebhookRequestBody;
  try {
    body = JSON.parse(rawBody || "{}");
  } catch (err: any) {
    console.error("Failed to parse LINE webhook body:", err);
    await logWebhook(rawBody, signature, "JSON_PARSE_ERROR", err.message);
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const events: WebhookEvent[] = body.events || [];

  if (events.length === 0) {
    await logWebhook(rawBody, signature, "EMPTY_EVENTS_VERIFIED");
    return NextResponse.json({ status: "ok", message: "Webhook verified" });
  }

  for (const event of events) {
    try {
      await handleEvent(event);
      await logWebhook(rawBody, signature, "EVENT_PROCESSED");
    } catch (err: any) {
      console.error("Error handling LINE event:", err);
      await logWebhook(rawBody, signature, "EVENT_ERROR", err.message || JSON.stringify(err));
    }
  }

  return NextResponse.json({ status: "success" });
}

async function handleEvent(event: WebhookEvent) {
  const lineUserId = event.source.userId;
  if (!lineUserId) return;

  const lineClient = getLineMessagingClient();

  // 1. Upsert User in database
  let user;
  try {
    user = await db.upsertUser(lineUserId);
  } catch (err) {
    console.error("Failed to upsert user:", err);
    user = { id: lineUserId, lineUserId, displayName: "LINE User", pictureUrl: null, createdAt: new Date().toISOString() };
  }

  // 2. Handle Message Event
  if (event.type === "message" && event.message.type === "text") {
    await handleTextMessage(lineClient, event.replyToken, event.message.text, user.id);
  }

  // 3. Handle Postback Event
  if (event.type === "postback") {
    await handlePostback(lineClient, event);
  }
}

async function handleTextMessage(
  lineClient: ReturnType<typeof getLineMessagingClient>,
  replyToken: string,
  userText: string,
  userId: string
) {
  const trimmedText = userText.trim();

  // 1. วิเคราะห์ Intent ด้วย Gemini AI Master Router
  let assistant;
  try {
    assistant = await parseAssistantIntent(trimmedText, "Asia/Bangkok");
  } catch (aiErr: any) {
    console.error("Gemini AI parse failed:", aiErr);
    assistant = {
      type: "GENERAL_CHAT" as const,
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
      replyText: "ขออภัยครับ ไม่สามารถประมวลผลได้ในขณะนี้ ต้องการให้ช่วยเตือนความจำหรือจดโน้ตเรื่องอะไรครับ?",
    };
  }

  // -------------------------------------------------------------
  // CASE 1: จัดการ NOTE (จดโน้ต / รายการซื้อของ / สิ่งที่ต้องทำ)
  // -------------------------------------------------------------
  if (assistant.type === "NOTE") {
    if (assistant.noteAction === "CREATE" || !assistant.noteAction) {
      if (!assistant.noteItems || assistant.noteItems.length === 0) {
        await lineClient.replyMessage({
          replyToken,
          messages: [
            {
              type: "text",
              text:
                assistant.replyText ||
                "ต้องการให้จดโน้ตเรื่องอะไรครับ? เช่น 'จดโน้ต ซื้อไข่ไก่ นม ขนมปัง' หรือ 'จดโน้ต ยา metoprolol'",
            },
          ],
        });
        return;
      }

      const itemsList = assistant.noteItems;
      const noteItems = itemsList.map((txt) => ({
        id: "item-" + Math.random().toString(36).substring(2, 9),
        text: txt.trim(),
        completed: false,
      }));


      let note;
      try {
        note = await db.createNote({
          userId,
          title: assistant.noteTitle || (assistant.noteCategory === "SHOPPING" ? "รายการซื้อของ" : "โน้ตบันทึก"),
          items: noteItems,
          category: assistant.noteCategory || "GENERAL",
        });
      } catch (dbErr) {
        console.error("Failed to save note in DB:", dbErr);
        note = {
          id: "temp-note-" + Date.now(),
          userId,
          title: assistant.noteTitle || "รายการบันทึก",
          items: noteItems,
          category: (assistant.noteCategory || "GENERAL") as any,
          isPinned: false,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
      }

      try {
        const flexMessage = createNoteSuccessCard(note);
        await lineClient.replyMessage({
          replyToken,
          messages: [flexMessage],
        });
      } catch (flexErr) {
        console.error("Note flex message failed, fallback to text:", flexErr);
        const preview = noteItems.map((it) => `• ${it.text}`).join("\n");
        await lineClient.replyMessage({
          replyToken,
          messages: [
            {
              type: "text",
              text: `📝 บันทึก "${note.title}" เรียบร้อยแล้วครับ!\n\n${preview}`,
            },
          ],
        });
      }
      return;
    }

    if (assistant.noteAction === "LIST") {
      const userNotes = await db.findNotesByUserId(userId);
      if (userNotes.length === 0) {
        await lineClient.replyMessage({
          replyToken,
          messages: [
            {
              type: "text",
              text: "คุณยังไม่มีโน้ตหรือรายการที่บันทึกไว้ครับ 🌿 สามารถพิมพ์สั่งจดได้เลย เช่น 'จดโน้ต ซื้อไข่ไก่ นม ปลากระป๋อง'",
            },
          ],
        });
      } else {
        const summary = userNotes
          .slice(0, 4)
          .map((n, i) => {
            const count = Array.isArray(n.items) ? n.items.length : 0;
            const done = Array.isArray(n.items) ? n.items.filter((it) => it.completed).length : 0;
            return `${i + 1}. 📝 ${n.title} (${done}/${count} เสร็จแล้ว)`;
          })
          .join("\n");

        const liffId = process.env.NEXT_PUBLIC_LIFF_ID;
        const liffUrl = liffId ? `https://liff.line.me/${liffId}?tab=notes` : "";

        await lineClient.replyMessage({
          replyToken,
          messages: [
            {
              type: "text",
              text: `📋 โน้ตของคุณ:\n\n${summary}\n\n👉 ดูและติ๊กรายการทั้งหมดได้ที่: ${liffUrl}`,
            },
          ],
        });
      }
      return;
    }
  }

  // -------------------------------------------------------------
  // CASE 2: จัดการ REMINDER (เตือนความจำ)
  // -------------------------------------------------------------
  if (assistant.type === "REMINDER") {
    switch (assistant.reminderAction) {
      case "CREATE": {
        if (assistant.remindAtISO) {
          const remindAt = new Date(assistant.remindAtISO);

          let reminder;
          try {
            reminder = await db.createReminder({
              userId,
              taskTitle: assistant.taskTitle || trimmedText,
              remindAt,
              displayDate: assistant.displayDate || undefined,
              displayTime: assistant.displayTime || undefined,
              recurrence: assistant.recurrence || "NONE",
              status: "PENDING",
            });
          } catch (dbErr) {
            console.error("Failed to save reminder in DB:", dbErr);
            reminder = {
              id: "temp-" + Date.now(),
              userId,
              taskTitle: assistant.taskTitle || trimmedText,
              remindAt: remindAt.toISOString(),
              displayDate: assistant.displayDate || "-",
              displayTime: assistant.displayTime || "-",
              recurrence: (assistant.recurrence || "NONE") as any,
              status: "PENDING" as const,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            };
          }

          try {
            const flexMessage = createReminderSuccessCard(reminder);
            await lineClient.replyMessage({
              replyToken,
              messages: [flexMessage],
            });
          } catch (flexErr) {
            console.error("Flex message failed, falling back to text:", flexErr);
            await lineClient.replyMessage({
              replyToken,
              messages: [
                {
                  type: "text",
                  text: `⏰ ตั้งเตือน "${reminder.taskTitle}" วันที่ ${reminder.displayDate || ""} เวลา ${reminder.displayTime || ""} เรียบร้อยแล้วครับ! 🌿`,
                },
              ],
            });
          }
        } else {
          await lineClient.replyMessage({
            replyToken,
            messages: [
              {
                type: "text",
                text:
                  assistant.replyText ||
                  `ต้องการให้เตือนเรื่อง "${assistant.taskTitle || trimmedText}" ในวันและเวลาไหนดีครับ?`,
              },
            ],
          });
        }
        return;
      }

      case "CLARIFY": {
        await lineClient.replyMessage({
          replyToken,
          messages: [
            {
              type: "text",
              text:
                assistant.replyText ||
                "ต้องการให้เตือนเรื่องอะไร ในวันและเวลาไหนครับ? แจ้งผมได้เลย เช่น 'พรุ่งนี้ 8 โมงเช้า โทรหาลูกค้า'",
            },
          ],
        });
        return;
      }

      case "CANCEL": {
        const latestPending = await db.findLatestPendingReminder(userId);
        if (latestPending) {
          await db.updateReminder(latestPending.id, { status: "CANCELLED" });
          await lineClient.replyMessage({
            replyToken,
            messages: [
              {
                type: "text",
                text: `ยกเลิกการเตือน "${latestPending.taskTitle}" เรียบร้อยแล้วครับ ❌`,
              },
            ],
          });
        } else {
          await lineClient.replyMessage({
            replyToken,
            messages: [
              {
                type: "text",
                text: "ไม่พบรายการแจ้งเตือนที่กำลังรอดำเนินการครับ",
              },
            ],
          });
        }
        return;
      }

      case "LIST": {
        const pendingReminders = await db.findRemindersByUserId(userId, "all");
        if (pendingReminders.length === 0) {
          await lineClient.replyMessage({
            replyToken,
            messages: [
              {
                type: "text",
                text: "ตอนนี้คุณไม่มีรายการแจ้งเตือนที่ค้างอยู่ครับ 🌿",
              },
            ],
          });
        } else {
          const listText = pendingReminders
            .slice(0, 5)
            .map((r, i) => `${i + 1}. 📌 ${r.taskTitle}\n   ⏰ ${r.displayDate || ""} ${r.displayTime || ""}`)
            .join("\n\n");

          await lineClient.replyMessage({
            replyToken,
            messages: [
              {
                type: "text",
                text: `📋 รายการแจ้งเตือนของคุณ:\n\n${listText}`,
              },
            ],
          });
        }
        return;
      }
    }
  }

  // -------------------------------------------------------------
  // CASE 3: GENERAL_CHAT หรือ สนทนาทั่วไป
  // -------------------------------------------------------------
  await lineClient.replyMessage({
    replyToken,
    messages: [
      {
        type: "text",
        text:
          assistant.replyText ||
          "สวัสดีครับ! ผมคือ AI Personal Assistant ผู้ช่วยส่วนตัวของคุณ 🌿\n\nสามารถบอกผมได้เลย เช่น:\n⏰ 'พรุ่งนี้ 9 โมง นัดประชุม'\n📝 'จดโน้ต ซื้อไข่ไก่ นม ขนมปัง'",
      },
    ],
  });
}


async function handlePostback(lineClient: ReturnType<typeof getLineMessagingClient>, event: PostbackEvent) {
  const replyToken = event.replyToken;
  const data = new URLSearchParams(event.postback.data);
  const action = data.get("action");
  const reminderId = data.get("id");

  if (action === "cancel" && reminderId) {
    try {
      const reminder = await db.updateReminder(reminderId, { status: "CANCELLED" });

      await lineClient.replyMessage({
        replyToken,
        messages: [
          {
            type: "text",
            text: `ยกเลิกการแจ้งเตือน "${reminder?.taskTitle || ""}" เรียบร้อยแล้วครับ ❌`,
          },
        ],
      });
    } catch (err) {
      console.error("Error cancelling reminder via postback:", err);
      await lineClient.replyMessage({
        replyToken,
        messages: [
          {
            type: "text",
            text: "ไม่พบรายการ หรือรายการนี้ถูกยกเลิกไปแล้วครับ",
          },
        ],
      });
    }
  }

  if (action === "complete" && reminderId) {
    try {
      const reminder = await db.updateReminder(reminderId, { status: "COMPLETED" });

      await lineClient.replyMessage({
        replyToken,
        messages: [
          {
            type: "text",
            text: `🎉 เยี่ยมมากครับ! บันทึกว่าทำ "${reminder?.taskTitle || ""}" เสร็จเรียบร้อยแล้ว`,
          },
        ],
      });
    } catch (err) {
      console.error("Error completing reminder via postback:", err);
    }
  }

  if (action === "snooze" && reminderId) {
    try {
      const minutes = parseInt(data.get("minutes") || "10", 10);
      const newRemindAt = new Date(Date.now() + minutes * 60 * 1000);
      const TIMEZONE = "Asia/Bangkok";
      const displayTime = formatInTimeZone(newRemindAt, TIMEZONE, "HH:mm น.");

      const reminder = await db.updateReminder(reminderId, {
        remindAt: newRemindAt,
        displayTime,
        status: "PENDING",
      });

      await lineClient.replyMessage({
        replyToken,
        messages: [
          {
            type: "text",
            text: `⏱️ เลื่อนการแจ้งเตือน "${reminder?.taskTitle || ""}" ออกไปอีก ${minutes} นาที (เป็นเวลา ${displayTime}) เรียบร้อยครับ`,
          },
        ],
      });
    } catch (err) {
      console.error("Error snoozing reminder via postback:", err);
    }
  }
}
