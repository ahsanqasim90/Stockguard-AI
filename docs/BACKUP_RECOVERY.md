# StockGuard AI backup and recovery

StockGuard uses a daily GitHub Actions workflow to create an encrypted logical
backup of the `stockguard_ai` MongoDB database and prove that the backup can be
restored. The workflow is in `.github/workflows/daily-backup.yml` and runs at
02:15 UTC every day. Each successful run retains the encrypted backup, its
checksum manifest and restore evidence as a private GitHub Actions artifact for
30 days.

## Security design

- Backup content is compressed and encrypted with AES-256-GCM before it is
  written to disk or uploaded as an artifact.
- MongoDB ObjectIds, dates, numeric BSON types, collection indexes and TTL
  indexes are preserved with MongoDB Extended JSON.
- The manifest contains counts and a SHA-256 checksum but no credentials or
  document content.
- The MongoDB URI and encryption key are stored as encrypted GitHub repository
  secrets named `STOCKGUARD_BACKUP_MONGODB_URI` and `STOCKGUARD_BACKUP_KEY`.
- A local recovery key may be kept in ignored file `server/.backup-key`; it must
  also be copied to an offline password manager because GitHub secrets cannot be
  read back after saving.

## Daily restore verification

The database user is intentionally limited to `readWrite` on `stockguard_ai`.
The workflow therefore restores each collection into an isolated namespace named
`restore_verify_<run-id>__*`, verifies every document count and index, records the
recovery time, and removes only those temporary collections. Existing production
collections are never dropped or overwritten.

The restore program refuses to run unless one of these safety rules is met:

1. The target database is different from production and ends with
   `_restore_verify`; or
2. The target is the source database and the collection prefix matches
   `restore_verify_*__`.

## Local commands

Generate a key once and store it securely:

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Create an encrypted backup:

```powershell
$env:MONGODB_URI="<StockGuard database URI>"
$env:STOCKGUARD_BACKUP_KEY="<32-byte base64 key>"
npm.cmd --prefix server run backup:create
```

Verify a restore without touching production collections:

```powershell
$env:STOCKGUARD_BACKUP_FILE="<path to .sgbackup>"
$env:STOCKGUARD_RESTORE_URI=$env:MONGODB_URI
$env:STOCKGUARD_RESTORE_COLLECTION_PREFIX="restore_verify_manual__"
$env:STOCKGUARD_DROP_RESTORE_AFTER_VERIFY="true"
npm.cmd --prefix server run backup:verify-restore
```

## Recovery procedure

1. Download the newest successful `stockguard-encrypted-backup-*` artifact from
   GitHub Actions.
2. Obtain the backup key from the offline password manager.
3. Run restore verification against an isolated prefix or temporary database.
4. Confirm that `recoveryWithinTenMinutes` is `true` and every collection is
   marked `verified` in the evidence file.
5. For an actual disaster, create a fresh Atlas database with a database-scoped
   user, restore into that database, verify counts and indexes, then update the
   application URI. Never overwrite a damaged database before verification.

The production drill on 24 September 2026 restored and verified 1,055 documents
across 16 collections in 13.914 seconds. Temporary verification collections were
removed after the test.
