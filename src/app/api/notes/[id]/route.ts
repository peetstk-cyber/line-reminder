import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const note = await db.findNoteById(id);
    if (!note) {
      return NextResponse.json({ error: "Note not found" }, { status: 404 });
    }
    return NextResponse.json({ note });
  } catch (err: any) {
    console.error("Error finding note:", err);
    return NextResponse.json({ error: err.message || "Failed to find note" }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();
    const { toggleItemId, title, items, category, isPinned } = body;

    if (toggleItemId) {
      const updated = await db.toggleNoteItem(id, toggleItemId);
      if (!updated) {
        return NextResponse.json({ error: "Note not found" }, { status: 404 });
      }
      return NextResponse.json({ status: "SUCCESS", note: updated });
    }

    const updated = await db.updateNote(id, {
      title,
      items,
      category,
      isPinned,
    });

    if (!updated) {
      return NextResponse.json({ error: "Note not found" }, { status: 404 });
    }

    return NextResponse.json({ status: "SUCCESS", note: updated });
  } catch (err: any) {
    console.error("Error updating note:", err);
    return NextResponse.json({ error: err.message || "Failed to update note" }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    await db.deleteNote(id);
    return NextResponse.json({ status: "SUCCESS" });
  } catch (err: any) {
    console.error("Error deleting note:", err);
    return NextResponse.json({ error: err.message || "Failed to delete note" }, { status: 500 });
  }
}
