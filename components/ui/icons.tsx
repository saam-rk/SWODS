import type { ReactNode, SVGProps } from "react";

export type IconName =
  | "arrow-left"
  | "arrow-right"
  | "camera"
  | "check"
  | "close"
  | "download"
  | "explore"
  | "gallery"
  | "image"
  | "invitations"
  | "lock"
  | "menu"
  | "print"
  | "refresh"
  | "share"
  | "user";

const paths: Record<IconName, ReactNode> = {
  "arrow-left": <><path d="M19 12H5" /><path d="m11 18-6-6 6-6" /></>,
  "arrow-right": <><path d="M5 12h14" /><path d="m13 6 6 6-6 6" /></>,
  camera: <><path d="M4 7h3l1.5-2h7L17 7h3v12H4Z" /><circle cx="12" cy="13" r="3.5" /></>,
  check: <path d="m5 12 4 4L19 6" />,
  close: <><path d="m6 6 12 12" /><path d="M18 6 6 18" /></>,
  download: <><path d="M12 3v12" /><path d="m7 10 5 5 5-5" /><path d="M5 21h14" /></>,
  explore: <><circle cx="12" cy="12" r="8.5" /><path d="m15.5 8.5-2.1 4.9-4.9 2.1 2.1-4.9Z" /></>,
  gallery: <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="m3 16 5-5 4 4 3-3 6 6" /><circle cx="16.5" cy="8.5" r="1.5" /></>,
  image: <><rect x="4" y="3" width="16" height="18" rx="2" /><path d="m4 16 4-4 4 4 3-3 5 5" /></>,
  invitations: <><path d="M4 7h16v11H4Z" /><path d="m4 8 8 6 8-6" /></>,
  lock: <><rect x="5" y="10" width="14" height="11" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></>,
  menu: <><path d="M4 7h16" /><path d="M4 12h16" /><path d="M4 17h16" /></>,
  print: <><path d="M7 9V3h10v6" /><path d="M7 17H4V9h16v8h-3" /><path d="M7 14h10v7H7Z" /></>,
  refresh: <><path d="M20 7v5h-5" /><path d="M19 12a7 7 0 1 0-2 5" /></>,
  share: <><circle cx="18" cy="5" r="2.5" /><circle cx="6" cy="12" r="2.5" /><circle cx="18" cy="19" r="2.5" /><path d="m8.2 10.8 7.6-4.5" /><path d="m8.2 13.2 7.6 4.5" /></>,
  user: <><circle cx="12" cy="8" r="4" /><path d="M4.5 21a7.5 7.5 0 0 1 15 0" /></>,
};

export function Icon({ name, className = "icon", ...props }: SVGProps<SVGSVGElement> & { name: IconName }) {
  return (
    <svg aria-hidden="true" className={className} viewBox="0 0 24 24" {...props}>
      {paths[name]}
    </svg>
  );
}
