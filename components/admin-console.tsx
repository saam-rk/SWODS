"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  ADMIN_STATE_EVENT,
  authenticateAdmin,
  authorizeDemoAdmin,
  createAdminExperience,
  createAdminChallenge,
  createAdminTeam,
  deleteAdminChallenge,
  deleteAdminPhoto,
  deleteAdminTeam,
  getAdminAccess,
  loadAdminSnapshot,
  saveAdminTargetImage,
  saveGeneratedMosaic,
  signOutAdmin,
  updateAdminChallenge,
  updateAdminExperience,
  updateAdminParticipant,
  updateAdminPhotoStatus,
  updateAdminTeam,
  assignAdminParticipant,
  type AdminAccess,
  type AdminChallenge,
  type AdminExperience,
  type AdminParticipant,
  type AdminSnapshot,
  type AdminTeam,
} from "@/lib/admin";
import { generateToneOpacityMosaic, downloadMosaic, type MosaicProgress } from "@/lib/mosaic";
import { experiencePhases, type ExperiencePhase } from "@/lib/experience-phase";
import { useLocale } from "@/components/locale-provider";
import { hasSupabaseConfig } from "@/lib/supabase/client";
import { buildMemoryUrl, issueMemoryLink, listMemoryLinks, revokeMemoryLink, type MemoryLink } from "@/lib/supabase/memory-links";
import type { Locale } from "@/lib/i18n";
import { Icon } from "@/components/ui/icons";

type AdminTab = "event" | "participants" | "teams" | "challenges" | "photos" | "final";

export function AdminConsole() {
  const { copy, locale } = useLocale();
  const [access, setAccess] = useState<AdminAccess | null>(null);
  const [checkingAccess, setCheckingAccess] = useState(true);
  const [snapshot, setSnapshot] = useState<AdminSnapshot | null>(null);
  const [activeTab, setActiveTab] = useState<AdminTab>("event");
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  const checkAccess = useCallback(async () => {
    setCheckingAccess(true);
    setError("");
    try {
      setAccess(await getAdminAccess());
    } catch {
      setError(copy.admin.accessDenied);
    } finally {
      setCheckingAccess(false);
    }
  }, [copy.admin.accessDenied]);

  const refresh = useCallback(async (nextAccess = access) => {
    if (!nextAccess) return;
    setError("");
    try {
      setSnapshot(await loadAdminSnapshot(nextAccess, locale, copy));
    } catch {
      setError(copy.admin.error);
    }
  }, [access, copy, locale]);

  useEffect(() => {
    void checkAccess();
  }, [checkAccess]);

  useEffect(() => {
    if (access) void refresh(access);
  }, [access, locale, refresh]);

  useEffect(() => {
    const handleStateChange = () => { if (access) void refresh(access); };
    window.addEventListener(ADMIN_STATE_EVENT, handleStateChange);
    return () => window.removeEventListener(ADMIN_STATE_EVENT, handleStateChange);
  }, [access, locale, refresh]);

  async function mutate(action: () => Promise<void>) {
    setError("");
    setSaved(false);
    try {
      await action();
      await refresh();
      setSaved(true);
      window.setTimeout(() => setSaved(false), 2200);
    } catch {
      setError(copy.admin.error);
    }
  }

  if (checkingAccess) return <main className="admin-gate admin-gate--loading" id="main-content"><span className="admin-loader" aria-hidden="true" /><p role="status">{copy.admin.loading}</p></main>;
  if (!access) return <AdminGate error={error} onAuthorized={(nextAccess) => setAccess(nextAccess)} onRefresh={() => void checkAccess()} />;
  if (!snapshot) return <main className="admin-gate admin-gate--loading" id="main-content"><span className="admin-loader" aria-hidden="true" /><p role="status">{copy.admin.loading}</p></main>;

  const tabItems: Array<{ id: AdminTab; label: string; mark: string }> = [
    { id: "event", label: copy.admin.tabs.event, mark: "01" },
    { id: "participants", label: copy.admin.tabs.participants, mark: "02" },
    { id: "teams", label: copy.admin.tabs.teams, mark: "03" },
    { id: "challenges", label: copy.admin.tabs.challenges, mark: "04" },
    { id: "photos", label: copy.admin.tabs.photos, mark: "05" },
    { id: "final", label: copy.admin.tabs.final, mark: "06" },
  ];

  return (
    <main className="admin-page" id="main-content">
      <header className="admin-header">
        <div className="admin-header__identity">
          <span className="brand-mark" aria-hidden="true" />
          <div>
          <h1>{copy.admin.title}</h1>
          <p>{copy.admin.subtitle}</p>
          </div>
        </div>
        <div className="admin-header__actions">
          <span className="admin-badge">{access.mode === "demo" ? copy.admin.demoBadge : copy.admin.supabaseBadge}</span>
          <button className="button button--ghost" onClick={() => void refresh()} type="button"><Icon name="refresh" />{copy.admin.refresh}</button>
          <button className="button button--ghost" onClick={() => void signOutAdmin(access).then(() => { setSnapshot(null); setAccess(null); }).catch(() => setError(copy.admin.error))} type="button"><span>{copy.admin.signOut}</span></button>
        </div>
      </header>

      <label className="admin-tab-select">
        <span className="sr-only">{copy.shell.menuLabel}</span>
        <select aria-label={copy.shell.menuLabel} onChange={(event) => setActiveTab(event.target.value as AdminTab)} value={activeTab}>
          {tabItems.map((item) => <option key={item.id} value={item.id}>{item.mark} · {item.label}</option>)}
        </select>
      </label>
      <nav className="admin-tabs" aria-label={copy.admin.title} role="tablist">
        {tabItems.map((item, itemIndex) => <button aria-controls="admin-panel" aria-selected={activeTab === item.id} className={`admin-tab${activeTab === item.id ? " admin-tab--active" : ""}`} id={`admin-tab-${item.id}`} key={item.id} onClick={() => setActiveTab(item.id)} onKeyDown={(event) => { if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return; event.preventDefault(); const offset = event.key === "ArrowRight" ? 1 : -1; const next = tabItems[(itemIndex + offset + tabItems.length) % tabItems.length]; setActiveTab(next.id); document.getElementById(`admin-tab-${next.id}`)?.focus(); }} role="tab" tabIndex={activeTab === item.id ? 0 : -1} type="button"><span aria-hidden="true">{item.mark}</span>{item.label}</button>)}
      </nav>

      {error ? <p className="form-message form-message--error admin-error" role="alert">{error}</p> : null}
      {saved ? <p className="admin-saved" role="status">{copy.admin.saved}</p> : null}

      <section aria-labelledby={`admin-tab-${activeTab}`} className="admin-workspace" id="admin-panel" role="tabpanel" tabIndex={0}>
        {activeTab === "event" ? <EventEditor access={access} experience={snapshot.experience} onCreate={async (input) => { const nextAccess = await createAdminExperience(access, input); setAccess(nextAccess); }} onSave={(patch) => void mutate(() => updateAdminExperience(access, patch))} /> : null}
        {activeTab === "participants" ? <ParticipantsEditor access={access} snapshot={snapshot} onMutate={mutate} /> : null}
        {activeTab === "teams" ? <TeamsEditor access={access} snapshot={snapshot} onMutate={mutate} /> : null}
        {activeTab === "challenges" ? <ChallengesEditor access={access} snapshot={snapshot} onMutate={mutate} /> : null}
        {activeTab === "photos" ? <PhotosEditor access={access} snapshot={snapshot} onMutate={mutate} /> : null}
        {activeTab === "final" ? <FinalEditor access={access} snapshot={snapshot} onMutate={mutate} /> : null}
      </section>
    </main>
  );
}

function AdminGate({ error, onAuthorized, onRefresh }: Readonly<{ error: string; onAuthorized: (access: AdminAccess) => void; onRefresh: () => void }>) {
  const { copy } = useLocale();
  const [code, setCode] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState(error);
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setSubmitting(true);
    if (hasSupabaseConfig()) {
      try {
        onAuthorized(await authenticateAdmin(email, password));
      } catch {
        setMessage(copy.admin.accessDenied);
        onRefresh();
      } finally {
        setSubmitting(false);
      }
      return;
    }
    if (authorizeDemoAdmin(code)) onAuthorized({ mode: "demo", experienceId: "demo-hervas" });
    else setMessage(copy.admin.accessDenied);
    setSubmitting(false);
  }

  return (
    <main className="admin-gate" id="main-content">
      <span className="brand-mark" aria-hidden="true" />
      <div className="admin-gate__copy"><h1>{copy.admin.accessTitle}</h1><p>{copy.admin.accessBody}</p></div>
      <form aria-busy={submitting} className="admin-gate__form" onSubmit={(event) => void submit(event)}>
        {hasSupabaseConfig() ? <>
          <label className="field"><span>{copy.admin.emailLabel}</span><input aria-describedby={message ? "admin-access-error" : undefined} aria-invalid={Boolean(message)} autoComplete="username" inputMode="email" onChange={(event) => setEmail(event.target.value)} required type="email" value={email} /></label>
          <label className="field"><span>{copy.admin.passwordLabel}</span><input aria-describedby={message ? "admin-access-error" : undefined} aria-invalid={Boolean(message)} autoComplete="current-password" onChange={(event) => setPassword(event.target.value)} required type="password" value={password} /></label>
        </> : <label className="field"><span>{copy.admin.accessCodeLabel}</span><input aria-describedby={message ? "admin-access-error" : "admin-access-hint"} aria-invalid={Boolean(message)} autoComplete="off" onChange={(event) => setCode(event.target.value)} placeholder={copy.admin.accessCodePlaceholder} value={code} /></label>}
        <button className="button button--primary" disabled={submitting} type="submit">{submitting ? copy.admin.signingIn : copy.admin.accessButton}<Icon name="arrow-right" /></button>
      </form>
      {!hasSupabaseConfig() ? <p className="field-hint" id="admin-access-hint">{copy.admin.accessHint}</p> : null}
      {message ? <p className="field-message field-message--error" id="admin-access-error" role="alert">{message}</p> : null}
    </main>
  );
}

function EventEditor({ access, experience, onCreate, onSave }: Readonly<{ access: AdminAccess; experience: AdminExperience; onCreate: (input: { slug: string; title: string; place: string; firstName: string; joinCode: string; supportedLanguages: Locale[] }) => Promise<void>; onSave: (patch: Partial<AdminExperience>) => void }>) {
  const { copy } = useLocale();
  const [draft, setDraft] = useState(experience);
  const [creating, setCreating] = useState(false);
  const [newField, setNewField] = useState({ slug: "", title: "", place: "", firstName: "", joinCode: "" });
  useEffect(() => setDraft(experience), [experience]);
  const phaseLabels: Record<ExperiencePhase, string> = {
    welcome: copy.admin.event.phaseWelcome,
    exploration: copy.admin.event.phaseExploration,
    selection: copy.admin.event.phaseSelection,
    presentation: copy.admin.event.phasePresentation,
    reveal: copy.admin.event.phaseReveal,
    finished: copy.admin.event.phaseFinished,
  };
  const stateLabels = { draft: copy.admin.event.draft, active: copy.admin.event.active, archived: copy.admin.event.archived };
  const toggleLanguage = (language: Locale) => setDraft((current) => ({ ...current, supportedLanguages: current.supportedLanguages.includes(language) ? current.supportedLanguages.filter((item) => item !== language) : [...current.supportedLanguages, language] }));

  return (
    <div className="admin-section">
      <SectionHeading eyebrow="01 / EVENT" title={copy.admin.event.title} body={copy.admin.event.body} />
      <div className="admin-form-grid">
        <label className="field field--wide"><span>{copy.admin.event.titleLabel}</span><input onChange={(event) => setDraft({ ...draft, title: event.target.value })} value={draft.title} /></label>
        <label className="field field--wide"><span>{copy.admin.event.descriptionLabel}</span><textarea onChange={(event) => setDraft({ ...draft, description: event.target.value })} rows={3} value={draft.description} /></label>
        <label className="field"><span>{copy.admin.event.placeLabel}</span><input onChange={(event) => setDraft({ ...draft, place: event.target.value })} value={draft.place} /></label>
        <label className="field"><span>{copy.admin.event.joinCodeLabel}</span><input onChange={(event) => setDraft({ ...draft, joinCode: event.target.value.toUpperCase() })} value={draft.joinCode} /></label>
        <label className="field"><span>{copy.admin.event.startLabel}</span><input onChange={(event) => setDraft({ ...draft, startDate: event.target.value })} type="date" value={draft.startDate} /></label>
        <label className="field"><span>{copy.admin.event.endLabel}</span><input onChange={(event) => setDraft({ ...draft, endDate: event.target.value })} type="date" value={draft.endDate} /></label>
        <label className="field"><span>{copy.admin.event.stateLabel}</span><select onChange={(event) => setDraft({ ...draft, state: event.target.value as AdminExperience["state"] })} value={draft.state}>{Object.entries(stateLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label className="field"><span>{copy.admin.event.phaseLabel}</span><select onChange={(event) => setDraft({ ...draft, currentPhase: event.target.value as ExperiencePhase })} value={draft.currentPhase}>{experiencePhases.map((phase) => <option key={phase} value={phase}>{phaseLabels[phase]}</option>)}</select></label>
      </div>
      <div className="admin-setting-row">
        <div><span className="utility-label">{copy.admin.event.languagesLabel}</span><div className="admin-language-list">{(["en", "es", "it"] as Locale[]).map((language) => <button aria-pressed={draft.supportedLanguages.includes(language)} className={`admin-choice${draft.supportedLanguages.includes(language) ? " admin-choice--active" : ""}`} key={language} onClick={() => toggleLanguage(language)} type="button">{language.toUpperCase()}</button>)}</div></div>
        <label className="admin-toggle"><input checked={draft.selectionEnabled} onChange={(event) => setDraft({ ...draft, selectionEnabled: event.target.checked })} type="checkbox" /><span>{copy.admin.event.selectionLabel}</span><small>{draft.selectionEnabled ? copy.admin.event.on : copy.admin.event.off}</small></label>
        <label className="field field--small"><span>{copy.admin.event.storyCountLabel}</span><input max={12} min={1} onChange={(event) => setDraft({ ...draft, storyCount: Number(event.target.value) })} type="number" value={draft.storyCount} /></label>
        <label className="admin-toggle"><input checked={!draft.mosaicVisible} onChange={(event) => setDraft({ ...draft, mosaicVisible: !event.target.checked })} type="checkbox" /><span>{copy.admin.event.mosaicHidden}</span><small>{!draft.mosaicVisible ? copy.admin.event.on : copy.admin.event.off}</small></label>
      </div>
      <div className="admin-actions"><p className="form-hint"><span className="form-hint__dot" aria-hidden="true" />{copy.admin.event.note}</p><div className="admin-actions--wrap"><button className="button button--primary" onClick={() => onSave(draft)} type="button">{copy.admin.save}<span aria-hidden="true">↗</span></button><button className="button button--quiet" onClick={() => setCreating((current) => !current)} type="button">{creating ? copy.common.close : copy.admin.event.newExperience}<span aria-hidden="true">{creating ? "×" : "+"}</span></button></div></div>
      {creating ? <form className="admin-inline-form" onSubmit={(event) => { event.preventDefault(); void onCreate({ ...newField, supportedLanguages: draft.supportedLanguages }).then(() => setCreating(false)); }}><p className="utility-label">{copy.admin.event.createExperience}</p><div className="admin-form-grid admin-form-grid--inline"><label className="field"><span>{copy.admin.event.titleLabel}</span><input required onChange={(event) => setNewField({ ...newField, title: event.target.value })} value={newField.title} /></label><label className="field"><span>{copy.admin.event.placeLabel}</span><input required onChange={(event) => setNewField({ ...newField, place: event.target.value })} value={newField.place} /></label><label className="field"><span>{copy.admin.event.joinCodeLabel}</span><input required onChange={(event) => setNewField({ ...newField, joinCode: event.target.value.toUpperCase() })} value={newField.joinCode} /></label><label className="field"><span>{copy.admin.event.slugLabel}</span><input required onChange={(event) => setNewField({ ...newField, slug: event.target.value })} value={newField.slug} /></label><label className="field"><span>{copy.admin.event.adminNameLabel}</span><input required onChange={(event) => setNewField({ ...newField, firstName: event.target.value })} value={newField.firstName} /></label><button className="button button--primary" type="submit">{copy.admin.event.createExperience}<span aria-hidden="true">↗</span></button></div></form> : null}
    </div>
  );
}

function ParticipantsEditor({ access, snapshot, onMutate }: Readonly<{ access: AdminAccess; snapshot: AdminSnapshot; onMutate: (action: () => Promise<void>) => Promise<void> }>) {
  const { copy } = useLocale();
  return (
    <div className="admin-section">
      <SectionHeading eyebrow="02 / PEOPLE" title={copy.admin.participants.title} body={copy.admin.participants.body} aside={`${snapshot.participants.length} ${copy.common.perspectives}`} />
      <div className="admin-table admin-table--people">
        <div className="admin-table__head"><span>{copy.admin.participants.name}</span><span>{copy.admin.participants.country}</span><span>{copy.admin.participants.team}</span><span>{copy.admin.participants.status}</span><span /></div>
        {snapshot.participants.map((participant) => <ParticipantRow access={access} key={participant.id} participant={participant} snapshot={snapshot} onMutate={onMutate} />)}
      </div>
    </div>
  );
}

function ParticipantRow({ access, participant, snapshot, onMutate }: Readonly<{ access: AdminAccess; participant: AdminParticipant; snapshot: AdminSnapshot; onMutate: (action: () => Promise<void>) => Promise<void> }>) {
  const { copy } = useLocale();
  const [name, setName] = useState(participant.firstName);
  const [teamId, setTeamId] = useState(participant.teamId ?? "");
  useEffect(() => { setName(participant.firstName); setTeamId(participant.teamId ?? ""); }, [participant]);
  const activeAction = participant.isActive ? async () => { if (window.confirm(copy.admin.participants.removeConfirm)) await updateAdminParticipant(access, participant.id, { firstName: name, isActive: false }); } : () => updateAdminParticipant(access, participant.id, { firstName: name, isActive: true });
  return (
    <div className={`admin-table__row${participant.isActive ? "" : " admin-table__row--muted"}`}>
      <label className="admin-mobile-field"><span>{copy.admin.participants.name}</span><input onChange={(event) => setName(event.target.value)} value={name} /></label>
      <span className="admin-mobile-value" data-label={copy.admin.participants.country}>{participant.countryCode || "—"}</span>
      <label className="admin-mobile-field"><span>{copy.admin.participants.team}</span><select onChange={(event) => { const next = event.target.value; setTeamId(next); void onMutate(() => assignAdminParticipant(access, participant.id, next || null)); }} value={teamId}><option value="">{copy.admin.participants.unassigned}</option>{snapshot.teams.map((team) => <option key={team.id} value={team.id}>{team.symbol} {team.name}</option>)}</select></label>
      <span className="admin-status" data-label={copy.admin.participants.status}>{participant.isActive ? copy.admin.participants.active : copy.admin.participants.paused}</span>
      <div className="admin-row-actions"><button className="button button--quiet" onClick={() => void onMutate(() => updateAdminParticipant(access, participant.id, { firstName: name, isActive: participant.isActive }))} type="button">{copy.admin.participants.save}</button><button className="text-link" onClick={() => void onMutate(activeAction)} type="button"><span>{participant.isActive ? copy.admin.participants.remove : copy.admin.participants.restore}</span></button></div>
    </div>
  );
}

function TeamsEditor({ access, snapshot, onMutate }: Readonly<{ access: AdminAccess; snapshot: AdminSnapshot; onMutate: (action: () => Promise<void>) => Promise<void> }>) {
  const { copy } = useLocale();
  const [newTeam, setNewTeam] = useState({ name: "", symbol: "◌", accent: "wood", displayOrder: snapshot.teams.length + 1 });
  return <div className="admin-section"><SectionHeading eyebrow="03 / TEAMS" title={copy.admin.teams.title} body={copy.admin.teams.body} /><div className="admin-team-list">{snapshot.teams.map((team) => <TeamRow access={access} key={team.id} team={team} onMutate={onMutate} />)}</div><div className="admin-inline-form"><p className="utility-label">{copy.admin.teams.new}</p><div className="admin-form-grid admin-form-grid--inline"><label className="field"><span>{copy.admin.teams.name}</span><input onChange={(event) => setNewTeam({ ...newTeam, name: event.target.value })} value={newTeam.name} /></label><label className="field field--tiny"><span>{copy.admin.teams.symbol}</span><input onChange={(event) => setNewTeam({ ...newTeam, symbol: event.target.value.slice(0, 2) })} value={newTeam.symbol} /></label><label className="field"><span>{copy.admin.teams.accent}</span><input onChange={(event) => setNewTeam({ ...newTeam, accent: event.target.value })} value={newTeam.accent} /></label><button className="button button--primary" disabled={!newTeam.name.trim()} onClick={() => void onMutate(async () => { await createAdminTeam(access, { ...newTeam, name: newTeam.name.trim() }); setNewTeam({ ...newTeam, name: "", displayOrder: newTeam.displayOrder + 1 }); })} type="button">{copy.admin.teams.new}<span aria-hidden="true">+</span></button></div></div></div>;
}

function TeamRow({ access, team, onMutate }: Readonly<{ access: AdminAccess; team: AdminTeam; onMutate: (action: () => Promise<void>) => Promise<void> }>) {
  const { copy } = useLocale();
  const [draft, setDraft] = useState(team);
  useEffect(() => setDraft(team), [team]);
  return (
    <div className="admin-team-row">
      <span className="admin-team-row__symbol" aria-hidden="true">{draft.symbol}</span>
      <label className="admin-mobile-field"><span>{copy.admin.teams.name}</span><input onChange={(event) => setDraft({ ...draft, name: event.target.value })} value={draft.name} /></label>
      <label className="admin-mobile-field admin-team-row__symbol-input"><span>{copy.admin.teams.symbol}</span><input maxLength={2} onChange={(event) => setDraft({ ...draft, symbol: event.target.value.slice(0, 2) })} value={draft.symbol} /></label>
      <label className="admin-mobile-field"><span>{copy.admin.teams.accent}</span><input onChange={(event) => setDraft({ ...draft, accent: event.target.value })} value={draft.accent} /></label>
      <span className="admin-team-row__count" data-label={copy.admin.teams.members.replace("{count}", "")}>{draft.memberCount}</span>
      <button className="button button--quiet" onClick={() => void onMutate(() => updateAdminTeam(access, team.id, { name: draft.name, symbol: draft.symbol, accent: draft.accent, displayOrder: draft.displayOrder }))} type="button">{copy.admin.teams.save}</button>
      <button className="text-link text-link--danger" onClick={() => { if (window.confirm(copy.admin.teams.deleteConfirm)) void onMutate(() => deleteAdminTeam(access, team.id)); }} type="button"><span>{copy.admin.teams.delete}</span></button>
    </div>
  );
}

function ChallengesEditor({ access, snapshot, onMutate }: Readonly<{ access: AdminAccess; snapshot: AdminSnapshot; onMutate: (action: () => Promise<void>) => Promise<void> }>) {
  const { copy, locale } = useLocale();
  const [newChallenge, setNewChallenge] = useState(false);
  return <div className="admin-section"><SectionHeading eyebrow="04 / INVITATIONS" title={copy.admin.challenges.title} body={copy.admin.challenges.body} aside={<button className="button button--primary" onClick={() => setNewChallenge(true)} type="button">{copy.admin.challenges.new}<span aria-hidden="true">+</span></button>} />{newChallenge ? <ChallengeEditor access={access} challenge={blankChallenge(snapshot.challenges.length + 1)} locale={locale} teams={snapshot.teams} isNew onCancel={() => setNewChallenge(false)} onMutate={async (action) => { await onMutate(action); setNewChallenge(false); }} /> : null}<div className="admin-challenge-list">{snapshot.challenges.map((challenge) => <ChallengeEditor access={access} challenge={challenge} isNew={false} key={challenge.id} locale={locale} teams={snapshot.teams} onMutate={onMutate} />)}</div></div>;
}

function ChallengeEditor({ access, challenge, isNew, locale, teams, onCancel, onMutate }: Readonly<{ access: AdminAccess; challenge: AdminChallenge; isNew: boolean; locale: Locale; teams: AdminTeam[]; onCancel?: () => void; onMutate: (action: () => Promise<void>) => Promise<void> }>) {
  const { copy } = useLocale();
  const [draft, setDraft] = useState(challenge);
  const [translationLocale, setTranslationLocale] = useState<Locale>(locale);
  useEffect(() => setDraft(challenge), [challenge]);
  const updateTranslation = (key: keyof AdminChallenge["translations"][Locale], value: string) => setDraft((current) => ({ ...current, translations: { ...current.translations, [translationLocale]: { ...current.translations[translationLocale], [key]: value } } }));
  const save = () => onMutate(() => isNew ? createAdminChallenge(access, draft) : updateAdminChallenge(access, draft.id, draft));
  return <article className={`admin-challenge-editor${isNew ? " admin-challenge-editor--new" : ""}`}><div className="admin-challenge-editor__top"><div><span className="admin-challenge-editor__number">{String(draft.displayOrder).padStart(2, "0")}</span><input className="admin-challenge-editor__slug" aria-label={copy.admin.challenges.slug} onChange={(event) => setDraft({ ...draft, slug: event.target.value })} value={draft.slug} /></div><div className="admin-challenge-editor__actions"><label className="admin-check"><input checked={draft.isActive} onChange={(event) => setDraft({ ...draft, isActive: event.target.checked })} type="checkbox" />{copy.admin.challenges.active}</label><button className="button button--quiet" onClick={save} type="button">{copy.admin.challenges.save}</button>{isNew ? <button className="text-link" onClick={onCancel} type="button"><span>{copy.common.close}</span></button> : <button className="text-link text-link--danger" onClick={() => { if (window.confirm(copy.admin.challenges.deleteConfirm)) void onMutate(() => deleteAdminChallenge(access, draft.id)); }} type="button"><span>{copy.admin.challenges.delete}</span></button>}</div></div><div className="admin-form-grid admin-form-grid--challenge"><label className="field"><span>{copy.admin.challenges.category}</span><input onChange={(event) => setDraft({ ...draft, category: event.target.value })} value={draft.category} /></label><label className="field"><span>{copy.admin.challenges.difficulty}</span><input onChange={(event) => setDraft({ ...draft, difficulty: event.target.value })} value={draft.difficulty} /></label><label className="field"><span>{copy.admin.challenges.order}</span><input min={1} onChange={(event) => setDraft({ ...draft, displayOrder: Number(event.target.value) })} type="number" value={draft.displayOrder} /></label><label className="field"><span>{copy.admin.challenges.maxPhotos}</span><input max={20} min={1} onChange={(event) => setDraft({ ...draft, maxPhotos: Number(event.target.value) })} type="number" value={draft.maxPhotos} /></label><label className="field"><span>{copy.admin.challenges.unlockPhase}</span><select onChange={(event) => setDraft({ ...draft, unlockPhase: event.target.value as ExperiencePhase })} value={draft.unlockPhase}>{experiencePhases.map((phase) => <option key={phase} value={phase}>{phase}</option>)}</select></label><label className="field"><span>{copy.admin.challenges.team}</span><select onChange={(event) => setDraft({ ...draft, assignedTeamId: event.target.value || null })} value={draft.assignedTeamId ?? ""}><option value="">{copy.admin.challenges.everyone}</option>{teams.map((team) => <option key={team.id} value={team.id}>{team.symbol} {team.name}</option>)}</select></label></div><div className="admin-checks"><label className="admin-check"><input checked={draft.required} onChange={(event) => setDraft({ ...draft, required: event.target.checked })} type="checkbox" />{copy.admin.challenges.required}</label><label className="admin-check"><input checked={draft.secret} onChange={(event) => setDraft({ ...draft, secret: event.target.checked })} type="checkbox" />{copy.admin.challenges.secret}</label></div><div className="admin-translation"><div className="admin-translation__tabs"><span className="utility-label">{copy.admin.challenges.locale}</span>{(["en", "es", "it"] as Locale[]).map((item) => <button className={translationLocale === item ? "admin-choice admin-choice--active" : "admin-choice"} key={item} onClick={() => setTranslationLocale(item)} type="button">{item.toUpperCase()}</button>)}</div><label className="field"><span>{copy.admin.challenges.titleLabel}</span><input onChange={(event) => updateTranslation("title", event.target.value)} value={draft.translations[translationLocale].title} /></label><label className="field"><span>{copy.admin.challenges.descriptionLabel}</span><textarea onChange={(event) => updateTranslation("description", event.target.value)} rows={2} value={draft.translations[translationLocale].description} /></label><label className="field"><span>{copy.admin.challenges.hintLabel}</span><input onChange={(event) => updateTranslation("hint", event.target.value)} value={draft.translations[translationLocale].hint} /></label></div></article>;
}

function PhotosEditor({ access, snapshot, onMutate }: Readonly<{ access: AdminAccess; snapshot: AdminSnapshot; onMutate: (action: () => Promise<void>) => Promise<void> }>) {
  const { copy } = useLocale();
  const [filter, setFilter] = useState<"all" | "visible" | "hidden">("all");
  const photos = useMemo(() => snapshot.photos.filter((photo) => photo.status !== "deleted" && (filter === "all" || photo.status === filter)), [filter, snapshot.photos]);
  return <div className="admin-section"><SectionHeading eyebrow="05 / PHOTOGRAPHS" title={copy.admin.photos.title} body={copy.admin.photos.body} /><div aria-label={copy.admin.photos.title} className="admin-filter-tabs" role="group">{(["all", "visible", "hidden"] as const).map((item) => <button aria-pressed={filter === item} className={filter === item ? "admin-choice admin-choice--active" : "admin-choice"} key={item} onClick={() => setFilter(item)} type="button">{copy.admin.photos[item]}</button>)}</div><div className="admin-photo-list">{photos.length === 0 ? <p className="admin-empty">{copy.admin.photos.empty}</p> : photos.map((photo) => <article className="admin-photo-row" key={photo.id}>{photo.thumbnailUrl ? <img alt={photo.caption} loading="lazy" src={photo.thumbnailUrl} /> : <div className={`photo-study photo-study--${photo.tone}`} aria-hidden="true" />}<div className="admin-photo-row__copy"><span className="utility-label">{photo.challengeTitle}</span><strong>{photo.caption}</strong><small>{copy.admin.photos.by.replace("{name}", photo.participantName).replace("{team}", photo.teamName)}</small>{photo.status === "hidden" ? <em>{copy.admin.photos.statusHidden}</em> : null}</div><div className="admin-row-actions"><button className="button button--quiet" onClick={() => void onMutate(() => updateAdminPhotoStatus(access, photo.id, photo.status === "hidden" ? "visible" : "hidden"))} type="button">{photo.status === "hidden" ? copy.admin.photos.unhide : copy.admin.photos.hide}</button><button className="text-link text-link--danger" onClick={() => { if (window.confirm(copy.admin.photos.deleteConfirm)) void onMutate(() => deleteAdminPhoto(access, photo)); }} type="button"><span>{copy.admin.photos.delete}</span></button></div></article>)}</div></div>;
}

function FinalEditor({ access, snapshot, onMutate }: Readonly<{ access: AdminAccess; snapshot: AdminSnapshot; onMutate: (action: () => Promise<void>) => Promise<void> }>) {
  const { copy } = useLocale();
  const [progress, setProgress] = useState<MosaicProgress | null>(null);
  const [targetError, setTargetError] = useState("");
  const abortRef = useRef<AbortController | null>(null);
  const targetUrl = snapshot.experience.targetImageUrl ?? snapshot.mosaic?.targetImageUrl;
  const photos = snapshot.photos.filter((photo) => photo.status !== "deleted");
  useEffect(() => () => abortRef.current?.abort(), []);

  async function handleTarget(file: File | undefined) {
    if (!file) return;
    setTargetError("");
    try {
      await onMutate(async () => { await saveAdminTargetImage(access, file); });
    } catch {
      setTargetError(copy.admin.error);
    }
  }

  async function generate() {
    if (!targetUrl || photos.length === 0) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setProgress({ completed: 0, total: 1 });
    try {
      const result = await generateToneOpacityMosaic(targetUrl, photos.map((photo) => ({ id: photo.id, src: photo.thumbnailUrl, tone: photo.tone })), { signal: controller.signal, onProgress: setProgress });
      await onMutate(() => saveGeneratedMosaic(access, result).then(() => undefined));
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError")) setTargetError(copy.admin.final.failed);
    } finally {
      setProgress(null);
      abortRef.current = null;
    }
  }

  return <div className="admin-section"><SectionHeading eyebrow="06 / FINAL" title={copy.admin.final.title} body={copy.admin.final.body} /><div className="final-admin-grid"><div className="target-panel viewfinder">{targetUrl ? <img alt={copy.admin.final.target} src={targetUrl} /> : <div className="target-panel__empty"><span aria-hidden="true">⌜ ⌝</span><p>{copy.admin.final.draft}</p></div>}<label className="button button--quiet target-panel__upload"><input accept="image/*" onChange={(event) => void handleTarget(event.target.files?.[0])} type="file" />{targetUrl ? copy.admin.final.replaceTarget : copy.admin.final.uploadTarget}<span aria-hidden="true">↗</span></label></div><div className="final-admin-copy"><p className="utility-label">{copy.admin.final.target}</p><p>{copy.admin.final.targetHelp}</p><p className="form-hint"><span className="form-hint__dot" aria-hidden="true" />{copy.admin.final.algorithm}</p><div className="mosaic-admin-status">{snapshot.mosaic?.generatedImageUrl ? <img alt={copy.admin.final.ready} src={snapshot.mosaic.generatedImageUrl} /> : <div className="mosaic-admin-status__blank"><span>∷</span>{progress ? copy.admin.final.generating.replace("{completed}", String(progress.completed)).replace("{total}", String(progress.total)) : copy.admin.final.draft}</div>}</div><div className="admin-actions admin-actions--wrap"><button className="button button--primary" disabled={!targetUrl || photos.length === 0 || Boolean(progress)} onClick={() => void generate()} type="button">{progress ? copy.admin.final.generating.replace("{completed}", String(progress.completed)).replace("{total}", String(progress.total)) : snapshot.mosaic?.generatedImageUrl ? copy.admin.final.regenerate : copy.admin.final.generate}<span aria-hidden="true">↗</span></button>{snapshot.mosaic?.generatedImageUrl ? <button className="button button--quiet" onClick={() => downloadMosaic(snapshot.mosaic?.generatedImageUrl ?? "", `${snapshot.experience.slug}-mosaic.jpg`)} type="button">{copy.admin.final.download}</button> : null}</div>{photos.length === 0 ? <p className="form-message form-message--error">{copy.admin.final.noPhotos}</p> : null}{targetError ? <p className="form-message form-message--error">{targetError}</p> : null}</div></div><div className="admin-final-controls"><label className="admin-toggle"><input checked={snapshot.experience.mosaicVisible} onChange={(event) => void onMutate(() => updateAdminExperience(access, { mosaicVisible: event.target.checked }))} type="checkbox" /><span>{copy.admin.final.reveal}</span><small>{copy.admin.final.revealHelp}</small></label><div className="admin-final-links"><Link className="button button--quiet" href="/present">{copy.admin.final.present}<span aria-hidden="true">↗</span></Link><Link className="button button--quiet" href="/reveal">{copy.admin.final.revealRoute}<span aria-hidden="true">↗</span></Link><Link className="button button--quiet" href={`/memory/${snapshot.experience.slug}`}>{copy.admin.final.memory}<span aria-hidden="true">↗</span></Link></div></div><MemoryLinkEditor access={access} experience={snapshot.experience} /></div>;
}

function MemoryLinkEditor({ access, experience }: Readonly<{ access: AdminAccess; experience: AdminExperience }>) {
  const { copy, locale } = useLocale();
  const [links, setLinks] = useState<MemoryLink[]>([]);
  const [issuedUrl, setIssuedUrl] = useState("");
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const shareReady = experience.mosaicVisible && (experience.currentPhase === "reveal" || experience.currentPhase === "finished");

  const refreshLinks = useCallback(async () => {
    if (access.mode !== "supabase") return;
    setLinks(await listMemoryLinks(experience.id));
  }, [access.mode, experience.id]);

  useEffect(() => {
    void refreshLinks().catch(() => setError(copy.admin.final.memoryLinkError));
  }, [copy.admin.final.memoryLinkError, refreshLinks]);

  if (access.mode !== "supabase") return null;

  async function createLink() {
    setLoading(true);
    setError("");
    try {
      const issued = await issueMemoryLink(experience.id, 30);
      const url = buildMemoryUrl(window.location.origin, experience.slug, issued.token);
      setIssuedUrl(url);
      await refreshLinks();
    } catch {
      setError(copy.admin.final.memoryLinkError);
    } finally {
      setLoading(false);
    }
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(issuedUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2200);
    } catch {
      setError(copy.admin.final.memoryLinkError);
    }
  }

  async function revoke(linkId: string) {
    setError("");
    try {
      await revokeMemoryLink(experience.id, linkId);
      await refreshLinks();
    } catch {
      setError(copy.admin.final.memoryLinkError);
    }
  }

  return (
    <section className="admin-inline-form" aria-labelledby="memory-links-title">
      <div>
        <h3 id="memory-links-title">{copy.admin.final.memoryLinksTitle}</h3>
        <p>{copy.admin.final.memoryLinksBody}</p>
      </div>
      {!shareReady ? <p className="form-hint">{copy.admin.final.memoryLinkUnavailable}</p> : null}
      <div className="admin-actions admin-actions--wrap">
        <button className="button button--primary" disabled={!shareReady || loading} onClick={() => void createLink()} type="button">{loading ? copy.admin.saving : copy.admin.final.createMemoryLink}</button>
        {issuedUrl ? <button className="button button--secondary" onClick={() => void copyLink()} type="button"><Icon name="share" />{copied ? copy.presentation.copied : copy.admin.final.copyMemoryLink}</button> : null}
      </div>
      {issuedUrl ? <><label className="field"><span>{copy.admin.final.memoryLinkValueLabel}</span><input onFocus={(event) => event.currentTarget.select()} readOnly value={issuedUrl} /></label><p className="form-message" role="status">{copy.admin.final.memoryLinkCreated}</p></> : null}
      {error ? <p className="form-message form-message--error" role="alert">{error}</p> : null}
      {links.length > 0 ? <div className="admin-team-list">{links.map((link) => <div className="admin-team-row" key={link.id}><span>{link.tokenHint}</span><span>{copy.admin.final.memoryLinkExpires.replace("{date}", new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(new Date(link.expiresAt)))}</span><span className="admin-status">{link.revokedAt ? copy.admin.final.memoryLinkRevoked : copy.admin.final.memoryLinkActive}</span>{!link.revokedAt ? <button className="button button--quiet" onClick={() => void revoke(link.id)} type="button">{copy.admin.final.revokeMemoryLink}</button> : null}</div>)}</div> : null}
    </section>
  );
}

function SectionHeading({ eyebrow, title, body, aside }: Readonly<{ eyebrow: string; title: string; body: string; aside?: React.ReactNode }>) {
  return <div className="admin-section__heading"><div><p className="eyebrow">{eyebrow}</p><h2>{title}</h2><p>{body}</p></div>{aside ? <div className="admin-section__aside">{aside}</div> : null}</div>;
}

function blankChallenge(order: number): AdminChallenge {
  const translation = { title: "", description: "", hint: "" };
  return { id: "", slug: "new-invitation", category: "attention", difficulty: "gentle", required: false, secret: false, assignedTeamId: null, maxPhotos: 1, unlockPhase: "exploration", isActive: true, displayOrder: order, translations: { en: translation, es: { ...translation }, it: { ...translation } } };
}
