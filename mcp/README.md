# Altiora MCP server

An [MCP](https://modelcontextprotocol.io) server that exposes the Altiora / Offline Tasker
SQLite database — expenses, tasks, habits, daily records, the trading journal, notebooks and
app-usage — to Claude Code and any other MCP client.

The app itself stays offline. This server reads a **copy of the database file**, so nothing is
sent anywhere except into the model context of whatever client you point at it.

## Layout

```
mcp/
├── server.js            stdio MCP server (tools + resources)
├── lib/db.js            database access, SQL guardrails, credential redaction
├── lib/tools.js         tool definitions and handlers
└── scripts/adb-sync.sh  pull/push the database between phone and laptop
```

## Setup

```bash
cd mcp && npm install
```

Requires Node ≥ 22.5 — the server uses the built-in `node:sqlite` module, so there is no
native build step and the only dependency is the MCP SDK.

## Getting real data

The live database lives inside the app's sandbox on the phone. Pull a copy:

```bash
./mcp/scripts/adb-sync.sh pull     # device -> ./offline_tasker.db (plus -wal/-shm)
```

This needs `adb` on PATH and a **debuggable** build installed (`run-as` does not work against a
release APK). `*.db` is already gitignored, so pulled data is never committed.

Writes made through the write tools land in the local copy. To get them back onto the phone,
close the app first and then:

```bash
./mcp/scripts/adb-sync.sh push
```

Set `ALTIORA_PKG` if the application id ever changes from `com.offlinetasker.app`.

## Configuration

| Variable | Default | Meaning |
| --- | --- | --- |
| `ALTIORA_DB_PATH` | `<repo>/offline_tasker.db` | Which database file to open |
| `ALTIORA_MCP_READONLY` | unset | Set to `1` to hide all write tools (14 tools instead of 18) |

The server reopens the file automatically when its mtime changes, so an `adb-sync.sh pull` in
the middle of a session is picked up without a restart.

## Claude Code

`.mcp.json` in the repository root registers the server at project scope:

```json
{
  "mcpServers": {
    "altiora": {
      "type": "stdio",
      "command": "sh",
      "args": ["-c", "exec node \"${CLAUDE_PROJECT_DIR:-.}/mcp/server.js\""]
    }
  }
}
```

Claude Code does **not** expand `${VAR}` inside `.mcp.json`, but it does export
`CLAUDE_PROJECT_DIR` into the server process — hence the `sh -c` wrapper, which expands it at
launch and makes the server work regardless of which directory `claude` was started from.

Project-scoped servers need a one-time approval: start `claude` in this repo and accept the
prompt, then confirm with `claude mcp list` (`altiora … ✔ Connected`).

For a read-only session, run Claude Code with `ALTIORA_MCP_READONLY=1 claude`.

Other clients: run `node mcp/server.js` over stdio, or `npm run inspect` for the MCP Inspector.

## Tools

**Read**

| Tool | Purpose |
| --- | --- |
| `altiora_db_info` | File path, size, mtime, per-table row counts |
| `altiora_schema` | Tables and their columns |
| `altiora_query` | Ad-hoc read-only SELECT/WITH |
| `altiora_expenses` | Expense/income rows with filters |
| `altiora_expense_summary` | Totals grouped by category, payment method, day, month, … |
| `altiora_receivables` | Money owed by others, outstanding or settled |
| `altiora_tasks` | Top-level tasks with subtask progress |
| `altiora_task_detail` | One task plus subtasks, documents, learnings, comments |
| `altiora_habits` | Check-in state for a date, completion rate, current streak |
| `altiora_daily_records` | Logged work blocks and total hours |
| `altiora_trading` | Journal rows plus P&L summary for a range |
| `altiora_app_usage` | Screen time aggregated per app |
| `altiora_notes_search` | Substring search across notebook sessions, returns snippets |
| `altiora_daily_brief` | One-call snapshot of a single day |

**Write** (hidden when `ALTIORA_MCP_READONLY=1`)

| Tool | Purpose |
| --- | --- |
| `altiora_add_expense` | Insert an expense or income entry |
| `altiora_add_task` | Create a task or subtask |
| `altiora_set_task_completed` | Toggle completion |
| `altiora_add_daily_record` | Log a block of work |

**Resources**: `altiora://schema`, `altiora://db-info`.

## Safety

- `altiora_query` accepts a single `SELECT`/`WITH` statement only. Multiple statements, writes,
  DDL, `PRAGMA`, `ATTACH` and `VACUUM` are rejected before anything reaches SQLite.
- The `shoonya_config` table holds broker credentials (password, API key, TOTP secret). It is
  refused by `altiora_query` outright, and `password` / `api_key` / `totp_secret` / `vendor_code`
  are redacted from every other code path — those values never enter the model context.
- Write tools mutate only the local copy; the phone is untouched until you run an explicit
  `adb-sync.sh push`.

## Notes on the schema

Subtasks are rows in `tasks` with `parent_task_id` set, not rows in the legacy `task_subtasks`
table. `adv_habits` / `adv_habit_checks` back the timeline-style habit UI and are separate from
`habits` / `habit_checks`. Dates are `YYYY-MM-DD` text and amounts are INR.
