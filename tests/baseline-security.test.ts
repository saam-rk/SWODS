import { it, expect } from 'vitest';
import { database, fixture, ids, login } from './helpers/database';

it('reproduces original security failures against migrations 001–005 (historical evidence)', async () => {
  const db = await database(5);
  try {
    await fixture(db);
    await login(db);
    await db.query('update participants set is_admin=true where id=$1', [ids.participant]);
    expect((await db.query<{allowed:boolean}>('select is_experience_admin($1) as allowed',[ids.experience])).rows[0].allowed).toBe(true);
    await db.exec('reset role');
    await db.query('update participants set is_admin=false, is_active=false where id=$1',[ids.participant]);
    await login(db);
    await expect(db.query("select * from join_experience('HERVAS','Audit',null,'en')")).rejects.toThrow(/ambiguous/);
    await db.exec('reset role');
    await db.query('update participants set is_active=true where id=$1',[ids.participant]);
    await db.query("update photos set status='hidden' where id=$1",[ids.photo]);
    await db.query('update challenges set secret=true, assigned_team_id=$1 where id=$2',[ids.otherTeam,ids.challenge]);
    await login(db);
    expect((await db.query('select * from photos where id=$1',[ids.photo])).rows).toHaveLength(1);
    expect((await db.query('select * from storage.objects')).rows).toHaveLength(2);
    expect((await db.query('select * from challenges where id=$1',[ids.challenge])).rows).toHaveLength(1);
    await db.exec("update experiences set current_phase='finished'"); // no authorized rows as ordinary member
    await db.exec('reset role');
    await db.query("update experiences set current_phase='finished' where id=$1",[ids.experience]);
    await login(db);
    await db.query("update photos set status='visible', caption='changed after finish' where id=$1",[ids.photo]);
    expect((await db.query<{caption:string}>('select caption from photos where id=$1',[ids.photo])).rows[0].caption).toBe('changed after finish');
    expect((await db.query('delete from storage.objects returning id')).rows).toHaveLength(2);
    const created = await db.query("select * from create_experience_admin('rogue','Rogue','Here','Audit','ROGUE')");
    expect(created.rows).toHaveLength(1);
  } finally { await db.close(); }
}, 30000);
