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
    let lineUserId = searchParams.get("lineUserId");
    let date = searchParams.get("date");
    let dates: string[] = [];

    // Check if json body is provided
    try {
      const body = await req.json();
      if (body) {
        if (body.lineUserId) lineUserId = body.lineUserId;
        if (Array.isArray(body.dates)) dates = body.dates;
        if (body.date && !dates.includes(body.date)) dates.push(body.date);
      }
    } catch (e) {
      // Body is optional
    }

    if (date && !dates.includes(date)) {
      dates.push(date);
    }

    if (!lineUserId) {
      return NextResponse.json({ error: "lineUserId is required" }, { status: 400 });
    }

    if (dates.length === 0) {
      return NextResponse.json({ error: "date or dates are required" }, { status: 400 });
    }

    const user = await db.findUserByLineId(lineUserId);
    if (!user) {
      return NextResponse.json({ status: "SUCCESS" });
    }

    await db.batchDeleteShifts(user.id, dates);

    return NextResponse.json({ status: "SUCCESS" });
  } catch (err: any) {
    console.error("Error deleting shifts:", err);
    return NextResponse.json({ error: "Failed to delete shifts" }, { status: 500 });
  }
}
