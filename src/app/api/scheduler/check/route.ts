import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
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

  // Verify Cron Secret
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

  // Query pending reminders that have reached their scheduled time
  const dueReminders = await prisma.reminder.findMany({
    where: {
      status: "PENDING",
      remindAt: {
        lte: now,
      },
    },
    include: {
      user: true,
    },
  });

  let successCount = 0;
  let failedCount = 0;

  for (const reminder of dueReminders) {
    try {
      const lineUserId = reminder.user?.lineUserId;

      if (lineUserId) {
        const alertCard = createReminderAlertCard(reminder);

        // 1. Send Push Notification to user's LINE
        await lineMessagingClient.pushMessage({
          to: lineUserId,
          messages: [alertCard],
        });

        // 2. Record Notification Log
        await prisma.notificationLog.create({
          data: {
            reminderId: reminder.id,
            status: "SUCCESS",
            sentAt: new Date(),
          },
        });

        successCount++;
      }

      // 3. Handle Recurrence or Completion
      if (reminder.recurrence === "NONE") {
        await prisma.reminder.update({
          where: { id: reminder.id },
          data: { status: "COMPLETED" },
        });
      } else {
        let nextDate = reminder.remindAt;
        if (reminder.recurrence === "DAILY") {
          nextDate = addDays(reminder.remindAt, 1);
        } else if (reminder.recurrence === "WEEKLY") {
          nextDate = addWeeks(reminder.remindAt, 1);
        } else if (reminder.recurrence === "MONTHLY") {
          nextDate = addMonths(reminder.remindAt, 1);
        }

        const nextDisplayDate = formatInTimeZone(nextDate, TIMEZONE, "dd MMM yyyy");
        const nextDisplayTime = formatInTimeZone(nextDate, TIMEZONE, "HH:mm น.");

        await prisma.reminder.update({
          where: { id: reminder.id },
          data: {
            remindAt: nextDate,
            displayDate: nextDisplayDate,
            displayTime: nextDisplayTime,
            status: "PENDING",
          },
        });
      }
    } catch (err) {
      console.error(`Failed to process reminder ID ${reminder.id}:`, err);
      failedCount++;

      await prisma.notificationLog.create({
        data: {
          reminderId: reminder.id,
          status: "FAILED",
          sentAt: new Date(),
        },
      });
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
