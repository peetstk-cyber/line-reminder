import fs from "fs";
import path from "path";

// Simple .env parser if not already loaded
if (!process.env.LINE_CHANNEL_ACCESS_TOKEN) {
  const envPath = path.join(process.cwd(), ".env");
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, "utf-8");
    envContent.split("\n").forEach((line) => {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith("#") && trimmed.includes("=")) {
        const [key, ...vals] = trimmed.split("=");
        const val = vals.join("=").replace(/^["']|["']$/g, "");
        if (!process.env[key.trim()]) {
          process.env[key.trim()] = val.trim();
        }
      }
    });
  }
}

const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
const liffId = process.env.NEXT_PUBLIC_LIFF_ID;

if (!token) {
  console.error("❌ Error: LINE_CHANNEL_ACCESS_TOKEN is missing in .env");
  process.exit(1);
}

const imagePath = path.join(process.cwd(), "public", "richmenu.jpg");
if (!fs.existsSync(imagePath)) {
  console.error("❌ Error: Image not found at public/richmenu.jpg");
  process.exit(1);
}

async function setup() {
  console.log("🚀 Starting LINE Rich Menu setup...");

  const richMenuReq = {
    size: {
      width: 2500,
      height: 1686,
    },
    selected: false,
    name: "Main Rich Menu 4 Tabs",
    chatBarText: "เมนูหลัก 🌿",
    areas: [
      // 1. Top-Left: Reminders (เตือนความจำ)
      {
        bounds: { x: 0, y: 0, width: 1250, height: 843 },
        action: {
          type: "uri",
          label: "เตือนความจำ",
          uri: liffId ? `https://liff.line.me/${liffId}?tab=reminders` : "https://liff.line.me",
        },
      },
      // 2. Top-Right: Calendar (ปฏิทิน)
      {
        bounds: { x: 1250, y: 0, width: 1250, height: 843 },
        action: {
          type: "uri",
          label: "ปฏิทิน",
          uri: liffId ? `https://liff.line.me/${liffId}?tab=calendar` : "https://liff.line.me",
        },
      },
      // 3. Bottom-Left: Notes (โน้ต & ซื้อของ)
      {
        bounds: { x: 0, y: 843, width: 1250, height: 843 },
        action: {
          type: "uri",
          label: "โน้ต & ซื้อของ",
          uri: liffId ? `https://liff.line.me/${liffId}?tab=notes` : "https://liff.line.me",
        },
      },
      // 4. Bottom-Right: Debts (ทวงเงิน/ยืมคืน)
      {
        bounds: { x: 1250, y: 843, width: 1250, height: 843 },
        action: {
          type: "uri",
          label: "ทวงเงิน/ยืมคืน",
          uri: liffId ? `https://liff.line.me/${liffId}?tab=debt` : "https://liff.line.me",
        },
      },
    ],
  };

  // Step 1: Create Rich Menu
  console.log("1️⃣ Creating Rich Menu object in LINE...");
  const createRes = await fetch("https://api.line.me/v2/bot/richmenu", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(richMenuReq),
  });

  if (!createRes.ok) {
    const err = await createRes.text();
    console.error("❌ Failed to create rich menu:", err);
    process.exit(1);
  }

  const { richMenuId } = await createRes.json();
  console.log(`✅ Rich Menu created with ID: ${richMenuId}`);

  // Step 2: Upload Image
  console.log("2️⃣ Uploading rich menu image (public/richmenu.jpg)...");
  const imageBuffer = fs.readFileSync(imagePath);
  const uploadRes = await fetch(`https://api-data.line.me/v2/bot/richmenu/${richMenuId}/content`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "image/jpeg",
    },
    body: imageBuffer,
  });

  if (!uploadRes.ok) {
    const err = await uploadRes.text();
    console.error("❌ Failed to upload image:", err);
    process.exit(1);
  }
  console.log("✅ Image uploaded successfully!");

  // Step 3: Set as Default Rich Menu
  console.log("3️⃣ Setting as default rich menu for all users...");
  const defaultRes = await fetch(`https://api.line.me/v2/bot/user/all/richmenu/${richMenuId}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!defaultRes.ok) {
    const err = await defaultRes.text();
    console.error("❌ Failed to set default rich menu:", err);
    process.exit(1);
  }

  console.log("🎉 All done! Rich Menu is now live on your LINE OA!");
}

setup().catch((e) => {
  console.error("Error:", e);
});
