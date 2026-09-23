-- TSK-04-02 design.md D1 — 수용 기준 "약어 중복 경고"(거부 아님)와 V3 의 부분 유일 인덱스
-- UX_TB_MDM_TERM_ABBR 가 상충한다. 유일 인덱스를 비유일로 교체해 애플리케이션 경고(TermSaveResult.warnings)
-- 로 대체한다. 필터(ENG_ABBR IS NOT NULL)는 그대로 유지 — NULL 행은 여전히 색인하지 않는다.
DROP INDEX UX_TB_MDM_TERM_ABBR ON TB_MDM_TERM;
CREATE INDEX IX_TB_MDM_TERM_ABBR ON TB_MDM_TERM(ENG_ABBR) WHERE ENG_ABBR IS NOT NULL;
