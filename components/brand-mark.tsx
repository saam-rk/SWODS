import Link from "next/link";

import { useLocale } from "@/components/locale-provider";

export function BrandMark({ linked = true }: Readonly<{ linked?: boolean }>) {
  const { copy } = useLocale();
  const content = (
    <span className="brand-mark">
      <span className="brand-mark__symbol" aria-hidden="true">
        <i /><i /><i /><i /><i /><i />
      </span>
      <span className="brand-mark__text">
        <span className="brand-mark__name">{copy.shell.experienceName}</span>
      </span>
    </span>
  );

  return linked ? <Link href="/explore" aria-label={copy.shell.experienceName}>{content}</Link> : content;
}
