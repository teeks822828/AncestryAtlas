const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'ancestry-atlas.db');

let db = null;

// Ensure the directory for DB_PATH exists
const dbDir = path.dirname(DB_PATH);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

// Save database to file
function saveDatabase() {
  if (db) {
    const data = db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(DB_PATH, buffer);
  }
}

// Initialize database
async function initializeDatabase() {
  const SQL = await initSqlJs();

  // Try to load existing database
  try {
    if (fs.existsSync(DB_PATH)) {
      const fileBuffer = fs.readFileSync(DB_PATH);
      db = new SQL.Database(fileBuffer);
      console.log('Loaded existing database');
    } else {
      db = new SQL.Database();
      console.log('Created new database');
    }
  } catch (err) {
    console.log('Creating new database:', err.message);
    db = new SQL.Database();
  }

  // Create tables
  db.run(`
    CREATE TABLE IF NOT EXISTS families (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      host_user_id INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT,
      name TEXT NOT NULL,
      family_id INTEGER,
      google_id TEXT UNIQUE,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (family_id) REFERENCES families(id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      event_date DATE NOT NULL,
      end_date DATE,
      latitude REAL NOT NULL,
      longitude REAL NOT NULL,
      category TEXT DEFAULT 'other',
      source TEXT DEFAULT 'manual',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  // Migrations for existing DBs
  try { db.run("ALTER TABLE events ADD COLUMN end_date DATE"); } catch (e) {}
  try { db.run("ALTER TABLE events ADD COLUMN category TEXT DEFAULT 'other'"); } catch (e) {}
  try { db.run("ALTER TABLE events ADD COLUMN source TEXT DEFAULT 'manual'"); } catch (e) {}
  try { db.run("ALTER TABLE users ADD COLUMN google_id TEXT UNIQUE"); } catch (e) {}

  // Photos table
  db.run(`
    CREATE TABLE IF NOT EXISTS event_photos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_id INTEGER NOT NULL,
      filename TEXT NOT NULL,
      original_name TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE
    )
  `);

  // Comments table
  db.run(`
    CREATE TABLE IF NOT EXISTS comments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      text TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  // Create family_requests table for invite system
  db.run(`
    CREATE TABLE IF NOT EXISTS family_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      requester_id INTEGER NOT NULL,
      family_id INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (requester_id) REFERENCES users(id),
      FOREIGN KEY (family_id) REFERENCES families(id)
    )
  `);

  // Create notifications table
  db.run(`
    CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      type TEXT NOT NULL,
      message TEXT NOT NULL,
      data TEXT,
      read INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  // GEDCOM people table (parsed individuals from .ged files)
  db.run(`
    CREATE TABLE IF NOT EXISTS gedcom_people (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      gedcom_id TEXT NOT NULL,
      name TEXT NOT NULL,
      birth_date TEXT, birth_place TEXT,
      death_date TEXT, death_place TEXT,
      sex TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  // GEDCOM families table (FAM records — parent/spouse links)
  db.run(`
    CREATE TABLE IF NOT EXISTS gedcom_families (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      gedcom_fam_id TEXT NOT NULL,
      husband_gedcom_id TEXT,
      wife_gedcom_id TEXT,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  // GEDCOM children table (links children to FAM records)
  db.run(`
    CREATE TABLE IF NOT EXISTS gedcom_children (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      gedcom_family_id INTEGER NOT NULL,
      child_gedcom_id TEXT NOT NULL,
      FOREIGN KEY (gedcom_family_id) REFERENCES gedcom_families(id) ON DELETE CASCADE
    )
  `);

  // Family relationships table (live user relationships)
  db.run(`
    CREATE TABLE IF NOT EXISTS family_relationships (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      family_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      related_user_id INTEGER NOT NULL,
      relationship TEXT NOT NULL,
      FOREIGN KEY (family_id) REFERENCES families(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (related_user_id) REFERENCES users(id)
    )
  `);

  saveDatabase();
  console.log('Database initialized successfully');
}

// Helper to get single row with params
function getOne(sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  if (stmt.step()) {
    const row = stmt.getAsObject();
    stmt.free();
    return row;
  }
  stmt.free();
  return null;
}

// Helper to get all rows with params
function getAll(sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const results = [];
  while (stmt.step()) {
    results.push(stmt.getAsObject());
  }
  stmt.free();
  return results;
}

// Helper to run insert/update/delete with params
function run(sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  stmt.step();
  stmt.free();

  // Get last insert id
  const lastIdStmt = db.prepare('SELECT last_insert_rowid() as id');
  lastIdStmt.step();
  const lastId = lastIdStmt.getAsObject().id;
  lastIdStmt.free();

  const changes = db.getRowsModified();
  saveDatabase();

  return { lastInsertRowid: lastId, changes };
}

// User queries
const userQueries = {
  findByEmail: (email) => getOne('SELECT * FROM users WHERE email = ?', [email]),
  findPublicByEmail: (email) => getOne('SELECT id, email, name, family_id, created_at FROM users WHERE email = ?', [email]),
  findById: (id) => getOne('SELECT id, email, name, family_id, created_at FROM users WHERE id = ?', [id]),
  create: (email, passwordHash, name, familyId) =>
    run('INSERT INTO users (email, password_hash, name, family_id) VALUES (?, ?, ?, ?)',
      [email, passwordHash, name, familyId]),
  updateFamily: (familyId, userId) =>
    run('UPDATE users SET family_id = ? WHERE id = ?', [familyId, userId]),
  updateName: (name, userId) =>
    run('UPDATE users SET name = ? WHERE id = ?', [name, userId]),
  updatePassword: (passwordHash, userId) =>
    run('UPDATE users SET password_hash = ? WHERE id = ?', [passwordHash, userId]),
  findByIdFull: (id) => getOne('SELECT * FROM users WHERE id = ?', [id]),
  findByGoogleId: (googleId) => getOne('SELECT * FROM users WHERE google_id = ?', [googleId]),
  setGoogleId: (googleId, userId) =>
    run('UPDATE users SET google_id = ? WHERE id = ?', [googleId, userId]),
  createGoogleUser: (email, name, googleId) =>
    run('INSERT INTO users (email, password_hash, name, google_id) VALUES (?, NULL, ?, ?)',
      [email, name, googleId])
};

// Family queries
const familyQueries = {
  findById: (id) => getOne('SELECT * FROM families WHERE id = ?', [id]),
  create: (name, hostUserId) =>
    run('INSERT INTO families (name, host_user_id) VALUES (?, ?)', [name, hostUserId]),
  getMembers: (familyId) =>
    getAll('SELECT id, email, name, created_at FROM users WHERE family_id = ?', [familyId]),
  updateHost: (hostUserId, familyId) =>
    run('UPDATE families SET host_user_id = ? WHERE id = ?', [hostUserId, familyId])
};

// Event queries
const eventQueries = {
  findById: (id) => getOne('SELECT * FROM events WHERE id = ?', [id]),
  findByUserId: (userId) =>
    getAll('SELECT * FROM events WHERE user_id = ? ORDER BY event_date ASC', [userId]),
  findByUserIdAndSource: (userId, source) =>
    getAll('SELECT * FROM events WHERE user_id = ? AND source = ? ORDER BY event_date ASC', [userId, source]),
  findByFamilyId: (familyId) =>
    getAll(`
      SELECT e.*, u.name as user_name
      FROM events e
      JOIN users u ON e.user_id = u.id
      WHERE u.family_id = ?
      ORDER BY e.event_date ASC
    `, [familyId]),
  findByFamilyIdAndSource: (familyId, source) =>
    getAll(`
      SELECT e.*, u.name as user_name
      FROM events e
      JOIN users u ON e.user_id = u.id
      WHERE u.family_id = ? AND e.source = ?
      ORDER BY e.event_date ASC
    `, [familyId, source]),
  create: (userId, title, description, eventDate, endDate, latitude, longitude, category) =>
    run('INSERT INTO events (user_id, title, description, event_date, end_date, latitude, longitude, category) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [userId, title, description, eventDate, endDate, latitude, longitude, category || 'other']),
  createWithSource: (userId, title, description, eventDate, endDate, latitude, longitude, category, source) =>
    run('INSERT INTO events (user_id, title, description, event_date, end_date, latitude, longitude, category, source) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [userId, title, description, eventDate, endDate, latitude, longitude, category || 'other', source]),
  update: (title, description, eventDate, endDate, latitude, longitude, category, id) =>
    run('UPDATE events SET title = ?, description = ?, event_date = ?, end_date = ?, latitude = ?, longitude = ?, category = ? WHERE id = ?',
      [title, description, eventDate, endDate, latitude, longitude, category || 'other', id]),
  delete: (id) => run('DELETE FROM events WHERE id = ?', [id]),
  deleteByUserIdAndSource: (userId, source) =>
    run('DELETE FROM events WHERE user_id = ? AND source = ?', [userId, source])
};

// Family request queries
const requestQueries = {
  create: (requesterId, familyId) =>
    run('INSERT INTO family_requests (requester_id, family_id) VALUES (?, ?)', [requesterId, familyId]),
  findPending: (familyId) =>
    getAll(`
      SELECT fr.*, u.name as requester_name, u.email as requester_email
      FROM family_requests fr
      JOIN users u ON fr.requester_id = u.id
      WHERE fr.family_id = ? AND fr.status = 'pending'
      ORDER BY fr.created_at DESC
    `, [familyId]),
  findByRequesterAndFamily: (requesterId, familyId) =>
    getOne('SELECT * FROM family_requests WHERE requester_id = ? AND family_id = ? AND status = ?', [requesterId, familyId, 'pending']),
  updateStatus: (id, status) =>
    run('UPDATE family_requests SET status = ? WHERE id = ?', [status, id]),
  findById: (id) => getOne('SELECT * FROM family_requests WHERE id = ?', [id])
};

// Notification queries
const notificationQueries = {
  create: (userId, type, message, data) =>
    run('INSERT INTO notifications (user_id, type, message, data) VALUES (?, ?, ?, ?)',
      [userId, type, message, data || null]),
  getUnread: (userId) =>
    getAll('SELECT * FROM notifications WHERE user_id = ? AND read = 0 ORDER BY created_at DESC', [userId]),
  getAll: (userId) =>
    getAll('SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 50', [userId]),
  markRead: (id) =>
    run('UPDATE notifications SET read = 1 WHERE id = ?', [id]),
  markAllRead: (userId) =>
    run('UPDATE notifications SET read = 1 WHERE user_id = ?', [userId])
};

// Photo queries
const photoQueries = {
  create: (eventId, filename, originalName) =>
    run('INSERT INTO event_photos (event_id, filename, original_name) VALUES (?, ?, ?)',
      [eventId, filename, originalName]),
  findByEventId: (eventId) =>
    getAll('SELECT * FROM event_photos WHERE event_id = ? ORDER BY created_at ASC', [eventId]),
  findById: (id) => getOne('SELECT * FROM event_photos WHERE id = ?', [id]),
  delete: (id) => run('DELETE FROM event_photos WHERE id = ?', [id])
};

// Comment queries
const commentQueries = {
  findByEventId: (eventId) =>
    getAll(`
      SELECT c.*, u.name as user_name
      FROM comments c
      JOIN users u ON c.user_id = u.id
      WHERE c.event_id = ?
      ORDER BY c.created_at ASC
    `, [eventId]),
  create: (eventId, userId, text) =>
    run('INSERT INTO comments (event_id, user_id, text) VALUES (?, ?, ?)',
      [eventId, userId, text]),
  delete: (id) => run('DELETE FROM comments WHERE id = ?', [id]),
  findById: (id) => getOne('SELECT * FROM comments WHERE id = ?', [id])
};

// GEDCOM people queries
const gedcomPeopleQueries = {
  create: (userId, gedcomId, name, birthDate, birthPlace, deathDate, deathPlace, sex) =>
    run('INSERT INTO gedcom_people (user_id, gedcom_id, name, birth_date, birth_place, death_date, death_place, sex) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [userId, gedcomId, name, birthDate || null, birthPlace || null, deathDate || null, deathPlace || null, sex || null]),
  findByUserId: (userId) =>
    getAll('SELECT * FROM gedcom_people WHERE user_id = ? ORDER BY name ASC', [userId]),
  deleteByUserId: (userId) =>
    run('DELETE FROM gedcom_people WHERE user_id = ?', [userId])
};

// GEDCOM family queries
const gedcomFamilyQueries = {
  create: (userId, gedcomFamId, husbandGedcomId, wifeGedcomId) =>
    run('INSERT INTO gedcom_families (user_id, gedcom_fam_id, husband_gedcom_id, wife_gedcom_id) VALUES (?, ?, ?, ?)',
      [userId, gedcomFamId, husbandGedcomId || null, wifeGedcomId || null]),
  createChild: (gedcomFamilyId, childGedcomId) =>
    run('INSERT INTO gedcom_children (gedcom_family_id, child_gedcom_id) VALUES (?, ?)',
      [gedcomFamilyId, childGedcomId]),
  findByUserId: (userId) =>
    getAll('SELECT * FROM gedcom_families WHERE user_id = ?', [userId]),
  findChildrenByFamilyId: (gedcomFamilyId) =>
    getAll('SELECT * FROM gedcom_children WHERE gedcom_family_id = ?', [gedcomFamilyId]),
  deleteByUserId: (userId) => {
    // Delete children first (referencing gedcom_families)
    const families = getAll('SELECT id FROM gedcom_families WHERE user_id = ?', [userId]);
    for (const fam of families) {
      run('DELETE FROM gedcom_children WHERE gedcom_family_id = ?', [fam.id]);
    }
    return run('DELETE FROM gedcom_families WHERE user_id = ?', [userId]);
  }
};

// Family relationship queries (live users)
const familyRelationshipQueries = {
  create: (familyId, userId, relatedUserId, relationship) =>
    run('INSERT INTO family_relationships (family_id, user_id, related_user_id, relationship) VALUES (?, ?, ?, ?)',
      [familyId, userId, relatedUserId, relationship]),
  findByFamilyId: (familyId) =>
    getAll('SELECT * FROM family_relationships WHERE family_id = ?', [familyId]),
  findByUserId: (userId) =>
    getAll('SELECT * FROM family_relationships WHERE user_id = ? OR related_user_id = ?', [userId, userId]),
  delete: (id) => run('DELETE FROM family_relationships WHERE id = ?', [id]),
  findExisting: (familyId, userId, relatedUserId) =>
    getOne('SELECT * FROM family_relationships WHERE family_id = ? AND user_id = ? AND related_user_id = ?',
      [familyId, userId, relatedUserId]),
  deleteByPair: (familyId, userId, relatedUserId) =>
    run('DELETE FROM family_relationships WHERE family_id = ? AND ((user_id = ? AND related_user_id = ?) OR (user_id = ? AND related_user_id = ?))',
      [familyId, userId, relatedUserId, relatedUserId, userId])
};

module.exports = {
  initializeDatabase,
  userQueries,
  familyQueries,
  eventQueries,
  requestQueries,
  notificationQueries,
  photoQueries,
  commentQueries,
  gedcomPeopleQueries,
  gedcomFamilyQueries,
  familyRelationshipQueries,
  getDb: () => db
};
