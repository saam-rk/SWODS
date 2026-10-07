export default function Loading() {
  return (
    <main className="route-state" id="main-content">
      <div aria-hidden="true" className="route-skeleton">
        <span />
        <span />
        <span />
        <span />
      </div>
      <p className="sr-only" role="status">Loading</p>
    </main>
  );
}
