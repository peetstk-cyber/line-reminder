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

export interface DbNoteItem {
  id: string;
  text: string;
  completed: boolean;
}

export interface DbNote {
  id: string;
  userId: string;
  title: string;
  items: DbNoteItem[];
  category: "SHOPPING" | "TODO" | "GENERAL";
  isPinned: boolean;
  createdAt: string;
  updatedAt: string;
  user?: DbUser;
}

export const db = {
  async ensureTablesExist(): Promise<void> {
    try {
      const sql = getSql();
      await sql`
        CREATE TABLE IF NOT EXISTS "notes" (
          "id" TEXT PRIMARY KEY,
          "userId" TEXT NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
          "title" TEXT NOT NULL,
          "items" JSONB NOT NULL DEFAULT '[]'::jsonb,
          "category" TEXT NOT NULL DEFAULT 'GENERAL',
          "isPinned" BOOLEAN NOT NULL DEFAULT false,
          "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
      `;
      await sql`
        CREATE INDEX IF NOT EXISTS "notes_userId_idx" ON "notes"("userId");
      `;
      await sql`
        CREATE INDEX IF NOT EXISTS "notes_category_idx" ON "notes"("category");
      `;
    } catch (err) {
      console.error("Error ensuring notes table exists:", err);
    }
  },

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
      WHERE r."status" = 'PENDING' AND r."remindAt" <= CURRENT_TIMESTAMP + INTERVAL '45 seconds';
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

  // ===================== NOTE CRUD METHODS =====================
  async createNote(data: {
    userId: string;
    title: string;
    items?: DbNoteItem[];
    category?: "SHOPPING" | "TODO" | "GENERAL";
    isPinned?: boolean;
  }): Promise<DbNote> {
    await this.ensureTablesExist();
    const sql = getSql();
    const itemsJson = JSON.stringify(data.items || []);
    const rows = await sql`
      INSERT INTO "notes" (
        "id", "userId", "title", "items", "category", "isPinned"
      )
      VALUES (
        gen_random_uuid()::text,
        ${data.userId},
        ${data.title},
        ${itemsJson}::jsonb,
        ${data.category || "GENERAL"},
        ${data.isPinned || false}
      )
      RETURNING *;
    `;
    return rows[0] as DbNote;
  },

  async findNotesByUserId(userId: string, category?: string): Promise<DbNote[]> {
    await this.ensureTablesExist();
    const sql = getSql();
    if (category && category !== "ALL") {
      const rows = await sql`
        SELECT * FROM "notes"
        WHERE "userId" = ${userId} AND "category" = ${category}
        ORDER BY "isPinned" DESC, "updatedAt" DESC;
      `;
      return rows as DbNote[];
    }
    const rows = await sql`
      SELECT * FROM "notes"
      WHERE "userId" = ${userId}
      ORDER BY "isPinned" DESC, "updatedAt" DESC;
    `;
    return rows as DbNote[];
  },

  async findNoteById(id: string): Promise<DbNote | null> {
    await this.ensureTablesExist();
    const sql = getSql();
    const rows = await sql`SELECT * FROM "notes" WHERE "id" = ${id} LIMIT 1;`;
    return (rows[0] as DbNote) || null;
  },

  async updateNote(id: string, data: {
    title?: string;
    items?: DbNoteItem[];
    category?: "SHOPPING" | "TODO" | "GENERAL";
    isPinned?: boolean;
  }): Promise<DbNote | null> {
    await this.ensureTablesExist();
    const sql = getSql();
    const existing = await sql`SELECT * FROM "notes" WHERE "id" = ${id} LIMIT 1;`;
    if (!existing || existing.length === 0) return null;

    const title = data.title !== undefined ? data.title : existing[0].title;
    const items = data.items !== undefined ? JSON.stringify(data.items) : JSON.stringify(existing[0].items);
    const category = data.category !== undefined ? data.category : existing[0].category;
    const isPinned = data.isPinned !== undefined ? data.isPinned : existing[0].isPinned;

    const rows = await sql`
      UPDATE "notes" SET
        "title" = ${title},
        "items" = ${items}::jsonb,
        "category" = ${category},
        "isPinned" = ${isPinned},
        "updatedAt" = CURRENT_TIMESTAMP
      WHERE "id" = ${id}
      RETURNING *;
    `;
    return (rows[0] as DbNote) || null;
  },

  async toggleNoteItem(noteId: string, itemId: string): Promise<DbNote | null> {
    await this.ensureTablesExist();
    const sql = getSql();
    const existing = await sql`SELECT * FROM "notes" WHERE "id" = ${noteId} LIMIT 1;`;
    if (!existing || existing.length === 0) return null;

    const items: DbNoteItem[] = Array.isArray(existing[0].items) ? existing[0].items : [];
    const updatedItems = items.map((it) =>
      it.id === itemId ? { ...it, completed: !it.completed } : it
    );

    const rows = await sql`
      UPDATE "notes" SET
        "items" = ${JSON.stringify(updatedItems)}::jsonb,
        "updatedAt" = CURRENT_TIMESTAMP
      WHERE "id" = ${noteId}
      RETURNING *;
    `;
    return (rows[0] as DbNote) || null;
  },

  async deleteNote(id: string): Promise<boolean> {
    await this.ensureTablesExist();
    const sql = getSql();
    await sql`DELETE FROM "notes" WHERE "id" = ${id};`;
    return true;
  },

  // ===================== MORNING BRIEF HELPERS =====================
  async findAllUsers(): Promise<DbUser[]> {
    const sql = getSql();
    const rows = await sql`SELECT * FROM "users";`;
    return rows as DbUser[];
  },

  async findMorningBriefData(userId: string): Promise<{
    todayReminders: DbReminder[];
    pendingNotes: { id: string; title: string; category: string; pendingItems: string[] }[];
  }> {
    await this.ensureTablesExist();
    const sql = getSql();

    // Today's pending reminders (Thailand timezone UTC+7)
    const reminderRows = await sql`
      SELECT * FROM "reminders"
      WHERE "userId" = ${userId}
        AND "status" = 'PENDING'
        AND ("remindAt" AT TIME ZONE 'Asia/Bangkok')::date = (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Bangkok')::date
      ORDER BY "remindAt" ASC;
    `;

    // Notes with incomplete items
    const noteRows = await sql`
      SELECT * FROM "notes"
      WHERE "userId" = ${userId}
      ORDER BY "isPinned" DESC, "updatedAt" DESC;
    `;

    const pendingNotes: { id: string; title: string; category: string; pendingItems: string[] }[] = [];

    for (const note of noteRows as DbNote[]) {
      const items: DbNoteItem[] = Array.isArray(note.items) ? note.items : [];
      const pending = items.filter((it) => !it.completed).map((it) => it.text);
      if (pending.length > 0) {
        pendingNotes.push({
          id: note.id,
          title: note.title,
          category: note.category,
          pendingItems: pending,
        });
      }
    }

    return {
      todayReminders: reminderRows as DbReminder[],
      pendingNotes,
    };
  },
};


