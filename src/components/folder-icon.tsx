import {
  Archive,
  BriefcaseBusiness,
  Folder,
  Heart,
  House,
  Receipt,
  Shield,
  Star
} from "lucide-react";

export const FOLDER_ICON_OPTIONS = [
  { value: "folder", label: "Ordner" },
  { value: "archive", label: "Archiv" },
  { value: "briefcase", label: "Arbeit" },
  { value: "heart", label: "Herz" },
  { value: "home", label: "Zuhause" },
  { value: "receipt", label: "Belege" },
  { value: "shield", label: "Schutz" },
  { value: "star", label: "Favorit" }
] as const;

export type FolderIconName = (typeof FOLDER_ICON_OPTIONS)[number]["value"];

export function FolderGlyph({ icon, size = 22 }: { icon?: string; size?: number }) {
  const props = { "aria-hidden": true, size } as const;
  switch (icon) {
    case "archive": return <Archive {...props} />;
    case "briefcase": return <BriefcaseBusiness {...props} />;
    case "heart": return <Heart {...props} />;
    case "home": return <House {...props} />;
    case "receipt": return <Receipt {...props} />;
    case "shield": return <Shield {...props} />;
    case "star": return <Star {...props} />;
    default: return <Folder {...props} />;
  }
}
