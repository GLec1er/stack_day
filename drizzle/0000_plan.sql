CREATE TABLE plans (
  user_id TEXT PRIMARY KEY NOT NULL,
  revision INTEGER NOT NULL DEFAULT 0,
  body TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
--> statement-breakpoint
CREATE TABLE snapshots (
  user_id TEXT NOT NULL,
  revision INTEGER NOT NULL,
  body TEXT NOT NULL,
  saved_at TEXT NOT NULL,
  PRIMARY KEY (user_id, revision)
);
