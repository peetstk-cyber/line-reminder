import { neon } from "@neondatabase/serverless";

function getSql() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is not defined in environment variables");
  }
  return neon(url);
}

export interface DbUser {
  id: string;
  lineUserId: string;
  displayName: string | null;
  pictureUrl: string | null;
  createdAt: string;
}

export interface DbReminder {
  id: string;
  userId: string;
  taskTitle: string;
  remindAt: string;
  displayDate: string | null;
  displayTime: string | null;
  status: "PENDING" | "COMPLETED" | "CANCELLED";
  recurrence: "NONE" | "DAILY" | "WEEKLY" | "MONTHLY";
  createdAt: string;
  updatedAt: string;
  user?: DbUser;
}

export const db = {
  async upsertUser(lineUserId: string, displayName?: string, pictureUrl?: string): Promise<DbUser> {
    const sql = getSql();
    const rows = await sql`
      INSERT INTO "users" ("id", "lineUserId", "displayName", "pictureUrl")
      VALUES (gen_random_uuid()::text, ${lineUserId}, ${displayName || null}, ${pictureUrl || null})
      ON CONFLICT ("lineUserId") DO UPDATE SET
        "displayName" = COALESCE(EXCLUDED."displayName", "users"."displayName"),
        "pictureUrl" = COALESCE(EXCLUDED."pictureUrl", "users"."pictureUrl")
      RETURNING *;
    `;
    return rows[0] as DbUser;
  },

  async findUserByLineId(lineUserId: string): Promise<DbUser | null> {
    const sql = getSql();
    const rows = await sql`SELECT * FROM "users" WHERE "lineUserId" = ${lineUserId} LIMIT 1;`;
    return (rows[0] as DbUser) || null;
  },

  async createReminder(data: {
    userId: string;
    taskTitle: string;
    remindAt: Date;
    displayDate?: string;
    displayTime?: string;
    recurrence?: "NONE" | "DAILY" | "WEEKLY" | "MONTHLY";
    status?: "PENDING" | "COMPLETED" | "CANCELLED";
  }): Promise<DbReminder> {
    const sql = getSql();
    const remindAtIso = data.remindAt.toISOString();
    const rows = await sql`
      INSERT INTO "reminders" (
        "id", "userId", "taskTitle", "remindAt", "displayDate", "displayTime", "status", "recurrence"
      )
      VALUES (
        gen_random_uuid()::text,
        ${data.userId},
        ${data.taskTitle},
        ${remindAtIso},
        ${data.displayDate || null},
        ${data.displayTime || null},
        ${(data.status || "PENDING") as any},
        ${(data.recurrence || "NONE") as any}
      )
      RETURNING *;
    `;
    return rows[0] as DbReminder;
  },

  async findLatestPendingReminder(userId: string): Promise<DbReminder | null> {
    const sql = getSql();
    const rows = await sql`
      SELECT * FROM "reminders"
      WHERE "userId" = ${userId} AND "status" = 'PENDING'
      ORDER BY "createdAt" DESC
      LIMIT 1;
    `;
    return (rows[0] as DbReminder) || null;
  },

  async findRemindersByUserId(userId: string, filter?: string): Promise<DbReminder[]> {
    const sql = getSql();
    if (filter === "completed") {
      const rows = await sql`
        SELECT * FROM "reminders"
        WHERE "userId" = ${userId} AND "status" = 'COMPLETED'
        ORDER BY "updatedAt" DESC;
      `;
      return rows as DbReminder[];
    }

    if (filter === "today") {
      const rows = await sql`
        SELECT * FROM "reminders"
        WHERE "userId" = ${userId} AND "status" = 'PENDING'
        AND "remindAt"::date = CURRENT_DATE
        ORDER BY "remindAt" ASC;
      `;
      return rows as DbReminder[];
    }

    const rows = await sql`
      SELECT * FROM "reminders"
      WHERE "userId" = ${userId} AND "status" IN ('PENDING', 'COMPLETED')
      ORDER BY "remindAt" ASC;
    `;
    return rows as DbReminder[];
  },

  async updateReminder(id: string, data: Partial<DbReminder> & { remindAt?: Date }): Promise<DbReminder | null> {
    const sql = getSql();
    const existing = await sql`SELECT * FROM "reminders" WHERE "id" = ${id} LIMIT 1;`;
    if (!existing || existing.length === 0) return null;

    const taskTitle = data.taskTitle !== undefined ? data.taskTitle : existing[0].taskTitle;
    const status = data.status !== undefined ? data.status : existing[0].status;
    const recurrence = data.recurrence !== undefined ? data.recurrence : existing[0].recurrence;
    const displayDate = data.displayDate !== undefined ? data.displayDate : existing[0].displayDate;
    const displayTime = data.displayTime !== undefined ? data.displayTime : existing[0].displayTime;
    const remindAt = data.remindAt ? data.remindAt.toISOString() : existing[0].remindAt;

    const rows = await sql`
      UPDATE "reminders" SET
        "taskTitle" = ${taskTitle},
        "status" = ${status as any},
        "recurrence" = ${recurrence as any},
        "displayDate" = ${displayDate},
        "displayTime" = ${displayTime},
        "remindAt" = ${remindAt},
        "updatedAt" = CURRENT_TIMESTAMP
      WHERE "id" = ${id}
      RETURNING *;
    `;
    return (rows[0] as DbReminder) || null;
  },

  async deleteReminder(id: string): Promise<boolean> {
    const sql = getSql();
    await sql`DELETE FROM "reminders" WHERE "id" = ${id};`;
    return true;
  },

  async findDueReminders(): Promise<(DbReminder & { lineUserId: string })[]> {
    const sql = getSql();
    const rows = await sql`
      SELECT r.*, u."lineUserId"
      FROM "reminders" r
      JOIN "users" u ON r."userId" = u."id"
      WHERE r."status" = 'PENDING' AND r."remindAt" <= CURRENT_TIMESTAMP;
    `;
    return rows as (DbReminder & { lineUserId: string })[];
  },

  async createNotificationLog(reminderId: string, status: string) {
    const sql = getSql();
    await sql`
      INSERT INTO "notification_logs" ("id", "reminderId", "status", "sentAt")
      VALUES (gen_random_uuid()::text, ${reminderId}, ${status}, CURRENT_TIMESTAMP);
    `;
  },
};
