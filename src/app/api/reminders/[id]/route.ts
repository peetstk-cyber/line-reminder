import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { formatInTimeZone } from "date-fns-tz";

export const dynamic = "force-dynamic";

const TIMEZONE = "Asia/Bangkok";

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;
    const body = await req.json();
    const { taskTitle, remindAt, status, recurrence } = body;

    const dataToUpdate: Record<string, unknown> = {};

    if (taskTitle !== undefined) dataToUpdate.taskTitle = taskTitle;
    if (status !== undefined) dataToUpdate.status = status;
    if (recurrence !== undefined) dataToUpdate.recurrence = recurrence;

    if (remindAt !== undefined) {
      const remindAtDate = new Date(remindAt);
      dataToUpdate.remindAt = remindAtDate;
      dataToUpdate.displayDate = formatInTimeZone(remindAtDate, TIMEZONE, "dd MMM yyyy");
      dataToUpdate.displayTime = formatInTimeZone(remindAtDate, TIMEZONE, "HH:mm น.");
    }

    const updated = await prisma.reminder.update({
      where: { id },
      data: dataToUpdate,
    });

    return NextResponse.json({ reminder: updated });
  } catch (err) {
    console.error("Error updating reminder:", err);
    return NextResponse.json({ error: "Failed to update reminder" }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;

    await prisma.reminder.delete({
      where: { id },
    });

    return NextResponse.json({ status: "deleted", id });
  } catch (err) {
    console.error("Error deleting reminder:", err);
    return NextResponse.json({ error: "Failed to delete reminder" }, { status: 500 });
  }
}
