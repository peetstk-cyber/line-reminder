import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const { lineUserId, displayName, pictureUrl } = await req.json();

    if (!lineUserId) {
      return NextResponse.json({ error: "lineUserId is required" }, { status: 400 });
    }

    const user = await prisma.user.upsert({
      where: { lineUserId },
      update: {
        ...(displayName ? { displayName } : {}),
        ...(pictureUrl ? { pictureUrl } : {}),
      },
      create: {
        lineUserId,
        displayName: displayName || "LINE User",
        pictureUrl,
      },
    });

    return NextResponse.json({ user });
  } catch (err) {
    console.error("Error syncing LIFF user:", err);
    return NextResponse.json({ error: "Failed to sync user" }, { status: 500 });
  }
}
