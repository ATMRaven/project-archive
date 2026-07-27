-- Cloudflare D1 Database Schema for Selected Work Project Archive

DROP TABLE IF EXISTS projects;
DROP TABLE IF EXISTS category_orders;
DROP TABLE IF EXISTS ping_logs;

CREATE TABLE projects (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  url TEXT NOT NULL,
  category TEXT,
  hidden INTEGER DEFAULT 0,
  display_order INTEGER DEFAULT 999999,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE category_orders (
  category TEXT PRIMARY KEY,
  display_order INTEGER DEFAULT 0
);

CREATE TABLE ping_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  status INTEGER NOT NULL,
  message TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_projects_hidden ON projects(hidden);
CREATE INDEX idx_projects_display_order ON projects(display_order);
CREATE INDEX idx_ping_logs_created_at ON ping_logs(created_at DESC);
