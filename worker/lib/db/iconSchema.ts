// Keep the installation DDL in schema.sql in sync. No image backfill during migration.
export const ICON_DATASET_KEY = 'icon_dataset_epoch'
export const INITIALIZE_ICON_DATASET_SQL = `INSERT OR IGNORE INTO settings (key, value)
  VALUES ('icon_dataset_epoch', json_quote(lower(hex(randomblob(16)))))`
export const REPLACE_ICON_DATASET_SQL = `INSERT OR REPLACE INTO settings (key, value)
  VALUES ('icon_dataset_epoch', json_quote(lower(hex(randomblob(16)))))`

export const BOOKMARK_ICON_TRIGGERS = [
  `CREATE TRIGGER IF NOT EXISTS bookmark_icon_legacy_body
  AFTER UPDATE OF icon_blob ON bookmarks
  WHEN NEW.icon_blob IS NOT OLD.icon_blob
    AND NEW.icon_revision IS OLD.icon_revision
    AND NEW.icon_write_epoch = OLD.icon_write_epoch
  BEGIN
    UPDATE bookmarks SET icon_revision = NULL, icon_write_epoch = OLD.icon_write_epoch + 1
      WHERE id = NEW.id;
  END`,
  `CREATE TRIGGER IF NOT EXISTS bookmark_icon_legacy_source
  AFTER UPDATE OF icon, icon_source ON bookmarks
  WHEN (NEW.icon IS NOT OLD.icon OR NEW.icon_source IS NOT OLD.icon_source)
    AND NEW.icon_write_epoch = OLD.icon_write_epoch
  BEGIN
    UPDATE bookmarks SET icon_blob = NULL, icon_revision = NULL, icon_write_epoch = OLD.icon_write_epoch + 1
      WHERE id = NEW.id;
  END`,
  `CREATE TRIGGER IF NOT EXISTS bookmark_icon_publish
  AFTER UPDATE OF icon_revision, icon, icon_source ON bookmarks
  WHEN (OLD.icon_revision IS NOT NULL AND NEW.icon_revision IS NOT OLD.icon_revision)
    OR NEW.icon IS NOT OLD.icon OR NEW.icon_source IS NOT OLD.icon_source
  BEGIN
    INSERT OR REPLACE INTO settings (key, value)
      VALUES ('data_version', json_quote(lower(hex(randomblob(16)))));
  END`,
]
