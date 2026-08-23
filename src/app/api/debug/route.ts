import { NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const sql = neon(process.env.DATABASE_URL!);
    const logs = await sql`SELECT * FROM "webhook_logs" ORDER BY "receivedAt" DESC LIMIT 20;`;
    const users = await sql`SELECT * FROM "users" LIMIT 10;`;
    const reminders = await sql`SELECT * FROM "reminders" ORDER BY "createdAt" DESC LIMIT 10;`;

    return NextResponse.json({
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
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message });
  }
}
