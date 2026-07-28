import {
    all, one, run, dbStats, listTables, columnsOf, assertReadOnlySql,
    today, daysAgo, READ_ONLY,
} from './db.js';

const DATE = { type: 'string', description: 'Date as YYYY-MM-DD' };
const LIMIT = { type: 'integer', minimum: 1, maximum: 500, default: 50 };

/** Build `WHERE` fragments from optional filters. */
function range(field, args, clauses, params) {
    if (args.date) {
        clauses.push(`${field} = ?`);
        params.push(args.date);
        return;
    }
    if (args.start_date) { clauses.push(`${field} >= ?`); params.push(args.start_date); }
    if (args.end_date) { clauses.push(`${field} <= ?`); params.push(args.end_date); }
}

function where(clauses) {
    return clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
}

function num(v, fallback) {
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
}

const readTools = [
    {
        name: 'altiora_db_info',
        description:
            'Inspect the Altiora SQLite database: file path, size, last-modified time and row counts per table. ' +
            'Start here to confirm the server is pointed at a real, up-to-date copy of the phone database.',
        inputSchema: { type: 'object', properties: {} },
        handler: () => dbStats(),
    },

    {
        name: 'altiora_schema',
        description: 'List tables and their columns. Use before writing raw SQL with altiora_query.',
        inputSchema: {
            type: 'object',
            properties: { table: { type: 'string', description: 'Only this table; omit for all tables' } },
        },
        handler: (a) => {
            const tables = a.table ? [a.table] : listTables();
            return Object.fromEntries(tables.map((t) => [t, columnsOf(t)]));
        },
    },

    {
        name: 'altiora_query',
        description:
            'Run a read-only SELECT/WITH query against the Altiora database and return rows as JSON. ' +
            'Single statement only; writes, PRAGMA/ATTACH and the credential table are rejected. ' +
            'Use the purpose-built tools when one fits — this is the escape hatch for ad-hoc analysis.',
        inputSchema: {
            type: 'object',
            properties: {
                sql: { type: 'string', description: 'A single SELECT or WITH statement' },
                params: { type: 'array', items: {}, description: 'Positional ? parameters' },
                limit: { ...LIMIT, default: 200, description: 'Row cap applied to the result set' },
            },
            required: ['sql'],
        },
        handler: (a) => {
            const sql = assertReadOnlySql(a.sql);
            const limit = num(a.limit, 200);
            const rows = all(sql, a.params ?? []);
            return {
                row_count: rows.length,
                truncated: rows.length > limit,
                rows: rows.slice(0, limit),
            };
        },
    },

    {
        name: 'altiora_expenses',
        description:
            'List expense / income entries with optional filters. Amounts are in INR. ' +
            'type is "expense" or "income"; payment_method is the account the money moved through.',
        inputSchema: {
            type: 'object',
            properties: {
                date: DATE,
                start_date: DATE,
                end_date: DATE,
                category: { type: 'string' },
                payment_method: { type: 'string' },
                type: { type: 'string', enum: ['expense', 'income'] },
                search: { type: 'string', description: 'Substring match on description' },
                limit: LIMIT,
            },
        },
        handler: (a) => {
            const clauses = [];
            const params = [];
            range('date', a, clauses, params);
            if (a.category) { clauses.push('category = ?'); params.push(a.category); }
            if (a.payment_method) { clauses.push('payment_method = ?'); params.push(a.payment_method); }
            if (a.type) { clauses.push('type = ?'); params.push(a.type); }
            if (a.search) { clauses.push('LOWER(description) LIKE ?'); params.push(`%${a.search.toLowerCase()}%`); }
            const limit = num(a.limit, 50);
            const rows = all(
                `SELECT * FROM expenses ${where(clauses)} ORDER BY date DESC, created_at DESC LIMIT ?`,
                [...params, limit]
            );
            const total = rows.reduce((s, r) => s + (r.type === 'income' ? 0 : r.amount), 0);
            return { count: rows.length, total_expense_in_page: total, expenses: rows };
        },
    },

    {
        name: 'altiora_expense_summary',
        description:
            'Aggregate spending and income over a date range, grouped by category, payment method, day, month, ' +
            'consumer type or entry type. Defaults to the last 30 days grouped by category.',
        inputSchema: {
            type: 'object',
            properties: {
                start_date: DATE,
                end_date: DATE,
                group_by: {
                    type: 'string',
                    enum: ['category', 'payment_method', 'date', 'month', 'consumer_type', 'type'],
                    default: 'category',
                },
            },
        },
        handler: (a) => {
            const start = a.start_date ?? daysAgo(30);
            const end = a.end_date ?? today();
            const groupBy = a.group_by ?? 'category';
            const expr = groupBy === 'month' ? `substr(date, 1, 7)` : groupBy;
            const rows = all(
                `SELECT ${expr} AS bucket,
                        SUM(CASE WHEN type = 'income' THEN 0 ELSE amount END) AS spent,
                        SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END) AS income,
                        COUNT(*) AS entries
                 FROM expenses
                 WHERE date >= ? AND date <= ?
                 GROUP BY bucket
                 ORDER BY spent DESC`,
                [start, end]
            );
            const totals = rows.reduce(
                (acc, r) => ({ spent: acc.spent + (r.spent ?? 0), income: acc.income + (r.income ?? 0) }),
                { spent: 0, income: 0 }
            );
            return {
                range: { start, end },
                group_by: groupBy,
                totals: { ...totals, net: totals.income - totals.spent },
                buckets: rows,
            };
        },
    },

    {
        name: 'altiora_receivables',
        description: 'Money owed to the user (expenses paid on someone else’s behalf), settled or outstanding.',
        inputSchema: {
            type: 'object',
            properties: {
                settled: { type: 'boolean', default: false, description: 'false = outstanding only' },
                limit: LIMIT,
            },
        },
        handler: (a) => {
            const settled = a.settled === true ? 1 : 0;
            const rows = all(
                `SELECT * FROM receivables WHERE is_settled = ? ORDER BY date DESC LIMIT ?`,
                [settled, num(a.limit, 50)]
            );
            return {
                settled: Boolean(settled),
                count: rows.length,
                total_amount: rows.reduce((s, r) => s + (r.amount ?? 0), 0),
                receivables: rows,
            };
        },
    },

    {
        name: 'altiora_tasks',
        description:
            'List top-level tasks with their subtask progress. Subtasks are rows in `tasks` whose parent_task_id ' +
            'points at the parent. Use altiora_task_detail for documents, learnings and comments.',
        inputSchema: {
            type: 'object',
            properties: {
                status: { type: 'string', enum: ['all', 'open', 'done'], default: 'open' },
                search: { type: 'string', description: 'Substring match on task name' },
                due_before: { ...DATE, description: 'Only tasks with end_date on or before this' },
                limit: LIMIT,
            },
        },
        handler: (a) => {
            const clauses = ['parent_task_id IS NULL'];
            const params = [];
            const status = a.status ?? 'open';
            if (status === 'open') clauses.push('is_completed = 0');
            if (status === 'done') clauses.push('is_completed = 1');
            if (a.search) { clauses.push('LOWER(name) LIKE ?'); params.push(`%${a.search.toLowerCase()}%`); }
            if (a.due_before) { clauses.push('end_date IS NOT NULL AND end_date <= ?'); params.push(a.due_before); }

            const tasks = all(
                `SELECT * FROM tasks ${where(clauses)} ORDER BY is_completed, COALESCE(end_date, start_date), created_at DESC LIMIT ?`,
                [...params, num(a.limit, 50)]
            );
            for (const t of tasks) {
                const sub = one(
                    `SELECT COUNT(*) AS total, SUM(is_completed) AS done FROM tasks WHERE parent_task_id = ?`,
                    [t.id]
                );
                t.subtasks = { total: sub?.total ?? 0, done: sub?.done ?? 0 };
            }
            return { status, count: tasks.length, tasks };
        },
    },

    {
        name: 'altiora_task_detail',
        description: 'Everything attached to one task: subtasks, documents, learnings and comments.',
        inputSchema: {
            type: 'object',
            properties: { task_id: { type: 'integer' } },
            required: ['task_id'],
        },
        handler: (a) => {
            const task = one('SELECT * FROM tasks WHERE id = ?', [a.task_id]);
            if (!task) throw new Error(`No task with id ${a.task_id}.`);
            return {
                task,
                subtasks: all('SELECT * FROM tasks WHERE parent_task_id = ? ORDER BY created_at', [a.task_id]),
                documents: all('SELECT * FROM task_documents WHERE task_id = ? ORDER BY created_at DESC', [a.task_id]),
                learnings: all('SELECT * FROM task_learnings WHERE task_id = ? ORDER BY created_at DESC', [a.task_id]),
                comments: all('SELECT * FROM task_comments WHERE task_id = ? ORDER BY created_at DESC', [a.task_id]),
            };
        },
    },

    {
        name: 'altiora_habits',
        description:
            'Habits with their check-in state for a given date, plus a completion rate and current streak ' +
            'computed over a trailing window. Defaults to today with a 30-day window.',
        inputSchema: {
            type: 'object',
            properties: {
                date: DATE,
                window_days: { type: 'integer', minimum: 1, maximum: 365, default: 30 },
            },
        },
        handler: (a) => {
            const date = a.date ?? today();
            const windowDays = num(a.window_days, 30);
            const from = daysAgo(windowDays);
            const habits = all(
                `SELECT h.*, hc.is_checked, hc.check_time, hc.delay_minutes
                 FROM habits h
                 LEFT JOIN habit_checks hc ON h.id = hc.habit_id AND hc.date = ?
                 WHERE h.is_active = 1
                 ORDER BY h.category, h.scheduled_time`,
                [date]
            );
            for (const h of habits) {
                const stat = one(
                    `SELECT COUNT(*) AS logged, SUM(is_checked) AS done
                     FROM habit_checks WHERE habit_id = ? AND date >= ? AND date <= ?`,
                    [h.id, from, date]
                );
                const done = stat?.done ?? 0;
                h.window = {
                    days: windowDays,
                    completed: done,
                    completion_rate: windowDays ? Number((done / windowDays).toFixed(2)) : 0,
                };
                const recent = all(
                    `SELECT date, is_checked FROM habit_checks WHERE habit_id = ? AND date <= ? ORDER BY date DESC LIMIT ?`,
                    [h.id, date, windowDays]
                );
                let streak = 0;
                for (const r of recent) {
                    if (r.is_checked) streak += 1;
                    else break;
                }
                h.current_streak = streak;
            }
            return { date, count: habits.length, habits };
        },
    },

    {
        name: 'altiora_daily_records',
        description:
            'Time-logged work entries (daily_records): what was done, for how many hours, under which variant/bucket.',
        inputSchema: {
            type: 'object',
            properties: {
                date: DATE, start_date: DATE, end_date: DATE,
                variant: { type: 'string' },
                limit: LIMIT,
            },
        },
        handler: (a) => {
            const clauses = [];
            const params = [];
            range('date', a, clauses, params);
            if (a.variant) { clauses.push('variant = ?'); params.push(a.variant); }
            const rows = all(
                `SELECT * FROM daily_records ${where(clauses)} ORDER BY date DESC, created_at DESC LIMIT ?`,
                [...params, num(a.limit, 50)]
            );
            return {
                count: rows.length,
                total_hours: Number(rows.reduce((s, r) => s + (r.hours_spent ?? 0), 0).toFixed(2)),
                records: rows,
            };
        },
    },

    {
        name: 'altiora_trading',
        description:
            'Daily trading journal rows and a profit/loss summary for the range. Defaults to the last 30 days. ' +
            'This is the manual journal, not live broker positions.',
        inputSchema: {
            type: 'object',
            properties: { start_date: DATE, end_date: DATE, limit: LIMIT },
        },
        handler: (a) => {
            const start = a.start_date ?? daysAgo(30);
            const end = a.end_date ?? today();
            const trades = all(
                `SELECT * FROM trading WHERE date >= ? AND date <= ? ORDER BY date DESC LIMIT ?`,
                [start, end, num(a.limit, 100)]
            );
            const summary = one(
                `SELECT COUNT(*) AS sessions, SUM(buy_amount) AS total_bought, SUM(sell_amount) AS total_sold,
                        SUM(profit_loss) AS total_pnl,
                        SUM(CASE WHEN profit_loss > 0 THEN 1 ELSE 0 END) AS winning_days,
                        SUM(CASE WHEN profit_loss < 0 THEN 1 ELSE 0 END) AS losing_days
                 FROM trading WHERE date >= ? AND date <= ?`,
                [start, end]
            );
            return { range: { start, end }, summary, trades };
        },
    },

    {
        name: 'altiora_app_usage',
        description: 'Screen-time rows per app. Aggregates hours per app across the range when no single date is given.',
        inputSchema: {
            type: 'object',
            properties: { date: DATE, start_date: DATE, end_date: DATE, top: { type: 'integer', default: 15 } },
        },
        handler: (a) => {
            const clauses = [];
            const params = [];
            range('date', a, clauses, params);
            if (!clauses.length) { clauses.push('date >= ?'); params.push(daysAgo(7)); }
            const rows = all(
                `SELECT app_name, SUM(hours_used) AS hours, COUNT(DISTINCT date) AS days
                 FROM app_usage ${where(clauses)}
                 GROUP BY app_name ORDER BY hours DESC LIMIT ?`,
                [...params, num(a.top, 15)]
            );
            return {
                total_hours: Number(rows.reduce((s, r) => s + (r.hours ?? 0), 0).toFixed(2)),
                apps: rows,
            };
        },
    },

    {
        name: 'altiora_notes_search',
        description:
            'Full-text substring search across notebook sessions (including the Daily Logs notebook). ' +
            'Returns a snippet around each match rather than whole documents.',
        inputSchema: {
            type: 'object',
            properties: {
                query: { type: 'string' },
                daily_logs_only: { type: 'boolean', default: false },
                limit: { ...LIMIT, default: 20 },
            },
            required: ['query'],
        },
        handler: (a) => {
            const needle = `%${a.query.toLowerCase()}%`;
            const clauses = ['(LOWER(ns.content) LIKE ? OR LOWER(ns.name) LIKE ?)'];
            const params = [needle, needle];
            if (a.daily_logs_only) clauses.push('n.is_daily_log = 1');
            const rows = all(
                `SELECT ns.id, ns.name, ns.created_at, n.name AS notebook, n.is_daily_log, ns.content
                 FROM notebook_sessions ns JOIN notebooks n ON ns.notebook_id = n.id
                 ${where(clauses)} ORDER BY ns.created_at DESC LIMIT ?`,
                [...params, num(a.limit, 20)]
            );
            const lower = a.query.toLowerCase();
            return {
                count: rows.length,
                matches: rows.map(({ content, ...rest }) => {
                    const idx = (content ?? '').toLowerCase().indexOf(lower);
                    const start = Math.max(0, idx - 120);
                    return {
                        ...rest,
                        snippet: idx === -1
                            ? (content ?? '').slice(0, 240)
                            : (content ?? '').slice(start, idx + 240),
                    };
                }),
            };
        },
    },

    {
        name: 'altiora_daily_brief',
        description:
            'One-call snapshot of a single day: spending, hours logged, habit check-ins, tasks due, trading P&L ' +
            'and screen time. Defaults to today. Use this before answering "how was my day / week".',
        inputSchema: { type: 'object', properties: { date: DATE } },
        handler: (a) => {
            const date = a.date ?? today();
            const money = one(
                `SELECT SUM(CASE WHEN type='income' THEN 0 ELSE amount END) AS spent,
                        SUM(CASE WHEN type='income' THEN amount ELSE 0 END) AS income,
                        COUNT(*) AS entries
                 FROM expenses WHERE date = ?`,
                [date]
            );
            const work = one(
                `SELECT COUNT(*) AS entries, SUM(hours_spent) AS hours FROM daily_records WHERE date = ?`,
                [date]
            );
            const habits = one(
                `SELECT COUNT(*) AS logged, SUM(is_checked) AS done FROM habit_checks WHERE date = ?`,
                [date]
            );
            const activeHabits = one(`SELECT COUNT(*) AS n FROM habits WHERE is_active = 1`);
            const trading = one(`SELECT SUM(profit_loss) AS pnl, COUNT(*) AS sessions FROM trading WHERE date = ?`, [date]);
            const screen = one(`SELECT SUM(hours_used) AS hours FROM app_usage WHERE date = ?`, [date]);
            const tasksDue = all(
                `SELECT id, name, task_type, end_date, is_completed FROM tasks
                 WHERE parent_task_id IS NULL AND (start_date = ? OR end_date = ?)
                 ORDER BY is_completed`,
                [date, date]
            );
            const overdue = all(
                `SELECT id, name, end_date FROM tasks
                 WHERE parent_task_id IS NULL AND is_completed = 0 AND end_date IS NOT NULL AND end_date < ?
                 ORDER BY end_date LIMIT 20`,
                [date]
            );
            return {
                date,
                money: { spent: money?.spent ?? 0, income: money?.income ?? 0, entries: money?.entries ?? 0 },
                work: { entries: work?.entries ?? 0, hours: work?.hours ?? 0 },
                habits: { active: activeHabits?.n ?? 0, checked_in: habits?.done ?? 0 },
                trading: { pnl: trading?.pnl ?? 0, sessions: trading?.sessions ?? 0 },
                screen_time_hours: screen?.hours ?? 0,
                tasks_due: tasksDue,
                overdue_tasks: overdue,
            };
        },
    },
];

const writeTools = [
    {
        name: 'altiora_add_expense',
        description:
            'Insert an expense or income entry. Writes to the local database copy — push it back to the phone ' +
            'with `./mcp/scripts/adb-sync.sh push` (app closed) for it to show up in the app.',
        inputSchema: {
            type: 'object',
            properties: {
                amount: { type: 'number', exclusiveMinimum: 0 },
                payment_method: { type: 'string', description: 'Account used, e.g. Cash / UPI / Card' },
                description: { type: 'string' },
                category: { type: 'string' },
                type: { type: 'string', enum: ['expense', 'income'], default: 'expense' },
                date: { ...DATE, description: 'Defaults to today' },
                time: { type: 'string', description: 'HH:MM' },
                location_name: { type: 'string' },
            },
            required: ['amount', 'payment_method'],
        },
        handler: (a) => {
            const res = run(
                `INSERT INTO expenses (amount, description, category, payment_method, type, date, time, location_name, consumer_type)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'myself')`,
                [
                    a.amount, a.description ?? '', a.category ?? '', a.payment_method,
                    a.type ?? 'expense', a.date ?? today(), a.time ?? null, a.location_name ?? null,
                ]
            );
            return { inserted_id: res.lastInsertRowid, ...a, date: a.date ?? today() };
        },
    },

    {
        name: 'altiora_add_task',
        description: 'Create a task, or a subtask when parent_task_id is given. Does not create calendar events.',
        inputSchema: {
            type: 'object',
            properties: {
                name: { type: 'string' },
                start_date: { ...DATE, description: 'Defaults to today' },
                end_date: DATE,
                task_type: { type: 'string' },
                reminder_time: { type: 'string', description: 'HH:MM' },
                repeat_type: { type: 'string', description: 'Once / Daily / Weekly / Monthly' },
                parent_task_id: { type: 'integer' },
            },
            required: ['name'],
        },
        handler: (a) => {
            const res = run(
                `INSERT INTO tasks (name, start_date, end_date, task_type, reminder_time, repeat_type, parent_task_id)
                 VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [
                    a.name, a.start_date ?? today(), a.end_date ?? null, a.task_type ?? null,
                    a.reminder_time ?? null, a.repeat_type ?? null, a.parent_task_id ?? null,
                ]
            );
            return { inserted_id: res.lastInsertRowid, ...a };
        },
    },

    {
        name: 'altiora_set_task_completed',
        description: 'Mark a task (or subtask) complete or incomplete.',
        inputSchema: {
            type: 'object',
            properties: {
                task_id: { type: 'integer' },
                completed: { type: 'boolean', default: true },
            },
            required: ['task_id'],
        },
        handler: (a) => {
            const completed = a.completed === false ? 0 : 1;
            const res = run('UPDATE tasks SET is_completed = ? WHERE id = ?', [completed, a.task_id]);
            if (!res.changes) throw new Error(`No task with id ${a.task_id}.`);
            return { task_id: a.task_id, is_completed: Boolean(completed) };
        },
    },

    {
        name: 'altiora_add_daily_record',
        description: 'Log a block of work: description, hours and the variant/bucket it belongs to.',
        inputSchema: {
            type: 'object',
            properties: {
                task_description: { type: 'string' },
                variant: { type: 'string', description: 'Bucket the entry belongs to, e.g. Work / Personal' },
                hours_spent: { type: 'number', minimum: 0, default: 0 },
                date: { ...DATE, description: 'Defaults to today' },
                start_time: { type: 'string', description: 'HH:MM' },
                end_time: { type: 'string', description: 'HH:MM' },
                notes: { type: 'string' },
            },
            required: ['task_description', 'variant'],
        },
        handler: (a) => {
            const res = run(
                `INSERT INTO daily_records (date, variant, task_description, hours_spent, start_time, end_time, notes)
                 VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [
                    a.date ?? today(), a.variant, a.task_description, a.hours_spent ?? 0,
                    a.start_time ?? null, a.end_time ?? null, a.notes ?? null,
                ]
            );
            return { inserted_id: res.lastInsertRowid, ...a, date: a.date ?? today() };
        },
    },
];

export const tools = READ_ONLY ? readTools : [...readTools, ...writeTools];

export function findTool(name) {
    return tools.find((t) => t.name === name);
}
