import type { ParticipantSession } from '@/lib/participant-session';
import { readLocalAdminState } from '@/lib/admin';
import { demoPhotos } from '@/lib/demo-data';
import { listLocalPhotoRecords } from '@/lib/supabase/photos';
import { createBrowserSupabaseClient, isDemoMode } from '@/lib/supabase/client';

export type Overview = { title: string; place: string; teamName: string; symbol: string; members: string[]; totalPhotos: number; teamPhotos: number; ownPhotos: number };
export async function loadOverview(session: ParticipantSession): Promise<Overview> {
  if (session.mode === 'demo' && isDemoMode()) {
    const state = readLocalAdminState();
    const team = state.teams.find(t => t.id === session.teamId);
    const visible = listLocalPhotoRecords().filter(p => p.experienceId === session.experienceId && (state.photoStatuses[p.id] ?? 'visible') === 'visible');
    return { title: state.experience.title, place: state.experience.place, teamName: team?.name ?? '', symbol: team?.symbol ?? '◌', members: state.participants.filter(p=>p.isActive && p.teamId===session.teamId).map(p=>p.firstName), totalPhotos: visible.length + demoPhotos.filter(p=>(state.photoStatuses[p.id] ?? 'visible') === 'visible').length, teamPhotos: visible.filter(p=>p.teamId===session.teamId).length + demoPhotos.filter(p=>p.team===team?.name && (state.photoStatuses[p.id] ?? 'visible') === 'visible').length, ownPhotos: visible.filter(p=>p.participantId===session.participantId).length };
  }
  const supabase = createBrowserSupabaseClient();
  if (!supabase) throw new Error('Not configured');
  const [experience, team, memberships, photos] = await Promise.all([
    supabase.from('experiences').select('title, place').eq('id',session.experienceId).single(),
    session.teamId ? supabase.from('teams').select('name, symbol').eq('id',session.teamId).single() : Promise.resolve({data:null,error:null}),
    session.teamId ? supabase.from('team_members').select('participants(first_name)').eq('team_id',session.teamId) : Promise.resolve({data:[],error:null}),
    supabase.from('photos').select('team_id, participant_id').eq('experience_id',session.experienceId).eq('status','visible'),
  ]);
  if (experience.error || team.error || memberships.error || photos.error) throw experience.error ?? team.error ?? memberships.error ?? photos.error;
  // SAFETY: team_members.participant_id references one participants primary-key row.
  // Without generated Supabase schema types the client incorrectly infers an array.
  return { title: experience.data.title, place: experience.data.place, teamName: team.data?.name ?? '', symbol: team.data?.symbol ?? '◌', members: ((memberships.data ?? []) as unknown as Array<{participants: {first_name:string} | null}>).flatMap(m=>m.participants ? [m.participants.first_name] : []), totalPhotos: photos.data?.length ?? 0, teamPhotos: photos.data?.filter(p=>p.team_id===session.teamId).length ?? 0, ownPhotos: photos.data?.filter(p=>p.participant_id===session.participantId).length ?? 0 };
}
