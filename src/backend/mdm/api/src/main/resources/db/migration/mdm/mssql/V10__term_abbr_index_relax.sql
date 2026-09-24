-- TSK-04-02 design.md D1 — 수용 기준 "약어 중복 경고"(거부 아님)와 V3 의 부분 유일 인덱스
-- UX_TB_MDM_TERM_ABBR 가 상충한다. 유일 인덱스를 비유일로 교체해 애플리케이션 경고(TermSaveResult.warnings)
-- 로 대체한다. 필터(ENG_ABBR IS NOT NULL)는 그대로 유지 — NULL 행은 여전히 색인하지 않는다.
-- 원래 V4 로 채번했으나 TSK-05-01(V4__create_mdm_interface_layout)이 dev 에 먼저 머지돼 번호가 겹쳐
-- 팀장 배정표대로 V5 로 재채번했으나, 배정표가 폐기되고 V8·V9 가 먼저 머지돼 역순 도착이 되므로
-- 머지 뒤 최대 버전+1 인 V10 으로 다시 재채번했다(2026-09-24 팀장 정정, 파일명만 바뀜, 내용은 동일).
DROP INDEX UX_TB_MDM_TERM_ABBR ON TB_MDM_TERM;
CREATE INDEX IX_TB_MDM_TERM_ABBR ON TB_MDM_TERM(ENG_ABBR) WHERE ENG_ABBR IS NOT NULL;
