import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { parseReminderIntent } from "@/lib/ai/reminderParser";
import { formatInTimeZone } from "date-fns-tz";

export const dynamic = "force-dynamic";

const TIMEZONE = "Asia/Bangkok";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const lineUserId = searchParams.get("lineUserId");
    const filter = searchParams.get("filter") || "all";

    if (!lineUserId) {
      return NextResponse.json({ error: "lineUserId is required" }, { status: 400 });
    }

    const user = await db.findUserByLineId(lineUserId);

    if (!user) {
      return NextResponse.json({
        reminders: [],
        stats: { todayCount: 0, totalPending: 0, completedCount: 0 },
      });
    }

    const reminders = await db.findRemindersByUserId(user.id, filter);
    const allReminders = await db.findRemindersByUserId(user.id, "all");

    const todayCount = allReminders.filter((r) => r.status === "PENDING" && r.displayDate === formatInTimeZone(new Date(), TIMEZONE, "dd MMM yyyy")).length;
    const totalPending = allReminders.filter((r) => r.status === "PENDING").length;
    const completedCount = allReminders.filter((r) => r.status === "COMPLETED").length;

    return NextResponse.json({
      reminders,
      stats: {
        todayCount,
        totalPending,
        completedCount,
      },
    });
  } catch (err) {
    console.error("Error fetching reminders:", err);
    return NextResponse.json({ error: "Failed to fetch reminders" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { lineUserId, prompt, taskTitle, remindAt, recurrence, advanceMinutes = 0 } = body;

    if (!lineUserId) {
      return NextResponse.json({ error: "lineUserId is required" }, { status: 400 });
    }

    const user = await db.upsertUser(lineUserId);

    if (prompt && typeof prompt === "string") {
      const parsed = await parseReminderIntent(prompt, TIMEZONE);

      if (parsed.action === "CREATE" && parsed.remindAtISO) {
        const reminder = await db.createReminder({
          userId: user.id,
          taskTitle: parsed.taskTitle,
          remindAt: new Date(parsed.remindAtISO),
          displayDate: parsed.displayDate,
          displayTime: parsed.displayTime,
          recurrence: parsed.recurrence,
          status: "PENDING",
        });

        return NextResponse.json({
          status: "SUCCESS",
          reminder,
          parsed,
        });
      } else {
        return NextResponse.json({
          status: "CLARIFY",
          message:
            parsed.clarificationQuestion ||
            "กรุณาระบุวันและเวลาที่ต้องการให้เตือนเพิ่มเติม เช่น 'พรุ่งนี้ 9 โมง'",
          parsed,
        });
      }
    }

    if (!taskTitle || !remindAt) {
      return NextResponse.json(
        { error: "taskTitle and remindAt are required for manual creation" },
        { status: 400 }
      );
    }

    const triggerDate = new Date(remindAt);
    const eventDate = advanceMinutes > 0 ? new Date(triggerDate.getTime() + advanceMinutes * 60000) : triggerDate;
    const displayDate = formatInTimeZone(eventDate, TIMEZONE, "dd MMM yyyy");
    let displayTime = formatInTimeZone(eventDate, TIMEZONE, "HH:mm น.");
    if (advanceMinutes > 0) {
      const advLabel =
        advanceMinutes >= 1440
          ? `${Math.floor(advanceMinutes / 1440)} วัน`
          : advanceMinutes >= 60
          ? `${Math.floor(advanceMinutes / 60)} ชม.`
          : `${advanceMinutes} นาที`;
      displayTime += ` (เตือนล่วงหน้า ${advLabel})`;
    }

    const reminder = await db.createReminder({
      userId: user.id,
      taskTitle,
      remindAt: triggerDate,
      displayDate,
      displayTime,
      recurrence: recurrence || "NONE",
      status: "PENDING",
    });

    return NextResponse.json({
      status: "SUCCESS",
      reminder,
    });
  } catch (err) {
    console.error("Error creating reminder:", err);
    return NextResponse.json({ error: "Failed to create reminder" }, { status: 500 });
  }
}
