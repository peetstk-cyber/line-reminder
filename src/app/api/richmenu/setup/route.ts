import { NextResponse } from "next/server";
import { getLineMessagingClient } from "@/lib/line";
import fs from "fs";
import path from "path";

export async function POST() {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  const liffId = process.env.NEXT_PUBLIC_LIFF_ID;

  if (!token) {
    return NextResponse.json(
      { error: "LINE_CHANNEL_ACCESS_TOKEN is missing in .env" },
      { status: 400 }
    );
  }

  const client = getLineMessagingClient();
  const imagePath = path.join(process.cwd(), "public", "richmenu.jpg");

  if (!fs.existsSync(imagePath)) {
    return NextResponse.json(
      { error: "Rich menu image not found at public/richmenu.jpg" },
      { status: 404 }
    );
  }

  try {
    // 1. Create Rich Menu Object (2500 x 1686, 2x2 Grid)
    const richMenuReq = {
      size: {
        width: 2500,
        height: 1686,
      },
      selected: false,
      name: "Main Rich Menu 4 Tabs",
      chatBarText: "เมนูหลัก 🌿",
      areas: [
        // Top-Left: Reminders (เตือนความจำ)
        {
          bounds: { x: 0, y: 0, width: 1250, height: 843 },
          action: {
            type: "uri" as const,
            label: "เตือนความจำ",
            uri: liffId ? `https://liff.line.me/${liffId}?tab=reminders` : "https://liff.line.me",
          },
        },
        // Top-Right: Calendar (ปฏิทิน)
        {
          bounds: { x: 1250, y: 0, width: 1250, height: 843 },
          action: {
            type: "uri" as const,
            label: "ปฏิทิน",
            uri: liffId ? `https://liff.line.me/${liffId}?tab=calendar` : "https://liff.line.me",
          },
        },
        // Bottom-Left: Notes (โน้ต & ซื้อของ)
        {
          bounds: { x: 0, y: 843, width: 1250, height: 843 },
          action: {
            type: "uri" as const,
            label: "โน้ต & ซื้อของ",
            uri: liffId ? `https://liff.line.me/${liffId}?tab=notes` : "https://liff.line.me",
          },
        },
        // Bottom-Right: Debts (ทวงเงิน/ยืมคืน)
        {
          bounds: { x: 1250, y: 843, width: 1250, height: 843 },
          action: {
            type: "uri" as const,
            label: "ทวงเงิน/ยืมคืน",
            uri: liffId ? `https://liff.line.me/${liffId}?tab=debt` : "https://liff.line.me",
          },
        },
      ],
    };

    const res = await client.createRichMenu(richMenuReq);
    const richMenuId = res.richMenuId;

    // 2. Upload Image to LINE Blob API
    const imageBuffer = fs.readFileSync(imagePath);
    const uploadRes = await fetch(
      `https://api-data.line.me/v2/bot/richmenu/${richMenuId}/content`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "image/jpeg",
        },
        body: imageBuffer,
      }
    );

    if (!uploadRes.ok) {
      const errText = await uploadRes.text();
      return NextResponse.json(
        { error: "Failed to upload image to LINE", details: errText, richMenuId },
        { status: 500 }
      );
    }

    // 3. Set Default Rich Menu
    await client.setDefaultRichMenu(richMenuId);

    return NextResponse.json({
      success: true,
      message: "Rich Menu created and set as default successfully! 🌿",
      richMenuId,
    });
  } catch (error: any) {
    console.error("Rich Menu setup failed:", error);
    return NextResponse.json(
      { error: "Internal Server Error", message: error?.message || String(error) },
      { status: 500 }
    );
  }
}
