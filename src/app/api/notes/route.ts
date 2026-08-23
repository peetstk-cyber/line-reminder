import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const lineUserId = searchParams.get("lineUserId");
    const category = searchParams.get("category") || "ALL";

    if (!lineUserId) {
      return NextResponse.json({ error: "lineUserId is required" }, { status: 400 });
    }

    let user = await db.findUserByLineId(lineUserId);
    if (!user) {
      user = await db.upsertUser(lineUserId);
    }

    const notes = await db.findNotesByUserId(user.id, category);

    return NextResponse.json({
      notes,
      count: notes.length,
    });
  } catch (err: any) {
    console.error("Error fetching notes:", err);
    return NextResponse.json({ error: err.message || "Failed to fetch notes" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { lineUserId, title, items, category, isPinned } = body;

    if (!lineUserId) {
      return NextResponse.json({ error: "lineUserId is required" }, { status: 400 });
    }

    let user = await db.findUserByLineId(lineUserId);
    if (!user) {
      user = await db.upsertUser(lineUserId);
    }

    const formattedItems = Array.isArray(items)
      ? items.map((it: any) => {
          if (typeof it === "string") {
            return {
              id: "item-" + Math.random().toString(36).substring(2, 9),
              text: it.trim(),
              completed: false,
            };
          }
          return {
            id: it.id || "item-" + Math.random().toString(36).substring(2, 9),
            text: it.text || "",
            completed: !!it.completed,
          };
        })
      : [];

    const note = await db.createNote({
      userId: user.id,
      title: title || (category === "SHOPPING" ? "รายการซื้อของ" : "โน้ตใหม่"),
      items: formattedItems,
      category: category || "GENERAL",
      isPinned: !!isPinned,
    });

    return NextResponse.json({
      status: "SUCCESS",
      note,
    });
  } catch (err: any) {
    console.error("Error creating note:", err);
    return NextResponse.json({ error: err.message || "Failed to create note" }, { status: 500 });
  }
}
