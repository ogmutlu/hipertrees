import type { CSSProperties } from "react";
export type IconName =
  | "play"
  | "pause"
  | "plus"
  | "close"
  | "notes"
  | "pencil"
  | "arrow"
  | "download"
  | "upload"
  | "fit"
  | "trash"
  | "tree"
  | "check";
export function Icon({
  name,
  size = 18,
  style,
}: {
  name: IconName;
  size?: number;
  style?: CSSProperties;
}) {
  const paths: Record<IconName, string> = {
    play: "M8 5 19 12 8 19Z",
    pause: "M8 5v14M16 5v14",
    plus: "M12 5v14M5 12h14",
    close: "m6 6 12 12M18 6 6 18",
    notes: "M6 3h9l4 4v14H6ZM14 3v5h5M9 12h7M9 16h5",
    pencil: "m15 4 5 5M4 20l5-1L21 7a2 2 0 0 0-5-5L4 14Z",
    arrow: "M5 12h14m-6-6 6 6-6 6",
    download: "M12 3v12m-5-5 5 5 5-5M5 16v5h14v-5",
    upload: "M12 16V4m-5 5 5-5 5 5M5 16v5h14v-5",
    fit: "M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5",
    trash: "M3 6h18M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7m4-7v7",
    tree: "M12 5 5 18m7-13 7 13M9 5a3 3 0 1 0 6 0 3 3 0 1 0-6 0M2 19a3 3 0 1 0 6 0 3 3 0 1 0-6 0m14 0a3 3 0 1 0 6 0 3 3 0 1 0-6 0",
    check: "m5 12 4 4L19 6",
  };
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={name === "play" ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={style}
      aria-hidden="true"
    >
      <path d={paths[name]} />
    </svg>
  );
}
