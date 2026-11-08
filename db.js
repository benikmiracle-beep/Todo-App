const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const dataDir = path.join(__dirname, 'data');
fs.mkdirSync(dataDir, { recursive: true });

const db = new Database(path.join(dataDir, 'doable.db'));
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    category TEXT,
    priority TEXT NOT NULL DEFAULT 'medium',
    due_date TEXT,
    due_time TEXT,
    done INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS preferences (
    user_id TEXT PRIMARY KEY,
    theme TEXT NOT NULL DEFAULT 'light',
    reminder_lead_minutes INTEGER NOT NULL DEFAULT 10,
    notifications_enabled INTEGER NOT NULL DEFAULT 1,
    upcoming_alerts INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS ai_messages (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
  );
`);

function normalizeUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    created_at: user.created_at,
    updated_at: user.updated_at,
  };
}

function getUserByEmail(email) {
  const row = db.prepare('SELECT * FROM users WHERE LOWER(email) = LOWER(?)').get(email);
  return normalizeUser(row);
}

function getUserById(id) {
  const row = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  return normalizeUser(row);
}

function createUser({ id, name, email, passwordHash }) {
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO users (id, name, email, password_hash, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(id, name, email, passwordHash, now, now);

  db.prepare(
    `INSERT INTO preferences (user_id, theme, reminder_lead_minutes, notifications_enabled, upcoming_alerts, created_at, updated_at)
     VALUES (?, 'light', 10, 1, 1, ?, ?)`
  ).run(id, now, now);

  return getUserById(id);
}

function listTasksByUser(userId) {
  return db
    .prepare('SELECT * FROM tasks WHERE user_id = ? ORDER BY due_date, due_time, created_at')
    .all(userId)
    .map((task) => ({
      id: task.id,
      title: task.title,
      description: task.description || '',
      category: task.category || 'General',
      priority: task.priority || 'medium',
      dueDate: task.due_date || '',
      dueTime: task.due_time || '',
      done: Boolean(task.done),
      createdAt: task.created_at,
      updatedAt: task.updated_at,
    }));
}

function replaceTasksForUser(userId, incomingTasks) {
  const transaction = db.transaction(() => {
    db.prepare('DELETE FROM tasks WHERE user_id = ?').run(userId);

    const rows = Array.isArray(incomingTasks) ? incomingTasks : [];
    for (const task of rows) {
      const id = task.id || `task-${Date.now()}-${Math.random().toString(16).slice(2)}`;
      db.prepare(
        `INSERT INTO tasks (id, user_id, title, description, category, priority, due_date, due_time, done, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        id,
        userId,
        String(task.title || 'Untitled task').trim() || 'Untitled task',
        task.description || '',
        task.category || 'General',
        task.priority || 'medium',
        task.dueDate || '',
        task.dueTime || '',
        task.done ? 1 : 0,
        new Date().toISOString(),
        new Date().toISOString()
      );
    }
  });

  transaction();
  return listTasksByUser(userId);
}

function getPreferences(userId) {
  const row = db.prepare('SELECT * FROM preferences WHERE user_id = ?').get(userId);
  if (!row) {
    return {
      theme: 'light',
      reminderLeadMinutes: 10,
      notificationsEnabled: true,
      upcomingAlerts: true,
    };
  }

  return {
    theme: row.theme || 'light',
    reminderLeadMinutes: Number(row.reminder_lead_minutes) || 10,
    notificationsEnabled: Boolean(row.notifications_enabled),
    upcomingAlerts: Boolean(row.upcoming_alerts),
  };
}

function savePreferences(userId, updates) {
  const current = getPreferences(userId);
  const next = {
    ...current,
    ...updates,
  };

  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO preferences (user_id, theme, reminder_lead_minutes, notifications_enabled, upcoming_alerts, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET
       theme = excluded.theme,
       reminder_lead_minutes = excluded.reminder_lead_minutes,
       notifications_enabled = excluded.notifications_enabled,
       upcoming_alerts = excluded.upcoming_alerts,
       updated_at = excluded.updated_at`
  ).run(
    userId,
    next.theme || 'light',
    Number(next.reminderLeadMinutes) || 10,
    next.notificationsEnabled ? 1 : 0,
    next.upcomingAlerts ? 1 : 0,
    now,
    now
  );

  return getPreferences(userId);
}

function addAiMessage(userId, role, content) {
  const id = `msg-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  db.prepare('INSERT INTO ai_messages (id, user_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)')
    .run(id, userId, role, String(content || '').slice(0, 4000), new Date().toISOString());
}

function getAiHistory(userId, limit = 20) {
  return db.prepare(
    'SELECT id, role, content, created_at FROM ai_messages WHERE user_id = ? ORDER BY created_at DESC LIMIT ?'
  ).all(userId, limit)
    .reverse()
    .map((row) => ({ id: row.id, role: row.role, content: row.content, createdAt: row.created_at }));
}

module.exports = {
  db,
  getUserByEmail,
  getUserById,
  createUser,
  listTasksByUser,
  replaceTasksForUser,
  getPreferences,
  savePreferences,
  addAiMessage,
  getAiHistory,
};
