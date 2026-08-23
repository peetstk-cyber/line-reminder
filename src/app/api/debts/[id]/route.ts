import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const debt = await db.findDebtById(params.id);
    if (!debt) {
      return NextResponse.json({ error: "Debt not found" }, { status: 404 });
    }
    return NextResponse.json({ debt });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await req.json().catch(() => ({}));
    const { action = "SETTLE" } = body;

    if (action === "SETTLE") {
      const updated = await db.settleDebt(params.id);
      return NextResponse.json({ success: true, debt: updated });
    }

    return NextResponse.json({ error: "Unsupported action" }, { status: 400 });
  } catch (err: any) {
    console.error("PATCH /api/debts/[id] error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await db.deleteDebt(params.id);
    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("DELETE /api/debts/[id] error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
