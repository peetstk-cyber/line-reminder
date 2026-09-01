"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
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
  ChevronLeft,
  ChevronRight,
  CalendarDays,
  ExternalLink,
  Copy,
  Globe,
  Link as LinkIcon,
  Sun,
  Sunset,
  Moon,
  Palmtree,
  Tag,
  CalendarCheck,
  CalendarPlus,
} from "lucide-react";
import { PRESET_AVATARS, getAvatarInfo, PresetAvatar } from "@/lib/avatar";
import { formatInTimeZone } from "date-fns-tz";

export interface ShiftItem {
  id: string;
  userId: string;
  date: string; // "YYYY-MM-DD"
  shiftType: string; // "MORNING" | "AFTERNOON" | "NIGHT" | "OFF" | "CUSTOM"
  title: string;
  color: string;
  note: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export const SHIFT_PRESETS = [
  {
    type: "MORNING",
    title: "เช้า",
    subtitle: "08:00 - 16:00",
    icon: "🌅",
    color: "#EA580C",
    bgLight: "#FFF7ED",
    border: "#FDBA74",
    text: "#C2410C",
  },
  {
    type: "AFTERNOON",
    title: "บ่าย",
    subtitle: "16:00 - 24:00",
    icon: "🌇",
    color: "#7C3AED",
    bgLight: "#F5F3FF",
    border: "#C4B5FD",
    text: "#6D28D9",
  },
  {
    type: "NIGHT",
    title: "ดึก",
    subtitle: "24:00 - 08:00",
    icon: "🌙",
    color: "#2563EB",
    bgLight: "#EFF6FF",
    border: "#93C5FD",
    text: "#1D4ED8",
  },
  {
    type: "OFF",
    title: "OFF",
    subtitle: "วันหยุด",
    icon: "🏖️",
    color: "#059669",
    bgLight: "#ECFDF5",
    border: "#6EE7B7",
    text: "#047857",
  },
];

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
  category: "SHOPPING" | "TODO" | "GENERAL" | "LINK" | "READING";
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
  const [activeMainTab, setActiveMainTab] = useState<"reminders" | "calendar" | "notes" | "debt">("reminders");
  const [lineUserId, setLineUserId] = useState<string>("");
  const [displayName, setDisplayName] = useState<string>("ผู้ใช้งาน LINE");
  const [pictureUrl, setPictureUrl] = useState<string | null>(null);
  const [isLiffReady, setIsLiffReady] = useState(false);
  const [loading, setLoading] = useState(true);

  // Calendar State
  const [calendarCurrentDate, setCalendarCurrentDate] = useState<Date>(() => new Date());
  const [selectedCalendarDate, setSelectedCalendarDate] = useState<string>(() => {
    return formatInTimeZone(new Date(), "Asia/Bangkok", "yyyy-MM-dd");
  });

  // Reminders State
  const [reminders, setReminders] = useState<ReminderItem[]>([]);
  const [stats, setStats] = useState<Stats>({ todayCount: 0, totalPending: 0, completedCount: 0 });
  const [activeReminderFilter, setActiveReminderFilter] = useState<"all" | "today" | "week" | "completed">("all");
  
  // Manual Reminder Creator State
  const [isCreatingReminder, setIsCreatingReminder] = useState(false);
  const [newReminderTitle, setNewReminderTitle] = useState("");
  const [newReminderDateTime, setNewReminderDateTime] = useState("");
  const [newReminderRecurrence, setNewReminderRecurrence] = useState<"NONE" | "DAILY" | "WEEKLY" | "MONTHLY">("NONE");
  const [newReminderAdvanceMinutes, setNewReminderAdvanceMinutes] = useState<number>(0);
  const [isSavingReminder, setIsSavingReminder] = useState(false);

  // Edit Reminder Modal State
  const [editingReminder, setEditingReminder] = useState<ReminderItem | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDateTime, setEditDateTime] = useState("");
  const [editRecurrence, setEditRecurrence] = useState<"NONE" | "DAILY" | "WEEKLY" | "MONTHLY">("NONE");
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  // Notes State
  const [notes, setNotes] = useState<Note[]>([]);
  const [activeNoteCategory, setActiveNoteCategory] = useState<"ALL" | "LINK" | "SHOPPING" | "TODO" | "GENERAL" | "READING">("ALL");
  const [isCreatingNote, setIsCreatingNote] = useState(false);
  const [newNoteTitle, setNewNoteTitle] = useState("");
  const [newNoteCategory, setNewNoteCategory] = useState<"TODO" | "GENERAL" | "SHOPPING" | "LINK" | "READING">("TODO");
  const [newNoteItemsText, setNewNoteItemsText] = useState("");
  const [isSavingNote, setIsSavingNote] = useState(false);
  const [inlineNewItem, setInlineNewItem] = useState<{ [noteId: string]: string }>({});
  const [copiedLinkId, setCopiedLinkId] = useState<string | null>(null);

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

  // Shift Management State
  const [shifts, setShifts] = useState<ShiftItem[]>([]);
  const [isShiftModeActive, setIsShiftModeActive] = useState(false);
  const [selectedShiftType, setSelectedShiftType] = useState<string>("MORNING");
  const [customShiftTitle, setCustomShiftTitle] = useState<string>("");
  const [customShiftColor, setCustomShiftColor] = useState<string>("#F97316");
  const [multiSelectedDates, setMultiSelectedDates] = useState<string[]>([]);
  const [isSavingShifts, setIsSavingShifts] = useState(false);
  const [editingDayShiftDate, setEditingDayShiftDate] = useState<string | null>(null);

  // Instant Cache Hydration on mount (0ms UI render)
  useEffect(() => {
    try {
      const cachedUid = localStorage.getItem("line_uid");
      const cachedName = localStorage.getItem("line_name");
      const cachedPic = localStorage.getItem("line_pic");
      const cachedRem = localStorage.getItem("line_cached_reminders");
      const cachedStats = localStorage.getItem("line_cached_stats");
      const cachedNotes = localStorage.getItem("line_cached_notes");
      const cachedDebts = localStorage.getItem("line_cached_debts");
      const cachedShifts = localStorage.getItem("line_cached_shifts");

      if (cachedUid) setLineUserId(cachedUid);
      if (cachedName) setDisplayName(cachedName);
      if (cachedPic) setPictureUrl(cachedPic);
      if (cachedRem) {
        const parsed = JSON.parse(cachedRem);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setReminders(parsed);
          setLoading(false);
        }
      }
      if (cachedStats) setStats(JSON.parse(cachedStats));
      if (cachedNotes) setNotes(JSON.parse(cachedNotes));
      if (cachedDebts) setDebtSummary(JSON.parse(cachedDebts));
      if (cachedShifts) setShifts(JSON.parse(cachedShifts));
    } catch (e) {
      console.error("Failed to load local cache:", e);
    }
  }, []);

  // Initialize LIFF & Check URL Params
  useEffect(() => {
    async function initLiff() {
      if (typeof window !== "undefined") {
        const urlParams = new URLSearchParams(window.location.search);
        const tab = urlParams.get("tab");
        if (tab === "notes") {
          setActiveMainTab("notes");
        } else if (tab === "debt") {
          setActiveMainTab("debt");
        } else if (tab === "calendar") {
          setActiveMainTab("calendar");
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

            // Save to localStorage for instant 0ms load next time
            try {
              localStorage.setItem("line_uid", profile.userId);
              localStorage.setItem("line_name", profile.displayName);
              if (profile.pictureUrl) localStorage.setItem("line_pic", profile.pictureUrl);
            } catch (e) {}

            // Background sync (non-blocking)
            fetch("/api/users/sync", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                lineUserId: profile.userId,
                displayName: profile.displayName,
                pictureUrl: profile.pictureUrl,
              }),
            }).catch((err) => console.error("Background user sync failed:", err));
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
      const res = await fetch(`/api/reminders?lineUserId=${lineUserId}&filter=${filter}`);
      if (res.ok) {
        const data = await res.json();
        setReminders(data.reminders || []);
        if (data.stats) setStats(data.stats);

        try {
          if (filter === "all" && Array.isArray(data.reminders)) {
            localStorage.setItem("line_cached_reminders", JSON.stringify(data.reminders));
          }
          if (data.stats) {
            localStorage.setItem("line_cached_stats", JSON.stringify(data.stats));
          }
        } catch (e) {}
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
      const res = await fetch(`/api/notes?lineUserId=${lineUserId}&category=${category}`);
      if (res.ok) {
        const data = await res.json();
        setNotes(data.notes || []);
        try {
          if (category === "ALL" && Array.isArray(data.notes)) {
            localStorage.setItem("line_cached_notes", JSON.stringify(data.notes));
          }
        } catch (e) {}
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
      const res = await fetch(`/api/debts?lineUserId=${lineUserId}`);
      if (res.ok) {
        const data = await res.json();
        if (data.summary) {
          setDebtSummary(data.summary);
          try {
            localStorage.setItem("line_cached_debts", JSON.stringify(data.summary));
          } catch (e) {}
        }
        if (data.debts) setDebts(data.debts);
        if (data.profiles) setPersonProfiles(data.profiles);
      }
    } catch (err) {
      console.error("Error fetching debts:", err);
    } finally {
      setLoading(false);
    }
  }, [lineUserId]);

  // Fetch Shifts
  const fetchShifts = useCallback(async () => {
    if (!lineUserId) return;
    try {
      const res = await fetch(`/api/shifts?lineUserId=${lineUserId}`);
      if (res.ok) {
        const data = await res.json();
        setShifts(data.shifts || []);
        try {
          localStorage.setItem("line_cached_shifts", JSON.stringify(data.shifts || []));
        } catch (e) {}
      }
    } catch (err) {
      console.error("Error fetching shifts:", err);
    }
  }, [lineUserId]);

  useEffect(() => {
    if (isLiffReady && lineUserId) {
      if (activeMainTab === "reminders") {
        fetchReminders(activeReminderFilter);
      } else if (activeMainTab === "calendar") {
        fetchReminders("all");
        fetchShifts();
      } else if (activeMainTab === "notes") {
        fetchNotes(activeNoteCategory);
      } else if (activeMainTab === "debt") {
        fetchDebts();
      }
    }
  }, [isLiffReady, lineUserId, activeMainTab, activeReminderFilter, activeNoteCategory, fetchReminders, fetchNotes, fetchDebts, fetchShifts]);

  // Toggle multi-select date in Shift Mode
  function handleToggleDateInShiftMode(dateKey: string) {
    setMultiSelectedDates((prev) =>
      prev.includes(dateKey) ? prev.filter((d) => d !== dateKey) : [...prev, dateKey]
    );
  }

  // Batch Save Multi-Selected Shifts
  async function handleSaveMultiShifts() {
    if (multiSelectedDates.length === 0 || !lineUserId || isSavingShifts) return;

    try {
      setIsSavingShifts(true);
      const preset = SHIFT_PRESETS.find((p) => p.type === selectedShiftType);
      const title =
        selectedShiftType === "CUSTOM"
          ? customShiftTitle.trim() || "เวร"
          : preset?.title || "เวร";
      const color =
        selectedShiftType === "CUSTOM" ? customShiftColor : preset?.color || "#F97316";

      const shiftsPayload = multiSelectedDates.map((date) => ({
        date,
        shiftType: selectedShiftType,
        title,
        color,
      }));

      // Optimistic update
      setShifts((prev) => {
        const dateSet = new Set(multiSelectedDates);
        const filtered = prev.filter((s) => !dateSet.has(s.date));
        const newItems: ShiftItem[] = shiftsPayload.map((sp) => ({
          id: `temp-${sp.date}`,
          userId: lineUserId,
          date: sp.date,
          shiftType: sp.shiftType,
          title: sp.title,
          color: sp.color,
          note: null,
        }));
        const next = [...filtered, ...newItems];
        try {
          localStorage.setItem("line_cached_shifts", JSON.stringify(next));
        } catch (e) {}
        return next;
      });

      const res = await fetch("/api/shifts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lineUserId,
          shifts: shiftsPayload,
        }),
      });

      if (res.ok) {
        setIsShiftModeActive(false);
        setMultiSelectedDates([]);
        fetchShifts();
      }
    } catch (err) {
      console.error("Failed to save shifts:", err);
    } finally {
      setIsSavingShifts(false);
    }
  }

  // Set Single Day Shift
  async function handleSetSingleDayShift(dateKey: string, shiftType: string, title: string, color: string) {
    if (!lineUserId) return;
    try {
      // Optimistic update
      setShifts((prev) => {
        const filtered = prev.filter((s) => s.date !== dateKey);
        const newItem: ShiftItem = {
          id: `temp-${dateKey}`,
          userId: lineUserId,
          date: dateKey,
          shiftType,
          title,
          color,
          note: null,
        };
        const next = [...filtered, newItem];
        try {
          localStorage.setItem("line_cached_shifts", JSON.stringify(next));
        } catch (e) {}
        return next;
      });

      await fetch("/api/shifts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lineUserId,
          shifts: [{ date: dateKey, shiftType, title, color }],
        }),
      });
      fetchShifts();
    } catch (err) {
      console.error("Failed to set shift:", err);
    }
  }

  // Delete Single Shift
  async function handleDeleteSingleShift(dateKey: string) {
    if (!lineUserId) return;
    try {
      // Optimistic removal
      setShifts((prev) => {
        const next = prev.filter((s) => s.date !== dateKey);
        try {
          localStorage.setItem("line_cached_shifts", JSON.stringify(next));
        } catch (e) {}
        return next;
      });

      await fetch(`/api/shifts?lineUserId=${lineUserId}&date=${dateKey}`, {
        method: "DELETE",
      });
      fetchShifts();
    } catch (err) {
      console.error("Failed to delete shift:", err);
    }
  }

  // Handle Create Manual Reminder
  async function handleCreateManualReminder(e: React.FormEvent) {
    e.preventDefault();
    if (!newReminderTitle.trim() || !newReminderDateTime || isSavingReminder) return;

    try {
      setIsSavingReminder(true);
      const selectedDate = new Date(newReminderDateTime);
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
        setNewReminderDateTime("");
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

    // Immediate optimistic removal from current view
    if (newStatus === "COMPLETED" && activeReminderFilter !== "completed") {
      setReminders((prev) => prev.filter((r) => r.id !== id));
      setStats((prev) => ({
        ...prev,
        totalPending: Math.max(0, prev.totalPending - 1),
        completedCount: prev.completedCount + 1,
      }));
    } else if (newStatus === "PENDING" && activeReminderFilter === "completed") {
      setReminders((prev) => prev.filter((r) => r.id !== id));
      setStats((prev) => ({
        ...prev,
        totalPending: prev.totalPending + 1,
        completedCount: Math.max(0, prev.completedCount - 1),
      }));
    } else {
      setReminders((prev) =>
        prev.map((r) => (r.id === id ? { ...r, status: newStatus as any } : r))
      );
    }

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
    setEditDateTime(formatInTimeZone(d, "Asia/Bangkok", "yyyy-MM-dd'T'HH:mm"));
  }

  // Save Edited Reminder
  async function handleSaveEditReminder(e: React.FormEvent) {
    e.preventDefault();
    if (!editingReminder || !editTitle.trim() || !editDateTime || isSavingEdit) return;

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
    LINK: { label: "ลิงก์เว็บ", emoji: "🔗", bg: "bg-indigo-50 border-indigo-200", text: "text-indigo-800" },
    READING: { label: "ต้องอ่าน", emoji: "📚", bg: "bg-amber-50 border-amber-200", text: "text-amber-800" },
    TODO: { label: "สิ่งที่ต้องทำ", emoji: "📌", bg: "bg-emerald-50 border-emerald-200", text: "text-emerald-800" },
    SHOPPING: { label: "ซื้อของ", emoji: "🛒", bg: "bg-orange-50 border-orange-200", text: "text-orange-800" },
    GENERAL: { label: "ทั่วไป", emoji: "📝", bg: "bg-blue-50 border-blue-200", text: "text-blue-800" },
  };

  const extractDomainFromUrl = (url: string): string => {
    try {
      const parsed = new URL(url);
      return parsed.hostname.replace(/^www\./, "");
    } catch (e) {
      return "website.com";
    }
  };

  const handleCopyLink = async (noteId: string, url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopiedLinkId(noteId);
      setTimeout(() => setCopiedLinkId(null), 2000);
    } catch (e) {
      console.error("Failed to copy link:", e);
    }
  };

  // Filtered people for Debt tab
  const filteredPeople = debtSummary.people.filter((p) => {
    if (activeDebtFilter === "RECEIVABLE") return p.netAmount > 0;
    if (activeDebtFilter === "PAYABLE") return p.netAmount < 0;
    return true;
  });

  // Calendar Computations & Helpers
  const year = calendarCurrentDate.getFullYear();
  const month = calendarCurrentDate.getMonth();

  const monthNamesThai = [
    "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
    "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"
  ];

  const thaiDayHeaders = ["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"];

  const handlePrevMonth = () => {
    setCalendarCurrentDate(new Date(year, month - 1, 1));
  };

  const handleNextMonth = () => {
    setCalendarCurrentDate(new Date(year, month + 1, 1));
  };

  const handleTodayMonth = () => {
    const today = new Date();
    setCalendarCurrentDate(today);
    setSelectedCalendarDate(formatInTimeZone(today, "Asia/Bangkok", "yyyy-MM-dd"));
  };

  const remindersByDate = useMemo(() => {
    const map = new Map<string, ReminderItem[]>();
    reminders.forEach((r) => {
      try {
        const dateKey = formatInTimeZone(new Date(r.remindAt), "Asia/Bangkok", "yyyy-MM-dd");
        const list = map.get(dateKey) || [];
        list.push(r);
        map.set(dateKey, list);
      } catch (e) {}
    });
    return map;
  }, [reminders]);

  const calendarDays = useMemo(() => {
    const firstDayOfMonth = new Date(year, month, 1);
    const startDayOfWeek = firstDayOfMonth.getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const daysInPrevMonth = new Date(year, month, 0).getDate();
    const todayBangkokKey = formatInTimeZone(new Date(), "Asia/Bangkok", "yyyy-MM-dd");

    const cells: Array<{
      day: number;
      dateKey: string;
      isCurrentMonth: boolean;
      isToday: boolean;
      isSelected: boolean;
      reminders: ReminderItem[];
      pendingCount: number;
      completedCount: number;
    }> = [];

    for (let i = startDayOfWeek - 1; i >= 0; i--) {
      const prevDay = daysInPrevMonth - i;
      const prevDate = new Date(year, month - 1, prevDay);
      const dateKey = formatInTimeZone(prevDate, "Asia/Bangkok", "yyyy-MM-dd");
      const dayReminders = remindersByDate.get(dateKey) || [];
      cells.push({
        day: prevDay,
        dateKey,
        isCurrentMonth: false,
        isToday: dateKey === todayBangkokKey,
        isSelected: dateKey === selectedCalendarDate,
        reminders: dayReminders,
        pendingCount: dayReminders.filter((r) => r.status === "PENDING").length,
        completedCount: dayReminders.filter((r) => r.status === "COMPLETED").length,
      });
    }

    for (let day = 1; day <= daysInMonth; day++) {
      const thisDate = new Date(year, month, day);
      const dateKey = formatInTimeZone(thisDate, "Asia/Bangkok", "yyyy-MM-dd");
      const dayReminders = remindersByDate.get(dateKey) || [];
      cells.push({
        day,
        dateKey,
        isCurrentMonth: true,
        isToday: dateKey === todayBangkokKey,
        isSelected: dateKey === selectedCalendarDate,
        reminders: dayReminders,
        pendingCount: dayReminders.filter((r) => r.status === "PENDING").length,
        completedCount: dayReminders.filter((r) => r.status === "COMPLETED").length,
      });
    }

    const remaining = (7 - (cells.length % 7)) % 7;
    for (let nextDay = 1; nextDay <= remaining; nextDay++) {
      const nextDate = new Date(year, month + 1, nextDay);
      const dateKey = formatInTimeZone(nextDate, "Asia/Bangkok", "yyyy-MM-dd");
      const dayReminders = remindersByDate.get(dateKey) || [];
      cells.push({
        day: nextDay,
        dateKey,
        isCurrentMonth: false,
        isToday: dateKey === todayBangkokKey,
        isSelected: dateKey === selectedCalendarDate,
        reminders: dayReminders,
        pendingCount: dayReminders.filter((r) => r.status === "PENDING").length,
        completedCount: dayReminders.filter((r) => r.status === "COMPLETED").length,
      });
    }

    return cells;
  }, [year, month, remindersByDate, selectedCalendarDate]);

  const selectedDayReminders = useMemo(() => {
    return remindersByDate.get(selectedCalendarDate) || [];
  }, [remindersByDate, selectedCalendarDate]);

  const formatThaiSelectedDate = (dateKey: string) => {
    try {
      const parts = dateKey.split("-");
      if (parts.length !== 3) return dateKey;
      const y = parseInt(parts[0], 10);
      const m = parseInt(parts[1], 10) - 1;
      const d = parseInt(parts[2], 10);
      const date = new Date(y, m, d);
      const dayOfWeek = ["วันอาทิตย์", "วันจันทร์", "วันอังคาร", "วันพุธ", "วันพฤหัสบดี", "วันศุกร์", "วันเสาร์"][date.getDay()];
      return `${dayOfWeek}ที่ ${d} ${monthNamesThai[m]} ${y + 543}`;
    } catch (e) {
      return dateKey;
    }
  };

  return (
    <div className="min-h-screen bg-sand-light text-mocha font-sans pb-28">
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
                  setNewReminderDateTime(formatInTimeZone(now, "Asia/Bangkok", "yyyy-MM-dd'T'HH:mm"));
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

                {/* Unified Date & Time Picker */}
                <div>
                  <label className="block text-xs font-semibold text-mocha-muted mb-1 flex items-center gap-1">
                    <Calendar className="w-3.5 h-3.5 text-matcha-dark" />
                    วันและเวลาที่ต้องการเตือน *
                  </label>
                  <input
                    type="datetime-local"
                    value={newReminderDateTime}
                    onChange={(e) => setNewReminderDateTime(e.target.value)}
                    required
                    className="w-full bg-sand-light border border-sand rounded-xl px-3 py-2.5 text-sm text-mocha focus:outline-none focus:ring-2 focus:ring-matcha"
                  />
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
                      className="w-full bg-sand-light border border-sand rounded-xl px-2.5 py-2 text-xs text-mocha focus:outline-none focus:ring-2 focus:ring-matcha truncate"
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
                      className="w-full bg-sand-light border border-sand rounded-xl px-2.5 py-2 text-xs text-mocha focus:outline-none focus:ring-2 focus:ring-matcha truncate"
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
                    disabled={isSavingReminder || !newReminderTitle.trim() || !newReminderDateTime}
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
                  { key: "all", label: "ทั้งหมด", count: stats.totalPending },
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
                            onClick={() => handleToggleReminder(item.id, item.status)}
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
                            onClick={() => handleEditClick(item)}
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
        {/* SECTION 2: CALENDAR & SCHEDULE TAB */}
        {/* ========================================================================= */}
        {activeMainTab === "calendar" && (
          <div className="space-y-4 animate-in fade-in duration-200">
            {/* Multi-Date Shift Mode Top Banner / Control Panel */}
            {isShiftModeActive && (
              <div className="bg-gradient-to-br from-amber-500/10 via-orange-500/10 to-amber-500/5 rounded-3xl p-4 sm:p-5 border-2 border-amber-400/80 shadow-md animate-in slide-in-from-top-3 duration-200">
                <div className="flex items-center justify-between pb-3 border-b border-amber-200/80 mb-3">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">🩺</span>
                    <div>
                      <h3 className="text-sm sm:text-base font-black text-mocha">
                        โหมดลงตารางเวร (เลือกหลายวัน)
                      </h3>
                      <p className="text-[11px] text-mocha-muted">
                        เลือกประเภทเวร แล้วแตะวันที่ในปฏิทินที่ต้องการลงเวรนี้
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      setIsShiftModeActive(false);
                      setMultiSelectedDates([]);
                    }}
                    className="p-1.5 text-mocha-muted hover:text-mocha hover:bg-white/80 rounded-xl transition-colors"
                    title="ปิดโหมดลงเวร"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                {/* Shift Type Selector Chips */}
                <div className="space-y-2">
                  <span className="text-[11px] font-bold text-mocha-muted uppercase tracking-wider">
                    เลือกประเภทเวรที่จะลง:
                  </span>
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-1.5">
                    {SHIFT_PRESETS.map((preset) => {
                      const isSelected = selectedShiftType === preset.type;
                      return (
                        <button
                          key={preset.type}
                          type="button"
                          onClick={() => setSelectedShiftType(preset.type)}
                          className={`p-2 rounded-2xl border transition-all text-left flex flex-col justify-between ${
                            isSelected
                              ? "bg-white shadow-sm ring-2 scale-[1.02]"
                              : "bg-white/60 hover:bg-white border-sand/80 opacity-80 hover:opacity-100"
                          }`}
                          style={{
                            borderColor: isSelected ? preset.color : undefined,
                            boxShadow: isSelected ? `0 2px 8px ${preset.color}25` : undefined,
                          }}
                        >
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-base">{preset.icon}</span>
                            {isSelected && (
                              <span
                                className="w-2 h-2 rounded-full"
                                style={{ backgroundColor: preset.color }}
                              />
                            )}
                          </div>
                          <div>
                            <div className="font-extrabold text-xs text-mocha leading-tight">
                              {preset.title}
                            </div>
                            <div className="text-[10px] text-mocha-muted leading-tight">
                              {preset.subtitle}
                            </div>
                          </div>
                        </button>
                      );
                    })}

                    {/* Custom Shift Button */}
                    <button
                      type="button"
                      onClick={() => setSelectedShiftType("CUSTOM")}
                      className={`p-2 rounded-2xl border transition-all text-left flex flex-col justify-between ${
                        selectedShiftType === "CUSTOM"
                          ? "bg-white shadow-sm ring-2 ring-mocha border-mocha scale-[1.02]"
                          : "bg-white/60 hover:bg-white border-sand/80 opacity-80 hover:opacity-100"
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-base">🏷️</span>
                        {selectedShiftType === "CUSTOM" && (
                          <span className="w-2 h-2 rounded-full bg-mocha" />
                        )}
                      </div>
                      <div>
                        <div className="font-extrabold text-xs text-mocha leading-tight">
                          กำหนดเอง
                        </div>
                        <div className="text-[10px] text-mocha-muted leading-tight">
                          เช่น ER, OR, Ward
                        </div>
                      </div>
                    </button>
                  </div>

                  {/* Custom Title Input if CUSTOM selected */}
                  {selectedShiftType === "CUSTOM" && (
                    <div className="pt-2 flex items-center gap-2">
                      <input
                        type="text"
                        value={customShiftTitle}
                        onChange={(e) => setCustomShiftTitle(e.target.value)}
                        placeholder="พิมพ์ชื่อเวร เช่น ER, OR, สลับเวร"
                        className="flex-1 px-3 py-2 bg-white rounded-xl border border-sand text-xs font-bold text-mocha focus:outline-none focus:ring-2 focus:ring-matcha"
                      />
                      <input
                        type="color"
                        value={customShiftColor}
                        onChange={(e) => setCustomShiftColor(e.target.value)}
                        className="w-9 h-9 rounded-xl border border-sand cursor-pointer p-0.5 bg-white"
                        title="เลือกสี Badge"
                      />
                    </div>
                  )}
                </div>

                {/* Bottom Action Bar */}
                <div className="mt-4 pt-3 border-t border-amber-200/80 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-mocha">
                    <span className="w-5 h-5 rounded-full bg-amber-500 text-white flex items-center justify-center text-[11px]">
                      {multiSelectedDates.length}
                    </span>
                    <span>วันที่เลือกไว้</span>
                  </div>

                  <div className="flex items-center gap-2">
                    {multiSelectedDates.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setMultiSelectedDates([])}
                        className="px-2.5 py-1.5 text-xs font-bold text-mocha-muted hover:text-rose-600 transition-colors"
                      >
                        ล้างที่เลือก
                      </button>
                    )}
                    <button
                      type="button"
                      disabled={multiSelectedDates.length === 0 || isSavingShifts}
                      onClick={handleSaveMultiShifts}
                      className="px-4 py-2 bg-matcha-dark hover:bg-matcha text-white text-xs font-bold rounded-xl flex items-center gap-1.5 shadow-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isSavingShifts ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Check className="w-4 h-4" />
                      )}
                      <span>บันทึกเวร ({multiSelectedDates.length} วัน)</span>
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Month Navigator Header */}
            <div className="bg-white rounded-3xl p-4 sm:p-5 border border-sand shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <span className="text-[11px] font-bold text-matcha-dark uppercase tracking-wider">
                    ปฏิทิน & ตารางเวร
                  </span>
                  <h2 className="text-lg sm:text-xl font-black text-mocha flex items-center gap-2 mt-0.5">
                    <Calendar className="w-5 h-5 text-matcha-dark" />
                    <span>
                      {monthNamesThai[month]} {year + 543}
                    </span>
                  </h2>
                </div>

                <div className="flex items-center gap-1.5">
                  {/* Toggle Shift Mode Button */}
                  {!isShiftModeActive && (
                    <button
                      onClick={() => {
                        setIsShiftModeActive(true);
                        if (selectedCalendarDate) {
                          setMultiSelectedDates([selectedCalendarDate]);
                        }
                      }}
                      className="px-3 py-1.5 bg-amber-500/10 hover:bg-amber-500/20 text-amber-800 border border-amber-400/40 text-xs font-extrabold rounded-xl flex items-center gap-1.5 transition-all shadow-xs"
                    >
                      <span>🩺</span>
                      <span>ลงตารางเวร</span>
                    </button>
                  )}

                  <div className="flex items-center gap-1 bg-sand-light p-1 rounded-2xl border border-sand">
                    <button
                      onClick={handlePrevMonth}
                      className="w-8 h-8 rounded-xl bg-white hover:bg-sand text-mocha flex items-center justify-center shadow-xs transition-colors"
                      title="เดือนก่อนหน้า"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    <button
                      onClick={handleTodayMonth}
                      className="px-2.5 py-1 text-xs font-bold text-matcha-dark hover:bg-white rounded-xl transition-colors"
                      title="ไปที่วันนี้"
                    >
                      วันนี้
                    </button>
                    <button
                      onClick={handleNextMonth}
                      className="w-8 h-8 rounded-xl bg-white hover:bg-sand text-mocha flex items-center justify-center shadow-xs transition-colors"
                      title="เดือนถัดไป"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>

              {/* Days of Week Header */}
              <div className="grid grid-cols-7 gap-1 text-center mb-2">
                {thaiDayHeaders.map((dayName, idx) => (
                  <div
                    key={dayName}
                    className={`text-[11px] font-bold py-1 ${
                      idx === 0 ? "text-rose-500" : idx === 6 ? "text-amber-600" : "text-mocha-muted"
                    }`}
                  >
                    {dayName}
                  </div>
                ))}
              </div>

              {/* Calendar Grid Cells */}
              <div className="grid grid-cols-7 gap-1 sm:gap-1.5">
                {calendarDays.map((cell, idx) => {
                  const isSun = idx % 7 === 0;
                  const isSat = idx % 7 === 6;
                  const dayShift = shifts.find((s) => s.date === cell.dateKey);
                  const isMultiSelected =
                    isShiftModeActive && multiSelectedDates.includes(cell.dateKey);

                  return (
                    <button
                      key={`${cell.dateKey}-${idx}`}
                      type="button"
                      onClick={() => {
                        if (isShiftModeActive) {
                          handleToggleDateInShiftMode(cell.dateKey);
                        } else {
                          setSelectedCalendarDate(cell.dateKey);
                        }
                      }}
                      className={`min-h-[58px] sm:min-h-[64px] p-1 rounded-2xl flex flex-col items-center justify-between transition-all relative ${
                        isMultiSelected
                          ? "bg-amber-100/90 text-amber-950 font-bold border-2 border-amber-500 shadow-md scale-[1.03] z-10"
                          : cell.isSelected && !isShiftModeActive
                          ? "bg-matcha-dark text-white font-bold shadow-md ring-2 ring-matcha-light scale-[1.02] z-10"
                          : cell.isToday
                          ? "bg-matcha-subtle/80 text-matcha-dark font-extrabold border border-matcha-light"
                          : cell.isCurrentMonth
                          ? "bg-sand-light/50 hover:bg-sand text-mocha font-medium"
                          : "bg-transparent text-mocha-muted/30 hover:bg-sand-light/30"
                      }`}
                    >
                      {/* Day Number */}
                      <span
                        className={`text-xs ${
                          isMultiSelected
                            ? "text-amber-950 font-black"
                            : cell.isSelected && !isShiftModeActive
                            ? "text-white font-bold"
                            : cell.isToday
                            ? "text-matcha-dark font-black"
                            : !cell.isCurrentMonth
                            ? "text-mocha-muted/35"
                            : isSun
                            ? "text-rose-500 font-semibold"
                            : isSat
                            ? "text-amber-700 font-semibold"
                            : "text-mocha"
                        }`}
                      >
                        {cell.day}
                      </span>

                      {/* Shift Badge (ตารางเวร) */}
                      {dayShift ? (
                        <div
                          className={`w-full text-center truncate px-0.5 py-0.5 rounded-md text-[9px] sm:text-[10px] font-black leading-tight tracking-tight shadow-2xs mt-0.5 ${
                            cell.isSelected && !isShiftModeActive
                              ? "bg-white/20 text-white border border-white/40"
                              : ""
                          }`}
                          style={
                            cell.isSelected && !isShiftModeActive
                              ? undefined
                              : {
                                  backgroundColor: `${dayShift.color}20`,
                                  color: dayShift.color,
                                  border: `1px solid ${dayShift.color}45`,
                                }
                          }
                          title={dayShift.title}
                        >
                          {dayShift.title}
                        </div>
                      ) : isMultiSelected ? (
                        <div className="w-full text-center truncate px-0.5 py-0.5 rounded-md text-[9px] sm:text-[10px] font-black leading-tight shadow-2xs mt-0.5 bg-amber-200 text-amber-900 border border-amber-400">
                          {selectedShiftType === "CUSTOM"
                            ? customShiftTitle.trim() || "เวร"
                            : SHIFT_PRESETS.find((p) => p.type === selectedShiftType)?.title}
                        </div>
                      ) : (
                        <div className="min-h-[14px]" />
                      )}

                      {/* Reminder Event Dots (จุดการแจ้งเตือน) */}
                      <div className="flex items-center justify-center gap-1 min-h-[5px] mb-0.5">
                        {cell.pendingCount > 0 && (
                          <span
                            className={`w-1.5 h-1.5 rounded-full ${
                              cell.isSelected && !isShiftModeActive
                                ? "bg-white"
                                : "bg-matcha-dark"
                            }`}
                            title="มีงานที่ต้องทำ"
                          />
                        )}
                        {cell.completedCount > 0 && (
                          <span
                            className={`w-1.5 h-1.5 rounded-full ${
                              cell.isSelected && !isShiftModeActive
                                ? "bg-white/60"
                                : "bg-mocha-muted/40"
                            }`}
                            title="งานที่เสร็จแล้ว"
                          />
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Legend */}
              <div className="mt-4 pt-3 border-t border-sand flex flex-wrap items-center justify-between gap-2 text-[11px] text-mocha-muted px-1">
                <div className="flex flex-wrap items-center gap-3">
                  <div className="flex items-center gap-1.5">
                    <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-orange-100 text-orange-700 border border-orange-200">
                      🌅 เช้า
                    </span>
                    <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-purple-100 text-purple-700 border border-purple-200">
                      🌇 บ่าย
                    </span>
                    <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-blue-100 text-blue-700 border border-blue-200">
                      🌙 ดึก
                    </span>
                    <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-emerald-100 text-emerald-700 border border-emerald-200">
                      🏖️ OFF
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-matcha-dark" />
                    <span>มีแจ้งเตือน</span>
                  </div>
                </div>
                <span className="text-[10px] text-mocha-muted/70">
                  {isShiftModeActive ? "กำลังอยู่ในโหมดลงเวร" : "แตะวันที่เพื่อดูรายละเอียด"}
                </span>
              </div>
            </div>

            {/* Selected Day Inspector / Details */}
            <div className="bg-white rounded-3xl p-4 sm:p-5 border border-sand shadow-sm space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-sand">
                <div>
                  <span className="text-[11px] font-semibold text-matcha-dark">
                    ข้อมูลประจำวันที่
                  </span>
                  <h3 className="text-sm sm:text-base font-bold text-mocha">
                    {formatThaiSelectedDate(selectedCalendarDate)}
                  </h3>
                </div>
                <button
                  onClick={() => {
                    setIsCreatingReminder(true);
                    setNewReminderDateTime(`${selectedCalendarDate}T09:00`);
                    setActiveMainTab("reminders");
                  }}
                  className="px-3 py-1.5 bg-matcha-subtle hover:bg-matcha-light text-matcha-dark font-bold text-xs rounded-xl flex items-center gap-1.5 transition-colors shadow-xs"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>เพิ่มแจ้งเตือนวันนี้</span>
                </button>
              </div>

              {/* ------------------------------------------------------------- */}
              {/* SUBSECTION 1: ตารางเวรของวันที่เลือก (Daily Shift Box) */}
              {/* ------------------------------------------------------------- */}
              {(() => {
                const currentShift = shifts.find((s) => s.date === selectedCalendarDate);
                const currentPreset = SHIFT_PRESETS.find(
                  (p) => p.type === currentShift?.shiftType
                );

                if (currentShift) {
                  return (
                    <div
                      className="p-3.5 sm:p-4 rounded-2xl border transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                      style={{
                        backgroundColor: `${currentShift.color}10`,
                        borderColor: `${currentShift.color}40`,
                      }}
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-2xl sm:text-3xl">
                          {currentPreset?.icon || "🩺"}
                        </span>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] uppercase font-bold tracking-wider text-mocha-muted">
                              ตารางเวรประจำวัน
                            </span>
                            <span
                              className="px-2 py-0.5 rounded-full text-[10px] font-black text-white"
                              style={{ backgroundColor: currentShift.color }}
                            >
                              {currentShift.title}
                            </span>
                          </div>
                          <div className="text-sm sm:text-base font-black text-mocha mt-0.5">
                            {currentPreset?.subtitle || currentShift.title}
                          </div>
                        </div>
                      </div>

                      {/* Quick Change / Delete Buttons */}
                      <div className="flex items-center gap-1.5 self-end sm:self-center">
                        <div className="flex items-center gap-1 bg-white/80 p-1 rounded-xl border border-sand">
                          {SHIFT_PRESETS.map((p) => (
                            <button
                              key={p.type}
                              type="button"
                              onClick={() =>
                                handleSetSingleDayShift(
                                  selectedCalendarDate,
                                  p.type,
                                  p.title,
                                  p.color
                                )
                              }
                              className={`px-2 py-1 rounded-lg text-xs font-bold transition-all ${
                                currentShift.shiftType === p.type
                                  ? "bg-matcha-dark text-white shadow-xs"
                                  : "text-mocha-muted hover:text-mocha hover:bg-sand-light"
                              }`}
                              title={`เปลี่ยนเป็นเวร ${p.title}`}
                            >
                              {p.title}
                            </button>
                          ))}
                        </div>

                        <button
                          type="button"
                          onClick={() => handleDeleteSingleShift(selectedCalendarDate)}
                          className="p-2 text-mocha-muted hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-colors"
                          title="ลบเวรของวันนี้"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  );
                }

                return (
                  <div className="p-3 sm:p-3.5 rounded-2xl border-2 border-dashed border-sand bg-sand-light/30 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">🩺</span>
                      <div>
                        <div className="text-xs font-bold text-mocha">
                          ยังไม่ได้ลงเวรในวันนี้
                        </div>
                        <div className="text-[10px] text-mocha-muted">
                          แตะเลือกเวรด้านขวาเพื่อลงเวรทันที
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 flex-wrap">
                      {SHIFT_PRESETS.map((p) => (
                        <button
                          key={p.type}
                          type="button"
                          onClick={() =>
                            handleSetSingleDayShift(
                              selectedCalendarDate,
                              p.type,
                              p.title,
                              p.color
                            )
                          }
                          className="px-2.5 py-1 bg-white hover:bg-sand border border-sand rounded-xl text-xs font-bold text-mocha flex items-center gap-1 shadow-2xs transition-all hover:scale-105"
                        >
                          <span>{p.icon}</span>
                          <span>{p.title}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })()}

              {/* ------------------------------------------------------------- */}
              {/* SUBSECTION 2: การแจ้งเตือนและนัดหมาย (Reminders List) */}
              {/* ------------------------------------------------------------- */}
              <div className="pt-2">
                <div className="flex items-center gap-1.5 mb-2">
                  <span className="text-xs font-bold text-matcha-dark">⏰ นัดหมายและการแจ้งเตือน</span>
                  <span className="text-[11px] text-mocha-muted">({selectedDayReminders.length} รายการ)</span>
                </div>

                {selectedDayReminders.length === 0 ? (
                  <div className="py-6 text-center space-y-1 bg-sand-light/20 rounded-2xl border border-sand/60">
                    <p className="text-xs font-semibold text-mocha">ไม่มีการแจ้งเตือนในวันนี้ 🎉</p>
                    <p className="text-[11px] text-mocha-muted">
                      กดปุ่ม &quot;เพิ่มแจ้งเตือนวันนี้&quot; ด้านบนหากต้องการตั้งเตือน
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {selectedDayReminders.map((reminder) => {
                      const isCompleted = reminder.status === "COMPLETED";
                      return (
                        <div
                          key={reminder.id}
                          className={`p-3 rounded-2xl border transition-all flex items-start justify-between gap-3 ${
                            isCompleted
                              ? "bg-sand-light/50 border-sand opacity-70"
                              : "bg-white border-sand hover:border-matcha-light shadow-xs"
                          }`}
                        >
                          <div className="flex items-start gap-2.5 flex-1 min-w-0">
                            <button
                              type="button"
                              onClick={() => handleToggleReminder(reminder.id, reminder.status)}
                              className="mt-0.5 text-mocha-muted hover:text-matcha-dark transition-colors"
                            >
                              {isCompleted ? (
                                <CheckCircle2 className="w-5 h-5 text-matcha-dark" />
                              ) : (
                                <Circle className="w-5 h-5" />
                              )}
                            </button>
                            <div className="flex-1 min-w-0">
                              <p
                                className={`text-sm font-medium leading-snug break-words ${
                                  isCompleted
                                    ? "line-through text-mocha-muted"
                                    : "text-mocha font-semibold"
                                }`}
                              >
                                {reminder.taskTitle}
                              </p>
                              <div className="flex flex-wrap items-center gap-2 mt-1 text-xs text-mocha-muted">
                                <span className="flex items-center gap-1 font-semibold text-matcha-dark">
                                  <Clock className="w-3.5 h-3.5" />
                                  {reminder.displayTime ||
                                    formatInTimeZone(
                                      new Date(reminder.remindAt),
                                      "Asia/Bangkok",
                                      "HH:mm"
                                    )}{" "}
                                  น.
                                </span>
                                {reminder.recurrence !== "NONE" && (
                                  <span className="px-2 py-0.5 bg-sand rounded-full text-[10px] font-bold text-mocha">
                                    {reminder.recurrence === "DAILY"
                                      ? "ทุกวัน"
                                      : reminder.recurrence === "WEEKLY"
                                      ? "ทุกสัปดาห์"
                                      : "ทุกเดือน"}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => handleEditClick(reminder)}
                              className="p-1.5 text-mocha-muted hover:text-matcha-dark hover:bg-sand-light rounded-lg transition-colors"
                              title="แก้ไข"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => handleDeleteReminder(reminder.id)}
                              className="p-1.5 text-mocha-muted hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                              title="ลบ"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* SECTION 3: NOTES & SHOPPING LIST TAB */}
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
                    {newNoteCategory === "LINK"
                      ? "ชื่อเว็บไซต์ / หัวข้อ *"
                      : newNoteCategory === "READING"
                      ? "หัวข้อการอ่าน *"
                      : "หัวข้อโน้ต *"}
                  </label>
                  <input
                    type="text"
                    value={newNoteTitle}
                    onChange={(e) => setNewNoteTitle(e.target.value)}
                    placeholder={
                      newNoteCategory === "LINK"
                        ? "เช่น บทความ AI, เพลง YouTube, เอกสารงาน"
                        : newNoteCategory === "READING"
                        ? "เช่น svc syndrome, pulmonary hypertension"
                        : "เช่น รายการซื้อของเข้าบ้าน, เมนูอาหารเย็น"
                    }
                    required
                    className="w-full bg-sand-light border border-sand rounded-xl px-3 py-2 text-sm text-mocha focus:outline-none focus:ring-2 focus:ring-matcha"
                  />
                </div>

                {/* Category Selection */}
                <div>
                  <label className="block text-xs font-semibold text-mocha-muted mb-1">
                    หมวดหมู่
                  </label>
                  <div className="grid grid-cols-5 gap-1">
                    {[
                      { key: "READING", label: "📚 อ่าน" },
                      { key: "TODO", label: "📌 To-Do" },
                      { key: "GENERAL", label: "📝 ทั่วไป" },
                      { key: "SHOPPING", label: "🛒 ซื้อของ" },
                      { key: "LINK", label: "🔗 ลิงก์" },
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
                    {newNoteCategory === "LINK"
                      ? "ลิงก์ URL เว็บไซต์ (https://...) *"
                      : newNoteCategory === "READING"
                      ? "หัวข้อย่อยที่ต้องอ่าน (พิมพ์แยกบรรทัด หรือคั่นด้วยจุลภาค)"
                      : "รายการย่อย (พิมพ์แยกบรรทัด หรือคั่นด้วยจุลภาค)"}
                  </label>
                  <textarea
                    rows={newNoteCategory === "LINK" ? 2 : 3}
                    value={newNoteItemsText}
                    onChange={(e) => setNewNoteItemsText(e.target.value)}
                    placeholder={
                      newNoteCategory === "LINK"
                        ? "https://www.youtube.com/watch?v=..."
                        : newNoteCategory === "READING"
                        ? "svc syndrome\npulmonary hypertension\nivs obstruction"
                        : "น้ำดื่ม\nขนมปัง\nสาหร่าย\nไข่ไก่"
                    }
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
                { key: "READING", label: "📚 ต้องอ่าน" },
                { key: "TODO", label: "📌 สิ่งที่ต้องทำ" },
                { key: "GENERAL", label: "📝 ทั่วไป" },
                { key: "SHOPPING", label: "🛒 ซื้อของ" },
                { key: "LINK", label: "🔗 ลิงก์เว็บ" },
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
            <section className="space-y-3">
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
                    กดปุ่มสร้างโน้ตด้านบน หรือก๊อปปี้ลิงก์/ข้อความส่งในแชท LINE ได้เลยครับ
                  </p>
                </div>
              ) : (
                notes.map((note) => {
                  const cat = noteCategoryInfo[note.category] || noteCategoryInfo.GENERAL;
                  const items = Array.isArray(note.items) ? note.items : [];

                  // ==========================================
                  // CASE A: LINK CATEGORY (Horizontal Link Card)
                  // ==========================================
                  if (note.category === "LINK") {
                    const url = items[0]?.text || "";
                    const domain = extractDomainFromUrl(url);
                    const isCopied = copiedLinkId === note.id;

                    return (
                      <div
                        key={note.id}
                        className="bg-white rounded-2xl border border-sand shadow-sm hover:shadow-md transition-all p-3.5 flex items-center justify-between gap-3 group"
                      >
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          {/* Favicon Icon */}
                          <div className="w-11 h-11 rounded-2xl bg-indigo-50/90 border border-indigo-100 flex items-center justify-center shrink-0 overflow-hidden shadow-xs">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={`https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=128`}
                              alt={domain}
                              className="w-6 h-6 object-contain"
                              onError={(e) => {
                                (e.target as HTMLElement).style.display = "none";
                              }}
                            />
                          </div>

                          {/* Info */}
                          <div className="min-w-0 flex-1">
                            <h3 className="text-sm font-bold text-mocha truncate" title={note.title}>
                              {note.title}
                            </h3>
                            <p className="text-xs text-mocha-muted/70 truncate font-mono mt-0.5" title={url}>
                              {url}
                            </p>
                          </div>
                        </div>

                        {/* Action Buttons */}
                        <div className="flex items-center gap-1 shrink-0">
                          {/* Copy Link Button */}
                          <button
                            type="button"
                            onClick={() => handleCopyLink(note.id, url)}
                            className={`p-2 rounded-xl transition-all ${
                              isCopied
                                ? "bg-emerald-50 text-emerald-600 font-bold"
                                : "text-mocha-muted hover:text-indigo-600 hover:bg-indigo-50"
                            }`}
                            title="คัดลอกลิงก์"
                          >
                            {isCopied ? (
                              <Check className="w-4 h-4 text-emerald-600 animate-in zoom-in" />
                            ) : (
                              <Copy className="w-4 h-4" />
                            )}
                          </button>

                          {/* Open Link Button */}
                          {url && (
                            <a
                              href={url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="p-2 text-mocha-muted hover:text-matcha-dark hover:bg-matcha-subtle rounded-xl transition-colors"
                              title="เปิดเว็บไซต์"
                            >
                              <ExternalLink className="w-4 h-4" />
                            </a>
                          )}

                          {/* Delete Note Button */}
                          <button
                            type="button"
                            onClick={() => handleDeleteNote(note.id)}
                            className="p-2 text-mocha-muted hover:text-red-600 hover:bg-red-50 rounded-xl transition-colors"
                            title="ลบลิงก์นี้"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    );
                  }

                  // ==========================================
                  // CASE B: REGULAR CHECKLIST NOTES
                  // ==========================================
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

              {/* Unified Date & Time Picker */}
              <div>
                <label className="block text-xs font-semibold text-mocha-muted mb-1 flex items-center gap-1">
                  <Calendar className="w-3.5 h-3.5 text-matcha-dark" />
                  วันและเวลาที่ต้องการเตือน
                </label>
                <input
                  type="datetime-local"
                  value={editDateTime}
                  onChange={(e) => setEditDateTime(e.target.value)}
                  required
                  className="w-full bg-sand-light border border-sand rounded-xl px-3 py-2.5 text-sm text-mocha focus:outline-none focus:ring-2 focus:ring-matcha"
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

      {/* ========================================================================= */}
      {/* STICKY BOTTOM NAVIGATION BAR (4 TABS) */}
      {/* ========================================================================= */}
      <nav className="fixed bottom-0 left-0 right-0 z-40 bg-sand-light/95 backdrop-blur-md border-t border-sand shadow-[0_-4px_20px_rgba(0,0,0,0.06)] pb-[max(env(safe-area-inset-bottom),0.5rem)] pt-1.5 px-3">
        <div className="max-w-md mx-auto grid grid-cols-4 gap-1">
          {/* 1. Reminders */}
          <button
            onClick={() => setActiveMainTab("reminders")}
            className={`relative flex flex-col items-center justify-center py-1 px-1 rounded-2xl transition-all ${
              activeMainTab === "reminders"
                ? "text-matcha-dark font-bold scale-[1.02]"
                : "text-mocha-muted/70 hover:text-mocha font-medium"
            }`}
          >
            <div className={`p-1 rounded-xl transition-colors ${activeMainTab === "reminders" ? "bg-matcha-subtle" : ""}`}>
              <Bell className="w-5 h-5" />
            </div>
            <span className="text-[11px] mt-0.5">แจ้งเตือน</span>
            {stats.todayCount > 0 && (
              <span className="absolute top-0.5 right-2 sm:right-4 min-w-[16px] h-4 px-1 rounded-full bg-matcha-dark text-white text-[9px] font-bold flex items-center justify-center shadow-xs">
                {stats.todayCount}
              </span>
            )}
          </button>

          {/* 2. Calendar */}
          <button
            onClick={() => {
              setActiveMainTab("calendar");
              fetchReminders("all");
            }}
            className={`relative flex flex-col items-center justify-center py-1 px-1 rounded-2xl transition-all ${
              activeMainTab === "calendar"
                ? "text-matcha-dark font-bold scale-[1.02]"
                : "text-mocha-muted/70 hover:text-mocha font-medium"
            }`}
          >
            <div className={`p-1 rounded-xl transition-colors ${activeMainTab === "calendar" ? "bg-matcha-subtle" : ""}`}>
              <Calendar className="w-5 h-5" />
            </div>
            <span className="text-[11px] mt-0.5">ปฏิทิน</span>
            {stats.totalPending > 0 && (
              <span className="absolute top-1 right-4 sm:right-6 w-2 h-2 rounded-full bg-matcha-dark ring-2 ring-white"></span>
            )}
          </button>

          {/* 3. Notes */}
          <button
            onClick={() => setActiveMainTab("notes")}
            className={`relative flex flex-col items-center justify-center py-1 px-1 rounded-2xl transition-all ${
              activeMainTab === "notes"
                ? "text-matcha-dark font-bold scale-[1.02]"
                : "text-mocha-muted/70 hover:text-mocha font-medium"
            }`}
          >
            <div className={`p-1 rounded-xl transition-colors ${activeMainTab === "notes" ? "bg-matcha-subtle" : ""}`}>
              <CheckSquare className="w-5 h-5" />
            </div>
            <span className="text-[11px] mt-0.5">โน้ต</span>
            {notes.length > 0 && (
              <span className="absolute top-0.5 right-2 sm:right-4 min-w-[16px] h-4 px-1 rounded-full bg-sand text-mocha text-[9px] font-bold flex items-center justify-center border border-sand-darker/20">
                {notes.length}
              </span>
            )}
          </button>

          {/* 4. Debt */}
          <button
            onClick={() => setActiveMainTab("debt")}
            className={`relative flex flex-col items-center justify-center py-1 px-1 rounded-2xl transition-all ${
              activeMainTab === "debt"
                ? "text-matcha-dark font-bold scale-[1.02]"
                : "text-mocha-muted/70 hover:text-mocha font-medium"
            }`}
          >
            <div className={`p-1 rounded-xl transition-colors ${activeMainTab === "debt" ? "bg-matcha-subtle" : ""}`}>
              <Coins className="w-5 h-5" />
            </div>
            <span className="text-[11px] mt-0.5">หนี้สิน</span>
            {debtSummary.people.length > 0 && (
              <span className="absolute top-0.5 right-2 sm:right-4 min-w-[16px] h-4 px-1 rounded-full bg-amber-500 text-white text-[9px] font-bold flex items-center justify-center shadow-xs">
                {debtSummary.people.length}
              </span>
            )}
          </button>
        </div>
      </nav>
    </div>
  );
}


