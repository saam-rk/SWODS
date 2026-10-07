import type { AdminChallenge, AdminExperience, CreateExperienceInput } from '@/lib/admin';

export function validateExperience(patch: Partial<AdminExperience>) {
  if (patch.title !== undefined && (!patch.title.trim() || patch.title.length > 160)) throw new Error('A title of 1–160 characters is required.');
  if (patch.place !== undefined && (!patch.place.trim() || patch.place.length > 160)) throw new Error('A place of 1–160 characters is required.');
  if (patch.joinCode !== undefined && !/^[A-Z0-9-]{4,32}$/.test(patch.joinCode.trim().toUpperCase())) throw new Error('Use a join code of 4–32 letters, numbers or hyphens.');
  if (patch.startDate && patch.endDate && patch.startDate > patch.endDate) throw new Error('The end date must not precede the start date.');
  if (patch.supportedLanguages && (patch.supportedLanguages.length === 0 || patch.supportedLanguages.some(l=>!['en','es','it'].includes(l)))) throw new Error('Choose a supported language.');
  if (patch.storyCount !== undefined && (!Number.isInteger(patch.storyCount) || patch.storyCount < 1 || patch.storyCount > 12)) throw new Error('Choose 1–12 stories.');
}
export function validateNewExperience(input: CreateExperienceInput) {
  validateExperience(input);
  if (!/^[a-zA-Z0-9]+(-[a-zA-Z0-9]+)*$/.test(input.slug) || input.slug.length > 80 || !input.firstName.trim()) throw new Error('A URL slug and administrator name are required.');
}
export function validateChallenge(input: Omit<AdminChallenge,'id'>) {
  if (!input.slug.trim() || !Number.isInteger(input.maxPhotos) || input.maxPhotos < 1 || input.maxPhotos > 20 || !Number.isInteger(input.displayOrder) || input.displayOrder < 1) throw new Error('Invalid invitation settings.');
  if (input.secret && !input.assignedTeamId) throw new Error('Assign a team to a team-only invitation.');
  for (const translation of Object.values(input.translations)) {
    if (!translation.title.trim() || translation.title.length > 160 || !translation.description.trim() || translation.description.length > 2000) throw new Error('Complete all invitation translations.');
  }
}
