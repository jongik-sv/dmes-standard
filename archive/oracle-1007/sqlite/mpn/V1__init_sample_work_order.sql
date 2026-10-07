-- 계획/작업지시 샘플 슬라이스 초기 스키마.
CREATE TABLE sample_work_order (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_no TEXT NOT NULL,
    item_code TEXT NOT NULL,
    planned_qty NUMERIC NOT NULL,
    due_date TEXT NOT NULL,
    status TEXT NOT NULL
);
