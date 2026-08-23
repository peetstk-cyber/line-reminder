export interface PresetAvatar {
  id: string;
  name: string;
  emoji: string;
  bg: string;
  border: string;
  textColor: string;
  iconUrl: string; // High-resolution SVG / 3D emoji url for LINE Flex Message
}

export const PRESET_AVATARS: PresetAvatar[] = [
  {
    id: "fox",
    name: "น้องจิ้งจอก",
    emoji: "🦊",
    bg: "#FFE8D6",
    border: "#FDBA74",
    textColor: "#9A3412",
    iconUrl: "https://images.unsplash.com/photo-1579202673506-ca3ce28943ef?w=100&auto=format&fit=crop&q=80",
  },
  {
    id: "cat",
    name: "แมวส้ม",
    emoji: "🐱",
    bg: "#FFD8BE",
    border: "#FCA5A5",
    textColor: "#991B1B",
    iconUrl: "https://images.unsplash.com/photo-1514888286974-6c03e2ca1dba?w=100&auto=format&fit=crop&q=80",
  },
  {
    id: "bear",
    name: "พี่หมี",
    emoji: "🐻",
    bg: "#EAD5C3",
    border: "#D6B89D",
    textColor: "#5C3A21",
    iconUrl: "https://images.unsplash.com/photo-1530595467537-0b5996c41f2d?w=100&auto=format&fit=crop&q=80",
  },
  {
    id: "bunny",
    name: "กระต่ายน้อย",
    emoji: "🐰",
    bg: "#FDE2E4",
    border: "#FBCFE8",
    textColor: "#9D174D",
    iconUrl: "https://images.unsplash.com/photo-1585110396000-c9ffd4e4b308?w=100&auto=format&fit=crop&q=80",
  },
  {
    id: "panda",
    name: "แพนด้า",
    emoji: "🐼",
    bg: "#E5E5E5",
    border: "#D4D4D4",
    textColor: "#262626",
    iconUrl: "https://images.unsplash.com/photo-1564349683136-77e08dba1ef6?w=100&auto=format&fit=crop&q=80",
  },
  {
    id: "dog",
    name: "น้องหมา",
    emoji: "🐶",
    bg: "#FFF1C5",
    border: "#FDE047",
    textColor: "#854D0E",
    iconUrl: "https://images.unsplash.com/photo-1543466835-00a7907e9de1?w=100&auto=format&fit=crop&q=80",
  },
  {
    id: "koala",
    name: "โคอาล่า",
    emoji: "🐨",
    bg: "#D3ECE1",
    border: "#99F6E4",
    textColor: "#115E59",
    iconUrl: "https://images.unsplash.com/photo-1526336024174-e58f5cdd8e13?w=100&auto=format&fit=crop&q=80",
  },
  {
    id: "chick",
    name: "ลูกเจี๊ยบ",
    emoji: "🐥",
    bg: "#FFF8D6",
    border: "#FEF08A",
    textColor: "#713F12",
    iconUrl: "https://images.unsplash.com/photo-1563281577-a7be47e20db9?w=100&auto=format&fit=crop&q=80",
  },
  {
    id: "frog",
    name: "กบน้อย",
    emoji: "🐸",
    bg: "#D8E8D4",
    border: "#86EFAC",
    textColor: "#166534",
    iconUrl: "https://images.unsplash.com/photo-1561037404-61cd46aa615b?w=100&auto=format&fit=crop&q=80",
  },
  {
    id: "hamster",
    name: "แฮมสเตอร์",
    emoji: "🐹",
    bg: "#EFEBE4",
    border: "#E2D9CE",
    textColor: "#4B382A",
    iconUrl: "https://images.unsplash.com/photo-1425082661705-1834bfd09dca?w=100&auto=format&fit=crop&q=80",
  },
  {
    id: "unicorn",
    name: "ยูนิคอร์น",
    emoji: "🦄",
    bg: "#E8E0F0",
    border: "#DDD6FE",
    textColor: "#5B21B6",
    iconUrl: "https://images.unsplash.com/photo-1579783902614-a3fb3927b675?w=100&auto=format&fit=crop&q=80",
  },
  {
    id: "lion",
    name: "สิงโต",
    emoji: "🦁",
    bg: "#FEE4CB",
    border: "#FED7AA",
    textColor: "#C2410C",
    iconUrl: "https://images.unsplash.com/photo-1534188753412-3e26d0d618d6?w=100&auto=format&fit=crop&q=80",
  },
];

/**
 * สุ่ม/คำนวณ Preset Avatar เริ่มต้นสำหรับชื่อคน (ให้คนชื่อเดิมได้ตัวละครเดิมเสมอ)
 */
export function getDefaultPresetForName(name: string): PresetAvatar {
  if (!name) return PRESET_AVATARS[0];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % PRESET_AVATARS.length;
  return PRESET_AVATARS[index];
}

/**
 * ดึงข้อมูล Avatar สมบูรณ์ (ทั้งกรณี Preset Character หรือ Custom Face Image)
 */
export function getAvatarInfo(
  name: string,
  profile?: { avatarType?: string; avatarValue?: string; color?: string } | null
): {
  isCustomImage: boolean;
  imageUrl?: string;
  emoji: string;
  bg: string;
  border: string;
  textColor: string;
  characterName: string;
} {
  const defaultPreset = getDefaultPresetForName(name);

  if (profile?.avatarType === "CUSTOM_IMAGE" && profile.avatarValue && profile.avatarValue.startsWith("http")) {
    return {
      isCustomImage: true,
      imageUrl: profile.avatarValue,
      emoji: defaultPreset.emoji,
      bg: profile.color || defaultPreset.bg,
      border: defaultPreset.border,
      textColor: defaultPreset.textColor,
      characterName: "รูปภาพจริง",
    };
  }

  if (profile?.avatarType === "PRESET_CHARACTER" && profile.avatarValue) {
    const found = PRESET_AVATARS.find((p) => p.id === profile.avatarValue);
    if (found) {
      return {
        isCustomImage: false,
        emoji: found.emoji,
        bg: profile.color || found.bg,
        border: found.border,
        textColor: found.textColor,
        characterName: found.name,
      };
    }
  }

  return {
    isCustomImage: false,
    emoji: defaultPreset.emoji,
    bg: defaultPreset.bg,
    border: defaultPreset.border,
    textColor: defaultPreset.textColor,
    characterName: defaultPreset.name,
  };
}
