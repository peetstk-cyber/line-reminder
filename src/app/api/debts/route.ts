import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const lineUserId = searchParams.get("lineUserId");

    if (!lineUserId) {
      return NextResponse.json({ error: "lineUserId is required" }, { status: 400 });
    }

    const user = await db.findUserByLineId(lineUserId);
    if (!user) {
      return NextResponse.json({ summary: { totalReceivable: 0, totalPayable: 0, netBalance: 0, people: [] }, debts: [] });
    }

    const summary = await db.findDebtSummary(user.id);
    const debts = await db.findDebtsByUserId(user.id);
    const profiles = await db.findPersonProfilesByUserId(user.id);

    return NextResponse.json({ summary, debts, profiles });
  } catch (err: any) {
    console.error("GET /api/debts error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { lineUserId, personName, amount, type = "LENT", description } = body;

    if (!lineUserId || !personName || amount === undefined || amount === null) {
      return NextResponse.json({ error: "lineUserId, personName, and amount are required" }, { status: 400 });
    }

    let user = await db.findUserByLineId(lineUserId);
    if (!user) {
      user = await db.upsertUser(lineUserId, "User");
    }

    // Ensure person profile exists
    let profile = await db.getPersonProfile(user.id, personName);
    if (!profile) {
      profile = await db.upsertPersonProfile({
        userId: user.id,
        name: personName,
      });
    }

    const debt = await db.createDebt({
      userId: user.id,
      personName,
      amount: parseFloat(amount),
      type,
      description,
    });

    return NextResponse.json({ success: true, debt, profile });
  } catch (err: any) {
    console.error("POST /api/debts error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
