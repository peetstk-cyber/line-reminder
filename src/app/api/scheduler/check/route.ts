import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { lineMessagingClient } from "@/lib/line";
import { createReminderAlertCard } from "@/lib/line/flexTemplates";
import { addDays, addWeeks, addMonths } from "date-fns";
import { formatInTimeZone } from "date-fns-tz";

export const dynamic = "force-dynamic";

const TIMEZONE = "Asia/Bangkok";

export async function GET(req: NextRequest) {
  return handleSchedulerCheck(req);
}

export async function POST(req: NextRequest) {
  return handleSchedulerCheck(req);
}

async function handleSchedulerCheck(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers.get("authorization");

  if (cronSecret) {
    const isAuthorized =
      authHeader === `Bearer ${cronSecret}` ||
      req.headers.get("x-cron-secret") === cronSecret;

    if (!isAuthorized) {
      console.warn("Unauthorized scheduler trigger attempt");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const now = new Date();
  const dueReminders = await db.findDueReminders();

  let successCount = 0;
  let failedCount = 0;

  for (const reminder of dueReminders) {
    try {
      const lineUserId = reminder.lineUserId;

      if (lineUserId) {
        const alertCard = createReminderAlertCard(reminder as any);

        await lineMessagingClient.pushMessage({
          to: lineUserId,
          messages: [alertCard],
        });

        await db.createNotificationLog(reminder.id, "SUCCESS");
        successCount++;
      }

      if (reminder.recurrence === "NONE") {
        await db.updateReminder(reminder.id, { status: "COMPLETED" });
      } else {
        const remindAtDate = new Date(reminder.remindAt);
        let nextDate = remindAtDate;

        if (reminder.recurrence === "DAILY") {
          nextDate = addDays(remindAtDate, 1);
        } else if (reminder.recurrence === "WEEKLY") {
          nextDate = addWeeks(remindAtDate, 1);
        } else if (reminder.recurrence === "MONTHLY") {
          nextDate = addMonths(remindAtDate, 1);
        }

        const nextDisplayDate = formatInTimeZone(nextDate, TIMEZONE, "dd MMM yyyy");
        const nextDisplayTime = formatInTimeZone(nextDate, TIMEZONE, "HH:mm น.");

        await db.updateReminder(reminder.id, {
          remindAt: nextDate,
          displayDate: nextDisplayDate,
          displayTime: nextDisplayTime,
          status: "PENDING",
        });
      }
    } catch (err) {
      console.error(`Failed to process reminder ID ${reminder.id}:`, err);
      failedCount++;
      await db.createNotificationLog(reminder.id, "FAILED");
    }
  }

  return NextResponse.json({
    status: "ok",
    processedCount: dueReminders.length,
    successCount,
    failedCount,
    timestamp: now.toISOString(),
  });
}
