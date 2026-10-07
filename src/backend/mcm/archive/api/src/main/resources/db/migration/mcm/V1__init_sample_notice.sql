-- 공지사항 샘플 슬라이스 초기 스키마.
CREATE TABLE sample_notice (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    content TEXT,
    active INTEGER NOT NULL
);
