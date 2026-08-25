import { NextRequest, NextResponse } from "next/server";
import { db, DbUser } from "@/lib/db";
import { getLineMessagingClient } from "@/lib/line";
import { createReadingEveningBriefCard } from "@/lib/line/flexTemplates";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  return handleReadingBrief(req);
}

export async function POST(req: NextRequest) {
  return handleReadingBrief(req);
}

async function handleReadingBrief(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const targetLineUserId = searchParams.get("lineUserId");

  const lineClient = getLineMessagingClient();
  const now = new Date();

  let users: DbUser[] = [];
  if (targetLineUserId) {
    const singleUser = await db.findUserByLineId(targetLineUserId);
    if (singleUser) users = [singleUser];
  } else {
    users = await db.findAllUsers();
  }

  let sentCount = 0;
  let skippedCount = 0;
  let failedCount = 0;

  for (const user of users) {
    try {
      if (!user.lineUserId) continue;

      const readingData = await db.findEveningReadingBriefData(user.id);

      // Only send if there are pending reading items
      if (!readingData.hasPending || readingData.readingNotes.length === 0) {
        skippedCount++;
        continue;
      }

      const card = createReadingEveningBriefCard({
        displayName: user.displayName || "คุณ",
        readingNotes: readingData.readingNotes,
      });

      await lineClient.pushMessage({
        to: user.lineUserId,
        messages: [card],
      });

      sentCount++;
    } catch (err) {
      console.error(`Failed to send reading brief to user ${user.id}:`, err);
      failedCount++;
    }
  }

  return NextResponse.json({
    status: "ok",
    totalUsers: users.length,
    sentCount,
    skippedCount,
    failedCount,
    timestamp: now.toISOString(),
  });
}
