import * as SQLite from 'expo-sqlite';

let dbInstance = null;
let dbStarting = false;

export const getDatabase = async () => {
    if (dbInstance) return dbInstance;
    if (dbStarting) {
        // Wait for current initialization
        while (dbStarting) {
            await new Promise(resolve => setTimeout(resolve, 50));
        }
        if (dbInstance) return dbInstance;
    }
    
    dbStarting = true;
    try {
        console.log('[DB] Opening database...');
        const database = await SQLite.openDatabaseAsync('offline_tasker.db');

        // Sanitize `undefined` to `null` to prevent SQLite errors in Hermes/release mode
        const sanitizeArg = (arg) => {
            if (arg === undefined) return null;
            if (Array.isArray(arg)) return arg.map(item => item === undefined ? null : item);
            if (arg !== null && typeof arg === 'object') {
                const newObj = {};
                for (const key in arg) {
                    newObj[key] = arg[key] === undefined ? null : arg[key];
                }
                return newObj;
            }
            return arg;
        };

        const originalRunAsync = database.runAsync.bind(database);
        database.runAsync = async (query, ...args) => {
            return await originalRunAsync(query, ...args.map(sanitizeArg));
        };

        const originalGetAllAsync = database.getAllAsync.bind(database);
        database.getAllAsync = async (query, ...args) => {
            return await originalGetAllAsync(query, ...args.map(sanitizeArg));
        };

        const originalGetFirstAsync = database.getFirstAsync.bind(database);
        database.getFirstAsync = async (query, ...args) => {
            return await originalGetFirstAsync(query, ...args.map(sanitizeArg));
        };

        console.log('[DB] Database opened, initializing schema...');
        await initializeDatabase(database);
        dbInstance = database;
        console.log('[DB] Database ready.');
        return database;
    } catch (e) {
        console.error('[DB] Database open error:', e);
        throw e;
    } finally {
        dbStarting = false;
    }
};

const initializeDatabase = async (database) => {
    try {
        await database.runAsync('PRAGMA journal_mode = WAL;');
        await database.runAsync('PRAGMA foreign_keys = ON;');
        
        await database.execAsync(`
    CREATE TABLE IF NOT EXISTS expenses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      amount REAL NOT NULL,
      description TEXT,
      category TEXT,
      payment_method TEXT NOT NULL,
      type TEXT DEFAULT 'expense',
      date TEXT NOT NULL,
      latitude REAL,
      longitude REAL,
      location_name TEXT,
      time TEXT,
      created_at TEXT DEFAULT (datetime('now','localtime'))
    );

    CREATE TABLE IF NOT EXISTS daily_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      variant TEXT NOT NULL,
      task_description TEXT NOT NULL,
      hours_spent REAL DEFAULT 0,
      start_time TEXT,
      end_time TEXT,
      notes TEXT,
      latitude REAL,
      longitude REAL,
      location_name TEXT,
      created_at TEXT DEFAULT (datetime('now','localtime'))
    );

    CREATE TABLE IF NOT EXISTS trading (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      starting_money REAL DEFAULT 0,
      ending_money REAL DEFAULT 0,
      buy_amount REAL DEFAULT 0,
      sell_amount REAL DEFAULT 0,
      profit_loss REAL DEFAULT 0,
      notes TEXT,
      created_at TEXT DEFAULT (datetime('now','localtime'))
    );

    CREATE TABLE IF NOT EXISTS habits (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      category TEXT NOT NULL,
      scheduled_time TEXT,
      is_active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now','localtime'))
    );

    CREATE TABLE IF NOT EXISTS habit_checks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      habit_id INTEGER NOT NULL,
      date TEXT NOT NULL,
      is_checked INTEGER DEFAULT 0,
      check_time TEXT,
      delay_minutes INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now','localtime')),
      FOREIGN KEY (habit_id) REFERENCES habits(id) ON DELETE CASCADE,
      UNIQUE(habit_id, date)
    );

    CREATE TABLE IF NOT EXISTS app_usage (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      app_name TEXT NOT NULL,
      hours_used REAL DEFAULT 0,
      time_used_at TEXT,
      date TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now','localtime'))
    );

    CREATE TABLE IF NOT EXISTS adv_habits (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      start_time TEXT,
      end_time TEXT,
      hour_slot INTEGER,
      slot_index INTEGER,
      has_notification INTEGER,
      priority INTEGER,
      from_date TEXT,
      to_date TEXT,
      repeat_type TEXT
    );

    CREATE TABLE IF NOT EXISTS adv_habit_checks (
      habit_id INTEGER NOT NULL,
      date TEXT NOT NULL,
      is_checked INTEGER DEFAULT 0,
      UNIQUE(habit_id, date)
    );

    CREATE TABLE IF NOT EXISTS notebooks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      is_daily_log INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now','localtime'))
    );

    CREATE TABLE IF NOT EXISTS notebook_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      notebook_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      content TEXT,
      created_at TEXT DEFAULT (datetime('now','localtime')),
      FOREIGN KEY (notebook_id) REFERENCES notebooks(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      start_date TEXT,
      end_date TEXT,
      task_type TEXT,
      reminder_time TEXT,
      repeat_type TEXT,
      linked_habit_id INTEGER,
      is_completed INTEGER DEFAULT 0,
      calendar_event_id TEXT DEFAULT NULL,
      reminder_id TEXT DEFAULT NULL,
      created_at TEXT DEFAULT (datetime('now','localtime'))
    );

    CREATE TABLE IF NOT EXISTS shoonya_config (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT,
      password TEXT,
      api_key TEXT,
      vendor_code TEXT,
      totp_secret TEXT,
      imei TEXT,
      actid TEXT,
      is_active INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS trading_presets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      symbol TEXT NOT NULL,
      exchange TEXT DEFAULT 'NSE',
      quantity INTEGER DEFAULT 1,
      product_type TEXT DEFAULT 'MIS'
    );

    CREATE TABLE IF NOT EXISTS task_subtasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      is_completed INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now','localtime')),
      FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS task_documents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      content TEXT,
      created_at TEXT DEFAULT (datetime('now','localtime')),
      FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS task_learnings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id INTEGER NOT NULL,
      content TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now','localtime')),
      FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS task_comments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id INTEGER NOT NULL,
      content TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now','localtime')),
      FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
    );

    INSERT INTO notebooks (name, is_daily_log)
    SELECT 'Daily Logs', 1
    WHERE NOT EXISTS (SELECT 1 FROM notebooks WHERE is_daily_log = 1);
  `);
    } catch (e) {
        console.warn('execAsync schema init failed softly:', e);
    }

    // Individual migrations with independent try-catch
    // These handle upgrading old databases that are missing newer columns
    const migrations = [
        ["ALTER TABLE tasks ADD COLUMN parent_task_id INTEGER DEFAULT NULL;", "tasks parent_task_id"],
        ["ALTER TABLE expenses ADD COLUMN latitude REAL DEFAULT NULL;", "expenses latitude"],
        ["ALTER TABLE expenses ADD COLUMN longitude REAL DEFAULT NULL;", "expenses longitude"],
        ["ALTER TABLE expenses ADD COLUMN location_name TEXT DEFAULT NULL;", "expenses location_name"],
        ["ALTER TABLE expenses ADD COLUMN time TEXT DEFAULT NULL;", "expenses time"],
        ["ALTER TABLE expenses ADD COLUMN consumer_type TEXT DEFAULT 'myself';", "expenses consumer_type"],
        ["ALTER TABLE expenses ADD COLUMN consumer_data TEXT DEFAULT NULL;", "expenses consumer_data"],
        ["ALTER TABLE tasks ADD COLUMN calendar_event_id TEXT DEFAULT NULL;", "tasks calendar_event_id"],
        ["ALTER TABLE tasks ADD COLUMN reminder_id TEXT DEFAULT NULL;", "tasks reminder_id"],
        ["ALTER TABLE notebook_sessions ADD COLUMN type TEXT DEFAULT 'text';", "notebook_sessions type"],
    ];

    for (const [sql, label] of migrations) {
        try {
            await database.runAsync(sql);
            console.log(`[DB] Migration success: ${label}`);
        } catch (e) {
            // Ignore "duplicate column" errors
            const msg = e?.message || "";
            if (!msg.includes('duplicate column') && !msg.includes('already exists')) {
                console.warn(`[DB] Migration check for ${label}:`, msg);
            }
        }
    }

    // Create receivables table
    try {
        await database.runAsync(`
            CREATE TABLE IF NOT EXISTS receivables (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                expense_id INTEGER,
                consumer_type TEXT NOT NULL,
                person_name TEXT,
                amount REAL NOT NULL,
                description TEXT,
                date TEXT NOT NULL,
                is_settled INTEGER DEFAULT 0,
                settled_at TEXT,
                created_at TEXT DEFAULT (datetime('now','localtime'))
            );
        `);
    } catch (e) {
        console.warn('receivables table creation failed:', e);
    }

    // Cleanup duplicates from daily logs (keep latest non-empty or max id)
    try {
        await database.runAsync(`
            DELETE FROM notebook_sessions 
            WHERE (content IS NULL OR content = '' OR content = '{}')
            AND id IN (
                SELECT n1.id 
                FROM notebook_sessions n1
                JOIN notebook_sessions n2 
                ON n1.notebook_id = n2.notebook_id AND n1.name = n2.name
                WHERE n1.id > n2.id OR (n2.content IS NOT NULL AND n2.content != '' AND n2.content != '{}')
            );
        `);
    } catch (e) {
        console.warn('Duplicate cleanup failed:', e);
    }

    // Create inter_transfers table if needed
    try {
        await database.runAsync(`
            CREATE TABLE IF NOT EXISTS inter_transfers (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                amount REAL NOT NULL,
                from_account TEXT NOT NULL,
                to_account TEXT NOT NULL,
                reason TEXT,
                date TEXT NOT NULL,
                time TEXT NOT NULL,
                created_at TEXT DEFAULT (datetime('now','localtime'))
            );
        `);
    } catch (e) {
        console.warn('inter_transfers table creation failed:', e);
    }
};

// ============= EXPENSES =============
export const addExpense = async (expense) => {
    const db = await getDatabase();
    const result = await db.runAsync(
        'INSERT INTO expenses (amount, description, category, payment_method, type, date, time, latitude, longitude, location_name, consumer_type, consumer_data) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [
            expense.amount,
            expense.description ?? '',
            expense.category ?? '',
            expense.payment_method,
            expense.type ?? 'expense',
            expense.date,
            expense.time ?? null,
            expense.latitude ?? null,
            expense.longitude ?? null,
            expense.location_name ?? null,
            expense.consumer_type ?? 'myself',
            expense.consumer_data ? JSON.stringify(expense.consumer_data) : null,
        ]
    );
    return result.lastInsertRowId;
};

// ============= RECEIVABLES =============
export const addReceivable = async (rec) => {
    const db = await getDatabase();
    const result = await db.runAsync(
        'INSERT INTO receivables (expense_id, consumer_type, person_name, amount, description, date) VALUES (?, ?, ?, ?, ?, ?)',
        [rec.expense_id ?? null, rec.consumer_type, rec.person_name ?? null, rec.amount, rec.description ?? '', rec.date]
    );
    return result.lastInsertRowId;
};

export const getReceivables = async (settled = false) => {
    const db = await getDatabase();
    return await db.getAllAsync(
        'SELECT * FROM receivables WHERE is_settled = ? ORDER BY created_at DESC',
        [settled ? 1 : 0]
    );
};

export const settleReceivable = async (id) => {
    const db = await getDatabase();
    await db.runAsync(
        "UPDATE receivables SET is_settled = 1, settled_at = datetime('now','localtime') WHERE id = ?",
        [id]
    );
};

export const deleteReceivable = async (id) => {
    const db = await getDatabase();
    await db.runAsync('DELETE FROM receivables WHERE id = ?', [id]);
};

export const addTransfer = async (transfer) => {
    const db = await getDatabase();
    const result = await db.runAsync(
        'INSERT INTO inter_transfers (amount, from_account, to_account, reason, date, time) VALUES (?, ?, ?, ?, ?, ?)',
        [
            transfer.amount,
            transfer.from_account,
            transfer.to_account,
            transfer.reason || '',
            transfer.date,
            transfer.time,
        ]
    );
    return result.lastInsertRowId;
};

export const getTransfers = async (date = null) => {
    const db = await getDatabase();
    try {
        if (date) {
            return await db.getAllAsync('SELECT * FROM inter_transfers WHERE date = ? ORDER BY created_at DESC', [date]);
        }
        return await db.getAllAsync('SELECT * FROM inter_transfers ORDER BY date DESC, created_at DESC LIMIT 200');
    } catch (e) {
        return [];
    }
};

export const deleteTransfer = async (id) => {
    const db = await getDatabase();
    await db.runAsync('DELETE FROM inter_transfers WHERE id = ?', [id]);
};

export const getExpenses = async (date = null) => {
    const db = await getDatabase();
    if (date) {
        return await db.getAllAsync('SELECT * FROM expenses WHERE date = ? ORDER BY created_at DESC', [date]);
    }
    return await db.getAllAsync('SELECT * FROM expenses ORDER BY date DESC, created_at DESC LIMIT 100');
};

export const getExpenseSummary = async (startDate, endDate) => {
    const db = await getDatabase();
    return await db.getAllAsync(
        `SELECT payment_method, SUM(CASE WHEN type='expense' THEN amount ELSE 0 END) as total_spent,
            SUM(CASE WHEN type='income' THEN amount ELSE 0 END) as total_income,
            COUNT(*) as count
     FROM expenses WHERE date >= ? AND date <= ? GROUP BY payment_method`,
        [startDate, endDate]
    );
};

export const deleteExpense = async (id) => {
    const db = await getDatabase();
    await db.runAsync('DELETE FROM expenses WHERE id = ?', [id]);
};

// ============= DAILY RECORDS =============
export const addDailyRecord = async (record) => {
    const db = await getDatabase();
    const result = await db.runAsync(
        'INSERT INTO daily_records (date, variant, task_description, hours_spent, start_time, end_time, notes, latitude, longitude, location_name) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [
            record.date,
            record.variant,
            record.task_description,
            record.hours_spent,
            record.start_time,
            record.end_time,
            record.notes,
            record.latitude || null,
            record.longitude || null,
            record.location_name || null
        ]
    );
    return result.lastInsertRowId;
};

export const getDailyRecords = async (date = null) => {
    const db = await getDatabase();
    if (date) {
        return await db.getAllAsync('SELECT * FROM daily_records WHERE date = ? ORDER BY variant, created_at', [date]);
    }
    return await db.getAllAsync('SELECT * FROM daily_records ORDER BY date DESC, variant, created_at DESC LIMIT 100');
};

export const getDailyRecordsByVariant = async (date, variant) => {
    const db = await getDatabase();
    return await db.getAllAsync('SELECT * FROM daily_records WHERE date = ? AND variant = ? ORDER BY created_at', [date, variant]);
};

export const deleteDailyRecord = async (id) => {
    const db = await getDatabase();
    await db.runAsync('DELETE FROM daily_records WHERE id = ?', [id]);
};

// ============= TRADING =============
export const addTrade = async (trade) => {
    const db = await getDatabase();
    const profitLoss = (trade.ending_money || 0) - (trade.starting_money || 0);
    const result = await db.runAsync(
        'INSERT INTO trading (date, starting_money, ending_money, buy_amount, sell_amount, profit_loss, notes) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [trade.date, trade.starting_money, trade.ending_money, trade.buy_amount, trade.sell_amount, profitLoss, trade.notes]
    );
    return result.lastInsertRowId;
};

export const getTrades = async (date = null) => {
    const db = await getDatabase();
    if (date) {
        return await db.getAllAsync('SELECT * FROM trading WHERE date = ? ORDER BY created_at DESC', [date]);
    }
    return await db.getAllAsync('SELECT * FROM trading ORDER BY date DESC LIMIT 100');
};

export const getTradeSummary = async (startDate, endDate) => {
    const db = await getDatabase();
    const result = await db.getFirstAsync(
        `SELECT SUM(buy_amount) as total_bought, SUM(sell_amount) as total_sold,
            SUM(profit_loss) as total_pnl, COUNT(*) as count
     FROM trading WHERE date >= ? AND date <= ?`,
        [startDate, endDate]
    );
    return result;
};

export const deleteTrade = async (id) => {
    const db = await getDatabase();
    await db.runAsync('DELETE FROM trading WHERE id = ?', [id]);
};

// ============= HABITS =============
export const addHabit = async (habit) => {
    const db = await getDatabase();
    const result = await db.runAsync(
        'INSERT INTO habits (name, category, scheduled_time) VALUES (?, ?, ?)',
        [habit.name, habit.category, habit.scheduled_time]
    );
    return result.lastInsertRowId;
};

export const getHabits = async (category = null) => {
    const db = await getDatabase();
    if (category) {
        return await db.getAllAsync('SELECT * FROM habits WHERE category = ? AND is_active = 1 ORDER BY scheduled_time', [category]);
    }
    return await db.getAllAsync('SELECT * FROM habits WHERE is_active = 1 ORDER BY category, scheduled_time');
};

export const toggleHabitCheck = async (habitId, date, checkTime) => {
    const db = await getDatabase();
    const existing = await db.getFirstAsync(
        'SELECT * FROM habit_checks WHERE habit_id = ? AND date = ?', [habitId, date]
    );

    if (existing) {
        if (existing.is_checked) {
            await db.runAsync('UPDATE habit_checks SET is_checked = 0, check_time = NULL, delay_minutes = 0 WHERE id = ?', [existing.id]);
        } else {
            const habit = await db.getFirstAsync('SELECT * FROM habits WHERE id = ?', [habitId]);
            let delayMinutes = 0;
            if (habit && habit.scheduled_time && checkTime) {
                const [sh, sm] = habit.scheduled_time.split(':').map(Number);
                const [ch, cm] = checkTime.split(':').map(Number);
                delayMinutes = Math.max(0, (ch * 60 + cm) - (sh * 60 + sm));
            }
            await db.runAsync(
                'UPDATE habit_checks SET is_checked = 1, check_time = ?, delay_minutes = ? WHERE id = ?',
                [checkTime, delayMinutes, existing.id]
            );
        }
    } else {
        const habit = await db.getFirstAsync('SELECT * FROM habits WHERE id = ?', [habitId]);
        let delayMinutes = 0;
        if (habit && habit.scheduled_time && checkTime) {
            const [sh, sm] = habit.scheduled_time.split(':').map(Number);
            const [ch, cm] = checkTime.split(':').map(Number);
            delayMinutes = Math.max(0, (ch * 60 + cm) - (sh * 60 + sm));
        }
        await db.runAsync(
            'INSERT INTO habit_checks (habit_id, date, is_checked, check_time, delay_minutes) VALUES (?, ?, 1, ?, ?)',
            [habitId, date, checkTime, delayMinutes]
        );
    }
};

export const getHabitChecks = async (date) => {
    const db = await getDatabase();
    return await db.getAllAsync(
        `SELECT h.*, hc.is_checked, hc.check_time, hc.delay_minutes
     FROM habits h LEFT JOIN habit_checks hc ON h.id = hc.habit_id AND hc.date = ?
     WHERE h.is_active = 1 ORDER BY h.category, h.scheduled_time`,
        [date]
    );
};

export const deleteHabit = async (id) => {
    const db = await getDatabase();
    await db.runAsync('DELETE FROM habits WHERE id = ?', [id]);
};

// ============= APP USAGE =============
export const addAppUsage = async (usage) => {
    const db = await getDatabase();
    const result = await db.runAsync(
        'INSERT INTO app_usage (app_name, hours_used, time_used_at, date) VALUES (?, ?, ?, ?)',
        [usage.app_name, usage.hours_used, usage.time_used_at, usage.date]
    );
    return result.lastInsertRowId;
};

export const getAppUsage = async (date = null) => {
    const db = await getDatabase();
    if (date) {
        return await db.getAllAsync('SELECT * FROM app_usage WHERE date = ? ORDER BY hours_used DESC', [date]);
    }
    return await db.getAllAsync('SELECT * FROM app_usage ORDER BY date DESC LIMIT 100');
};

export const deleteAppUsage = async (id) => {
    const db = await getDatabase();
    await db.runAsync('DELETE FROM app_usage WHERE id = ?', [id]);
};

export const clearAppUsageByDate = async (date) => {
    const db = await getDatabase();
    await db.runAsync('DELETE FROM app_usage WHERE date = ?', [date]);
};

// ============= ADVANCED HABITS =============
export const addAdvHabit = async (habit) => {
    const db = await getDatabase();
    const result = await db.runAsync(
        'INSERT INTO adv_habits (name, start_time, end_time, hour_slot, slot_index, has_notification, priority, from_date, to_date, repeat_type) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [habit.name, habit.start_time, habit.end_time, habit.hour_slot, habit.slot_index, habit.has_notification ? 1 : 0, habit.priority, habit.from_date, habit.to_date, habit.repeat_type]
    );
    return result.lastInsertRowId;
};

export const getAdvHabits = async () => {
    const db = await getDatabase();
    return await db.getAllAsync('SELECT * FROM adv_habits');
};

export const toggleAdvHabit = async (habitId, date) => {
    const db = await getDatabase();
    const existing = await db.getFirstAsync('SELECT * FROM adv_habit_checks WHERE habit_id = ? AND date = ?', [habitId, date]);
    if (existing) {
        await db.runAsync('UPDATE adv_habit_checks SET is_checked = ? WHERE habit_id = ? AND date = ?', [existing.is_checked ? 0 : 1, habitId, date]);
    } else {
        await db.runAsync('INSERT INTO adv_habit_checks (habit_id, date, is_checked) VALUES (?, ?, 1)', [habitId, date]);
    }
};

export const getAdvHabitChecks = async (date) => {
    const db = await getDatabase();
    return await db.getAllAsync('SELECT * FROM adv_habit_checks WHERE date = ?', [date]);
};

export const deleteAdvHabit = async (id) => {
    const db = await getDatabase();
    await db.runAsync('DELETE FROM adv_habits WHERE id = ?', [id]);
};

// ============= NOTEBOOKS =============
export const getNotebooks = async () => {
    const db = await getDatabase();
    return await db.getAllAsync('SELECT * FROM notebooks ORDER BY is_daily_log DESC, created_at DESC');
};

export const addNotebook = async (name) => {
    const db = await getDatabase();
    const result = await db.runAsync('INSERT INTO notebooks (name, is_daily_log) VALUES (?, 0)', [name]);
    return result.lastInsertRowId;
};

export const deleteNotebook = async (id) => {
    const db = await getDatabase();
    await db.runAsync('DELETE FROM notebooks WHERE id = ? AND is_daily_log = 0', [id]);
};

// ============= NOTEBOOK SESSIONS =============
export const getSessions = async (notebookId) => {
    const db = await getDatabase();
    return await db.getAllAsync('SELECT * FROM notebook_sessions WHERE notebook_id = ? ORDER BY created_at DESC', [notebookId]);
};

export const addSession = async (notebookId, name, content = '', type = 'text') => {
    const db = await getDatabase();
    const result = await db.runAsync(
        'INSERT INTO notebook_sessions (notebook_id, name, content, type) VALUES (?, ?, ?, ?)',
        [notebookId, name, content, type]
    );
    return result.lastInsertRowId;
};

export const updateSessionContent = async (sessionId, content) => {
    const db = await getDatabase();
    await db.runAsync('UPDATE notebook_sessions SET content = ? WHERE id = ?', [content, sessionId]);
};

export const deleteSession = async (id) => {
    const db = await getDatabase();
    await db.runAsync('DELETE FROM notebook_sessions WHERE id = ?', [id]);
};

// ============= TASKS =============
export const getTasksList = async () => {
    const db = await getDatabase();
    return await db.getAllAsync('SELECT * FROM tasks WHERE parent_task_id IS NULL ORDER BY start_date DESC, created_at DESC');
};

export const getUnsyncedTasks = async () => {
    const db = await getDatabase();
    return await db.getAllAsync('SELECT * FROM tasks WHERE calendar_event_id IS NULL AND parent_task_id IS NULL');
};

export const addTaskItem = async (task) => {
    const db = await getDatabase();
    let linkedHabitId = null;

    if (task.reminder_time && task.repeat_type) {
        let hourSlot = 0;
        let slotIndex = 0;
        const [h, m] = task.reminder_time.split(':');
        if (h && m) {
            hourSlot = parseInt(h);
            slotIndex = Math.floor(parseInt(m) / 12);
        }
        const habitResult = await db.runAsync(
            'INSERT INTO adv_habits (name, start_time, end_time, hour_slot, slot_index, has_notification, priority, from_date, to_date, repeat_type) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [task.name, task.reminder_time, task.reminder_time, hourSlot, slotIndex, 1, 1, task.start_date, task.end_date || null, task.repeat_type]
        );
        linkedHabitId = habitResult.lastInsertRowId;
    }

    const result = await db.runAsync(
        'INSERT INTO tasks (name, start_date, end_date, task_type, reminder_time, repeat_type, parent_task_id, linked_habit_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [
            task.name ?? null, 
            task.start_date ?? null, 
            task.end_date ?? null, 
            task.task_type ?? null, 
            task.reminder_time ?? null, 
            task.repeat_type ?? null, 
            task.parent_task_id ?? null, 
            linkedHabitId ?? null
        ]
    );
    return result.lastInsertRowId;
};

export const toggleTaskCompletion = async (id, currentStatus) => {
    const db = await getDatabase();
    await db.runAsync('UPDATE tasks SET is_completed = ? WHERE id = ?', [currentStatus ? 0 : 1, id]);
};

export const updateTaskCalendarIds = async (id, calendarEventId, reminderId) => {
    const db = await getDatabase();
    await db.runAsync('UPDATE tasks SET calendar_event_id = ?, reminder_id = ? WHERE id = ?', [calendarEventId, reminderId, id]);
};

export const deleteTaskItem = async (id, linkedHabitId) => {
    const db = await getDatabase();
    await db.runAsync('DELETE FROM tasks WHERE parent_task_id = ?', [id]);
    await db.runAsync('DELETE FROM tasks WHERE id = ?', [id]);
    if (linkedHabitId) {
        await db.runAsync('DELETE FROM adv_habits WHERE id = ?', [linkedHabitId]);
    }
};

// ============= TASK SUB-ITEMS =============

// Subtasks
export const getTaskSubtasks = async (taskId) => {
    const db = await getDatabase();
    return await db.getAllAsync('SELECT * FROM tasks WHERE parent_task_id = ? ORDER BY created_at ASC', [taskId]);
};
export const addTaskSubtask = async (taskId, name) => {
    // Legacy support: We now use addTaskItem with parent_task_id directly for rich subtasks.
    // This function will remain for any simple string based subtasks if needed.
    const db = await getDatabase();
    const result = await db.runAsync('INSERT INTO tasks (name, parent_task_id) VALUES (?, ?)', [name, taskId]);
    return result.lastInsertRowId;
};
export const toggleTaskSubtask = async (id, currentStatus) => {
    const db = await getDatabase();
    await db.runAsync('UPDATE tasks SET is_completed = ? WHERE id = ?', [currentStatus ? 0 : 1, id]);
};
export const deleteTaskSubtask = async (id) => {
    const db = await getDatabase();
    await db.runAsync('DELETE FROM tasks WHERE id = ?', [id]);
};

// Documents
export const getTaskDocuments = async (taskId) => {
    const db = await getDatabase();
    return await db.getAllAsync('SELECT * FROM task_documents WHERE task_id = ? ORDER BY created_at DESC', [taskId]);
};
export const addTaskDocument = async (taskId, title, content) => {
    const db = await getDatabase();
    const result = await db.runAsync('INSERT INTO task_documents (task_id, title, content) VALUES (?, ?, ?)', [taskId, title, content]);
    return result.lastInsertRowId;
};
export const deleteTaskDocument = async (id) => {
    const db = await getDatabase();
    await db.runAsync('DELETE FROM task_documents WHERE id = ?', [id]);
};

// Learnings
export const getTaskLearnings = async (taskId) => {
    const db = await getDatabase();
    return await db.getAllAsync('SELECT * FROM task_learnings WHERE task_id = ? ORDER BY created_at DESC', [taskId]);
};
export const addTaskLearning = async (taskId, content) => {
    const db = await getDatabase();
    const result = await db.runAsync('INSERT INTO task_learnings (task_id, content) VALUES (?, ?)', [taskId, content]);
    return result.lastInsertRowId;
};
export const deleteTaskLearning = async (id) => {
    const db = await getDatabase();
    await db.runAsync('DELETE FROM task_learnings WHERE id = ?', [id]);
};

// Comments
export const getTaskComments = async (taskId) => {
    const db = await getDatabase();
    return await db.getAllAsync('SELECT * FROM task_comments WHERE task_id = ? ORDER BY created_at DESC', [taskId]);
};
export const addTaskComment = async (taskId, content) => {
    const db = await getDatabase();
    const result = await db.runAsync('INSERT INTO task_comments (task_id, content) VALUES (?, ?)', [taskId, content]);
    return result.lastInsertRowId;
};
export const deleteTaskComment = async (id) => {
    const db = await getDatabase();
    await db.runAsync('DELETE FROM task_comments WHERE id = ?', [id]);
};

// Task Daily Logs Mapping
export const getIncompleteTasksForDailyLog = async () => {
    const db = await getDatabase();
    const tasks = await db.getAllAsync(`
        SELECT t.*, p.name as parent_name 
        FROM tasks t 
        LEFT JOIN tasks p ON t.parent_task_id = p.id 
        WHERE t.is_completed = 0 
        ORDER BY t.created_at DESC
    `);
    return tasks.map(t => ({
        ...t,
        displayName: t.parent_name ? `${t.parent_name} / ${t.name}` : t.name
    }));
};

export const getTaskDailyLogs = async (taskName) => {
    const db = await getDatabase();
    const sessions = await db.getAllAsync(`
        SELECT ns.* FROM notebook_sessions ns
        JOIN notebooks n ON ns.notebook_id = n.id
        WHERE n.is_daily_log = 1
        ORDER BY ns.created_at DESC
    `);
    
    if (!taskName) return [];
    
    const lowerName = taskName.toLowerCase().trim();
    return sessions.filter(s => {
        const matchContent = s.content && s.content.toLowerCase().includes(lowerName);
        const matchName = s.name && s.name.toLowerCase().includes(lowerName);
        return matchContent || matchName;
    });
};
// ============= SHOONYA TRADING =============

export const saveShoonyaConfig = async (config) => {
    const db = await getDatabase();
    await db.runAsync('DELETE FROM shoonya_config'); // Only one config for now
    const result = await db.runAsync(
        'INSERT INTO shoonya_config (user_id, password, api_key, vendor_code, totp_secret, imei, actid, is_active) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [config.user_id, config.password, config.api_key, config.vendor_code, config.totp_secret, config.imei || 'ALT123456789', config.actid || config.user_id, 1]
    );
    return result.lastInsertRowId;
};

export const getShoonyaConfig = async () => {
    const db = await getDatabase();
    return await db.getFirstAsync('SELECT * FROM shoonya_config WHERE is_active = 1');
};

export const saveTradingPreset = async (preset) => {
    const db = await getDatabase();
    const result = await db.runAsync(
        'INSERT INTO trading_presets (name, symbol, exchange, quantity, product_type) VALUES (?, ?, ?, ?, ?)',
        [preset.name, preset.symbol, preset.exchange || 'NSE', preset.quantity || 1, preset.product_type || 'MIS']
    );
    return result.lastInsertRowId;
};

export const getTradingPresets = async () => {
    const db = await getDatabase();
    return await db.getAllAsync('SELECT * FROM trading_presets');
};

export const deleteTradingPreset = async (id) => {
    const db = await getDatabase();
    await db.runAsync('DELETE FROM trading_presets WHERE id = ?', [id]);
};

// ============= WATCHLISTS =============
export const initWatchlistTables = async () => {
    const db = await getDatabase();
    try {
        await db.execAsync(`
            CREATE TABLE IF NOT EXISTS watchlists (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                sort_order INTEGER DEFAULT 0,
                created_at TEXT DEFAULT (datetime('now','localtime'))
            );
            CREATE TABLE IF NOT EXISTS watchlist_stocks (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                watchlist_id INTEGER NOT NULL,
                symbol TEXT NOT NULL,
                exchange TEXT DEFAULT 'NSE',
                token TEXT,
                company_name TEXT,
                created_at TEXT DEFAULT (datetime('now','localtime')),
                FOREIGN KEY (watchlist_id) REFERENCES watchlists(id) ON DELETE CASCADE,
                UNIQUE(watchlist_id, symbol, exchange)
            );
        `);
    } catch (e) {
        console.warn('[DB] Watchlist tables init:', e?.message);
    }
};

export const getWatchlists = async () => {
    const db = await getDatabase();
    await initWatchlistTables();
    return await db.getAllAsync('SELECT * FROM watchlists ORDER BY sort_order, id');
};

export const addWatchlist = async (name) => {
    const db = await getDatabase();
    await initWatchlistTables();
    const result = await db.runAsync('INSERT INTO watchlists (name) VALUES (?)', [name]);
    return result.lastInsertRowId;
};

export const deleteWatchlist = async (id) => {
    const db = await getDatabase();
    await db.runAsync('DELETE FROM watchlists WHERE id = ?', [id]);
};

export const getWatchlistStocks = async (watchlistId) => {
    const db = await getDatabase();
    await initWatchlistTables();
    return await db.getAllAsync('SELECT * FROM watchlist_stocks WHERE watchlist_id = ? ORDER BY id', [watchlistId]);
};

export const addWatchlistStock = async (watchlistId, stock) => {
    const db = await getDatabase();
    await initWatchlistTables();
    try {
        const result = await db.runAsync(
            'INSERT INTO watchlist_stocks (watchlist_id, symbol, exchange, token, company_name) VALUES (?, ?, ?, ?, ?)',
            [watchlistId, stock.symbol, stock.exchange || 'NSE', stock.token || '', stock.company_name || '']
        );
        return result.lastInsertRowId;
    } catch (e) {
        // Duplicate entry
        console.warn('Stock already in watchlist');
        return null;
    }
};

export const removeWatchlistStock = async (id) => {
    const db = await getDatabase();
    await db.runAsync('DELETE FROM watchlist_stocks WHERE id = ?', [id]);
};
// ============= BACKUP & RESTORE =============

export const getAllDataForBackup = async () => {
    const db = await getDatabase();
    const tables = [
        'expenses', 'daily_records', 'trading', 'habits', 'habit_checks', 
        'app_usage', 'adv_habits', 'adv_habit_checks', 'notebooks', 
        'notebook_sessions', 'tasks', 'task_documents', 'task_learnings', 
        'task_comments', 'shoonya_config', 'trading_presets', 'inter_transfers'
    ];
    
    const backup = {};
    for (const table of tables) {
        try {
            backup[table] = await db.getAllAsync(`SELECT * FROM ${table}`);
        } catch (e) {
            console.warn(`Backup failed for table ${table}:`, e);
            backup[table] = [];
        }
    }
    return backup;
};

export const restoreDataFromBackup = async (backup) => {
    const db = await getDatabase();
    // Use a transaction for safety
    await db.execAsync('BEGIN TRANSACTION');
    try {
        const tables = Object.keys(backup);
        for (const table of tables) {
            // Delete existing data
            await db.runAsync(`DELETE FROM ${table}`);
            const rows = backup[table];
            if (!rows || rows.length === 0) continue;
            
            const columns = Object.keys(rows[0]);
            const placeholders = columns.map(() => '?').join(',');
            const sql = `INSERT INTO ${table} (${columns.join(',')}) VALUES (${placeholders})`;
            
            for (const row of rows) {
                const values = columns.map(col => row[col]);
                await db.runAsync(sql, values);
            }
        }
        await db.execAsync('COMMIT');
        return { success: true };
    } catch (e) {
        await db.execAsync('ROLLBACK');
        console.error('Restore failed:', e);
        return { success: false, error: e.message };
    }
};
