import { describe, expect, it, vi, afterEach } from 'vitest';
import { validateExperience, validateNewExperience, validateChallenge } from '@/lib/admin-validation';
import { getMosaicGrid } from '@/lib/mosaic';

afterEach(()=>{vi.unstubAllGlobals();vi.unstubAllEnvs();vi.resetModules();});
describe('production input boundaries',()=>{
  it('refuses an unconfigured production build unless demo mode is explicit',async()=>{
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL','');vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY','');vi.stubEnv('NEXT_PUBLIC_DEMO_MODE','false');
    const {default:config}=await import('../next.config');
    expect(()=>config('phase-production-build')).toThrow(/Command failed/);
    expect(()=>config('phase-development-server')).not.toThrow();
    vi.stubEnv('NEXT_PUBLIC_DEMO_MODE','true');expect(()=>config('phase-production-build')).not.toThrow();
    vi.stubEnv('NEXT_PUBLIC_DEMO_MODE','false');vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL','https://example.supabase.co');vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY','test-key');vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY','server-only-test-key');expect(()=>config('phase-production-build')).not.toThrow();
  });
  it('rejects blank event fields, invalid code, empty languages, reversed dates and invalid counts',()=>{
    for(const input of [{title:' '},{place:''},{joinCode:'a'},{supportedLanguages:[]},{startDate:'2026-02-02',endDate:'2026-01-01'},{storyCount:0},{storyCount:1.5}]) expect(()=>validateExperience(input)).toThrow();
    expect(()=>validateExperience({title:'A field',joinCode:'FIELD-1',supportedLanguages:['en'],storyCount:3})).not.toThrow();
  });
  it('rejects an invalid URL slug for a new event',()=>{
    expect(()=>validateNewExperience({title:'Event',place:'Here',firstName:'Admin',joinCode:'FIELD',slug:'../oops',supportedLanguages:['en']})).toThrow();
  });
  it('rejects incomplete challenge translations and unassigned secrets',()=>{
    const translation={title:'Title',description:'Description',hint:''};
    const input={slug:'invitation',category:'attention',difficulty:'gentle',required:false,secret:false,assignedTeamId:null,maxPhotos:1,unlockPhase:'exploration' as const,isActive:true,displayOrder:1,translations:{en:translation,es:translation,it:translation}};
    expect(()=>validateChallenge(input)).not.toThrow();
    expect(()=>validateChallenge({...input,secret:true})).toThrow();
    expect(()=>validateChallenge({...input,maxPhotos:0})).toThrow();
    expect(()=>validateChallenge({...input,translations:{...input.translations,it:{...translation,title:''}}})).toThrow();
  });
  it('bounds panoramic and very tall mosaics',()=>{
    expect(getMosaicGrid(1,100000,5)).toMatchObject({width:1,height:1600,rows:64});
    expect(()=>getMosaicGrid(100,100,3,{maxWidth:NaN})).toThrow();
    expect(()=>getMosaicGrid(100,100,3,{maxWidth:50000})).toThrow();
  });
  it('does not silently claim image persistence when storage is full',async()=>{
    vi.stubGlobal('window',{localStorage:{getItem:()=>null,setItem:()=>{throw new Error('QuotaExceeded');},removeItem:()=>{throw new Error('blocked');}}});
    const storage=await import('@/lib/browser-storage');
    expect(storage.writeBrowserStorage('swods-participant-session','session')).toBe(false);
    expect(storage.readBrowserStorage('swods-participant-session')).toBe('session');
    expect(storage.writeBrowserStorage('swods-local-photos','image')).toBe(false);
    expect(storage.readBrowserStorage('swods-local-photos')).toBeNull();
    storage.removeBrowserStorage('swods-participant-session');expect(storage.readBrowserStorage('swods-participant-session')).toBeNull();
  });
});
