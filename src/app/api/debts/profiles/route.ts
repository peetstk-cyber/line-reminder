import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { lineUserId, personName, avatarType, avatarValue, color } = body;

    if (!lineUserId || !personName) {
      return NextResponse.json({ error: "lineUserId and personName are required" }, { status: 400 });
    }

    let user = await db.findUserByLineId(lineUserId);
    if (!user) {
      user = await db.upsertUser(lineUserId, "User");
    }

    const profile = await db.upsertPersonProfile({
      userId: user.id,
      name: personName,
      avatarType: avatarType || "PRESET_CHARACTER",
      avatarValue: avatarValue || "cat",
      color: color || "#E8F0E6",
    });

    return NextResponse.json({ success: true, profile });
  } catch (err: any) {
    console.error("POST /api/debts/profiles error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
