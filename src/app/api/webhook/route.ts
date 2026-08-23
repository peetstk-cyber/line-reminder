import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { WebhookRequestBody, WebhookEvent, MessageEvent, PostbackEvent } from "@line/bot-sdk";
import { prisma } from "@/lib/prisma";
import { lineMessagingClient } from "@/lib/line";
import { parseReminderIntent } from "@/lib/ai/reminderParser";
import { createReminderSuccessCard } from "@/lib/line/flexTemplates";
import { formatInTimeZone } from "date-fns-tz";

export const dynamic = "force-dynamic";

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

  if (channelSecret && signature) {
    if (!verifySignature(rawBody, signature, channelSecret)) {
      console.warn("Invalid LINE signature received");
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }
  }

  let body: WebhookRequestBody;
  try {
    body = JSON.parse(rawBody || "{}");
  } catch (err) {
    console.error("Failed to parse LINE webhook body:", err);
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const events: WebhookEvent[] = body.events || [];

  // If this is a LINE Verify ping (events is empty), return 200 OK immediately
  if (events.length === 0) {
    return NextResponse.json({ status: "ok", message: "Webhook verified" });
  }

  // Process all incoming events concurrently
  await Promise.all(
    events.map(async (event) => {
      try {
        await handleEvent(event);
      } catch (err) {
        console.error("Error processing LINE event:", err, "Event:", JSON.stringify(event));
      }
    })
  );

  return NextResponse.json({ status: "success" });
}

async function handleEvent(event: WebhookEvent) {
  const lineUserId = event.source.userId;
  if (!lineUserId) return;

  // 1. Upsert User in database
  let user = await prisma.user.findUnique({
    where: { lineUserId },
  });

  if (!user) {
    // Optionally fetch profile from LINE API
    let displayName = "LINE User";
    let pictureUrl: string | undefined = undefined;

    try {
      const profile = await lineMessagingClient.getProfile(lineUserId);
      displayName = profile.displayName;
      pictureUrl = profile.pictureUrl;
    } catch {
      // Fallback silently if profile fetch fails
    }

    user = await prisma.user.create({
      data: {
        lineUserId,
        displayName,
        pictureUrl,
      },
    });
  }

  // 2. Handle Message Event
  if (event.type === "message" && event.message.type === "text") {
    await handleTextMessage(event.replyToken, event.message.text, user.id);
  }

  // 3. Handle Postback Event (Buttons click e.g. Cancel or Complete)
  if (event.type === "postback") {
    await handlePostback(event);
  }
}

async function handleTextMessage(replyToken: string, userText: string, userId: string) {
  const trimmedText = userText.trim();

  // วิเคราะห์ Intent และแปลงเวลาด้วย Gemini AI
  const parsed = await parseReminderIntent(userText, "Asia/Bangkok");

  switch (parsed.action) {
    case "CREATE": {
      if (parsed.remindAtISO) {
        const remindAt = new Date(parsed.remindAtISO);

        const reminder = await prisma.reminder.create({
          data: {
            userId,
            taskTitle: parsed.taskTitle,
            remindAt,
            displayDate: parsed.displayDate,
            displayTime: parsed.displayTime,
            recurrence: parsed.recurrence,
            status: "PENDING",
          },
        });

        const flexMessage = createReminderSuccessCard(reminder);
        await lineMessagingClient.replyMessage({
          replyToken,
          messages: [flexMessage],
        });
      } else {
        // ขาดเวลา -> ส่งคำถามกลับ
        await lineMessagingClient.replyMessage({
          replyToken,
          messages: [
            {
              type: "text",
              text:
                parsed.clarificationQuestion ||
                `ต้องการให้เตือนเรื่อง "${parsed.taskTitle}" ในวันและเวลาไหนดีครับ?`,
            },
          ],
        });
      }
      break;
    }

    case "CLARIFY": {
      await lineMessagingClient.replyMessage({
        replyToken,
        messages: [
          {
            type: "text",
            text:
              parsed.clarificationQuestion ||
              "ต้องการให้เตือนเรื่องอะไร ในวันและเวลาไหนครับ? แจ้งผมได้เลย เช่น 'พรุ่งนี้ 8 โมงเช้า โทรหาลูกค้า'",
          },
        ],
      });
      break;
    }

    case "CANCEL": {
      const latestPending = await prisma.reminder.findFirst({
        where: { userId, status: "PENDING" },
        orderBy: { createdAt: "desc" },
      });

      if (latestPending) {
        await prisma.reminder.update({
          where: { id: latestPending.id },
          data: { status: "CANCELLED" },
        });

        await lineMessagingClient.replyMessage({
          replyToken,
          messages: [
            {
              type: "text",
              text: `ยกเลิกการเตือน "${latestPending.taskTitle}" เรียบร้อยแล้วครับ ❌`,
            },
          ],
        });
      } else {
        await lineMessagingClient.replyMessage({
          replyToken,
          messages: [
            {
              type: "text",
              text: "ไม่พบรายการแจ้งเตือนที่กำลังรอดำเนินการครับ",
            },
          ],
        });
      }
      break;
    }

    case "LIST": {
      const pendingReminders = await prisma.reminder.findMany({
        where: { userId, status: "PENDING" },
        orderBy: { remindAt: "asc" },
        take: 5,
      });

      if (pendingReminders.length === 0) {
        await lineMessagingClient.replyMessage({
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
          .map((r, i) => `${i + 1}. 📌 ${r.taskTitle}\n   ⏰ ${r.displayDate || ""} ${r.displayTime || ""}`)
          .join("\n\n");

        await lineMessagingClient.replyMessage({
          replyToken,
          messages: [
            {
              type: "text",
              text: `📋 รายการแจ้งเตือนที่กำลังจะมาถึง:\n\n${listText}`,
            },
          ],
        });
      }
      break;
    }

    case "GENERAL_CHAT":
    default: {
      await lineMessagingClient.replyMessage({
        replyToken,
        messages: [
          {
            type: "text",
            text:
              parsed.clarificationQuestion ||
              "สวัสดีครับ! ผมคือ AI Smart Reminder บอทช่วยจำ สามารถพิมพ์หรือส่งเสียงบอกสิ่งที่ต้องการให้เตือนพร้อมวันเวลาได้เลยครับ เช่น 'พรุ่งนี้ 2 ทุ่ม อ่านหนังสือ'",
          },
        ],
      });
      break;
    }
  }
}

async function handlePostback(event: PostbackEvent) {
  const replyToken = event.replyToken;
  const data = new URLSearchParams(event.postback.data);
  const action = data.get("action");
  const reminderId = data.get("id");

  if (action === "cancel" && reminderId) {
    try {
      const reminder = await prisma.reminder.update({
        where: { id: reminderId },
        data: { status: "CANCELLED" },
      });

      await lineMessagingClient.replyMessage({
        replyToken,
        messages: [
          {
            type: "text",
            text: `ยกเลิกการแจ้งเตือน "${reminder.taskTitle}" เรียบร้อยแล้วครับ ❌`,
          },
        ],
      });
    } catch (err) {
      console.error("Error cancelling reminder via postback:", err);
      await lineMessagingClient.replyMessage({
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
      const reminder = await prisma.reminder.update({
        where: { id: reminderId },
        data: { status: "COMPLETED" },
      });

      await lineMessagingClient.replyMessage({
        replyToken,
        messages: [
          {
            type: "text",
            text: `🎉 เยี่ยมมากครับ! บันทึกว่าทำ "${reminder.taskTitle}" เสร็จเรียบร้อยแล้ว`,
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

      const reminder = await prisma.reminder.update({
        where: { id: reminderId },
        data: {
          remindAt: newRemindAt,
          displayTime,
          status: "PENDING",
        },
      });

      await lineMessagingClient.replyMessage({
        replyToken,
        messages: [
          {
            type: "text",
            text: `⏱️ เลื่อนการแจ้งเตือน "${reminder.taskTitle}" ออกไปอีก ${minutes} นาที (เป็นเวลา ${displayTime}) เรียบร้อยครับ`,
          },
        ],
      });
    } catch (err) {
      console.error("Error snoozing reminder via postback:", err);
    }
  }
}

