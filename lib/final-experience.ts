import type { Dictionary, Locale } from "@/lib/i18n";
import { getAdminAccess, loadAdminSnapshot } from "@/lib/admin";
import { isExperiencePhase, type ExperiencePhase } from "@/lib/experience-phase";
import type { ParticipantSession } from "@/lib/participant-session";
import { createBrowserSupabaseClient, hasSupabaseConfig } from "@/lib/supabase/client";
import { loadGalleryData, type GalleryPhoto } from "@/lib/supabase/gallery";
import { loadPublicMemory } from "@/lib/supabase/memory-links";

export type FinalStory = {
  position: number;
  teamName: string;
  teamSymbol: string;
  photo: GalleryPhoto;
};

export type FinalExperience = {
  id: string;
  slug: string;
  title: string;
  description: string;
  place: string;
  startDate: string;
  endDate: string;
  phase: ExperiencePhase;
  mosaicVisible: boolean;
  targetImageUrl?: string;
  generatedMosaicUrl?: string;
  stories: FinalStory[];
  participants: string[];
  participantCount: number;
  totalPhotos: number;
};

export async function loadFinalExperience(session: ParticipantSession | null, locale: Locale, copy: Dictionary): Promise<FinalExperience> {
  if (!hasSupabaseConfig()) return loadDemoFinalExperience(locale, copy);
  let resolvedSession = session;
  if (!resolvedSession) {
    const adminAccess = await getAdminAccess();
    if (adminAccess?.mode === "supabase" && adminAccess.participantId) {
      resolvedSession = {
        participantId: adminAccess.participantId,
        experienceId: adminAccess.experienceId,
        name: "Administrator",
        country: "",
        locale,
        phase: "exploration",
        mode: "supabase",
        onboardingCompleted: true,
      };
    }
  }
  if (!resolvedSession) throw new Error("Join the experience to enter this final view.");
  if (resolvedSession.mode === "demo") return loadDemoFinalExperience(locale, copy);

  const supabase = createBrowserSupabaseClient();
  if (!supabase) throw new Error("Supabase is not configured.");
  const [experienceResult, gallery, participantResult, mosaicResult] = await Promise.all([
    supabase.from("experiences").select("id, slug, title, description, place, start_date, end_date, current_phase, mosaic_visible").eq("id", resolvedSession.experienceId).maybeSingle(),
    loadGalleryData(resolvedSession, locale, copy),
    supabase.from("participants").select("first_name").eq("experience_id", resolvedSession.experienceId).eq("is_active", true).order("created_at", { ascending: true }),
    supabase.from("mosaics").select("generated_image_path").eq("experience_id", resolvedSession.experienceId).eq("status", "ready").limit(1).maybeSingle(),
  ]);
  if (experienceResult.error) throw experienceResult.error;
  if (!experienceResult.data) throw new Error("This experience is no longer available.");
  if (participantResult.error) throw participantResult.error;
  if (mosaicResult.error) throw mosaicResult.error;

  const experience = experienceResult.data as SupabaseFinalExperienceRow;
  const mosaicPath = mosaicResult.data?.generated_image_path as string | null | undefined;
  const generatedMosaicUrl = mosaicPath ? await createSignedUrl(supabase, mosaicPath) : undefined;
  const teamNames = new Map(gallery.teams.map((team) => [team.id, team]));
  const photoMap = new Map(gallery.photos.map((photo) => [photo.id, photo]));
  const stories = gallery.storySelections
    .sort((first, second) => first.position - second.position)
    .flatMap((selection) => {
      const photo = photoMap.get(selection.photoId);
      const team = teamNames.get(selection.teamId);
      return photo && team ? [{ position: selection.position, teamName: team.name, teamSymbol: team.symbol, photo }] : [];
    });
  return {
    id: experience.id,
    slug: experience.slug,
    title: experience.title,
    description: experience.description ?? "",
    place: experience.place,
    startDate: experience.start_date ?? "",
    endDate: experience.end_date ?? "",
    phase: isExperiencePhase(experience.current_phase) ? experience.current_phase : "exploration",
    mosaicVisible: experience.mosaic_visible,
    generatedMosaicUrl,
    stories,
    participants: ((participantResult.data ?? []) as Array<{ first_name: string }>).map((participant) => participant.first_name),
    participantCount: (participantResult.data ?? []).length,
    totalPhotos: gallery.photos.length,
  };
}

export async function loadSharedMemory(slug: string, token: string, locale: Locale, copy: Dictionary): Promise<FinalExperience> {
  const shared = await loadPublicMemory(slug, token, locale);
  return {
    id: shared.id,
    slug: shared.slug,
    title: shared.title,
    description: shared.description,
    place: shared.place,
    startDate: shared.startDate,
    endDate: shared.endDate,
    phase: shared.phase,
    mosaicVisible: shared.mosaicVisible,
    generatedMosaicUrl: shared.generatedMosaicUrl,
    participants: [],
    participantCount: shared.participantCount,
    totalPhotos: shared.totalPhotos,
    stories: shared.stories.map((story, index) => ({
      position: story.position,
      teamName: story.teamName,
      teamSymbol: story.teamSymbol,
      photo: {
        id: story.photo.id,
        experienceId: shared.id,
        participantId: "",
        teamId: story.teamId,
        challengeId: story.photo.challengeId,
        study: `${String(index + 1).padStart(2, "0")} / ${String(shared.stories.length).padStart(2, "0")}`,
        author: copy.gallery.unknownAuthor,
        team: story.teamName,
        teamSymbol: story.teamSymbol,
        challenge: story.photo.challengeTitle,
        caption: story.photo.caption,
        altText: story.photo.altText,
        createdAt: story.photo.createdAt,
        orientation: index % 3 === 1 ? "landscape" : "portrait",
        tone: (["clay", "river", "moss", "sun", "ink"] as const)[index % 5],
        imageUrl: story.photo.imageUrl,
        thumbnailUrl: story.photo.thumbnailUrl,
        source: "supabase",
      },
    })),
  };
}

async function loadDemoFinalExperience(locale: Locale, copy: Dictionary): Promise<FinalExperience> {
  const access = await getAdminAccess();
  const snapshot = await loadAdminSnapshot(access ?? { mode: "demo", experienceId: "demo-hervas" }, locale, copy);
  const gallerySession: ParticipantSession = { participantId: "demo-participant", experienceId: "demo-hervas", name: "Field participant", country: "", locale, phase: snapshot.experience.currentPhase, mode: "demo", onboardingCompleted: true };
  const gallery = await loadGalleryData(gallerySession, locale, copy);
  const photoMap = new Map(gallery.photos.map((photo) => [photo.id, photo]));
  const teamMap = new Map(snapshot.teams.map((team) => [team.id, team]));
  const selected = gallery.storySelections
    .sort((first, second) => first.position - second.position)
    .flatMap((selection) => {
      const photo = photoMap.get(selection.photoId);
      const team = teamMap.get(selection.teamId);
      return photo && team ? [{ position: selection.position, teamName: team.name, teamSymbol: team.symbol, photo }] : [];
    });
  const stories = selected.length > 0 ? selected : gallery.photos.slice(0, 6).map((photo, index) => ({
    position: index + 1,
    teamName: photo.team,
    teamSymbol: photo.teamSymbol,
    photo,
  }));
  return {
    id: snapshot.experience.id,
    slug: snapshot.experience.slug,
    title: snapshot.experience.title,
    description: snapshot.experience.description,
    place: snapshot.experience.place,
    startDate: snapshot.experience.startDate,
    endDate: snapshot.experience.endDate,
    phase: snapshot.experience.currentPhase,
    mosaicVisible: snapshot.experience.mosaicVisible,
    targetImageUrl: snapshot.experience.targetImageUrl,
    generatedMosaicUrl: snapshot.mosaic?.generatedImageUrl,
    stories,
    participants: snapshot.participants.filter((participant) => participant.isActive).map((participant) => participant.firstName),
    participantCount: snapshot.participants.filter((participant) => participant.isActive).length,
    totalPhotos: gallery.photos.length,
  };
}

async function createSignedUrl(supabase: NonNullable<ReturnType<typeof createBrowserSupabaseClient>>, path: string) {
  const { data } = await supabase.storage.from("mosaics").createSignedUrl(path, 60 * 60);
  return data?.signedUrl;
}

type SupabaseFinalExperienceRow = {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  place: string;
  start_date: string | null;
  end_date: string | null;
  current_phase: string;
  mosaic_visible: boolean;
};
