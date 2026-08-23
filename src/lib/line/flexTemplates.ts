import { messagingApi } from "@line/bot-sdk";
import { DbReminder } from "../db";

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
