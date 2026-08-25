import fs from "fs";
import path from "path";

async function main() {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  const liffId = process.env.NEXT_PUBLIC_LIFF_ID || "2011213809-DAc52dRk";

  if (!token) {
    console.error("❌ Error: LINE_CHANNEL_ACCESS_TOKEN is not defined in .env");
    process.exit(1);
  }

  const imagePath = path.join(process.cwd(), "public", "richmenu.jpg");
  if (!fs.existsSync(imagePath)) {
    console.error("❌ Error: public/richmenu.jpg not found");
    process.exit(1);
  }

  console.log("🌿 Setting up new 4-Quadrant Edge-to-Edge Rich Menu...");

  // 1. List and Clean up existing rich menus
  try {
    const listRes = await fetch("https://api.line.me/v2/bot/richmenu/list", {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (listRes.ok) {
      const listData = await listRes.json();
      console.log(`Found ${listData.richmenus?.length || 0} existing rich menu(s). Cleaning up old menus...`);
      for (const rm of listData.richmenus || []) {
        console.log(`Deleting old rich menu: ${rm.richMenuId} (${rm.name})`);
        await fetch(`https://api.line.me/v2/bot/richmenu/${rm.richMenuId}`, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${token}` },
        });
      }
    }
  } catch (err) {
    console.warn("⚠️ Warning during cleanup:", err);
  }

  // 2. Create Rich Menu definition (2500 x 1686, 2x2 grid edge-to-edge)
  const richMenuBody = {
    size: {
      width: 2500,
      height: 1686,
    },
    selected: false,
    name: "Main 4-Tab Rich Menu (Edge-to-Edge)",
    chatBarText: "เมนูหลัก 🌿",
    areas: [
      // Top-Left: เตือนความจำ (Reminders)
      {
        bounds: { x: 0, y: 0, width: 1250, height: 843 },
        action: {
          type: "uri",
          label: "เตือนความจำ",
          uri: `https://liff.line.me/${liffId}?tab=reminders`,
        },
      },
      // Top-Right: ปฏิทิน (Calendar)
      {
        bounds: { x: 1250, y: 0, width: 1250, height: 843 },
        action: {
          type: "uri",
          label: "ปฏิทิน",
          uri: `https://liff.line.me/${liffId}?tab=calendar`,
        },
      },
      // Bottom-Left: โน้ต & เช็กลิสต์ (Notes & Lists)
      {
        bounds: { x: 0, y: 843, width: 1250, height: 843 },
        action: {
          type: "uri",
          label: "โน้ต & เช็กลิสต์",
          uri: `https://liff.line.me/${liffId}?tab=notes`,
        },
      },
      // Bottom-Right: ทวงเงิน/ยืมคืน (Debts & IOUs)
      {
        bounds: { x: 1250, y: 843, width: 1250, height: 843 },
        action: {
          type: "uri",
          label: "ทวงเงิน/ยืมคืน",
          uri: `https://liff.line.me/${liffId}?tab=debt`,
        },
      },
    ],
  };

  console.log("📝 Creating rich menu object on LINE API...");
  const createRes = await fetch("https://api.line.me/v2/bot/richmenu", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(richMenuBody),
  });

  if (!createRes.ok) {
    const errText = await createRes.text();
    console.error("❌ Failed to create rich menu:", errText);
    process.exit(1);
  }

  const createData = await createRes.json();
  const richMenuId = createData.richMenuId;
  console.log(`✅ Rich Menu created with ID: ${richMenuId}`);

  // 3. Upload image
  console.log("🖼️ Uploading image to LINE Blob API...");
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
    console.error("❌ Failed to upload rich menu image:", errText);
    process.exit(1);
  }
  console.log("✅ Image uploaded successfully!");

  // 4. Set as Default Rich Menu
  console.log("👑 Setting as default rich menu for all users...");
  const defaultRes = await fetch(
    `https://api.line.me/v2/bot/user/all/richmenu/${richMenuId}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );

  if (!defaultRes.ok) {
    const errText = await defaultRes.text();
    console.error("❌ Failed to set default rich menu:", errText);
    process.exit(1);
  }

  console.log("🎉 SUCCESS! New 4-quadrant edge-to-edge Rich Menu is now LIVE on LINE OA!");
  console.log(`Rich Menu ID: ${richMenuId}`);
}

main().catch((err) => {
  console.error("❌ Unexpected error:", err);
  process.exit(1);
});
