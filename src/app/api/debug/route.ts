import { NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const secret = searchParams.get("secret");
    const allowedSecret = process.env.CRON_SECRET || process.env.DEBUG_SECRET;

    if (process.env.NODE_ENV === "production" && (!allowedSecret || secret !== allowedSecret)) {
      return NextResponse.json({ error: "Unauthorized access" }, { status: 403 });
    }

    await db.ensureTablesExist();
    const sql = neon(process.env.DATABASE_URL!);
    const logs = await sql`SELECT * FROM "webhook_logs" ORDER BY "receivedAt" DESC LIMIT 20;`;
    const users = await sql`SELECT * FROM "users" LIMIT 10;`;
    const reminders = await sql`SELECT * FROM "reminders" ORDER BY "createdAt" DESC LIMIT 10;`;
    const notes = await sql`SELECT * FROM "notes" ORDER BY "createdAt" DESC LIMIT 10;`;

    return NextResponse.json({
      status: "ok",
      env: {
        hasDatabaseUrl: !!process.env.DATABASE_URL,
        hasLineToken: !!process.env.LINE_CHANNEL_ACCESS_TOKEN,
        hasLineSecret: !!process.env.LINE_CHANNEL_SECRET,
        hasGeminiKey: !!process.env.GEMINI_API_KEY,
        lineSecretPrefix: process.env.LINE_CHANNEL_SECRET?.slice(0, 4) + "...",
      },
      logs,
      users,
      reminders,
      notes,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message });
  }
}

