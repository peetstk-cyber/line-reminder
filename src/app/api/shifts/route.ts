import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const lineUserId = searchParams.get("lineUserId");
    const month = searchParams.get("month"); // e.g. "2026-09"

    if (!lineUserId) {
      return NextResponse.json({ error: "lineUserId is required" }, { status: 400 });
    }

    const user = await db.findUserByLineId(lineUserId);
    if (!user) {
      return NextResponse.json({ shifts: [] });
    }

    const shifts = await db.findShiftsByUserId(user.id, month || undefined);
    return NextResponse.json({ shifts });
  } catch (err: any) {
    console.error("Error fetching shifts:", err);
    return NextResponse.json({ error: "Failed to fetch shifts" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { lineUserId, shifts } = body;

    if (!lineUserId) {
      return NextResponse.json({ error: "lineUserId is required" }, { status: 400 });
    }

    if (!Array.isArray(shifts) || shifts.length === 0) {
      return NextResponse.json({ error: "shifts array is required" }, { status: 400 });
    }

    const user = await db.upsertUser(lineUserId);

    const savedShifts = await db.batchUpsertShifts(user.id, shifts);

    return NextResponse.json({
      status: "SUCCESS",
      shifts: savedShifts,
    });
  } catch (err: any) {
    console.error("Error saving shifts:", err);
    return NextResponse.json({ error: "Failed to save shifts" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const lineUserId = searchParams.get("lineUserId");
    const date = searchParams.get("date");

    if (!lineUserId || !date) {
      return NextResponse.json({ error: "lineUserId and date are required" }, { status: 400 });
    }

    const user = await db.findUserByLineId(lineUserId);
    if (!user) {
      return NextResponse.json({ status: "SUCCESS" });
    }

    await db.deleteShiftByDate(user.id, date);

    return NextResponse.json({ status: "SUCCESS" });
  } catch (err: any) {
    console.error("Error deleting shift:", err);
    return NextResponse.json({ error: "Failed to delete shift" }, { status: 500 });
  }
}
