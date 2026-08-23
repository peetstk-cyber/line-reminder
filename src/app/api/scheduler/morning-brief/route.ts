import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getLineMessagingClient } from "@/lib/line";
import { createMorningBriefCard } from "@/lib/line/flexTemplates";
import { formatInTimeZone } from "date-fns-tz";

export const dynamic = "force-dynamic";

const TIMEZONE = "Asia/Bangkok";

export async function GET(req: NextRequest) {
  return handleMorningBrief(req);
}

export async function POST(req: NextRequest) {
  return handleMorningBrief(req);
}

async function handleMorningBrief(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const targetLineUserId = searchParams.get("lineUserId");

  const lineClient = getLineMessagingClient();
  const now = new Date();
  const dateStr = formatInTimeZone(now, TIMEZONE, "EEEEที่ dd MMMM yyyy");

  let users = [];
  if (targetLineUserId) {
    const singleUser = await db.findUserByLineId(targetLineUserId);
    if (singleUser) users = [singleUser];
  } else {
    users = await db.findAllUsers();
  }

  let successCount = 0;
  let failedCount = 0;

  for (const user of users) {
    try {
      if (!user.lineUserId) continue;

      const briefData = await db.findMorningBriefData(user.id);
      const card = createMorningBriefCard({
        displayName: user.displayName || "คุณ",
        dateStr,
        todayReminders: briefData.todayReminders,
        pendingNotes: briefData.pendingNotes,
      });

      await lineClient.pushMessage({
        to: user.lineUserId,
        messages: [card],
      });

      successCount++;
    } catch (err) {
      console.error(`Failed to send morning brief to user ${user.id}:`, err);
      failedCount++;
    }
  }

  return NextResponse.json({
    status: "ok",
    dateStr,
    totalUsers: users.length,
    successCount,
    failedCount,
    timestamp: now.toISOString(),
  });
}
