import { DatabaseSync } from 'node:sqlite';
import { existsSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(HERE, '..', '..');

/**
 * Tables holding broker credentials. These never reach the model:
 * blocked in the raw-SQL tool and redacted anywhere else.
 */
export const SENSITIVE_TABLES = new Set(['shoonya_config']);
const SENSITIVE_COLUMNS = new Set(['password', 'api_key', 'totp_secret', 'vendor_code']);

/** Tables the app creates, in the order they are useful to a human reader. */
export const KNOWN_TABLES = [
    'expenses', 'receivables', 'inter_transfers',
    'tasks', 'task_subtasks', 'task_documents', 'task_learnings', 'task_comments',
    'habits', 'habit_checks', 'adv_habits', 'adv_habit_checks',
    'daily_records', 'notebooks', 'notebook_sessions',
    'trading', 'trading_presets', 'watchlists', 'watchlist_stocks',
    'app_usage', 'shoonya_config',
];

export const READ_ONLY = process.env.ALTIORA_MCP_READONLY === '1';

export function dbPath() {
    return process.env.ALTIORA_DB_PATH
        ? resolve(process.env.ALTIORA_DB_PATH)
        : resolve(PROJECT_ROOT, 'offline_tasker.db');
}

export class DbMissingError extends Error {
    constructor(path) {
        super(
            `Altiora database not found at ${path}.\n` +
            `The live database lives on the phone. Pull a copy first:\n` +
            `  ./mcp/scripts/adb-sync.sh pull\n` +
            `or point the server at another file with ALTIORA_DB_PATH.`
        );
        this.name = 'DbMissingError';
    }
}

let handle = null;
let handleMtime = 0;

/**
 * Open the database, reopening transparently when the file has been replaced
 * (which is exactly what `adb-sync.sh pull` does mid-session).
 */
export function db() {
    const path = dbPath();
    if (!existsSync(path)) throw new DbMissingError(path);

    const mtime = statSync(path).mtimeMs;
    if (handle && mtime !== handleMtime) {
        try { handle.close(); } catch { /* already gone */ }
        handle = null;
    }
    if (!handle) {
        handle = new DatabaseSync(path, { readOnly: READ_ONLY });
        handleMtime = mtime;
    }
    return handle;
}

export function tableExists(name) {
    const row = db()
        .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name = ?`)
        .get(name);
    return Boolean(row);
}

export function listTables() {
    return db()
        .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name`)
        .all()
        .map((r) => r.name);
}

export function columnsOf(table) {
    return db().prepare(`PRAGMA table_info(${quoteIdent(table)})`).all().map((c) => c.name);
}

export function rowCount(table) {
    try {
        return db().prepare(`SELECT COUNT(*) AS n FROM ${quoteIdent(table)}`).get().n;
    } catch {
        return null;
    }
}

/** BigInt values from SQLite INTEGER columns are not JSON-serialisable. */
function normalize(value) {
    return typeof value === 'bigint' ? Number(value) : value;
}

export function redact(rows) {
    return rows.map((row) => {
        const out = {};
        for (const [k, v] of Object.entries(row)) {
            out[k] = SENSITIVE_COLUMNS.has(k.toLowerCase()) && v ? '***redacted***' : normalize(v);
        }
        return out;
    });
}

export function all(sql, params = []) {
    return redact(db().prepare(sql).all(...params));
}

export function one(sql, params = []) {
    const rows = all(sql, params);
    return rows[0] ?? null;
}

export function run(sql, params = []) {
    if (READ_ONLY) throw new Error('Server is in read-only mode (ALTIORA_MCP_READONLY=1); writes are refused.');
    const res = db().prepare(sql).run(...params);
    return { changes: Number(res.changes), lastInsertRowid: Number(res.lastInsertRowid) };
}

export function quoteIdent(name) {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) throw new Error(`Unsafe identifier: ${name}`);
    return `"${name}"`;
}

/**
 * Reject anything that is not a single read-only statement, and refuse any
 * statement that touches a credential table.
 */
export function assertReadOnlySql(sql) {
    const stripped = sql
        .replace(/--[^\n]*/g, ' ')
        .replace(/\/\*[\s\S]*?\*\//g, ' ')
        .trim()
        .replace(/;\s*$/, '');

    if (!stripped) throw new Error('Empty query.');
    if (stripped.includes(';')) throw new Error('Only a single statement is allowed.');
    if (!/^(select|with)\b/i.test(stripped)) throw new Error('Only SELECT / WITH queries are allowed.');

    const forbidden = /\b(insert|update|delete|drop|alter|create|replace|attach|detach|pragma|vacuum|reindex)\b/i;
    if (forbidden.test(stripped)) throw new Error('Query contains a write or schema statement.');

    for (const t of SENSITIVE_TABLES) {
        if (new RegExp(`\\b${t}\\b`, 'i').test(stripped)) {
            throw new Error(`Table "${t}" holds broker credentials and cannot be queried.`);
        }
    }
    return stripped;
}

export function today() {
    const d = new Date();
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function daysAgo(n) {
    const d = new Date();
    d.setDate(d.getDate() - n);
    const p = (x) => String(x).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function dbStats() {
    const path = dbPath();
    if (!existsSync(path)) throw new DbMissingError(path);
    const st = statSync(path);
    const present = new Set(listTables());
    const counts = {};
    for (const t of KNOWN_TABLES) {
        if (present.has(t)) counts[t] = rowCount(t);
    }
    const extra = [...present].filter((t) => !KNOWN_TABLES.includes(t));
    return {
        path,
        size_bytes: st.size,
        modified: st.mtime.toISOString(),
        read_only: READ_ONLY,
        row_counts: counts,
        other_tables: extra,
    };
}
