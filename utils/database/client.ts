import * as SQLite from "expo-sqlite";
import { runMigrations } from "./migrations";

let db: SQLite.SQLiteDatabase | null = null;

export async function initDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (db) return db;

  const instance = await SQLite.openDatabaseAsync("epsea.db");

  try {
    // Enable WAL mode for better concurrent read/write performance
    await instance.execAsync("PRAGMA journal_mode = WAL;");
    await instance.execAsync("PRAGMA foreign_keys = ON;");

    await runMigrations(instance);

    // Only assign to the singleton after everything succeeds
    db = instance;
    return db;
  } catch (error) {
    // Close the connection so a retry can start fresh
    try {
      await instance.closeAsync();
    } catch {
      // ignore close errors
    }
    throw error;
  }
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
