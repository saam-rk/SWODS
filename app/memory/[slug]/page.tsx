import { FinalExperienceView } from "@/components/final-experience";

export default async function MemoryPage({ params }: Readonly<{ params: Promise<{ slug: string }> }>) {
  const { slug } = await params;
  return <FinalExperienceView slug={slug} view="memory" />;
}
