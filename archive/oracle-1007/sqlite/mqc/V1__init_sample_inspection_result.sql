-- 품질 검사 결과 샘플 슬라이스 초기 스키마.
CREATE TABLE sample_inspection_result (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    lot_no TEXT NOT NULL,
    inspected_at TEXT NOT NULL,
    result TEXT NOT NULL,
    remark TEXT
);
