import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { database, fixture, ids, login } from './helpers/database';

let db: PGlite;
beforeAll(async () => { db = await database(); await fixture(db); }, 30000);
afterAll(async () => { await db?.close(); });

describe.sequential('executed PostgreSQL permission boundaries', () => {
  it('joins and resumes the same participant/team without SQL ambiguity', async () => {
    await login(db);
    const r = await db.query<{participant_id:string;team_id:string}>("select * from join_experience(' hervas ','Audit',null,'en')");
    expect(r.rows[0]).toMatchObject({participant_id:ids.participant,team_id:ids.team});
    await db.query('update participants set onboarding_completed=true where id=$1',[ids.participant]);
    expect((await db.query<{onboarding_completed:boolean}>("select * from join_experience('HERVAS','Audit',null,'en')")).rows[0].onboarding_completed).toBe(true);
  });
  it('blocks role, identity, active-state and experience self-updates', async () => {
    await login(db);
    for (const sql of ['update participants set is_admin=true','update participants set is_active=true','update participants set user_id=null','update participants set experience_id=gen_random_uuid()']) {
      await expect(db.exec(sql)).rejects.toThrow(/permission denied/);
    }
  });
  it('blocks anonymous event creation and scoped admin edits work', async () => {
    await login(db);
    await expect(db.query("select * from create_experience_admin('rogue','Rogue','Here','Audit','ROGUE')")).rejects.toThrow(/administrator/);
    await login(db,ids.adminUser,false);
    expect((await db.query<{admin_update_participant:boolean}>('select admin_update_participant($1,$2,$3,false)',[ids.experience,ids.participant,'Paused'])).rows[0].admin_update_participant).toBe(true);
    await login(db);
    await expect(db.query("select * from join_experience('HERVAS','Audit',null,'en')")).rejects.toThrow(/paused/);
    expect((await db.query('select * from photos')).rows).toHaveLength(0);
    await login(db,ids.adminUser,false);
    await db.query('select admin_update_participant($1,$2,$3,true)',[ids.experience,ids.participant,'Audit']);
    await expect(db.query("select * from create_experience_admin('other','Other','Here','Admin','OTHER')")).resolves.toBeDefined();
  });
  it('hides moderated photos and files, secret challenges and translations', async () => {
    await login(db,ids.adminUser,false);
    await db.query("update photos set status='hidden' where id=$1",[ids.photo]);
    await db.query('update challenges set secret=true,assigned_team_id=$1 where id=$2',[ids.otherTeam,ids.challenge]);
    await login(db);
    expect((await db.query('select * from photos')).rows).toHaveLength(0);
    expect((await db.query('select * from storage.objects')).rows).toHaveLength(0);
    expect((await db.query('select * from challenges where id=$1',[ids.challenge])).rows).toHaveLength(0);
    expect((await db.query('select * from challenge_translations where challenge_id=$1',[ids.challenge])).rows).toHaveLength(0);
    expect((await db.query("update photos set status='visible' returning id")).rows).toHaveLength(0);
    await login(db,ids.adminUser,false);
    await db.query("update photos set status='visible' where id=$1",[ids.photo]);
    await db.query('update challenges set secret=false,assigned_team_id=null where id=$1',[ids.challenge]);
  });
  it('protects story phases, limits, deletion and reordering across gaps', async () => {
    await login(db);
    await expect(db.query('select * from select_story_photo($1,$2,$3)',[ids.experience,ids.team,ids.photo])).rejects.toThrow(/not open/);
    await login(db,ids.adminUser,false);
    await db.query("update experiences set current_phase='selection' where id=$1",[ids.experience]);
    await login(db);
    await db.query('select * from select_story_photo($1,$2,$3)',[ids.experience,ids.team,ids.photo]);
    await db.query('select * from move_story_selection($1,$2,$3,1::smallint)',[ids.experience,ids.team,ids.photo]);
    expect((await db.query('select * from story_selections')).rows).toHaveLength(1);
    await login(db,ids.adminUser,false);
    await db.query("update experiences set current_phase='finished' where id=$1",[ids.experience]);
    await login(db);
    expect((await db.query('delete from story_selections returning id')).rows).toHaveLength(0);
    expect((await db.query("update photos set caption='late change' returning id")).rows).toHaveLength(0);
    expect((await db.query('delete from storage.objects returning id')).rows).toHaveLength(0);
  });
  it('requires BOTH reveal visibility and the final phase; never exposes the target file', async () => {
    await db.exec('reset role');
    await db.query("insert into mosaics(experience_id,target_image_path,generated_image_path,status) values($1,$2,$3,'ready')",[ids.experience,`${ids.experience}/target/test.jpg`,`${ids.experience}/generated/test.jpg`]);
    await db.query("insert into storage.objects(bucket_id,name) values('mosaics',$1),('mosaics',$2)",[`${ids.experience}/target/test.jpg`,`${ids.experience}/generated/test.jpg`]);
    await login(db);
    expect((await db.query('select * from mosaics')).rows).toHaveLength(0);
    await login(db,ids.adminUser,false);
    await db.query('update experiences set mosaic_visible=true where id=$1',[ids.experience]);
    await login(db);
    expect((await db.query('select * from mosaics')).rows).toHaveLength(1);
    expect((await db.query("select * from storage.objects where bucket_id='mosaics'")).rows).toHaveLength(1);
    await login(db,ids.adminUser,false);
    await db.query("update experiences set current_phase='exploration' where id=$1",[ids.experience]);
    await login(db);
    expect((await db.query('select * from mosaics')).rows).toHaveLength(0);
  });
  it('validates bounds, removes public code lookup and refuses anonymous admin claims', async () => {
    await login(db,ids.adminUser,true);
    expect((await db.query<{allowed:boolean}>('select is_experience_admin($1) as allowed',[ids.experience])).rows[0].allowed).toBe(false);
    await login(db);
    await expect(db.query("select * from lookup_experience_by_join_code('HERVAS')")).rejects.toThrow(/permission denied/);
    await expect(db.query("select * from join_experience('HERVAS','A',null,'en')")).rejects.toThrow(/name/i);
    await login(db,ids.adminUser,false);
    await expect(db.query('update experiences set story_count=0 where id=$1',[ids.experience])).rejects.toThrow();
    await expect(db.query('update challenges set max_photos=0 where id=$1',[ids.challenge])).rejects.toThrow();
    await expect(db.query("update challenge_translations set title='' where challenge_id=$1",[ids.challenge])).rejects.toThrow();
  });
  it('enforces photo limits and handles selection gaps without unique conflicts', async () => {
    await login(db,ids.adminUser,false);
    await db.query('update challenges set max_photos=3 where id=$1',[ids.challenge]);
    const extra:string[]=[];
    for(let index=2;index<=4;index++) {
      const photo=`20000000-0000-4000-8000-00000000000${index}`;
      const path=`${ids.experience}/${ids.participant}/${photo}`;
      await login(db);
      await db.query("insert into storage.objects(bucket_id,name) values ('photos',$1),('photos',$2)",[`${path}/image.webp`,`${path}/thumbnail.webp`]);
      const insert=()=>db.query('select * from create_photo_record($1,$2,$3,$4,$5,$6,$7,null,null,true)',[photo,ids.experience,ids.participant,ids.team,ids.challenge,`${path}/image.webp`,`${path}/thumbnail.webp`]);
      if(index===4) await expect(insert()).rejects.toThrow(/limit/i);
      else {await insert();extra.push(photo);}
    }
    await login(db,ids.adminUser,false);await db.query("update experiences set current_phase='selection',story_count=2 where id=$1",[ids.experience]);
    await login(db);await db.query('select * from select_story_photo($1,$2,$3)',[ids.experience,ids.team,extra[0]]);
    await expect(db.query('select * from select_story_photo($1,$2,$3)',[ids.experience,ids.team,extra[1]])).rejects.toThrow(/full|limit/i);
    await db.query('delete from story_selections where photo_id=$1',[ids.photo]);
    await db.query('select * from select_story_photo($1,$2,$3)',[ids.experience,ids.team,extra[1]]);
    await db.query('select * from move_story_selection($1,$2,$3,-1::smallint)',[ids.experience,ids.team,extra[0]]);
    expect((await db.query<{position:number}>('select position from story_selections order by position')).rows.map(r=>r.position)).toEqual([1,2]);
    await login(db,ids.adminUser,false);await db.query("update experiences set current_phase='exploration' where id=$1",[ids.experience]);
  });
  it('counts own hidden photos without disclosing them', async () => {
    await login(db,ids.adminUser,false);await db.query("update photos set status='hidden' where id=$1",[ids.photo]);
    await login(db);
    expect((await db.query<{photo_count:number}>('select * from participant_photo_counts($1)',[ids.participant])).rows[0].photo_count).toBe(3);
    expect((await db.query('select * from participant_photo_counts($1)',[ids.peer])).rows).toHaveLength(0);
    await login(db,ids.adminUser,false);await db.query("update photos set status='visible' where id=$1",[ids.photo]);
  });
  it('rolls back the whole admin invitation edit when a translation fails', async () => {
    const settings={slug:'atomic-audit',category:'attention',difficulty:'gentle',required:false,secret:false,assigned_team_id:null,max_photos:1,unlock_phase:'exploration',is_active:true,display_order:10};
    const translations=['en','es','it'].map(locale=>({locale,title:'Audit',description:'Look closely',hint:''}));
    await login(db);
    await expect(db.query('select admin_save_challenge($1,null,$2,$3)',[ids.experience,settings,translations])).rejects.toThrow(/Administrator/);
    await login(db,ids.adminUser,false);
    await expect(db.query('select admin_save_challenge($1,null,$2,$3)',[ids.experience,settings,[translations[0],translations[1],{...translations[2],title:''}]])).rejects.toThrow();
    expect((await db.query("select * from challenges where slug='atomic-audit'")).rows).toHaveLength(0);
    const created=await db.query<{id:string}>('select admin_save_challenge($1,null,$2,$3) as id',[ids.experience,settings,translations]);
    const id=created.rows[0].id;
    await expect(db.query('select admin_save_challenge($1,$2,$3,$4)',[ids.experience,id,{...settings,max_photos:5},[translations[0],translations[1],{...translations[2],title:''}]])).rejects.toThrow();
    expect((await db.query<{max_photos:number}>('select max_photos from challenges where id=$1',[id])).rows[0].max_photos).toBe(1);
    expect((await db.query('select * from challenge_translations where challenge_id=$1',[id])).rows).toHaveLength(3);
  });
  it('durably queues files after row deletion and permits only owner/admin cleanup', async () => {
    await login(db);await db.query('delete from photos where id=$1',[ids.photo]);
    expect((await db.query('select * from photo_file_cleanup')).rows).toHaveLength(1);
    await db.query("select set_config('request.jwt.claim.sub',$1,false)",['10000000-0000-4000-8000-000000000099']);
    expect((await db.query('select * from photo_file_cleanup')).rows).toHaveLength(0);
    expect((await db.query('delete from storage.objects where name like $1 returning id',[`%/${ids.photo}/%`])).rows).toHaveLength(0);
    await login(db,ids.adminUser,false);await db.query("update experiences set current_phase='finished' where id=$1",[ids.experience]);
    await login(db);
    expect((await db.query('select * from storage.objects where name like $1',[`%/${ids.photo}/%`])).rows).toHaveLength(2);
    expect((await db.query('delete from storage.objects where name like $1 returning id',[`%/${ids.photo}/%`])).rows).toHaveLength(2);
    await db.query('delete from photo_file_cleanup where photo_id=$1',[ids.photo]);
    expect((await db.query('select * from photo_file_cleanup')).rows).toHaveLength(0);
  });
});
