"use client";

import { useEffect, useState, useCallback } from "react";
import liff from "@line/liff";
import {
  Bell,
  Sparkles,
  Calendar,
  Clock,
  CheckCircle2,
  Circle,
  Pencil,
  Trash2,
  Plus,
  RotateCcw,
  Loader2,
  Search,
  Filter,
  Check,
  X,
  AlertCircle,
} from "lucide-react";

interface ReminderItem {
  id: string;
  userId: string;
  taskTitle: string;
  remindAt: string;
  displayDate: string | null;
  displayTime: string | null;
  status: "PENDING" | "COMPLETED" | "CANCELLED";
  recurrence: "NONE" | "DAILY" | "WEEKLY" | "MONTHLY";
  createdAt: string;
}

interface Stats {
  todayCount: number;
  totalPending: number;
  completedCount: number;
}

export default function LiffDashboard() {
  const [lineUserId, setLineUserId] = useState<string>("");
  const [displayName, setDisplayName] = useState<string>("ผู้ใช้งาน LINE");
  const [pictureUrl, setPictureUrl] = useState<string | null>(null);
  const [isLiffReady, setIsLiffReady] = useState(false);
  const [loading, setLoading] = useState(true);

  const [reminders, setReminders] = useState<ReminderItem[]>([]);
  const [stats, setStats] = useState<Stats>({ todayCount: 0, totalPending: 0, completedCount: 0 });
  const [activeFilter, setActiveFilter] = useState<"all" | "today" | "week" | "completed">("all");

  // Quick Add State
  const [quickPrompt, setQuickPrompt] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [aiMessage, setAiMessage] = useState<{ text: string; type: "info" | "success" | "error" } | null>(null);

  // Edit Modal State
  const [editingReminder, setEditingReminder] = useState<ReminderItem | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDateTime, setEditDateTime] = useState("");
  const [editRecurrence, setEditRecurrence] = useState<"NONE" | "DAILY" | "WEEKLY" | "MONTHLY">("NONE");
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  // Initialize LIFF
  useEffect(() => {
    async function initLiff() {
      const liffId = process.env.NEXT_PUBLIC_LIFF_ID || "";
      try {
        if (liffId) {
          await liff.init({ liffId });
          if (liff.isLoggedIn()) {
            const profile = await liff.getProfile();
            setLineUserId(profile.userId);
            setDisplayName(profile.displayName);
            setPictureUrl(profile.pictureUrl || null);

            // Sync User with database
            await fetch("/api/users/sync", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                lineUserId: profile.userId,
                displayName: profile.displayName,
                pictureUrl: profile.pictureUrl,
              }),
            });
          } else {
            // If opened in external browser, fallback to mock/guest user for preview
            const fallbackUid = "demo_user_001";
            setLineUserId(fallbackUid);
            setDisplayName("Guest / Preview User");
          }
        } else {
          // Dev preview without LIFF ID
          const fallbackUid = "demo_user_001";
          setLineUserId(fallbackUid);
          setDisplayName("Preview User");
        }
      } catch (err) {
        console.error("LIFF initialization failed:", err);
        const fallbackUid = "demo_user_001";
        setLineUserId(fallbackUid);
      } finally {
        setIsLiffReady(true);
      }
    }

    initLiff();
  }, []);

  // Fetch Reminders
  const fetchReminders = useCallback(async (filter = activeFilter) => {
    if (!lineUserId) return;
    try {
      setLoading(true);
      const res = await fetch(`/api/reminders?lineUserId=${lineUserId}&filter=${filter}`);
      if (res.ok) {
        const data = await responseJson(res);
        setReminders(data.reminders || []);
        if (data.stats) setStats(data.stats);
      }
    } catch (err) {
      console.error("Error fetching reminders:", err);
    } finally {
      setLoading(false);
    }
  }, [lineUserId, activeFilter]);

  async function responseJson(res: Response) {
    return res.json();
  }

  useEffect(() => {
    if (isLiffReady && lineUserId) {
      fetchReminders(activeFilter);
    }
  }, [isLiffReady, lineUserId, activeFilter, fetchReminders]);

  // Handle Quick Add via Natural Language
  async function handleQuickAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!quickPrompt.trim() || isSubmitting) return;

    try {
      setIsSubmitting(true);
      setAiMessage(null);

      const res = await fetch("/api/reminders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lineUserId,
          prompt: quickPrompt.trim(),
        }),
      });

      const data = await res.json();

      if (data.status === "SUCCESS") {
        setQuickPrompt("");
        setAiMessage({
          type: "success",
          text: `✨ ตั้งเตือน "${data.reminder.taskTitle}" (${data.reminder.displayDate || ""} ${data.reminder.displayTime || ""}) เรียบร้อย!`,
        });
        fetchReminders(activeFilter);
      } else if (data.status === "CLARIFY") {
        setAiMessage({
          type: "info",
          text: data.message,
        });
      } else {
        setAiMessage({
          type: "error",
          text: data.error || "เกิดข้อผิดพลาดในการสร้างการแจ้งเตือน",
        });
      }
    } catch (err) {
      console.error("Quick add failed:", err);
      setAiMessage({ type: "error", text: "เชื่อมต่อเซิร์ฟเวอร์ไม่สำเร็จ" });
    } finally {
      setIsSubmitting(false);
    }
  }

  // Toggle Complete / Pending
  async function handleToggleStatus(item: ReminderItem) {
    const nextStatus = item.status === "COMPLETED" ? "PENDING" : "COMPLETED";
    try {
      // Optimistic update
      setReminders((prev) =>
        prev.map((r) => (r.id === item.id ? { ...r, status: nextStatus } : r))
      );

      await fetch(`/api/reminders/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      });

      fetchReminders(activeFilter);
    } catch (err) {
      console.error("Failed to toggle status:", err);
      fetchReminders(activeFilter);
    }
  }

  // Delete Reminder
  async function handleDelete(id: string) {
    if (!confirm("คุณต้องการลบรายการแจ้งเตือนนี้ใช่หรือไม่?")) return;
    try {
      setReminders((prev) => prev.filter((r) => r.id !== id));
      await fetch(`/api/reminders/${id}`, { method: "DELETE" });
      fetchReminders(activeFilter);
    } catch (err) {
      console.error("Failed to delete reminder:", err);
      fetchReminders(activeFilter);
    }
  }

  // Open Edit Modal
  function openEditModal(item: ReminderItem) {
    setEditingReminder(item);
    setEditTitle(item.taskTitle);
    setEditRecurrence(item.recurrence);

    // Format ISO to datetime-local format YYYY-MM-DDTHH:mm
    const date = new Date(item.remindAt);
    const localIso = new Date(date.getTime() - date.getTimezoneOffset() * 60000)
      .toISOString()
      .slice(0, 16);
    setEditDateTime(localIso);
  }

  // Save Edit
  async function handleSaveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editingReminder || isSavingEdit) return;

    try {
      setIsSavingEdit(true);
      const res = await fetch(`/api/reminders/${editingReminder.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          taskTitle: editTitle.trim(),
          remindAt: new Date(editDateTime).toISOString(),
          recurrence: editRecurrence,
        }),
      });

      if (res.ok) {
        setEditingReminder(null);
        fetchReminders(activeFilter);
      }
    } catch (err) {
      console.error("Failed to save edit:", err);
    } finally {
      setIsSavingEdit(false);
    }
  }

  const recurrenceLabel: Record<string, string> = {
    NONE: "ไม่เตือนซ้ำ",
    DAILY: "ทุกวัน",
    WEEKLY: "ทุกสัปดาห์",
    MONTHLY: "ทุกเดือน",
  };

  return (
    <div className="min-h-screen bg-sand-light text-mocha font-sans pb-16">
      {/* Header Bar */}
      <header className="sticky top-0 z-20 bg-sand-light/95 backdrop-blur-md border-b border-sand px-4 py-3 shadow-sm">
        <div className="max-w-xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            {pictureUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={pictureUrl}
                alt={displayName}
                className="w-10 h-10 rounded-full border-2 border-matcha-light object-cover shadow-sm"
              />
            ) : (
              <div className="w-10 h-10 rounded-full bg-matcha-light text-matcha-dark font-bold flex items-center justify-center text-sm shadow-sm">
                {displayName.charAt(0)}
              </div>
            )}
            <div>
              <p className="text-xs text-mocha-muted">ยินดีต้อนรับ 👋</p>
              <h1 className="text-sm font-bold text-mocha truncate max-w-[160px] sm:max-w-xs">
                {displayName}
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-1.5 px-3 py-1.5 bg-matcha-subtle border border-matcha-light rounded-full">
            <Bell className="w-4 h-4 text-matcha-dark" />
            <span className="text-xs font-semibold text-matcha-dark">
              วันนี้: {stats.todayCount} งาน
            </span>
          </div>
        </div>
      </header>

      <main className="max-w-xl mx-auto px-4 pt-4 space-y-4">
        {/* Quick Add Bar */}
        <section className="bg-white rounded-2xl p-4 shadow-sm border border-sand">
          <div className="flex items-center gap-2 mb-2">
            <Sparkles className="w-4 h-4 text-amber-500" />
            <span className="text-xs font-bold text-mocha uppercase tracking-wider">
              AI Smart Quick Add
            </span>
          </div>

          <form onSubmit={handleQuickAdd} className="flex flex-col gap-2">
            <div className="relative">
              <input
                type="text"
                value={quickPrompt}
                onChange={(e) => setQuickPrompt(e.target.value)}
                placeholder="เช่น 'พรุ่งนี้ 9 โมง สรุปงานกับทีม' หรือ '2 ทุ่ม อ่านหนังสือ'"
                className="w-full bg-sand-light border border-sand rounded-xl px-3.5 py-2.5 text-sm text-mocha placeholder:text-mocha-muted/60 focus:outline-none focus:ring-2 focus:ring-matcha focus:border-transparent transition-all pr-10"
              />
              <button
                type="submit"
                disabled={isSubmitting || !quickPrompt.trim()}
                className="absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 bg-matcha-dark hover:bg-matcha text-white rounded-lg flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-sm"
              >
                {isSubmitting ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Plus className="w-4 h-4" />
                )}
              </button>
            </div>

            {aiMessage && (
              <div
                className={`text-xs px-3 py-2 rounded-xl flex items-start gap-2 ${
                  aiMessage.type === "success"
                    ? "bg-matcha-subtle text-matcha-dark border border-matcha-light"
                    : aiMessage.type === "info"
                    ? "bg-amber-50 text-amber-900 border border-amber-200"
                    : "bg-red-50 text-red-900 border border-red-200"
                }`}
              >
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <p className="leading-snug">{aiMessage.text}</p>
              </div>
            )}
          </form>
        </section>

        {/* Filter Tabs */}
        <section className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
          {(
            [
              { key: "all", label: "ทั้งหมด", count: stats.totalPending + stats.completedCount },
              { key: "today", label: "วันนี้", count: stats.todayCount },
              { key: "week", label: "สัปดาห์นี้", count: undefined },
              { key: "completed", label: "เสร็จแล้ว", count: stats.completedCount },
            ] as { key: "all" | "today" | "week" | "completed"; label: string; count?: number }[]
          ).map((tab) => {
            const isActive = activeFilter === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => setActiveFilter(tab.key)}
                className={`px-3.5 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all flex items-center gap-1.5 ${
                  isActive
                    ? "bg-matcha-dark text-white shadow-sm"
                    : "bg-white border border-sand text-mocha-muted hover:bg-sand-light"
                }`}
              >
                <span>{tab.label}</span>
                {tab.count !== undefined && (
                  <span
                    className={`text-[10px] px-1.5 py-0.2 rounded-full ${
                      isActive
                        ? "bg-white/20 text-white"
                        : "bg-sand text-mocha-muted font-bold"
                    }`}
                  >
                    {tab.count}
                  </span>
                )}
              </button>
            );
          })}
        </section>

        {/* Task Cards List */}
        <section className="space-y-3">
          {loading ? (
            <div className="py-12 flex flex-col items-center justify-center gap-2 text-mocha-muted">
              <Loader2 className="w-6 h-6 animate-spin text-matcha-dark" />
              <p className="text-xs">กำลังโหลดรายการเตือน...</p>
            </div>
          ) : reminders.length === 0 ? (
            <div className="bg-white rounded-2xl p-8 text-center border border-sand shadow-sm space-y-2">
              <div className="w-12 h-12 bg-matcha-subtle text-matcha-dark rounded-full flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <p className="text-sm font-semibold text-mocha">ไม่มีรายการเตือนในหมวดหมู่นี้</p>
              <p className="text-xs text-mocha-muted">
                พิมพ์บอกสิ่งที่ต้องการให้เตือนในช่อง Quick Add ด้านบนได้เลยครับ
              </p>
            </div>
          ) : (
            reminders.map((item) => {
              const isDone = item.status === "COMPLETED";
              return (
                <div
                  key={item.id}
                  className={`bg-white rounded-2xl border transition-all overflow-hidden shadow-sm hover:shadow-md ${
                    isDone
                      ? "border-sand bg-sand-light/50 opacity-75"
                      : "border-matcha-light/60"
                  }`}
                >
                  {/* Card Top Header */}
                  <div
                    className={`px-4 py-2 flex items-center justify-between text-xs ${
                      isDone
                        ? "bg-sand/60 text-mocha-muted"
                        : "bg-matcha-subtle text-matcha-dark"
                    }`}
                  >
                    <div className="flex items-center gap-1.5 font-medium">
                      <span className="w-2 h-2 rounded-full bg-matcha-dark"></span>
                      <span>{isDone ? "ทำเสร็จแล้ว" : "รอดำเนินการ"}</span>
                    </div>

                    {item.recurrence !== "NONE" && (
                      <span className="text-[11px] px-2 py-0.5 rounded-full bg-white/70 font-semibold border border-matcha-light/40">
                        🔄 {recurrenceLabel[item.recurrence]}
                      </span>
                    )}
                  </div>

                  {/* Card Body */}
                  <div className="p-4">
                    <div className="flex items-start gap-3">
                      <button
                        onClick={() => handleToggleStatus(item)}
                        className="mt-0.5 text-mocha-muted hover:text-matcha-dark transition-colors"
                        title={isDone ? "ทำเครื่องหมายว่ายังไม่เสร็จ" : "ทำเครื่องหมายว่าเสร็จแล้ว"}
                      >
                        {isDone ? (
                          <CheckCircle2 className="w-5 h-5 text-matcha-dark" />
                        ) : (
                          <Circle className="w-5 h-5 text-mocha-muted/60 hover:text-matcha" />
                        )}
                      </button>

                      <div className="flex-1 min-w-0">
                        <h3
                          className={`text-base font-bold leading-tight ${
                            isDone
                              ? "line-through text-mocha-muted"
                              : "text-mocha"
                          }`}
                        >
                          {item.taskTitle}
                        </h3>

                        <div className="mt-2.5 flex flex-wrap items-center gap-3 text-xs text-mocha-muted">
                          <div className="flex items-center gap-1">
                            <Calendar className="w-3.5 h-3.5 text-mocha-muted/80" />
                            <span>{item.displayDate || "-"}</span>
                          </div>
                          <div className="flex items-center gap-1 font-semibold text-matcha-dark">
                            <Clock className="w-3.5 h-3.5" />
                            <span>{item.displayTime || "-"}</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Card Footer Actions */}
                    <div className="mt-3.5 pt-3 border-t border-sand flex items-center justify-end gap-2">
                      <button
                        onClick={() => openEditModal(item)}
                        className="px-2.5 py-1 text-xs text-mocha-muted hover:text-mocha hover:bg-sand-light rounded-lg transition-colors flex items-center gap-1 font-medium"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                        <span>แก้ไข</span>
                      </button>
                      <button
                        onClick={() => handleDelete(item.id)}
                        className="px-2.5 py-1 text-xs text-red-600 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors flex items-center gap-1 font-medium"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>ลบ</span>
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </section>
      </main>

      {/* Edit Modal */}
      {editingReminder && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-sand animate-in fade-in zoom-in duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-sand">
              <h2 className="text-base font-bold text-mocha flex items-center gap-2">
                <Pencil className="w-4 h-4 text-matcha-dark" />
                แก้ไขรายการแจ้งเตือน
              </h2>
              <button
                onClick={() => setEditingReminder(null)}
                className="text-mocha-muted hover:text-mocha p-1 rounded-lg hover:bg-sand-light"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveEdit} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-mocha-muted mb-1">
                  สิ่งที่ต้องทำ
                </label>
                <input
                  type="text"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  required
                  className="w-full bg-sand-light border border-sand rounded-xl px-3 py-2 text-sm text-mocha focus:outline-none focus:ring-2 focus:ring-matcha"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-mocha-muted mb-1">
                  วันและเวลาแจ้งเตือน
                </label>
                <input
                  type="datetime-local"
                  value={editDateTime}
                  onChange={(e) => setEditDateTime(e.target.value)}
                  required
                  className="w-full bg-sand-light border border-sand rounded-xl px-3 py-2 text-sm text-mocha focus:outline-none focus:ring-2 focus:ring-matcha"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-mocha-muted mb-1">
                  การเตือนซ้ำ
                </label>
                <select
                  value={editRecurrence}
                  onChange={(e) =>
                    setEditRecurrence(
                      e.target.value as "NONE" | "DAILY" | "WEEKLY" | "MONTHLY"
                    )
                  }
                  className="w-full bg-sand-light border border-sand rounded-xl px-3 py-2 text-sm text-mocha focus:outline-none focus:ring-2 focus:ring-matcha"
                >
                  <option value="NONE">ไม่เตือนซ้ำ (ครั้งเดียว)</option>
                  <option value="DAILY">เตือนทุกวัน</option>
                  <option value="WEEKLY">เตือนทุกสัปดาห์</option>
                  <option value="MONTHLY">เตือนทุกเดือน</option>
                </select>
              </div>

              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setEditingReminder(null)}
                  className="px-4 py-2 text-xs font-semibold text-mocha-muted hover:bg-sand rounded-xl transition-colors"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  disabled={isSavingEdit || !editTitle.trim()}
                  className="px-4 py-2 text-xs font-semibold bg-matcha-dark hover:bg-matcha text-white rounded-xl shadow-sm transition-all flex items-center gap-1.5 disabled:opacity-50"
                >
                  {isSavingEdit && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>บันทึกการเปลี่ยนแปลง</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
