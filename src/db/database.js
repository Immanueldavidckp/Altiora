import * as SQLite from 'expo-sqlite';

let db = null;

export const getDatabase = async () => {
    if (db) return db;
    db = await SQLite.openDatabaseAsync('offline_tasker.db');
    await initializeDatabase(db);
    return db;
};

const initializeDatabase = async (database) => {
    await database.execAsync(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

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
  `);
};

// ============= EXPENSES =============
export const addExpense = async (expense) => {
    const db = await getDatabase();
    const result = await db.runAsync(
        'INSERT INTO expenses (amount, description, category, payment_method, type, date, latitude, longitude, location_name) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [
            expense.amount,
            expense.description,
            expense.category,
            expense.payment_method,
            expense.type || 'expense',
            expense.date,
            expense.latitude || null,
            expense.longitude || null,
            expense.location_name || null
        ]
    );
    return result.lastInsertRowId;
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
