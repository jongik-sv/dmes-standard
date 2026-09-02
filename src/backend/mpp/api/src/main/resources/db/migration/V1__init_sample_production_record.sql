-- 생산 실적 샘플 슬라이스 초기 스키마.
CREATE TABLE sample_production_record (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    work_order_no TEXT NOT NULL,
    produced_qty NUMERIC NOT NULL,
    defect_qty NUMERIC NOT NULL,
    recorded_at TEXT NOT NULL
);
