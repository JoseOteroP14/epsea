import * as SQLite from "expo-sqlite";
import { runMigrations } from "./migrations";

let db: SQLite.SQLiteDatabase | null = null;

export async function initDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (db) return db;

  db = await SQLite.openDatabaseAsync("epsea.db");

  // Enable WAL mode for better concurrent read/write performance
  await db.execAsync("PRAGMA journal_mode = WAL;");
  await db.execAsync("PRAGMA foreign_keys = ON;");

  await runMigrations(db);

  return db;
}

export function getDb(): SQLite.SQLiteDatabase {
  if (!db) {
    throw new Error(
      "Database not initialized. Call initDatabase() first via DatabaseProvider.",
    );
  }
  return db;
}

export async function closeDatabase(): Promise<void> {
  if (db) {
    await db.closeAsync();
    db = null;
  }
}
