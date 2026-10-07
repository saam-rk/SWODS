import Link from "next/link";

import { Icon } from "@/components/ui/icons";

export default function NotFound() {
  return (
    <main className="route-state" id="main-content">
      <div className="state-panel">
        <Icon name="explore" />
        <h1>This path is outside the experience.</h1>
        <p>The shared field note is still waiting where you left it.</p>
        <Link className="button button--primary" href="/explore">Return to explore</Link>
      </div>
    </main>
  );
}
