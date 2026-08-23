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
  Coins,
  Wallet,
  ArrowUpRight,
  ArrowDownLeft,
  Smile,
  Image as ImageIcon,
  User,
} from "lucide-react";
import { PRESET_AVATARS, getAvatarInfo, PresetAvatar } from "@/lib/avatar";
import { formatInTimeZone } from "date-fns-tz";

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

interface DebtItem {
  id: string;
  userId: string;
  personName: string;
  amount: number;
  type: "LENT" | "BORROWED";
  description: string | null;
  status: "PENDING" | "SETTLED";
  settledAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface PersonProfileItem {
  id: string;
  userId: string;
  name: string;
  avatarType: "PRESET_CHARACTER" | "CUSTOM_IMAGE";
  avatarValue: string;
  color: string;
}

interface PersonDebtGroup {
  personName: string;
  profile: PersonProfileItem | null;
  totalLent: number;
  totalBorrowed: number;
  netAmount: number;
  items: DebtItem[];
}

interface DebtSummary {
  totalReceivable: number;
  totalPayable: number;
  netBalance: number;
  people: PersonDebtGroup[];
}

interface Stats {
  todayCount: number;
  totalPending: number;
  completedCount: number;
}

export default function LiffDashboard() {
  const [activeMainTab, setActiveMainTab] = useState<"reminders" | "notes" | "debt">("reminders");
  const [lineUserId, setLineUserId] = useState<string>("");
  const [displayName, setDisplayName] = useState<string>("ผู้ใช้งาน LINE");
  const [pictureUrl, setPictureUrl] = useState<string | null>(null);
  const [isLiffReady, setIsLiffReady] = useState(false);
  const [loading, setLoading] = useState(true);

  // Reminders State
  const [reminders, setReminders] = useState<ReminderItem[]>([]);
  const [stats, setStats] = useState<Stats>({ todayCount: 0, totalPending: 0, completedCount: 0 });
  const [activeReminderFilter, setActiveReminderFilter] = useState<"all" | "today" | "week" | "completed">("all");
  
  // Manual Reminder Creator State
  const [isCreatingReminder, setIsCreatingReminder] = useState(false);
  const [newReminderTitle, setNewReminderTitle] = useState("");
  const [newReminderDate, setNewReminderDate] = useState("");
  const [newReminderTime, setNewReminderTime] = useState("");
  const [newReminderRecurrence, setNewReminderRecurrence] = useState<"NONE" | "DAILY" | "WEEKLY" | "MONTHLY">("NONE");
  const [newReminderAdvanceMinutes, setNewReminderAdvanceMinutes] = useState<number>(0);
  const [isSavingReminder, setIsSavingReminder] = useState(false);

  // Edit Reminder Modal State
  const [editingReminder, setEditingReminder] = useState<ReminderItem | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDate, setEditDate] = useState("");
  const [editTime, setEditTime] = useState("");
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

  // Debts State
  const [debtSummary, setDebtSummary] = useState<DebtSummary>({
    totalReceivable: 0,
    totalPayable: 0,
    netBalance: 0,
    people: [],
  });
  const [debts, setDebts] = useState<DebtItem[]>([]);
  const [personProfiles, setPersonProfiles] = useState<PersonProfileItem[]>([]);
  const [activeDebtFilter, setActiveDebtFilter] = useState<"ALL" | "RECEIVABLE" | "PAYABLE">("ALL");
  const [isCreatingDebt, setIsCreatingDebt] = useState(false);
  const [newDebtPerson, setNewDebtPerson] = useState("");
  const [newDebtAmount, setNewDebtAmount] = useState("");
  const [newDebtType, setNewDebtType] = useState<"LENT" | "BORROWED">("LENT");
  const [newDebtDesc, setNewDebtDesc] = useState("");
  const [isSavingDebt, setIsSavingDebt] = useState(false);

  // Avatar Customizer Modal State
  const [customizingPerson, setCustomizingPerson] = useState<string | null>(null);
  const [avatarCustomTab, setAvatarCustomTab] = useState<"preset" | "image">("preset");
  const [selectedPresetId, setSelectedPresetId] = useState<string>("cat");
  const [customPhotoUrl, setCustomPhotoUrl] = useState<string>("");
  const [isSavingProfile, setIsSavingProfile] = useState(false);

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

  // Fetch Debts
  const fetchDebts = useCallback(async () => {
    if (!lineUserId) return;
    try {
      setLoading(true);
      const res = await fetch(`/api/debts?lineUserId=${lineUserId}`);
      if (res.ok) {
        const data = await res.json();
        if (data.summary) setDebtSummary(data.summary);
        if (data.debts) setDebts(data.debts);
        if (data.profiles) setPersonProfiles(data.profiles);
      }
    } catch (err) {
      console.error("Error fetching debts:", err);
    } finally {
      setLoading(false);
    }
  }, [lineUserId]);

  useEffect(() => {
    if (isLiffReady && lineUserId) {
      if (activeMainTab === "reminders") {
        fetchReminders(activeReminderFilter);
      } else if (activeMainTab === "notes") {
        fetchNotes(activeNoteCategory);
      } else if (activeMainTab === "debt") {
        fetchDebts();
      }
    }
  }, [isLiffReady, lineUserId, activeMainTab, activeReminderFilter, activeNoteCategory, fetchReminders, fetchNotes, fetchDebts]);

  // Handle Create Manual Reminder
  async function handleCreateManualReminder(e: React.FormEvent) {
    e.preventDefault();
    if (!newReminderTitle.trim() || !newReminderDate || !newReminderTime || isSavingReminder) return;

    try {
      setIsSavingReminder(true);
      const selectedDate = new Date(`${newReminderDate}T${newReminderTime}:00`);
      const triggerDate = new Date(selectedDate.getTime() - newReminderAdvanceMinutes * 60000);

      const res = await fetch("/api/reminders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lineUserId,
          taskTitle: newReminderTitle.trim(),
          remindAt: triggerDate.toISOString(),
          recurrence: newReminderRecurrence,
          advanceMinutes: newReminderAdvanceMinutes,
        }),
      });

      if (res.ok) {
        setNewReminderTitle("");
        setNewReminderDate("");
        setNewReminderTime("");
        setNewReminderRecurrence("NONE");
        setNewReminderAdvanceMinutes(0);
        setIsCreatingReminder(false);
        fetchReminders(activeReminderFilter);
      }
    } catch (err) {
      console.error("Failed to create manual reminder:", err);
    } finally {
      setIsSavingReminder(false);
    }
  }

  // Toggle Reminder Completed / Pending
  async function handleToggleReminder(id: string, currentStatus: string) {
    const newStatus = currentStatus === "PENDING" ? "COMPLETED" : "PENDING";
    setReminders((prev) =>
      prev.map((r) => (r.id === id ? { ...r, status: newStatus as any } : r))
    );

    try {
      await fetch(`/api/reminders/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      fetchReminders(activeReminderFilter);
    } catch (err) {
      console.error("Failed to toggle reminder:", err);
      fetchReminders(activeReminderFilter);
    }
  }

  // Delete Reminder
  async function handleDeleteReminder(id: string) {
    if (!confirm("คุณต้องการลบการแจ้งเตือนนี้ใช่หรือไม่?")) return;

    setReminders((prev) => prev.filter((r) => r.id !== id));
    try {
      await fetch(`/api/reminders/${id}`, { method: "DELETE" });
      fetchReminders(activeReminderFilter);
    } catch (err) {
      console.error("Failed to delete reminder:", err);
      fetchReminders(activeReminderFilter);
    }
  }

  // Edit Reminder Click
  function handleEditClick(reminder: ReminderItem) {
    setEditingReminder(reminder);
    setEditTitle(reminder.taskTitle);
    setEditRecurrence(reminder.recurrence);

    const d = new Date(reminder.remindAt);
    setEditDate(formatInTimeZone(d, "Asia/Bangkok", "yyyy-MM-dd"));
    setEditTime(formatInTimeZone(d, "Asia/Bangkok", "HH:mm"));
  }

  // Save Edited Reminder
  async function handleSaveEditReminder(e: React.FormEvent) {
    e.preventDefault();
    if (!editingReminder || !editTitle.trim() || !editDate || !editTime || isSavingEdit) return;

    try {
      setIsSavingEdit(true);
      const res = await fetch(`/api/reminders/${editingReminder.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          taskTitle: editTitle.trim(),
          remindAt: new Date(`${editDate}T${editTime}:00`).toISOString(),
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

    const newItem = {
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

  // ==================== DEBTS ACTIONS ====================
  // Create New Debt
  async function handleCreateDebt(e: React.FormEvent) {
    e.preventDefault();
    if (!newDebtPerson.trim() || !newDebtAmount || isSavingDebt) return;

    try {
      setIsSavingDebt(true);
      const res = await fetch("/api/debts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lineUserId,
          personName: newDebtPerson.trim(),
          amount: parseFloat(newDebtAmount),
          type: newDebtType,
          description: newDebtDesc.trim() || undefined,
        }),
      });

      if (res.ok) {
        setNewDebtPerson("");
        setNewDebtAmount("");
        setNewDebtDesc("");
        setIsCreatingDebt(false);
        fetchDebts();
      }
    } catch (err) {
      console.error("Failed to create debt:", err);
    } finally {
      setIsSavingDebt(false);
    }
  }

  // Settle Debt
  async function handleSettleDebt(debtId: string) {
    try {
      await fetch(`/api/debts/${debtId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "SETTLE" }),
      });
      fetchDebts();
    } catch (err) {
      console.error("Failed to settle debt:", err);
      fetchDebts();
    }
  }

  // Delete Debt
  async function handleDeleteDebt(debtId: string) {
    if (!confirm("คุณต้องการลบรายการนี้ใช่หรือไม่?")) return;
    try {
      await fetch(`/api/debts/${debtId}`, { method: "DELETE" });
      fetchDebts();
    } catch (err) {
      console.error("Failed to delete debt:", err);
      fetchDebts();
    }
  }

  // Open Avatar Modal
  function handleOpenAvatarModal(personName: string) {
    const existingProfile = personProfiles.find(
      (p) => p.name.toLowerCase() === personName.toLowerCase()
    );

    setCustomizingPerson(personName);
    if (existingProfile?.avatarType === "CUSTOM_IMAGE") {
      setAvatarCustomTab("image");
      setCustomPhotoUrl(existingProfile.avatarValue || "");
      setSelectedPresetId("cat");
    } else {
      setAvatarCustomTab("preset");
      setSelectedPresetId(existingProfile?.avatarValue || "cat");
      setCustomPhotoUrl("");
    }
  }

  // Save Avatar Profile
  async function handleSaveAvatarProfile(e: React.FormEvent) {
    e.preventDefault();
    if (!customizingPerson || isSavingProfile) return;

    try {
      setIsSavingProfile(true);
      const isCustom = avatarCustomTab === "image" && customPhotoUrl.trim().length > 0;
      const avatarType = isCustom ? "CUSTOM_IMAGE" : "PRESET_CHARACTER";
      const avatarValue = isCustom ? customPhotoUrl.trim() : selectedPresetId;

      const res = await fetch("/api/debts/profiles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lineUserId,
          personName: customizingPerson,
          avatarType,
          avatarValue,
        }),
      });

      if (res.ok) {
        setCustomizingPerson(null);
        fetchDebts();
      }
    } catch (err) {
      console.error("Failed to save avatar profile:", err);
    } finally {
      setIsSavingProfile(false);
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

  // Filtered people for Debt tab
  const filteredPeople = debtSummary.people.filter((p) => {
    if (activeDebtFilter === "RECEIVABLE") return p.netAmount > 0;
    if (activeDebtFilter === "PAYABLE") return p.netAmount < 0;
    return true;
  });

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

        {/* 3-Tab Selector */}
        <div className="max-w-xl mx-auto mt-3 grid grid-cols-3 gap-1 bg-sand/60 p-1 rounded-xl border border-sand">
          <button
            onClick={() => setActiveMainTab("reminders")}
            className={`py-2 px-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
              activeMainTab === "reminders"
                ? "bg-white text-matcha-dark shadow-sm"
                : "text-mocha-muted hover:text-mocha"
            }`}
          >
            <Bell className="w-3.5 h-3.5" />
            <span>เตือนความจำ</span>
            {stats.todayCount > 0 && (
              <span className="bg-matcha-dark text-white text-[10px] px-1.5 py-0.2 rounded-full font-bold">
                {stats.todayCount}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveMainTab("notes")}
            className={`py-2 px-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
              activeMainTab === "notes"
                ? "bg-white text-matcha-dark shadow-sm"
                : "text-mocha-muted hover:text-mocha"
            }`}
          >
            <CheckSquare className="w-3.5 h-3.5" />
            <span>โน้ต</span>
            {notes.length > 0 && (
              <span className="bg-sand text-mocha-muted text-[10px] px-1.5 py-0.2 rounded-full font-bold">
                {notes.length}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveMainTab("debt")}
            className={`py-2 px-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
              activeMainTab === "debt"
                ? "bg-white text-matcha-dark shadow-sm"
                : "text-mocha-muted hover:text-mocha"
            }`}
          >
            <Coins className="w-3.5 h-3.5" />
            <span>หนี้สิน</span>
            {debtSummary.people.length > 0 && (
              <span className="bg-amber-100 text-amber-900 text-[10px] px-1.5 py-0.2 rounded-full font-bold">
                {debtSummary.people.length}
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
            {/* Create Reminder Button / Form */}
            {!isCreatingReminder ? (
              <button
                onClick={() => {
                  setIsCreatingReminder(true);
                  const now = new Date();
                  now.setHours(now.getHours() + 1, 0, 0, 0);
                  setNewReminderDate(formatInTimeZone(now, "Asia/Bangkok", "yyyy-MM-dd"));
                  setNewReminderTime(formatInTimeZone(now, "Asia/Bangkok", "HH:mm"));
                }}
                className="w-full bg-white hover:bg-sand-light/60 border border-sand rounded-2xl p-3.5 flex items-center justify-between text-mocha font-semibold text-sm shadow-sm transition-all group"
              >
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-matcha-subtle text-matcha-dark flex items-center justify-center group-hover:scale-105 transition-transform">
                    <Plus className="w-5 h-5" />
                  </div>
                  <span>เพิ่มการแจ้งเตือน</span>
                </div>
                <span className="text-xs text-mocha-muted font-normal">กดเพื่อเลือกวันเวลา ⏰</span>
              </button>
            ) : (
              <form
                onSubmit={handleCreateManualReminder}
                className="bg-white rounded-2xl p-4 shadow-md border border-matcha-light space-y-3.5 animate-in fade-in zoom-in-95 duration-150"
              >
                <div className="flex items-center justify-between border-b border-sand pb-2">
                  <h3 className="text-sm font-bold text-mocha flex items-center gap-1.5">
                    <Bell className="w-4 h-4 text-matcha-dark" />
                    เพิ่มการแจ้งเตือนใหม่
                  </h3>
                  <button
                    type="button"
                    onClick={() => setIsCreatingReminder(false)}
                    className="text-mocha-muted hover:text-mocha p-1 rounded-lg hover:bg-sand"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-mocha-muted mb-1">
                    สิ่งที่ต้องทำ / กิจกรรม *
                  </label>
                  <input
                    type="text"
                    value={newReminderTitle}
                    onChange={(e) => setNewReminderTitle(e.target.value)}
                    placeholder="เช่น ประชุมกับทีม, กินยาหลังอาหาร, ซื้อของเข้าบ้าน"
                    required
                    className="w-full bg-sand-light border border-sand rounded-xl px-3 py-2 text-sm text-mocha placeholder:text-mocha-muted/60 focus:outline-none focus:ring-2 focus:ring-matcha"
                  />
                </div>

                {/* Date & Time Pickers Side-by-Side (Mobile responsive, no overflow) */}
                <div className="grid grid-cols-2 gap-2.5">
                  <div className="min-w-0">
                    <label className="block text-xs font-semibold text-mocha-muted mb-1 flex items-center gap-1">
                      <Calendar className="w-3.5 h-3.5 text-matcha-dark" />
                      วันที่ *
                    </label>
                    <input
                      type="date"
                      value={newReminderDate}
                      onChange={(e) => setNewReminderDate(e.target.value)}
                      required
                      className="w-full min-w-0 box-border bg-sand-light border border-sand rounded-xl px-2.5 py-2 text-xs text-mocha focus:outline-none focus:ring-2 focus:ring-matcha"
                    />
                  </div>

                  <div className="min-w-0">
                    <label className="block text-xs font-semibold text-mocha-muted mb-1 flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5 text-matcha-dark" />
                      เวลา *
                    </label>
                    <input
                      type="time"
                      value={newReminderTime}
                      onChange={(e) => setNewReminderTime(e.target.value)}
                      required
                      className="w-full min-w-0 box-border bg-sand-light border border-sand rounded-xl px-2.5 py-2 text-xs text-mocha focus:outline-none focus:ring-2 focus:ring-matcha"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2.5">
                  <div className="min-w-0">
                    <label className="block text-xs font-semibold text-mocha-muted mb-1">
                      การเตือนซ้ำ
                    </label>
                    <select
                      value={newReminderRecurrence}
                      onChange={(e) =>
                        setNewReminderRecurrence(
                          e.target.value as "NONE" | "DAILY" | "WEEKLY" | "MONTHLY"
                        )
                      }
                      className="w-full min-w-0 box-border bg-sand-light border border-sand rounded-xl px-2.5 py-2 text-xs text-mocha focus:outline-none focus:ring-2 focus:ring-matcha truncate"
                    >
                      <option value="NONE">ไม่เตือนซ้ำ (ครั้งเดียว)</option>
                      <option value="DAILY">เตือนทุกวัน</option>
                      <option value="WEEKLY">เตือนทุกสัปดาห์</option>
                      <option value="MONTHLY">เตือนทุกเดือน</option>
                    </select>
                  </div>

                  <div className="min-w-0">
                    <label className="block text-xs font-semibold text-mocha-muted mb-1">
                      เตือนก่อนเวลา
                    </label>
                    <select
                      value={newReminderAdvanceMinutes}
                      onChange={(e) => setNewReminderAdvanceMinutes(parseInt(e.target.value, 10))}
                      className="w-full min-w-0 box-border bg-sand-light border border-sand rounded-xl px-2.5 py-2 text-xs text-mocha focus:outline-none focus:ring-2 focus:ring-matcha truncate"
                    >
                      <option value={0}>ตรงเวลาพอดี</option>
                      <option value={5}>เตือนก่อน 5 นาที</option>
                      <option value={10}>เตือนก่อน 10 นาที</option>
                      <option value={15}>เตือนก่อน 15 นาที</option>
                      <option value={30}>เตือนก่อน 30 นาที</option>
                      <option value={60}>เตือนก่อน 1 ชม.</option>
                      <option value={1440}>เตือนก่อน 1 วัน</option>
                    </select>
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setIsCreatingReminder(false)}
                    className="px-4 py-2 text-xs font-semibold text-mocha-muted hover:bg-sand rounded-xl transition-colors"
                  >
                    ยกเลิก
                  </button>
                  <button
                    type="submit"
                    disabled={isSavingReminder || !newReminderTitle.trim() || !newReminderDate || !newReminderTime}
                    className="px-4 py-2 text-xs font-semibold bg-matcha-dark hover:bg-matcha text-white rounded-xl shadow-sm transition-all flex items-center gap-1.5 disabled:opacity-50"
                  >
                    {isSavingReminder && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                    <span>บันทึกการแจ้งเตือน</span>
                  </button>
                </div>
              </form>
            )}

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

        {/* ========================================================================= */}
        {/* SECTION 3: DEBTS TAB */}
        {/* ========================================================================= */}
        {activeMainTab === "debt" && (
          <>
            {/* Overview Summary Cards */}
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-emerald-50/80 border border-emerald-200/80 rounded-2xl p-3.5 shadow-sm">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-emerald-800 flex items-center gap-1">
                    <ArrowDownLeft className="w-3.5 h-3.5 text-emerald-600" />
                    รอรับคืน (เราให้ยืม)
                  </span>
                </div>
                <p className="text-xl font-extrabold text-emerald-700 mt-1">
                  ฿{debtSummary.totalReceivable.toLocaleString("th-TH")}
                </p>
              </div>

              <div className="bg-rose-50/80 border border-rose-200/80 rounded-2xl p-3.5 shadow-sm">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-rose-800 flex items-center gap-1">
                    <ArrowUpRight className="w-3.5 h-3.5 text-rose-600" />
                    ต้องจ่ายคืน (เรายืมเขา)
                  </span>
                </div>
                <p className="text-xl font-extrabold text-rose-700 mt-1">
                  ฿{debtSummary.totalPayable.toLocaleString("th-TH")}
                </p>
              </div>
            </div>

            {/* Create Debt Action Button / Form */}
            {!isCreatingDebt ? (
              <button
                onClick={() => setIsCreatingDebt(true)}
                className="w-full bg-white hover:bg-sand-light/60 border border-sand rounded-2xl p-3.5 flex items-center justify-between text-mocha font-semibold text-sm shadow-sm transition-all group"
              >
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-amber-100 text-amber-900 flex items-center justify-center group-hover:scale-105 transition-transform">
                    <Plus className="w-5 h-5" />
                  </div>
                  <span>บันทึกรายการหนี้ใหม่</span>
                </div>
                <span className="text-xs text-mocha-muted font-normal">กดเพื่อบันทึก 💰</span>
              </button>
            ) : (
              <form
                onSubmit={handleCreateDebt}
                className="bg-white rounded-2xl p-4 shadow-md border border-matcha-light space-y-3 animate-in fade-in zoom-in-95 duration-150"
              >
                <div className="flex items-center justify-between border-b border-sand pb-2">
                  <h3 className="text-sm font-bold text-mocha flex items-center gap-1.5">
                    <Coins className="w-4 h-4 text-matcha-dark" />
                    บันทึกรายการหนี้ใหม่
                  </h3>
                  <button
                    type="button"
                    onClick={() => setIsCreatingDebt(false)}
                    className="text-mocha-muted hover:text-mocha p-1 rounded-lg hover:bg-sand"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {/* Debt Type Selector */}
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setNewDebtType("LENT")}
                    className={`py-2 px-3 rounded-xl text-xs font-bold border transition-all ${
                      newDebtType === "LENT"
                        ? "bg-emerald-50 border-emerald-300 text-emerald-800 shadow-sm"
                        : "bg-sand-light border-sand text-mocha-muted"
                    }`}
                  >
                    🟢 เราให้ยืม (รอรับคืน)
                  </button>
                  <button
                    type="button"
                    onClick={() => setNewDebtType("BORROWED")}
                    className={`py-2 px-3 rounded-xl text-xs font-bold border transition-all ${
                      newDebtType === "BORROWED"
                        ? "bg-rose-50 border-rose-300 text-rose-800 shadow-sm"
                        : "bg-sand-light border-sand text-mocha-muted"
                    }`}
                  >
                    🔴 เรายืมเขา (ต้องจ่ายคืน)
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs font-semibold text-mocha-muted mb-1">
                      ชื่อคน / เพื่อน *
                    </label>
                    <input
                      type="text"
                      value={newDebtPerson}
                      onChange={(e) => setNewDebtPerson(e.target.value)}
                      placeholder="เช่น ปิ่น, ก้อง, แฮม"
                      required
                      className="w-full bg-sand-light border border-sand rounded-xl px-3 py-2 text-sm text-mocha placeholder:text-mocha-muted/60 focus:outline-none focus:ring-2 focus:ring-matcha"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-mocha-muted mb-1">
                      จำนวนเงิน (บาท) *
                    </label>
                    <input
                      type="number"
                      step="any"
                      value={newDebtAmount}
                      onChange={(e) => setNewDebtAmount(e.target.value)}
                      placeholder="เช่น 50, 100"
                      required
                      className="w-full bg-sand-light border border-sand rounded-xl px-3 py-2 text-sm text-mocha placeholder:text-mocha-muted/60 focus:outline-none focus:ring-2 focus:ring-matcha"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-mocha-muted mb-1">
                    หมายเหตุ (ไม่บังคับ)
                  </label>
                  <input
                    type="text"
                    value={newDebtDesc}
                    onChange={(e) => setNewDebtDesc(e.target.value)}
                    placeholder="เช่น ค่ากาแฟ, ค่าข้าว, ค่าของขวัญ"
                    className="w-full bg-sand-light border border-sand rounded-xl px-3 py-2 text-sm text-mocha placeholder:text-mocha-muted/60 focus:outline-none focus:ring-2 focus:ring-matcha"
                  />
                </div>

                <div className="flex items-center justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setIsCreatingDebt(false)}
                    className="px-4 py-2 text-xs font-semibold text-mocha-muted hover:bg-sand rounded-xl transition-colors"
                  >
                    ยกเลิก
                  </button>
                  <button
                    type="submit"
                    disabled={isSavingDebt || !newDebtPerson.trim() || !newDebtAmount}
                    className="px-4 py-2 text-xs font-semibold bg-matcha-dark hover:bg-matcha text-white rounded-xl shadow-sm transition-all flex items-center gap-1.5 disabled:opacity-50"
                  >
                    {isSavingDebt && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                    <span>บันทึกหนี้</span>
                  </button>
                </div>
              </form>
            )}

            {/* Filter Chips */}
            <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
              {[
                { key: "ALL", label: `ทั้งหมด (${debtSummary.people.length})` },
                { key: "RECEIVABLE", label: "🟢 รอรับคืน" },
                { key: "PAYABLE", label: "🔴 ต้องจ่ายคืน" },
              ].map((f) => (
                <button
                  key={f.key}
                  onClick={() => setActiveDebtFilter(f.key as any)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all border ${
                    activeDebtFilter === f.key
                      ? "bg-matcha-dark text-white border-matcha-dark shadow-sm"
                      : "bg-white text-mocha-muted border-sand hover:border-matcha-light"
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>

            {/* List of People Groups */}
            <div className="space-y-3">
              {filteredPeople.length === 0 ? (
                <div className="text-center py-12 bg-white rounded-2xl border border-sand p-6">
                  <p className="text-3xl mb-2">🎉</p>
                  <p className="text-sm font-bold text-mocha">ไม่มีรายการหนี้สินคงค้าง</p>
                  <p className="text-xs text-mocha-muted mt-1">
                    พิมพ์บอกบอทได้เลย เช่น &quot;ปิ่น 50 ค่ากาแฟ&quot; หรือ &quot;เรายืมแฮม 60&quot;
                  </p>
                </div>
              ) : (
                filteredPeople.map((person) => {
                  const avatar = getAvatarInfo(person.personName, person.profile);
                  const isPositive = person.netAmount > 0;
                  const isZero = person.netAmount === 0;

                  return (
                    <div
                      key={person.personName}
                      className="bg-white rounded-2xl p-4 shadow-sm border border-sand space-y-3"
                    >
                      {/* Person Header */}
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          {/* Interactive Avatar */}
                          <div
                            onClick={() => handleOpenAvatarModal(person.personName)}
                            className="relative cursor-pointer group"
                            title="กดเพื่อเปลี่ยนตัวละคร / ใส่รูปหน้าจริง"
                          >
                            <div
                              style={{ backgroundColor: avatar.bg }}
                              className="w-12 h-12 rounded-2xl flex items-center justify-center text-xl shadow-inner border border-black/5 overflow-hidden transition-transform group-hover:scale-105"
                            >
                              {avatar.isCustomImage && avatar.imageUrl ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                  src={avatar.imageUrl}
                                  alt={person.personName}
                                  className="w-full h-full object-cover"
                                />
                              ) : (
                                <span>{avatar.emoji}</span>
                              )}
                            </div>
                            <div className="absolute -bottom-1 -right-1 bg-white border border-sand rounded-full p-0.5 shadow-sm text-mocha-muted">
                              <Pencil className="w-3 h-3" />
                            </div>
                          </div>

                          <div>
                            <div className="flex items-center gap-1.5">
                              <h4 className="text-base font-bold text-mocha">
                                {person.personName}
                              </h4>
                              <span className="text-[10px] text-mocha-muted bg-sand/60 px-1.5 py-0.5 rounded-md">
                                {avatar.characterName}
                              </span>
                            </div>
                            <p
                              className={`text-xs font-bold mt-0.5 ${
                                isZero
                                  ? "text-mocha-muted"
                                  : isPositive
                                  ? "text-emerald-700"
                                  : "text-rose-700"
                              }`}
                            >
                              {isZero
                                ? "ยอดหักลบพอดี"
                                : isPositive
                                ? `ติดเราสุทธิ ฿${person.netAmount.toLocaleString("th-TH")}`
                                : `เราติดเขาสุทธิ ฿${Math.abs(person.netAmount).toLocaleString("th-TH")}`}
                            </p>
                          </div>
                        </div>

                        {/* Quick Settle All Button */}
                        <button
                          onClick={() => {
                            person.items.forEach((item) => handleSettleDebt(item.id));
                          }}
                          className="px-2.5 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 rounded-xl text-xs font-semibold flex items-center gap-1 transition-all"
                        >
                          <Check className="w-3.5 h-3.5" />
                          <span>เคลียร์ทั้งหมด</span>
                        </button>
                      </div>

                      {/* Items List */}
                      <div className="divide-y divide-sand/50 bg-sand-light/40 rounded-xl p-2">
                        {person.items.map((item) => {
                          const isLent = item.type === "LENT";
                          return (
                            <div
                              key={item.id}
                              className="py-2 px-1 flex items-center justify-between text-xs"
                            >
                              <div className="flex items-center gap-2">
                                <span
                                  className={`px-1.5 py-0.5 rounded-md text-[10px] font-bold ${
                                    isLent
                                      ? "bg-emerald-100 text-emerald-800"
                                      : "bg-rose-100 text-rose-800"
                                  }`}
                                >
                                  {isLent ? "ให้ยืม" : "ยืมเขา"}
                                </span>
                                <span className="text-mocha font-medium">
                                  {item.description || "ยืมเงิน"}
                                </span>
                              </div>

                              <div className="flex items-center gap-2.5">
                                <span
                                  className={`font-bold ${
                                    isLent ? "text-emerald-700" : "text-rose-700"
                                  }`}
                                >
                                  {isLent ? "+" : "-"}฿{item.amount.toLocaleString("th-TH")}
                                </span>
                                <button
                                  onClick={() => handleSettleDebt(item.id)}
                                  className="text-emerald-600 hover:text-emerald-800 p-1 hover:bg-emerald-50 rounded-lg transition-colors"
                                  title="เคลียร์รายการนี้"
                                >
                                  <CheckCircle2 className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={() => handleDeleteDebt(item.id)}
                                  className="text-mocha-muted/60 hover:text-rose-600 p-1 hover:bg-rose-50 rounded-lg transition-colors"
                                  title="ลบรายการ"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
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

              {/* Date & Time Side-by-Side */}
              <div className="grid grid-cols-2 gap-2.5">
                <div className="min-w-0">
                  <label className="block text-xs font-semibold text-mocha-muted mb-1 flex items-center gap-1">
                    <Calendar className="w-3.5 h-3.5 text-matcha-dark" />
                    วันที่
                  </label>
                  <input
                    type="date"
                    value={editDate}
                    onChange={(e) => setEditDate(e.target.value)}
                    required
                    className="w-full min-w-0 box-border bg-sand-light border border-sand rounded-xl px-2.5 py-2 text-xs text-mocha focus:outline-none focus:ring-2 focus:ring-matcha"
                  />
                </div>

                <div className="min-w-0">
                  <label className="block text-xs font-semibold text-mocha-muted mb-1 flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5 text-matcha-dark" />
                    เวลา
                  </label>
                  <input
                    type="time"
                    value={editTime}
                    onChange={(e) => setEditTime(e.target.value)}
                    required
                    className="w-full min-w-0 box-border bg-sand-light border border-sand rounded-xl px-2.5 py-2 text-xs text-mocha focus:outline-none focus:ring-2 focus:ring-matcha"
                  />
                </div>
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

      {/* Avatar Customizer Modal */}
      {customizingPerson && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-sand animate-in fade-in zoom-in duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-sand">
              <h2 className="text-base font-bold text-mocha flex items-center gap-2">
                <Smile className="w-4 h-4 text-matcha-dark" />
                เลือกตัวละครคุณ {customizingPerson}
              </h2>
              <button
                onClick={() => setCustomizingPerson(null)}
                className="text-mocha-muted hover:text-mocha p-1 rounded-lg hover:bg-sand-light"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Tabs: Preset Characters vs Custom Photo */}
            <div className="mt-3 grid grid-cols-2 gap-1 bg-sand/60 p-1 rounded-xl">
              <button
                type="button"
                onClick={() => setAvatarCustomTab("preset")}
                className={`py-1.5 px-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1 ${
                  avatarCustomTab === "preset"
                    ? "bg-white text-matcha-dark shadow-sm"
                    : "text-mocha-muted"
                }`}
              >
                <Smile className="w-3.5 h-3.5" />
                <span>ตัวละครการ์ตูน</span>
              </button>

              <button
                type="button"
                onClick={() => setAvatarCustomTab("image")}
                className={`py-1.5 px-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1 ${
                  avatarCustomTab === "image"
                    ? "bg-white text-matcha-dark shadow-sm"
                    : "text-mocha-muted"
                }`}
              >
                <ImageIcon className="w-3.5 h-3.5" />
                <span>รูปหน้าจริง (URL)</span>
              </button>
            </div>

            <form onSubmit={handleSaveAvatarProfile} className="mt-4 space-y-4">
              {avatarCustomTab === "preset" ? (
                <div>
                  <label className="block text-xs font-semibold text-mocha-muted mb-2">
                    เลือกตัวละครที่ต้องการ:
                  </label>
                  <div className="grid grid-cols-4 gap-2.5 max-h-56 overflow-y-auto p-1">
                    {PRESET_AVATARS.map((preset) => {
                      const isSelected = selectedPresetId === preset.id;
                      return (
                        <button
                          type="button"
                          key={preset.id}
                          onClick={() => setSelectedPresetId(preset.id)}
                          style={{ backgroundColor: preset.bg }}
                          className={`p-2.5 rounded-2xl flex flex-col items-center justify-center border-2 transition-all group ${
                            isSelected
                              ? "border-matcha-dark scale-105 shadow-md ring-2 ring-matcha/30"
                              : "border-transparent hover:border-sand hover:scale-102"
                          }`}
                        >
                          <span className="text-2xl">{preset.emoji}</span>
                          <span className="text-[10px] font-bold text-mocha mt-1 truncate max-w-full">
                            {preset.name}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-semibold text-mocha-muted mb-1">
                      วางลิงก์รูปภาพใบหน้าจริง (Image URL):
                    </label>
                    <input
                      type="url"
                      value={customPhotoUrl}
                      onChange={(e) => setCustomPhotoUrl(e.target.value)}
                      placeholder="https://example.com/photo.jpg"
                      className="w-full bg-sand-light border border-sand rounded-xl px-3 py-2 text-sm text-mocha placeholder:text-mocha-muted/60 focus:outline-none focus:ring-2 focus:ring-matcha"
                    />
                  </div>

                  {/* Photo Preview */}
                  {customPhotoUrl && (
                    <div className="flex items-center gap-3 bg-sand-light/60 p-3 rounded-xl border border-sand">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={customPhotoUrl}
                        alt="Preview"
                        className="w-12 h-12 rounded-full object-cover border-2 border-matcha-light"
                        onError={(e) => {
                          (e.target as HTMLElement).style.display = "none";
                        }}
                      />
                      <div>
                        <p className="text-xs font-bold text-mocha">ตัวอย่างรูปภาพ</p>
                        <p className="text-[10px] text-mocha-muted">จะแสดงเป็น Avatar ของ {customizingPerson}</p>
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div className="pt-2 flex items-center justify-end gap-2 border-t border-sand">
                <button
                  type="button"
                  onClick={() => setCustomizingPerson(null)}
                  className="px-4 py-2 text-xs font-semibold text-mocha-muted hover:bg-sand rounded-xl transition-colors"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  disabled={isSavingProfile}
                  className="px-4 py-2 text-xs font-semibold bg-matcha-dark hover:bg-matcha text-white rounded-xl shadow-sm transition-all flex items-center gap-1.5 disabled:opacity-50"
                >
                  {isSavingProfile && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>บันทึกตัวละคร</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}


