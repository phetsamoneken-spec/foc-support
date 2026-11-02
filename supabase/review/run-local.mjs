/** Disposable in-memory PostgreSQL harness. No network or production credentials. */
import { readFile, readdir } from 'node:fs/promises';
const { PGlite } = await import(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const db = new PGlite();
const base = new URL('../', import.meta.url);
try {
 await db.exec(`create role anon; create role authenticated; create schema auth;
 create table auth.users(id uuid primary key,is_anonymous boolean default false);
 create table auth.sessions(id uuid primary key,user_id uuid references auth.users);
 create function auth.uid() returns uuid language sql stable as $$select (nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid$$;
 create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
 grant usage on schema auth to authenticated,anon;
 grant execute on function auth.uid(),auth.jwt() to authenticated,anon;`);
 const filenames = (await readdir(new URL('migrations/',base))).filter(p=>p.endsWith('_foc_phase1_schema.sql'));
 if (filenames.length!==1) throw Error('Expected one Phase 1 schema migration');
 const sql = await readFile(new URL('migrations/'+filenames[0],base),'utf8');
 await db.exec(sql); console.log('PASS migration');
 await db.exec(sql); console.log('PASS repeat migration');
 const tests=await readFile(new URL('tests/phase1-regression.sql',base),'utf8');
 await db.exec(tests);
 console.log('PASS SQL regression ('+(tests.match(/select pg_temp\.(assert_true|expect_error)\(/g)||[]).length+' assertions)');
 const workflows=await readFile(new URL('tests/phase1-workflows.sql',base),'utf8');
 await db.exec(workflows);
 console.log('PASS SQL workflows ('+(workflows.match(/select pg_temp\.(assert_true|expect_error)\(/g)||[]).length+' assertions)');
 const rollback=await readFile(new URL('review/rollback-empty.sql',base),'utf8');
 await db.exec("insert into public.mkt_customers(code,name,team,mde) values('ROLLBACK-GUARD','Synthetic','B1','MDE-B1')");
 let refused=false;
 try {await db.exec(rollback);} catch(error) {if(!error.message.includes('Refuse populated rollback')) throw error;refused=true;await db.exec('rollback');}
 if(!refused) throw Error('Populated rollback unexpectedly succeeded');
 const preserved=await db.query("select code from public.mkt_customers where code='ROLLBACK-GUARD'");
 if(preserved.rows.length!==1) throw Error('Rollback guard lost data');
 console.log('PASS populated rollback refuses without data loss');
 await db.exec("delete from public.mkt_customers where code='ROLLBACK-GUARD'");
 await db.exec(rollback);
 console.log('PASS empty-schema rollback');
 console.log('LIMIT: auth.users/auth.sessions/JWT functions are local stubs; Auth HTTP, PostgREST, concurrent connections and hosted advisors NOT TESTED.');
} catch(error) { console.error(error.message, error.where||'');process.exitCode=1; }
finally {await db.close();}
