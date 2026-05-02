import type { SQLiteDatabase } from "expo-sqlite";

interface Migration {
  version: number;
  up: (db: SQLiteDatabase) => Promise<void>;
}

const migrations: Migration[] = [
  {
    version: 1,
    up: async (db) => {
      await db.execAsync(`
        -- Auth
        CREATE TABLE IF NOT EXISTS users (
          user_id INTEGER PRIMARY KEY,
          username TEXT NOT NULL,
          roles_json TEXT NOT NULL DEFAULT '[]'
        );

        -- Projects
        CREATE TABLE IF NOT EXISTS projects (
          id INTEGER PRIMARY KEY,
          name TEXT NOT NULL,
          description TEXT,
          type_id INTEGER,
          role_name TEXT,
          raw_json TEXT NOT NULL
        );

        -- Producers
        CREATE TABLE IF NOT EXISTS producers (
          id INTEGER PRIMARY KEY,
          project_id INTEGER NOT NULL,
          identification TEXT NOT NULL,
          first_name TEXT NOT NULL,
          middle_name TEXT,
          first_surname TEXT NOT NULL,
          last_surname TEXT,
          email TEXT,
          phone TEXT,
          raw_json TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_producers_project_id ON producers(project_id);

        -- Producer details
        CREATE TABLE IF NOT EXISTS producer_details (
          id INTEGER PRIMARY KEY,
          raw_json TEXT NOT NULL
        );

        -- Survey components
        CREATE TABLE IF NOT EXISTS components (
          id INTEGER PRIMARY KEY,
          name TEXT NOT NULL,
          description TEXT,
          raw_json TEXT NOT NULL
        );

        -- Question types
        CREATE TABLE IF NOT EXISTS question_types (
          id INTEGER PRIMARY KEY,
          name TEXT NOT NULL
        );

        -- Questions
        CREATE TABLE IF NOT EXISTS questions (
          id INTEGER PRIMARY KEY,
          name TEXT NOT NULL,
          component_id INTEGER NOT NULL,
          question_type_id INTEGER NOT NULL,
          is_required INTEGER DEFAULT 0,
          sort_order INTEGER DEFAULT 0,
          raw_json TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_questions_component_id ON questions(component_id);

        -- Question details (type-specific)
        CREATE TABLE IF NOT EXISTS question_details (
          question_id INTEGER PRIMARY KEY,
          type_name TEXT NOT NULL,
          raw_json TEXT NOT NULL
        );

        -- Innova fields
        CREATE TABLE IF NOT EXISTS innova_fields (
          id INTEGER PRIMARY KEY,
          name TEXT NOT NULL,
          field_type TEXT,
          raw_json TEXT NOT NULL
        );

        -- Survey answers (offline writes)
        CREATE TABLE IF NOT EXISTS survey_answers (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          producer_id INTEGER NOT NULL,
          project_id INTEGER NOT NULL,
          component_id INTEGER NOT NULL,
          question_id INTEGER NOT NULL,
          value TEXT,
          answered_at TEXT NOT NULL DEFAULT (datetime('now')),
          UNIQUE(producer_id, project_id, component_id, question_id)
        );

        CREATE INDEX IF NOT EXISTS idx_survey_answers_producer ON survey_answers(producer_id, project_id);

        -- Sync queue
        CREATE TABLE IF NOT EXISTS sync_queue (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          entity_type TEXT NOT NULL,
          entity_key TEXT NOT NULL,
          payload TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'pending',
          attempts INTEGER NOT NULL DEFAULT 0,
          last_error TEXT,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE INDEX IF NOT EXISTS idx_sync_queue_status ON sync_queue(status);
        CREATE INDEX IF NOT EXISTS idx_sync_queue_user ON sync_queue(user_id);

        -- Prevent duplicate sync queue entries for same entity (UPSERT semantics)
        CREATE UNIQUE INDEX IF NOT EXISTS idx_sync_queue_entity_key
          ON sync_queue(entity_type, entity_key);

        -- Sync metadata
        CREATE TABLE IF NOT EXISTS sync_metadata (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL,
          updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        -- Migrations tracking
        CREATE TABLE IF NOT EXISTS _migrations (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          version INTEGER NOT NULL UNIQUE,
          applied_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
      `);
    },
  },
  {
    version: 2,
    up: async (db) => {
      // Add user_id to survey_answers to track which extensionist created each answer
      await db.execAsync(`
        ALTER TABLE survey_answers ADD COLUMN user_id INTEGER;
      `);

      // Add user_id to sync_queue to track which extensionist queued each item
      await db.execAsync(`
        ALTER TABLE sync_queue ADD COLUMN user_id INTEGER;
      `);

      // Create index for faster filtering by user
      await db.execAsync(`
        CREATE INDEX IF NOT EXISTS idx_survey_answers_user ON survey_answers(user_id);
        CREATE INDEX IF NOT EXISTS idx_sync_queue_user ON sync_queue(user_id);
      `);

      // Update unique constraint for survey_answers to include user_id
      // SQLite doesn't support ALTER CONSTRAINT, so we recreate the table
      await db.execAsync(`
        CREATE TABLE survey_answers_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          producer_id INTEGER NOT NULL,
          project_id INTEGER NOT NULL,
          component_id INTEGER NOT NULL,
          question_id INTEGER NOT NULL,
          user_id INTEGER NOT NULL,
          value TEXT,
          answered_at TEXT NOT NULL DEFAULT (datetime('now')),
          UNIQUE(producer_id, project_id, component_id, question_id, user_id)
        );

        INSERT INTO survey_answers_new (id, producer_id, project_id, component_id, question_id, user_id, value, answered_at)
        SELECT id, producer_id, project_id, component_id, question_id, COALESCE(user_id, 0), value, answered_at
        FROM survey_answers;

        DROP TABLE survey_answers;
        ALTER TABLE survey_answers_new RENAME TO survey_answers;

        CREATE INDEX IF NOT EXISTS idx_survey_answers_producer ON survey_answers(producer_id, project_id);
        CREATE INDEX IF NOT EXISTS idx_survey_answers_user ON survey_answers(user_id);
      `);
    },
  },
  {
    version: 3,
    up: async (db) => {
      await db.execAsync(`
        CREATE TABLE IF NOT EXISTS productive_lines (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          producer_id INTEGER NOT NULL,
          project_id INTEGER NOT NULL,
          user_id INTEGER NOT NULL,
          line_type TEXT NOT NULL,
          line_count INTEGER NOT NULL DEFAULT 0,
          lines_data TEXT NOT NULL DEFAULT '[]',
          updated_at TEXT NOT NULL DEFAULT (datetime('now')),
          UNIQUE(producer_id, project_id, user_id)
        );

        CREATE INDEX IF NOT EXISTS idx_productive_lines_producer ON productive_lines(producer_id, project_id);
      `);
    },
  },
  {
    version: 4,
    up: async (db) => {
      const columns = await db.getAllAsync<{ name: string }>(
        "PRAGMA table_info(users);",
      );
      const hasFirstName = columns.some((c) => c.name === "first_name");
      const hasLastName = columns.some((c) => c.name === "last_name");

      if (!hasFirstName) {
        await db.execAsync(`
          ALTER TABLE users ADD COLUMN first_name TEXT;
        `);
      }

      if (!hasLastName) {
        await db.execAsync(`
          ALTER TABLE users ADD COLUMN last_name TEXT;
        `);
      }
    },
  },
{
    version: 5,
    up: async (db) => {
      await db.execAsync(`
        CREATE UNIQUE INDEX IF NOT EXISTS idx_sync_queue_entity_key
          ON sync_queue(entity_type, entity_key);
      `);
    },
  },
  {
    version: 6,
    up: async (db) => {
      await db.execAsync(`
        CREATE TABLE IF NOT EXISTS answer_updates (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          answer_id INTEGER NOT NULL,
          new_value TEXT NOT NULL,
          producer_id INTEGER NOT NULL,
          project_id INTEGER NOT NULL,
          component_id INTEGER NOT NULL,
          question_id INTEGER NOT NULL,
          user_id INTEGER NOT NULL,
          intervention_method_id INTEGER NOT NULL,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          UNIQUE(answer_id)
        );

        CREATE INDEX IF NOT EXISTS idx_answer_updates_user
          ON answer_updates(user_id);

        CREATE TABLE IF NOT EXISTS visit1_queue (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          visit_uuid TEXT NOT NULL UNIQUE,
          payload TEXT NOT NULL,
          photos TEXT NOT NULL DEFAULT '[]',
          user_id INTEGER NOT NULL,
          status TEXT NOT NULL DEFAULT 'pending',
          attempts INTEGER NOT NULL DEFAULT 0,
          last_error TEXT,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE INDEX IF NOT EXISTS idx_visit1_queue_status ON visit1_queue(status);
        CREATE INDEX IF NOT EXISTS idx_visit1_queue_user ON visit1_queue(user_id);
      `);
    },
  },
  {
    version: 7,
    up: async (db) => {
      await db.execAsync(`
        ALTER TABLE survey_answers ADD COLUMN local_modified_at TEXT;
      `);
    },
  },
  {
    version: 8,
    up: async (db) => {
      await db.execAsync(`
        CREATE TABLE IF NOT EXISTS producer_intervention_methods (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          producer_id INTEGER NOT NULL,
          project_id INTEGER NOT NULL,
          intervention_method_id INTEGER NOT NULL,
          user_id INTEGER NOT NULL,
          applied_at TEXT NOT NULL DEFAULT (datetime('now')),
          UNIQUE(producer_id, project_id, intervention_method_id, user_id)
        );

        CREATE INDEX IF NOT EXISTS idx_pim_producer
          ON producer_intervention_methods(producer_id, project_id);

        CREATE INDEX IF NOT EXISTS idx_pim_user
          ON producer_intervention_methods(user_id);
      `);
    },
  },
];

export async function runMigrations(db: SQLiteDatabase): Promise<void> {
  // Ensure _migrations table exists first
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      version INTEGER NOT NULL UNIQUE,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  const appliedRows = await db.getAllAsync<{ version: number }>(
    "SELECT version FROM _migrations ORDER BY version",
  );
  const appliedVersions = new Set(appliedRows.map((r) => r.version));

  for (const migration of migrations) {
    if (appliedVersions.has(migration.version)) continue;

    await db.execAsync("BEGIN TRANSACTION;");
    try {
      await migration.up(db);
      await db.runAsync(
        "INSERT INTO _migrations (version) VALUES (?)",
        migration.version,
      );
      await db.execAsync("COMMIT;");
    } catch (error) {
      await db.execAsync("ROLLBACK;");
      throw new Error(
        `Migration v${migration.version} failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
