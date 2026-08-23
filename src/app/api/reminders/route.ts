import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { parseReminderIntent } from "@/lib/ai/reminderParser";
import { startOfDay, endOfDay, startOfWeek, endOfWeek } from "date-fns";
import { toZonedTime, formatInTimeZone } from "date-fns-tz";

const TIMEZONE = "Asia/Bangkok";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const lineUserId = searchParams.get("lineUserId");
    const filter = searchParams.get("filter") || "all";

    if (!lineUserId) {
      return NextResponse.json({ error: "lineUserId is required" }, { status: 400 });
    }

    const user = await prisma.user.findUnique({
      where: { lineUserId },
    });

    if (!user) {
      return NextResponse.json({
        reminders: [],
        stats: { todayCount: 0, totalPending: 0, completedCount: 0 },
      });
    }

    const now = new Date();
    const zonedNow = toZonedTime(now, TIMEZONE);
    const todayStart = startOfDay(zonedNow);
    const todayEnd = endOfDay(zonedNow);
    const weekStart = startOfWeek(zonedNow, { weekStartsOn: 1 });
    const weekEnd = endOfWeek(zonedNow, { weekStartsOn: 1 });

    // Calculate stats
    const [todayCount, totalPending, completedCount] = await Promise.all([
      prisma.reminder.count({
        where: {
          userId: user.id,
          status: "PENDING",
          remindAt: {
            gte: todayStart,
            lte: todayEnd,
          },
        },
      }),
      prisma.reminder.count({
        where: {
          userId: user.id,
          status: "PENDING",
        },
      }),
      prisma.reminder.count({
        where: {
          userId: user.id,
          status: "COMPLETED",
        },
      }),
    ]);

    // Build filter where clause
    const whereClause: Record<string, unknown> = {
      userId: user.id,
    };

    if (filter === "today") {
      whereClause.status = "PENDING";
      whereClause.remindAt = {
        gte: todayStart,
        lte: todayEnd,
      };
    } else if (filter === "week") {
      whereClause.status = "PENDING";
      whereClause.remindAt = {
        gte: weekStart,
        lte: weekEnd,
      };
    } else if (filter === "completed") {
      whereClause.status = "COMPLETED";
    } else {
      // "all" - shows pending and recent completed, excluding cancelled
      whereClause.status = {
        in: ["PENDING", "COMPLETED"],
      };
    }

    const reminders = await prisma.reminder.findMany({
      where: whereClause,
      orderBy: filter === "completed" ? { updatedAt: "desc" } : { remindAt: "asc" },
    });

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
    const { lineUserId, prompt, taskTitle, remindAt, recurrence } = body;

    if (!lineUserId) {
      return NextResponse.json({ error: "lineUserId is required" }, { status: 400 });
    }

    let user = await prisma.user.findUnique({
      where: { lineUserId },
    });

    if (!user) {
      user = await prisma.user.create({
        data: { lineUserId },
      });
    }

    // If natural language prompt is provided, parse with Gemini AI
    if (prompt && typeof prompt === "string") {
      const parsed = await parseReminderIntent(prompt, TIMEZONE);

      if (parsed.action === "CREATE" && parsed.remindAtISO) {
        const reminder = await prisma.reminder.create({
          data: {
            userId: user.id,
            taskTitle: parsed.taskTitle,
            remindAt: new Date(parsed.remindAtISO),
            displayDate: parsed.displayDate,
            displayTime: parsed.displayTime,
            recurrence: parsed.recurrence,
            status: "PENDING",
          },
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

    // Manual form submission
    if (!taskTitle || !remindAt) {
      return NextResponse.json(
        { error: "taskTitle and remindAt are required for manual creation" },
        { status: 400 }
      );
    }

    const remindAtDate = new Date(remindAt);
    const displayDate = formatInTimeZone(remindAtDate, TIMEZONE, "dd MMM yyyy");
    const displayTime = formatInTimeZone(remindAtDate, TIMEZONE, "HH:mm น.");

    const reminder = await prisma.reminder.create({
      data: {
        userId: user.id,
        taskTitle,
        remindAt: remindAtDate,
        displayDate,
        displayTime,
        recurrence: recurrence || "NONE",
        status: "PENDING",
      },
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
