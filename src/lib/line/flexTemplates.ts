import { messagingApi } from "@line/bot-sdk";
import { DbReminder, DbNote, DbDebt, DbPersonProfile } from "../db";
import { getAvatarInfo } from "../avatar";

/**
 * สร้าง Flex Message สำหรับรายการหนี้ที่บันทึกใหม่ (Debt Transaction Card)
 */
export function createDebtSuccessCard(data: {
  debt: DbDebt;
  profile?: DbPersonProfile | null;
}): messagingApi.FlexMessage {
  const liffId = process.env.NEXT_PUBLIC_LIFF_ID;
  const liffUrl = liffId ? `https://liff.line.me/${liffId}?tab=debt` : `https://line.me`;

  const { debt, profile } = data;
  const avatar = getAvatarInfo(debt.personName, profile);
  const isLent = debt.type === "LENT";

  const typeColor = isLent ? "#2E7D32" : "#C62828";
  const typeBg = isLent ? "#E8F5E9" : "#FFEBEE";
  const typeText = isLent ? "🟢 เราให้ยืม (รอรับคืน)" : "🔴 เรายืมเขา (ต้องจ่ายคืน)";

  const bubble: messagingApi.FlexBubble = {
    type: "bubble",
    size: "mega",
    header: {
      type: "box",
      layout: "horizontal",
      backgroundColor: "#FAF7F2",
      paddingAll: "16px",
      alignItems: "center",
      contents: [
        {
          type: "box",
          layout: "vertical",
          width: "48px",
          height: "48px",
          cornerRadius: "24px",
          backgroundColor: avatar.bg,
          justifyContent: "center",
          alignItems: "center",
          contents: avatar.isCustomImage && avatar.imageUrl
            ? [
                {
                  type: "image",
                  url: avatar.imageUrl,
                  size: "full",
                  aspectMode: "cover",
                },
              ]
            : [
                {
                  type: "text",
                  text: avatar.emoji,
                  size: "xl",
                  align: "center",
                },
              ],
        },
        {
          type: "box",
          layout: "vertical",
          margin: "md",
          contents: [
            {
              type: "text",
              text: debt.personName,
              weight: "bold",
              size: "md",
              color: "#2C221E",
            },
            {
              type: "box",
              layout: "baseline",
              contents: [
                {
                  type: "text",
                  text: typeText,
                  size: "xxs",
                  color: typeColor,
                  weight: "bold",
                },
              ],
            },
          ],
        },
      ],
    },
    body: {
      type: "box",
      layout: "vertical",
      backgroundColor: "#FFFFFF",
      paddingAll: "16px",
      spacing: "sm",
      contents: [
        {
          type: "box",
          layout: "horizontal",
          justifyContent: "space-between",
          alignItems: "baseline",
          contents: [
            {
              type: "text",
              text: "ยอดเงิน",
              size: "sm",
              color: "#766E65",
            },
            {
              type: "text",
              text: `฿${debt.amount.toLocaleString("th-TH")}`,
              size: "xl",
              weight: "bold",
              color: typeColor,
              align: "end",
            },
          ],
        },
        {
          type: "separator",
          color: "#EFEBE4",
          margin: "md",
        },
        {
          type: "box",
          layout: "horizontal",
          margin: "md",
          contents: [
            {
              type: "text",
              text: "หมายเหตุ",
              size: "xs",
              color: "#766E65",
              flex: 3,
            },
            {
              type: "text",
              text: debt.description || "ยืมเงินทั่วไป",
              size: "xs",
              color: "#2C221E",
              align: "end",
              wrap: true,
              flex: 7,
            },
          ],
        },
      ],
    },
    footer: {
      type: "box",
      layout: "vertical",
      backgroundColor: "#FAF7F2",
      paddingAll: "12px",
      spacing: "sm",
      contents: [
        {
          type: "button",
          style: "primary",
          color: "#3B5B3E",
          height: "sm",
          action: {
            type: "postback",
            label: "✓ เคลียร์หนี้รายการนี้",
            data: `action=settle_debt&id=${debt.id}&name=${encodeURIComponent(debt.personName)}`,
            displayText: `เคลียร์หนี้ ${debt.personName} ฿${debt.amount} แล้ว`,
          },
        },
        {
          type: "button",
          style: "link",
          height: "sm",
          color: "#766E65",
          action: {
            type: "uri",
            label: "📱 ดูบัญชีหนี้สินทั้งหมด",
            uri: liffUrl,
          },
        },
      ],
    },
  };

  return {
    type: "flex",
    altText: `💰 บันทึกหนี้: ${debt.personName} ฿${debt.amount}`,
    contents: bubble,
  };
}

/**
 * สร้าง Flex Message สรุปยอดหนี้ทั้งหมดแยกตามบุคคล (Debt Overview Card)
 */
export function createDebtSummaryCard(data: {
  totalReceivable: number;
  totalPayable: number;
  netBalance: number;
  people: {
    personName: string;
    profile: DbPersonProfile | null;
    totalLent: number;
    totalBorrowed: number;
    netAmount: number;
    items: DbDebt[];
  }[];
}): messagingApi.FlexMessage {
  const liffId = process.env.NEXT_PUBLIC_LIFF_ID;
  const liffUrl = liffId ? `https://liff.line.me/${liffId}?tab=debt` : `https://line.me`;

  const { totalReceivable, totalPayable, people } = data;

  const peopleBoxes: messagingApi.FlexComponent[] = [];

  if (people.length === 0) {
    peopleBoxes.push({
      type: "text",
      text: "🎉 ไม่มีหนี้สินค้างชำระ เคลียร์หมดแล้ว!",
      size: "sm",
      color: "#3B5B3E",
      align: "center",
      margin: "md",
    });
  } else {
    people.slice(0, 6).forEach((p) => {
      const avatar = getAvatarInfo(p.personName, p.profile);
      const isPositive = p.netAmount > 0;
      const isZero = p.netAmount === 0;

      const badgeColor = isZero ? "#766E65" : isPositive ? "#2E7D32" : "#C62828";
      const statusText = isZero
        ? "หักลบยอดพอดี"
        : isPositive
        ? `ติดเรา ฿${p.netAmount.toLocaleString("th-TH")}`
        : `เราติดเขา ฿${Math.abs(p.netAmount).toLocaleString("th-TH")}`;

      peopleBoxes.push({
        type: "box",
        layout: "horizontal",
        alignItems: "center",
        margin: "md",
        contents: [
          {
            type: "box",
            layout: "vertical",
            width: "36px",
            height: "36px",
            cornerRadius: "18px",
            backgroundColor: avatar.bg,
            justifyContent: "center",
            alignItems: "center",
            contents: avatar.isCustomImage && avatar.imageUrl
              ? [
                  {
                    type: "image",
                    url: avatar.imageUrl,
                    size: "full",
                    aspectMode: "cover",
                  },
                ]
              : [
                  {
                    type: "text",
                    text: avatar.emoji,
                    size: "md",
                    align: "center",
                  },
                ],
          },
          {
            type: "box",
            layout: "vertical",
            margin: "sm",
            flex: 1,
            contents: [
              {
                type: "text",
                text: p.personName,
                weight: "bold",
                size: "sm",
                color: "#2C221E",
              },
              {
                type: "text",
                text: statusText,
                size: "xs",
                color: badgeColor,
                weight: "bold",
              },
            ],
          },
        ],
      });
    });

    if (people.length > 6) {
      peopleBoxes.push({
        type: "text",
        text: `...และอีก ${people.length - 6} คน`,
        size: "xs",
        color: "#766E65",
        margin: "md",
        align: "center",
      });
    }
  }

  const bubble: messagingApi.FlexBubble = {
    type: "bubble",
    size: "mega",
    header: {
      type: "box",
      layout: "vertical",
      backgroundColor: "#D8E8D4",
      paddingAll: "16px",
      contents: [
        {
          type: "text",
          text: "💰 สรุปบัญชีหนี้สิน",
          weight: "bold",
          size: "lg",
          color: "#2C221E",
        },
        {
          type: "text",
          text: `มีรายการค้างรวม ${people.length} คน`,
          size: "xs",
          color: "#766E65",
          margin: "xs",
        },
      ],
    },
    body: {
      type: "box",
      layout: "vertical",
      backgroundColor: "#FFFFFF",
      paddingAll: "16px",
      contents: [
        // Summary Header Pills
        {
          type: "box",
          layout: "horizontal",
          spacing: "md",
          contents: [
            {
              type: "box",
              layout: "vertical",
              backgroundColor: "#E8F5E9",
              cornerRadius: "12px",
              paddingAll: "10px",
              flex: 1,
              contents: [
                {
                  type: "text",
                  text: "รอรับคืน 🟢",
                  size: "xxs",
                  color: "#2E7D32",
                  weight: "bold",
                },
                {
                  type: "text",
                  text: `฿${totalReceivable.toLocaleString("th-TH")}`,
                  size: "sm",
                  weight: "bold",
                  color: "#2E7D32",
                  margin: "xs",
                },
              ],
            },
            {
              type: "box",
              layout: "vertical",
              backgroundColor: "#FFEBEE",
              cornerRadius: "12px",
              paddingAll: "10px",
              flex: 1,
              contents: [
                {
                  type: "text",
                  text: "ต้องจ่ายคืน 🔴",
                  size: "xxs",
                  color: "#C62828",
                  weight: "bold",
                },
                {
                  type: "text",
                  text: `฿${totalPayable.toLocaleString("th-TH")}`,
                  size: "sm",
                  weight: "bold",
                  color: "#C62828",
                  margin: "xs",
                },
              ],
            },
          ],
        },
        {
          type: "separator",
          color: "#EFEBE4",
          margin: "lg",
        },
        // People List
        ...peopleBoxes,
      ],
    },
    footer: {
      type: "box",
      layout: "vertical",
      backgroundColor: "#FAF7F2",
      paddingAll: "12px",
      contents: [
        {
          type: "button",
          style: "primary",
          color: "#3B5B3E",
          height: "sm",
          action: {
            type: "uri",
            label: "📱 จัดการหนี้ & เปลี่ยน Avatar",
            uri: liffUrl,
          },
        },
      ],
    },
  };

  return {
    type: "flex",
    altText: `💰 สรุปบัญชีหนี้สิน: รอรับคืน ฿${totalReceivable} / ต้องจ่าย ฿${totalPayable}`,
    contents: bubble,
  };
}

/**
 * สร้าง Flex Message สรุปยามเช้า (Daily Morning Briefing - 06:00 น.)
 */
export function createMorningBriefCard(data: {
  displayName?: string;
  dateStr: string;
  todayReminders: DbReminder[];
  pendingNotes: { id: string; title: string; category: string; pendingItems: string[] }[];
}): messagingApi.FlexMessage {
  const liffId = process.env.NEXT_PUBLIC_LIFF_ID;
  const liffUrl = liffId ? `https://liff.line.me/${liffId}` : `https://line.me`;

  const { displayName = "คุณ", dateStr, todayReminders, pendingNotes } = data;

  // 1. Reminders Box
  const reminderContents: messagingApi.FlexComponent[] = [
    {
      type: "box",
      layout: "horizontal",
      alignItems: "center",
      spacing: "sm",
      margin: "md",
      contents: [
        {
          type: "text",
          text: "⏰ นัดหมายและเตือนความจำวันนี้",
          weight: "bold",
          size: "sm",
          color: "#3B5B3E",
          flex: 1,
        },
        {
          type: "text",
          text: `${todayReminders.length} รายการ`,
          size: "xs",
          color: "#766E65",
          align: "end",
        },
      ],
    },
  ];

  if (todayReminders.length === 0) {
    reminderContents.push({
      type: "text",
      text: "✨ วันนี้ไม่มีนัดหมายหรือการแจ้งเตือน",
      size: "xs",
      color: "#A39E98",
      margin: "sm",
    });
  } else {
    todayReminders.slice(0, 5).forEach((r) => {
      reminderContents.push({
        type: "box",
        layout: "horizontal",
        spacing: "md",
        margin: "sm",
        contents: [
          {
            type: "text",
            text: r.displayTime || "-",
            size: "xs",
            weight: "bold",
            color: "#3B5B3E",
            flex: 3,
          },
          {
            type: "text",
            text: r.taskTitle,
            size: "xs",
            color: "#2C221E",
            wrap: true,
            flex: 7,
          },
        ],
      });
    });
  }

  // 2. Pending Notes Box
  const allPendingItems: { noteTitle: string; itemText: string }[] = [];
  pendingNotes.forEach((n) => {
    n.pendingItems.forEach((it) => {
      allPendingItems.push({ noteTitle: n.title, itemText: it });
    });
  });

  const todoContents: messagingApi.FlexComponent[] = [
    {
      type: "box",
      layout: "horizontal",
      alignItems: "center",
      spacing: "sm",
      margin: "xl",
      contents: [
        {
          type: "text",
          text: "📝 สิ่งที่ต้องทำ (To-Do ค้างอยู่)",
          weight: "bold",
          size: "sm",
          color: "#3B5B3E",
          flex: 1,
        },
        {
          type: "text",
          text: `${allPendingItems.length} รายการ`,
          size: "xs",
          color: "#766E65",
          align: "end",
        },
      ],
    },
  ];

  if (allPendingItems.length === 0) {
    todoContents.push({
      type: "text",
      text: "🎉 ไม่มีรายการค้าง ทำครบหมดแล้ว!",
      size: "xs",
      color: "#A39E98",
      margin: "sm",
    });
  } else {
    allPendingItems.slice(0, 5).forEach((it) => {
      todoContents.push({
        type: "box",
        layout: "horizontal",
        spacing: "sm",
        margin: "sm",
        contents: [
          {
            type: "text",
            text: "☐",
            size: "xs",
            color: "#766E65",
            flex: 1,
          },
          {
            type: "text",
            text: it.itemText,
            size: "xs",
            color: "#2C221E",
            wrap: true,
            flex: 9,
          },
        ],
      });
    });

    if (allPendingItems.length > 5) {
      todoContents.push({
        type: "text",
        text: `...และอีก ${allPendingItems.length - 5} รายการ`,
        size: "xxs",
        color: "#766E65",
        margin: "sm",
      });
    }
  }

  const bubble: messagingApi.FlexBubble = {
    type: "bubble",
    size: "mega",
    header: {
      type: "box",
      layout: "vertical",
      backgroundColor: "#D8E8D4",
      paddingAll: "16px",
      contents: [
        {
          type: "box",
          layout: "horizontal",
          alignItems: "center",
          contents: [
            {
              type: "text",
              text: "🌅 สรุปยามเช้า",
              weight: "bold",
              color: "#2C221E",
              size: "lg",
              flex: 1,
            },
            {
              type: "text",
              text: "06:00 น.",
              size: "xs",
              color: "#3B5B3E",
              weight: "bold",
              align: "end",
            },
          ],
        },
        {
          type: "text",
          text: `อรุณสวัสดิ์ครับ ${displayName} 🌿 วันนี้ ${dateStr}`,
          size: "xs",
          color: "#766E65",
          margin: "xs",
        },
      ],
    },
    body: {
      type: "box",
      layout: "vertical",
      backgroundColor: "#F8F9F5",
      paddingAll: "16px",
      contents: [
        ...reminderContents,
        {
          type: "separator",
          margin: "lg",
          color: "#EFEBE4",
        },
        ...todoContents,
      ],
    },
    footer: {
      type: "box",
      layout: "horizontal",
      backgroundColor: "#F8F9F5",
      paddingAll: "16px",
      contents: [
        {
          type: "button",
          style: "primary",
          height: "sm",
          color: "#3B5B3E",
          action: {
            type: "uri",
            label: "📱 เปิดดู Dashboard ทั้งหมด",
            uri: liffUrl,
          },
          flex: 1,
        },
      ],
    },
    styles: {
      footer: {
        separator: true,
        separatorColor: "#EFEBE4",
      },
    },
  };

  return {
    type: "flex",
    altText: `🌅 สรุปยามเช้าประจำวันที่ ${dateStr} ของคุณ ${displayName}`,
    contents: bubble,
  };
}

/**
 * สร้าง Flex Message สำหรับโน้ตที่บันทึกสำเร็จ (Note Card)
 */
export function createNoteSuccessCard(
  note: DbNote | { id: string; title: string; items: { id: string; text: string; completed: boolean }[]; category: string }
): messagingApi.FlexMessage {

  const liffId = process.env.NEXT_PUBLIC_LIFF_ID;
  const liffUrl = liffId ? `https://liff.line.me/${liffId}?tab=notes` : `https://line.me`;

  const categoryLabel: Record<string, { name: string; emoji: string; bg: string }> = {
    SHOPPING: { name: "รายการซื้อของ", emoji: "🛒", bg: "#EBF5EB" },
    TODO: { name: "สิ่งที่ต้องทำ", emoji: "📌", bg: "#FEF3C7" },
    GENERAL: { name: "โน้ตทั่วไป", emoji: "📝", bg: "#E0E7FF" },
  };

  const cat = categoryLabel[note.category] || categoryLabel.GENERAL;
  const items = Array.isArray(note.items) ? note.items : [];

  const itemsListContents: messagingApi.FlexComponent[] = items.length > 0
    ? items.slice(0, 8).map((item) => ({
        type: "box",
        layout: "horizontal",
        spacing: "sm",
        margin: "sm",
        contents: [
          {
            type: "text",
            text: item.completed ? "☑" : "☐",
            color: item.completed ? "#3B5B3E" : "#766E65",
            size: "sm",
            flex: 1,
          },
          {
            type: "text",
            text: item.text,
            color: item.completed ? "#A39E98" : "#2C221E",
            decoration: item.completed ? "line-through" : "none",
            size: "sm",
            wrap: true,
            flex: 9,
          },
        ],
      }))
    : [
        {
          type: "text",
          text: "(ไม่มีรายการย่อย)",
          color: "#766E65",
          size: "sm",
          style: "italic",
        },
      ];

  if (items.length > 8) {
    itemsListContents.push({
      type: "text",
      text: `...และอีก ${items.length - 8} รายการ`,
      color: "#766E65",
      size: "xs",
      margin: "md",
    });
  }

  const bubble: messagingApi.FlexBubble = {
    type: "bubble",
    size: "mega",
    header: {
      type: "box",
      layout: "horizontal",
      backgroundColor: "#D8E8D4",
      paddingAll: "16px",
      alignItems: "center",
      contents: [
        {
          type: "box",
          layout: "horizontal",
          backgroundColor: "#3B5B3E",
          width: "20px",
          height: "20px",
          cornerRadius: "10px",
          alignItems: "center",
          justifyContent: "center",
          contents: [
            {
              type: "text",
              text: "📝",
              size: "xxs",
              align: "center",
            },
          ],
        },
        {
          type: "text",
          text: "จดโน้ตสำเร็จ",
          weight: "bold",
          color: "#2C221E",
          size: "md",
          margin: "md",
          flex: 1,
        },
        {
          type: "text",
          text: `${cat.emoji} ${cat.name}`,
          color: "#3B5B3E",
          size: "xs",
          weight: "bold",
          align: "end",
        },
      ],
    },
    body: {
      type: "box",
      layout: "vertical",
      backgroundColor: "#F8F9F5",
      paddingAll: "20px",
      contents: [
        {
          type: "text",
          text: note.title || "โน้ต",
          weight: "bold",
          size: "lg",
          color: "#2C221E",
          wrap: true,
        },
        {
          type: "separator",
          margin: "md",
          color: "#EFEBE4",
        },
        {
          type: "box",
          layout: "vertical",
          margin: "md",
          contents: itemsListContents,
        },
      ],
    },
    footer: {
      type: "box",
      layout: "horizontal",
      backgroundColor: "#F8F9F5",
      paddingAll: "16px",
      contents: [
        {
          type: "button",
          style: "primary",
          height: "sm",
          color: "#3B5B3E",
          action: {
            type: "uri",
            label: "📝 เปิดดู & ติ๊กรายการใน LIFF",
            uri: liffUrl,
          },
          flex: 1,
        },
      ],
    },
    styles: {
      footer: {
        separator: true,
        separatorColor: "#EFEBE4",
      },
    },
  };

  return {
    type: "flex",
    altText: `📝 บันทึก "${note.title}" เรียบร้อยแล้ว`,
    contents: bubble,
  };
}


/**
 * สร้าง Flex Message การ์ดยืนยันการตั้งเตือนสำเร็จ (Theme สีเขียว Muted Matcha)
 */
export function createReminderSuccessCard(
  reminder: DbReminder | { id: string; taskTitle: string; displayDate: string | null; displayTime: string | null; recurrence: string }
): messagingApi.FlexMessage {
  const liffId = process.env.NEXT_PUBLIC_LIFF_ID;
  const editUrl = liffId
    ? `https://liff.line.me/${liffId}?reminderId=${reminder.id}`
    : `https://line.me`;

  const recurrenceTextMap: Record<string, string> = {
    NONE: "ไม่เตือนซ้ำ",
    DAILY: "เตือนทุกวัน",
    WEEKLY: "เตือนทุกสัปดาห์",
    MONTHLY: "เตือนทุกเดือน",
  };

  const isRecurring = reminder.recurrence && reminder.recurrence !== "NONE";
  const recurrenceText = recurrenceTextMap[reminder.recurrence] || "ไม่เตือนซ้ำ";

  const headerContents: messagingApi.FlexComponent[] = [
    {
      type: "box",
      layout: "horizontal",
      backgroundColor: "#3B5B3E", // Matcha Dark
      width: "20px",
      height: "20px",
      cornerRadius: "10px",
      alignItems: "center",
      justifyContent: "center",
      contents: [
        {
          type: "text",
          text: "✓",
          color: "#FFFFFF",
          size: "xxs",
          weight: "bold",
          align: "center",
        },
      ],
    },
    {
      type: "text",
      text: "ตั้งเตือนแล้ว",
      weight: "bold",
      color: "#2C221E", // Mocha
      size: "md",
      margin: "md",
      flex: 1,
    },
  ];

  if (isRecurring) {
    headerContents.push({
      type: "text",
      text: recurrenceText,
      color: "#3B5B3E",
      size: "xs",
      align: "end",
      weight: "bold",
    });
  }

  const bubble: messagingApi.FlexBubble = {
    type: "bubble",
    size: "mega",
    header: {
      type: "box",
      layout: "horizontal",
      backgroundColor: "#D8E8D4", // Matcha Light
      paddingAll: "16px",
      alignItems: "center",
      contents: headerContents,
    },
    body: {
      type: "box",
      layout: "vertical",
      backgroundColor: "#F8F9F5", // Sand Light
      paddingAll: "20px",
      contents: [
        {
          type: "text",
          text: reminder.taskTitle || "สิ่งที่ต้องทำ",
          weight: "bold",
          size: "xl",
          color: "#2C221E", // Mocha
          wrap: true,
        },
        {
          type: "separator",
          margin: "lg",
          color: "#EFEBE4",
        },
        {
          type: "box",
          layout: "vertical",
          margin: "lg",
          spacing: "sm",
          contents: [
            {
              type: "box",
              layout: "horizontal",
              contents: [
                {
                  type: "text",
                  text: "📅 วันที่",
                  color: "#766E65",
                  size: "sm",
                  flex: 3,
                },
                {
                  type: "text",
                  text: reminder.displayDate || "-",
                  color: "#2C221E",
                  size: "sm",
                  weight: "bold",
                  align: "end",
                  flex: 7,
                },
              ],
            },
            {
              type: "box",
              layout: "horizontal",
              contents: [
                {
                  type: "text",
                  text: "⏰ เวลา",
                  color: "#766E65",
                  size: "sm",
                  flex: 3,
                },
                {
                  type: "text",
                  text: reminder.displayTime || "-",
                  color: "#3B5B3E",
                  size: "sm",
                  weight: "bold",
                  align: "end",
                  flex: 7,
                },
              ],
            },
            ...(isRecurring
              ? [
                  {
                    type: "box" as const,
                    layout: "horizontal" as const,
                    contents: [
                      {
                        type: "text" as const,
                        text: "🔄 เตือนซ้ำ",
                        color: "#766E65",
                        size: "sm",
                        flex: 3,
                      },
                      {
                        type: "text" as const,
                        text: recurrenceText,
                        color: "#2C221E",
                        size: "sm",
                        weight: "bold" as const,
                        align: "end" as const,
                        flex: 7,
                      },
                    ],
                  },
                ]
              : []),
          ],
        },
      ],
    },
    footer: {
      type: "box",
      layout: "horizontal",
      backgroundColor: "#F8F9F5",
      paddingAll: "16px",
      spacing: "md",
      contents: [
        {
          type: "button",
          style: "secondary",
          height: "sm",
          color: "#EFEBE4",
          action: {
            type: "uri",
            label: "✏️ แก้ไข",
            uri: editUrl,
          },
          flex: 1,
        },
        {
          type: "button",
          style: "primary",
          height: "sm",
          color: "#3B5B3E",
          action: {
            type: "postback",
            label: "❌ ยกเลิก",
            data: `action=cancel&id=${reminder.id}`,
            displayText: `ยกเลิกการเตือน "${reminder.taskTitle}"`,
          },
          flex: 1,
        },
      ],
    },
    styles: {
      footer: {
        separator: true,
        separatorColor: "#EFEBE4",
      },
    },
  };

  return {
    type: "flex",
    altText: `ตั้งเตือน "${reminder.taskTitle}" วันที่ ${reminder.displayDate || ""} เวลา ${reminder.displayTime || ""} เรียบร้อยแล้ว`,
    contents: bubble,
  };
}

/**
 * สร้าง Flex Message สำหรับการแจ้งเตือนเมื่องานถึงเวลา (Alarm Notification Card)
 */
export function createReminderAlertCard(
  reminder: DbReminder | { id: string; taskTitle: string; displayDate: string | null; displayTime: string | null }
): messagingApi.FlexMessage {
  const bubble: messagingApi.FlexBubble = {
    type: "bubble",
    size: "mega",
    header: {
      type: "box",
      layout: "horizontal",
      backgroundColor: "#3B5B3E", // Dark matcha
      paddingAll: "16px",
      alignItems: "center",
      contents: [
        {
          type: "text",
          text: "⏰ ถึงเวลาแล้ว!",
          weight: "bold",
          color: "#FFFFFF",
          size: "lg",
        },
      ],
    },
    body: {
      type: "box",
      layout: "vertical",
      backgroundColor: "#F8F9F5",
      paddingAll: "20px",
      contents: [
        {
          type: "text",
          text: reminder.taskTitle || "แจ้งเตือน",
          weight: "bold",
          size: "xl",
          color: "#2C221E",
          wrap: true,
        },
        {
          type: "box",
          layout: "horizontal",
          margin: "md",
          contents: [
            {
              type: "text",
              text: `⏰ กำหนดการ: ${reminder.displayDate || ""} ${reminder.displayTime || ""}`,
              color: "#766E65",
              size: "sm",
            },
          ],
        },
      ],
    },
    footer: {
      type: "box",
      layout: "horizontal",
      backgroundColor: "#F8F9F5",
      paddingAll: "16px",
      spacing: "md",
      contents: [
        {
          type: "button",
          style: "primary",
          height: "sm",
          color: "#3B5B3E",
          action: {
            type: "postback",
            label: "✓ เสร็จแล้ว",
            data: `action=complete&id=${reminder.id}`,
            displayText: `ทำ "${reminder.taskTitle}" เสร็จแล้ว`,
          },
          flex: 1,
        },
        {
          type: "button",
          style: "secondary",
          height: "sm",
          color: "#EFEBE4",
          action: {
            type: "postback",
            label: "⏱️ เลื่อน 10 นาที",
            data: `action=snooze&id=${reminder.id}&minutes=10`,
            displayText: `ขอเลื่อน "${reminder.taskTitle}" ออกไป 10 นาที`,
          },
          flex: 1,
        },
      ],
    },
    styles: {
      footer: {
        separator: true,
        separatorColor: "#EFEBE4",
      },
    },
  };

  return {
    type: "flex",
    altText: `⏰ ถึงเวลาแล้ว: ${reminder.taskTitle}`,
    contents: bubble,
  };
}
