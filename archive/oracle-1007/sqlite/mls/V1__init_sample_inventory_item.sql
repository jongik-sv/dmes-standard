-- 재고 품목 샘플 슬라이스 초기 스키마.
CREATE TABLE sample_inventory_item (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    item_code TEXT NOT NULL,
    item_name TEXT NOT NULL,
    qty NUMERIC NOT NULL,
    location TEXT
);
