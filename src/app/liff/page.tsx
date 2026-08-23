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
  Loader2,
  Check,
  X,
  AlertCircle,
  ShoppingBag,
  CheckSquare,
  FileText,
  Pin,
  ListTodo,
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

interface NoteItem {
  id: string;
  text: string;
  completed: boolean;
}

interface Note {
  id: string;
  userId: string;
  title: string;
  items: NoteItem[];
  category: "SHOPPING" | "TODO" | "GENERAL";
  isPinned: boolean;
  createdAt: string;
  updatedAt: string;
}

interface Stats {
  todayCount: number;
  totalPending: number;
  completedCount: number;
}

export default function LiffDashboard() {
  const [activeMainTab, setActiveMainTab] = useState<"reminders" | "notes">("reminders");
  const [lineUserId, setLineUserId] = useState<string>("");
  const [displayName, setDisplayName] = useState<string>("ผู้ใช้งาน LINE");
  const [pictureUrl, setPictureUrl] = useState<string | null>(null);
  const [isLiffReady, setIsLiffReady] = useState(false);
  const [loading, setLoading] = useState(true);

  // Reminders State
  const [reminders, setReminders] = useState<ReminderItem[]>([]);
  const [stats, setStats] = useState<Stats>({ todayCount: 0, totalPending: 0, completedCount: 0 });
  const [activeReminderFilter, setActiveReminderFilter] = useState<"all" | "today" | "week" | "completed">("all");
  const [quickReminderPrompt, setQuickReminderPrompt] = useState("");
  const [isSubmittingReminder, setIsSubmittingReminder] = useState(false);
  const [reminderAiMessage, setReminderAiMessage] = useState<{ text: string; type: "info" | "success" | "error" } | null>(null);

  // Edit Reminder Modal State
  const [editingReminder, setEditingReminder] = useState<ReminderItem | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDateTime, setEditDateTime] = useState("");
  const [editRecurrence, setEditRecurrence] = useState<"NONE" | "DAILY" | "WEEKLY" | "MONTHLY">("NONE");
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  // Notes State
  const [notes, setNotes] = useState<Note[]>([]);
  const [activeNoteCategory, setActiveNoteCategory] = useState<"ALL" | "SHOPPING" | "TODO" | "GENERAL">("ALL");
  const [isCreatingNote, setIsCreatingNote] = useState(false);
  const [newNoteTitle, setNewNoteTitle] = useState("");
  const [newNoteCategory, setNewNoteCategory] = useState<"SHOPPING" | "TODO" | "GENERAL">("SHOPPING");
  const [newNoteItemsText, setNewNoteItemsText] = useState("");
  const [isSavingNote, setIsSavingNote] = useState(false);
  const [inlineNewItem, setInlineNewItem] = useState<{ [noteId: string]: string }>({});

  // Initialize LIFF & Check URL Params
  useEffect(() => {
    async function initLiff() {
      if (typeof window !== "undefined") {
        const urlParams = new URLSearchParams(window.location.search);
        const tab = urlParams.get("tab");
        if (tab === "notes") {
          setActiveMainTab("notes");
        }
      }

      const liffId = process.env.NEXT_PUBLIC_LIFF_ID || "";
      try {
        if (liffId) {
          await liff.init({ liffId });
          if (liff.isLoggedIn()) {
            const profile = await liff.getProfile();
            setLineUserId(profile.userId);
            setDisplayName(profile.displayName);
            setPictureUrl(profile.pictureUrl || null);

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
            const fallbackUid = "demo_user_001";
            setLineUserId(fallbackUid);
            setDisplayName("Guest / Preview User");
          }
        } else {
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
  const fetchReminders = useCallback(async (filter = activeReminderFilter) => {
    if (!lineUserId) return;
    try {
      setLoading(true);
      const res = await fetch(`/api/reminders?lineUserId=${lineUserId}&filter=${filter}`);
      if (res.ok) {
        const data = await res.json();
        setReminders(data.reminders || []);
        if (data.stats) setStats(data.stats);
      }
    } catch (err) {
      console.error("Error fetching reminders:", err);
    } finally {
      setLoading(false);
    }
  }, [lineUserId, activeReminderFilter]);

  // Fetch Notes
  const fetchNotes = useCallback(async (category = activeNoteCategory) => {
    if (!lineUserId) return;
    try {
      setLoading(true);
      const res = await fetch(`/api/notes?lineUserId=${lineUserId}&category=${category}`);
      if (res.ok) {
        const data = await res.json();
        setNotes(data.notes || []);
      }
    } catch (err) {
      console.error("Error fetching notes:", err);
    } finally {
      setLoading(false);
    }
  }, [lineUserId, activeNoteCategory]);

  useEffect(() => {
    if (isLiffReady && lineUserId) {
      if (activeMainTab === "reminders") {
        fetchReminders(activeReminderFilter);
      } else {
        fetchNotes(activeNoteCategory);
      }
    }
  }, [isLiffReady, lineUserId, activeMainTab, activeReminderFilter, activeNoteCategory, fetchReminders, fetchNotes]);

  // Handle Quick Add Reminder
  async function handleQuickAddReminder(e: React.FormEvent) {
    e.preventDefault();
    if (!quickReminderPrompt.trim() || isSubmittingReminder) return;

    try {
      setIsSubmittingReminder(true);
      setReminderAiMessage(null);

      const res = await fetch("/api/reminders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lineUserId,
          prompt: quickReminderPrompt.trim(),
        }),
      });

      const data = await res.json();

      if (data.status === "SUCCESS") {
        setQuickReminderPrompt("");
        setReminderAiMessage({
          type: "success",
          text: `✨ ตั้งเตือน "${data.reminder.taskTitle}" (${data.reminder.displayDate || ""} ${data.reminder.displayTime || ""}) เรียบร้อย!`,
        });
        fetchReminders(activeReminderFilter);
      } else if (data.status === "CLARIFY") {
        setReminderAiMessage({
          type: "info",
          text: data.message,
        });
      } else {
        setReminderAiMessage({
          type: "error",
          text: data.error || "เกิดข้อผิดพลาดในการสร้างการแจ้งเตือน",
        });
      }
    } catch (err) {
      console.error("Quick add failed:", err);
      setReminderAiMessage({ type: "error", text: "เชื่อมต่อเซิร์ฟเวอร์ไม่สำเร็จ" });
    } finally {
      setIsSubmittingReminder(false);
    }
  }

  // Toggle Reminder Complete / Pending
  async function handleToggleReminderStatus(item: ReminderItem) {
    const nextStatus = item.status === "COMPLETED" ? "PENDING" : "COMPLETED";
    try {
      setReminders((prev) =>
        prev.map((r) => (r.id === item.id ? { ...r, status: nextStatus } : r))
      );
      await fetch(`/api/reminders/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      });
      fetchReminders(activeReminderFilter);
    } catch (err) {
      console.error("Failed to toggle status:", err);
      fetchReminders(activeReminderFilter);
    }
  }

  // Delete Reminder
  async function handleDeleteReminder(id: string) {
    if (!confirm("คุณต้องการลบรายการแจ้งเตือนนี้ใช่หรือไม่?")) return;
    try {
      setReminders((prev) => prev.filter((r) => r.id !== id));
      await fetch(`/api/reminders/${id}`, { method: "DELETE" });
      fetchReminders(activeReminderFilter);
    } catch (err) {
      console.error("Failed to delete reminder:", err);
      fetchReminders(activeReminderFilter);
    }
  }

  // Edit Reminder Modal
  function openEditModal(item: ReminderItem) {
    setEditingReminder(item);
    setEditTitle(item.taskTitle);
    setEditRecurrence(item.recurrence);
    const date = new Date(item.remindAt);
    const localIso = new Date(date.getTime() - date.getTimezoneOffset() * 60000)
      .toISOString()
      .slice(0, 16);
    setEditDateTime(localIso);
  }

  async function handleSaveEditReminder(e: React.FormEvent) {
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
        fetchReminders(activeReminderFilter);
      }
    } catch (err) {
      console.error("Failed to save edit:", err);
    } finally {
      setIsSavingEdit(false);
    }
  }

  // ==================== NOTES ACTIONS ====================
  // Create New Note
  async function handleCreateNote(e: React.FormEvent) {
    e.preventDefault();
    if (!newNoteTitle.trim() || isSavingNote) return;

    try {
      setIsSavingNote(true);
      const items = newNoteItemsText
        .split(/[\n,]+/)
        .map((s) => s.trim())
        .filter(Boolean)
        .map((text) => ({
          id: "item-" + Math.random().toString(36).substring(2, 9),
          text,
          completed: false,
        }));

      const res = await fetch("/api/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lineUserId,
          title: newNoteTitle.trim(),
          category: newNoteCategory,
          items,
        }),
      });

      if (res.ok) {
        setNewNoteTitle("");
        setNewNoteItemsText("");
        setIsCreatingNote(false);
        fetchNotes(activeNoteCategory);
      }
    } catch (err) {
      console.error("Failed to create note:", err);
    } finally {
      setIsSavingNote(false);
    }
  }

  // Toggle Note Item Completed
  async function handleToggleNoteItem(noteId: string, itemId: string) {
    setNotes((prev) =>
      prev.map((n) => {
        if (n.id !== noteId) return n;
        const updatedItems = (n.items || []).map((it) =>
          it.id === itemId ? { ...it, completed: !it.completed } : it
        );
        return { ...n, items: updatedItems };
      })
    );

    try {
      await fetch(`/api/notes/${noteId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ toggleItemId: itemId }),
      });
    } catch (err) {
      console.error("Failed to toggle note item:", err);
      fetchNotes(activeNoteCategory);
    }
  }

  // Add Item to existing Note inline
  async function handleAddInlineItem(noteId: string) {
    const text = inlineNewItem[noteId]?.trim();
    if (!text) return;

    const targetNote = notes.find((n) => n.id === noteId);
    if (!targetNote) return;

    const newItem: NoteItem = {
      id: "item-" + Math.random().toString(36).substring(2, 9),
      text,
      completed: false,
    };

    const updatedItems = [...(targetNote.items || []), newItem];

    setNotes((prev) =>
      prev.map((n) => (n.id === noteId ? { ...n, items: updatedItems } : n))
    );
    setInlineNewItem((prev) => ({ ...prev, [noteId]: "" }));

    try {
      await fetch(`/api/notes/${noteId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: updatedItems }),
      });
    } catch (err) {
      console.error("Failed to append item:", err);
      fetchNotes(activeNoteCategory);
    }
  }

  // Delete Note
  async function handleDeleteNote(noteId: string) {
    if (!confirm("คุณต้องการลบโน้ตนี้ใช่หรือไม่?")) return;
    try {
      setNotes((prev) => prev.filter((n) => n.id !== noteId));
      await fetch(`/api/notes/${noteId}`, { method: "DELETE" });
      fetchNotes(activeNoteCategory);
    } catch (err) {
      console.error("Failed to delete note:", err);
      fetchNotes(activeNoteCategory);
    }
  }

  const recurrenceLabel: Record<string, string> = {
    NONE: "ไม่เตือนซ้ำ",
    DAILY: "ทุกวัน",
    WEEKLY: "ทุกสัปดาห์",
    MONTHLY: "ทุกเดือน",
  };

  const noteCategoryInfo: Record<string, { label: string; emoji: string; bg: string; text: string }> = {
    SHOPPING: { label: "ซื้อของ", emoji: "🛒", bg: "bg-emerald-50 border-emerald-200", text: "text-emerald-800" },
    TODO: { label: "สิ่งที่ต้องทำ", emoji: "📌", bg: "bg-amber-50 border-amber-200", text: "text-amber-800" },
    GENERAL: { label: "ทั่วไป", emoji: "📝", bg: "bg-blue-50 border-blue-200", text: "text-blue-800" },
  };

  return (
    <div className="min-h-screen bg-sand-light text-mocha font-sans pb-20">
      {/* Top Header Bar */}
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
              <p className="text-xs text-mocha-muted">AI Personal Assistant 🌿</p>
              <h1 className="text-sm font-bold text-mocha truncate max-w-[160px] sm:max-w-xs">
                {displayName}
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-1.5 px-3 py-1.5 bg-matcha-subtle border border-matcha-light rounded-full">
            <span className="w-2 h-2 rounded-full bg-matcha-dark animate-pulse"></span>
            <span className="text-xs font-semibold text-matcha-dark">พร้อมใช้งาน</span>
          </div>
        </div>

        {/* Main Tab Bar Switcher (Reminders vs Notes) */}
        <div className="max-w-xl mx-auto mt-3 grid grid-cols-2 p-1 bg-sand/60 rounded-xl">
          <button
            onClick={() => setActiveMainTab("reminders")}
            className={`py-2 px-3 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-2 ${
              activeMainTab === "reminders"
                ? "bg-white text-matcha-dark shadow-sm"
                : "text-mocha-muted hover:text-mocha"
            }`}
          >
            <Bell className="w-4 h-4" />
            <span>เตือนความจำ</span>
            {stats.todayCount > 0 && (
              <span className="bg-matcha-dark text-white text-[10px] px-1.5 py-0.2 rounded-full">
                {stats.todayCount}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveMainTab("notes")}
            className={`py-2 px-3 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-2 ${
              activeMainTab === "notes"
                ? "bg-white text-matcha-dark shadow-sm"
                : "text-mocha-muted hover:text-mocha"
            }`}
          >
            <CheckSquare className="w-4 h-4" />
            <span>โน้ต</span>
            {notes.length > 0 && (
              <span className="bg-sand text-mocha-muted text-[10px] px-1.5 py-0.2 rounded-full font-bold">
                {notes.length}
              </span>
            )}
          </button>
        </div>
      </header>

      <main className="max-w-xl mx-auto px-4 pt-4 space-y-4">
        {/* ========================================================================= */}
        {/* SECTION 1: REMINDERS TAB */}
        {/* ========================================================================= */}
        {activeMainTab === "reminders" && (
          <>
            {/* Quick Add Bar */}
            <section className="bg-white rounded-2xl p-4 shadow-sm border border-sand">
              <div className="flex items-center gap-2 mb-2">
                <Sparkles className="w-4 h-4 text-amber-500" />
                <span className="text-xs font-bold text-mocha uppercase tracking-wider">
                  AI Smart Quick Add (เตือนความจำ)
                </span>
              </div>

              <form onSubmit={handleQuickAddReminder} className="flex flex-col gap-2">
                <div className="relative">
                  <input
                    type="text"
                    value={quickReminderPrompt}
                    onChange={(e) => setQuickReminderPrompt(e.target.value)}
                    placeholder="เช่น 'พรุ่งนี้ 9 โมง สรุปงานกับทีม' หรือ '2 ทุ่ม อ่านหนังสือ'"
                    className="w-full bg-sand-light border border-sand rounded-xl px-3.5 py-2.5 text-sm text-mocha placeholder:text-mocha-muted/60 focus:outline-none focus:ring-2 focus:ring-matcha focus:border-transparent transition-all pr-10"
                  />
                  <button
                    type="submit"
                    disabled={isSubmittingReminder || !quickReminderPrompt.trim()}
                    className="absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 bg-matcha-dark hover:bg-matcha text-white rounded-lg flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-sm"
                  >
                    {isSubmittingReminder ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Plus className="w-4 h-4" />
                    )}
                  </button>
                </div>

                {reminderAiMessage && (
                  <div
                    className={`text-xs px-3 py-2 rounded-xl flex items-start gap-2 ${
                      reminderAiMessage.type === "success"
                        ? "bg-matcha-subtle text-matcha-dark border border-matcha-light"
                        : reminderAiMessage.type === "info"
                        ? "bg-amber-50 text-amber-900 border border-amber-200"
                        : "bg-red-50 text-red-900 border border-red-200"
                    }`}
                  >
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    <p className="leading-snug">{reminderAiMessage.text}</p>
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
                const isActive = activeReminderFilter === tab.key;
                return (
                  <button
                    key={tab.key}
                    onClick={() => setActiveReminderFilter(tab.key)}
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

            {/* Reminders List */}
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
                    พิมพ์บอกสิ่งที่ต้องการให้เตือนในช่อง Quick Add ด้านบน หรือในแชท LINE ได้เลยครับ
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

                      <div className="p-4">
                        <div className="flex items-start gap-3">
                          <button
                            onClick={() => handleToggleReminderStatus(item)}
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

                        <div className="mt-3.5 pt-3 border-t border-sand flex items-center justify-end gap-2">
                          <button
                            onClick={() => openEditModal(item)}
                            className="px-2.5 py-1 text-xs text-mocha-muted hover:text-mocha hover:bg-sand-light rounded-lg transition-colors flex items-center gap-1 font-medium"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                            <span>แก้ไข</span>
                          </button>
                          <button
                            onClick={() => handleDeleteReminder(item.id)}
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
          </>
        )}

        {/* ========================================================================= */}
        {/* SECTION 2: NOTES & SHOPPING LIST TAB */}
        {/* ========================================================================= */}
        {activeMainTab === "notes" && (
          <>
            {/* Create Note Action Button / Form */}
            {!isCreatingNote ? (
              <button
                onClick={() => setIsCreatingNote(true)}
                className="w-full bg-white hover:bg-sand-light/60 border border-sand rounded-2xl p-3.5 flex items-center justify-between text-mocha font-semibold text-sm shadow-sm transition-all group"
              >
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-matcha-subtle text-matcha-dark flex items-center justify-center group-hover:scale-105 transition-transform">
                    <Plus className="w-5 h-5" />
                  </div>
                  <span>สร้างโน้ตใหม่</span>
                </div>
                <span className="text-xs text-mocha-muted font-normal">กดเพื่อเขียน 📝</span>
              </button>
            ) : (
              <form
                onSubmit={handleCreateNote}
                className="bg-white rounded-2xl p-4 shadow-md border border-matcha-light space-y-3 animate-in fade-in zoom-in-95 duration-150"
              >
                <div className="flex items-center justify-between border-b border-sand pb-2">
                  <h3 className="text-sm font-bold text-mocha flex items-center gap-2">
                    <CheckSquare className="w-4 h-4 text-matcha-dark" />
                    เขียนโน้ตใหม่
                  </h3>
                  <button
                    type="button"
                    onClick={() => setIsCreatingNote(false)}
                    className="text-mocha-muted hover:text-mocha p-1"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {/* Title */}
                <div>
                  <label className="block text-xs font-semibold text-mocha-muted mb-1">
                    หัวข้อโน้ต
                  </label>
                  <input
                    type="text"
                    value={newNoteTitle}
                    onChange={(e) => setNewNoteTitle(e.target.value)}
                    placeholder="เช่น รายการซื้อของเข้าบ้าน, เมนูอาหารเย็น"
                    required
                    className="w-full bg-sand-light border border-sand rounded-xl px-3 py-2 text-sm text-mocha focus:outline-none focus:ring-2 focus:ring-matcha"
                  />
                </div>

                {/* Category Selection */}
                <div>
                  <label className="block text-xs font-semibold text-mocha-muted mb-1">
                    หมวดหมู่
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { key: "SHOPPING", label: "🛒 ซื้อของ" },
                      { key: "TODO", label: "📌 To-Do" },
                      { key: "GENERAL", label: "📝 ทั่วไป" },
                    ].map((c) => (
                      <button
                        type="button"
                        key={c.key}
                        onClick={() => setNewNoteCategory(c.key as any)}
                        className={`py-1.5 rounded-xl text-xs font-semibold border transition-all ${
                          newNoteCategory === c.key
                            ? "bg-matcha-subtle border-matcha text-matcha-dark font-bold"
                            : "bg-sand-light border-sand text-mocha-muted"
                        }`}
                      >
                        {c.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Items */}
                <div>
                  <label className="block text-xs font-semibold text-mocha-muted mb-1">
                    รายการย่อย (พิมพ์แยกบรรทัด หรือคั่นด้วยจุลภาค)
                  </label>
                  <textarea
                    rows={3}
                    value={newNoteItemsText}
                    onChange={(e) => setNewNoteItemsText(e.target.value)}
                    placeholder={"น้ำดื่ม\nขนมปัง\nสาหร่าย\nไข่ไก่"}
                    className="w-full bg-sand-light border border-sand rounded-xl px-3 py-2 text-sm text-mocha focus:outline-none focus:ring-2 focus:ring-matcha"
                  />
                </div>

                <div className="flex items-center justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setIsCreatingNote(false)}
                    className="px-3 py-1.5 text-xs text-mocha-muted hover:bg-sand rounded-xl"
                  >
                    ยกเลิก
                  </button>
                  <button
                    type="submit"
                    disabled={isSavingNote || !newNoteTitle.trim()}
                    className="px-4 py-1.5 text-xs font-semibold bg-matcha-dark hover:bg-matcha text-white rounded-xl shadow-sm flex items-center gap-1.5 disabled:opacity-50"
                  >
                    {isSavingNote && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                    <span>บันทึกโน้ต</span>
                  </button>
                </div>
              </form>
            )}

            {/* Note Category Filters */}
            <section className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
              {[
                { key: "ALL", label: "ทั้งหมด" },
                { key: "SHOPPING", label: "🛒 ซื้อของ" },
                { key: "TODO", label: "📌 สิ่งที่ต้องทำ" },
                { key: "GENERAL", label: "📝 ทั่วไป" },
              ].map((tab) => {
                const isActive = activeNoteCategory === tab.key;
                return (
                  <button
                    key={tab.key}
                    onClick={() => setActiveNoteCategory(tab.key as any)}
                    className={`px-3.5 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all ${
                      isActive
                        ? "bg-matcha-dark text-white shadow-sm"
                        : "bg-white border border-sand text-mocha-muted hover:bg-sand-light"
                    }`}
                  >
                    {tab.label}
                  </button>
                );
              })}
            </section>

            {/* Notes Cards List */}
            <section className="space-y-4">
              {loading ? (
                <div className="py-12 flex flex-col items-center justify-center gap-2 text-mocha-muted">
                  <Loader2 className="w-6 h-6 animate-spin text-matcha-dark" />
                  <p className="text-xs">กำลังโหลดรายการโน้ต...</p>
                </div>
              ) : notes.length === 0 ? (
                <div className="bg-white rounded-2xl p-8 text-center border border-sand shadow-sm space-y-2">
                  <div className="w-12 h-12 bg-matcha-subtle text-matcha-dark rounded-full flex items-center justify-center mx-auto">
                    <ListTodo className="w-6 h-6" />
                  </div>
                  <p className="text-sm font-semibold text-mocha">ยังไม่มีโน้ตในหมวดนี้</p>
                  <p className="text-xs text-mocha-muted">
                    กดปุ่มสร้างโน้ตด้านบน หรือพิมพ์บอกใน LINE ได้เลย เช่น &ldquo;จดโน้ต ซื้อไข่ไก่ นม ขนมปัง&rdquo;
                  </p>
                </div>
              ) : (
                notes.map((note) => {
                  const cat = noteCategoryInfo[note.category] || noteCategoryInfo.GENERAL;
                  const items = Array.isArray(note.items) ? note.items : [];
                  const completedCount = items.filter((it) => it.completed).length;
                  const totalCount = items.length;
                  const percent = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

                  return (
                    <div
                      key={note.id}
                      className="bg-white rounded-2xl border border-sand shadow-sm hover:shadow-md transition-all overflow-hidden"
                    >
                      {/* Card Header */}
                      <div className="px-4 py-3 border-b border-sand flex items-center justify-between">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full border ${cat.bg} ${cat.text}`}>
                            {cat.emoji} {cat.label}
                          </span>
                          <h3 className="text-sm font-bold text-mocha truncate">
                            {note.title}
                          </h3>
                        </div>

                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => handleDeleteNote(note.id)}
                            className="p-1 text-mocha-muted hover:text-red-600 rounded-lg hover:bg-red-50 transition-colors"
                            title="ลบโน้ตนี้"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>

                      {/* Progress Bar if items exist */}
                      {totalCount > 0 && (
                        <div className="px-4 pt-2.5 pb-1">
                          <div className="flex items-center justify-between text-[11px] text-mocha-muted mb-1 font-medium">
                            <span>เสร็จแล้ว {completedCount}/{totalCount} รายการ</span>
                            <span>{percent}%</span>
                          </div>
                          <div className="w-full h-1.5 bg-sand-light rounded-full overflow-hidden">
                            <div
                              className="h-full bg-matcha transition-all duration-300 rounded-full"
                              style={{ width: `${percent}%` }}
                            />
                          </div>
                        </div>
                      )}

                      {/* Checklist Items */}
                      <div className="p-4 space-y-2">
                        {items.length === 0 ? (
                          <p className="text-xs text-mocha-muted italic">ยังไม่มีรายการย่อย</p>
                        ) : (
                          items.map((item) => (
                            <div
                              key={item.id}
                              onClick={() => handleToggleNoteItem(note.id, item.id)}
                              className={`flex items-start gap-2.5 p-2 rounded-xl cursor-pointer transition-all ${
                                item.completed
                                  ? "bg-sand-light/50 text-mocha-muted"
                                  : "hover:bg-sand-light text-mocha"
                              }`}
                            >
                              <div className="mt-0.5 shrink-0">
                                {item.completed ? (
                                  <CheckCircle2 className="w-4 h-4 text-matcha-dark" />
                                ) : (
                                  <Circle className="w-4 h-4 text-mocha-muted/60 hover:text-matcha" />
                                )}
                              </div>
                              <span
                                className={`text-xs font-medium leading-tight flex-1 ${
                                  item.completed ? "line-through opacity-60" : ""
                                }`}
                              >
                                {item.text}
                              </span>
                            </div>
                          ))
                        )}

                        {/* Inline Quick Add Item */}
                        <div className="pt-2 flex items-center gap-2">
                          <input
                            type="text"
                            value={inlineNewItem[note.id] || ""}
                            onChange={(e) =>
                              setInlineNewItem((prev) => ({
                                ...prev,
                                [note.id]: e.target.value,
                              }))
                            }
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.preventDefault();
                                handleAddInlineItem(note.id);
                              }
                            }}
                            placeholder="+ เพิ่มรายการใหม่..."
                            className="flex-1 bg-sand-light border border-sand rounded-xl px-3 py-1.5 text-xs text-mocha placeholder:text-mocha-muted/50 focus:outline-none focus:ring-1 focus:ring-matcha"
                          />
                          <button
                            type="button"
                            onClick={() => handleAddInlineItem(note.id)}
                            disabled={!inlineNewItem[note.id]?.trim()}
                            className="px-2.5 py-1.5 bg-matcha-subtle hover:bg-matcha-light text-matcha-dark rounded-xl text-xs font-bold transition-all disabled:opacity-40"
                          >
                            เพิ่ม
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </section>
          </>
        )}
      </main>

      {/* Edit Reminder Modal */}
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

            <form onSubmit={handleSaveEditReminder} className="mt-4 space-y-4">
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

