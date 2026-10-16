import { DatabaseSync } from 'node:sqlite';
// Query-count scaling probe: run an operation at two dataset sizes; a count that grows with N is N+1.
function seed(n) { const db = new DatabaseSync(':memory:');
  db.exec('create table author(id integer primary key, name text); create table post(id integer primary key, author_id int, title text);');
  const ia = db.prepare('insert into author values(?,?)'), ip = db.prepare('insert into post values(?,?,?)');
  for (let i = 1; i <= n; i++) { ia.run(i, 'a' + i); ip.run(i, i, 't' + i); ip.run(n + i, i, 'u' + i); }
  return db; }
function counted(db) { const log = []; const prep = db.prepare.bind(db);
  return { log, prepare: (sql) => { const st = prep(sql); return { all: (...a) => (log.push(sql), st.all(...a)), get: (...a) => (log.push(sql), st.get(...a)) }; } }; }
const lazy = (db) => db.prepare('select * from author').all().map(a => ({ ...a, posts: db.prepare('select * from post where author_id=?').all(a.id) }));
const eager = (db) => { const as = db.prepare('select * from author').all(); const ps = db.prepare('select * from post where author_id in (select id from author)').all();
  return as.map(a => ({ ...a, posts: ps.filter(p => p.author_id === a.id) })); };
function probe(op) { const c = [10, 40].map(n => { const db = counted(seed(n)); op(db); return db.log.length; }); return { counts: c, scales: c[1] > c[0] }; }
console.log('lazy  (N+1):', probe(lazy));
console.log('eager (2 q):', probe(eager));
// plan scan probe
const db = seed(1000);
const plan = (sql) => db.prepare('explain query plan ' + sql).all().map(r => r.detail);
console.log('plan no index :', plan('select * from post where author_id=5'));
db.exec('create index post_author on post(author_id)');
console.log('plan w/ index :', plan('select * from post where author_id=5'));
