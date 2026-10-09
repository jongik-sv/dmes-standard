-- ============================================================
-- V7: 예약 작업 「놓친 회차 한 번 실행」 옵션 (D6 후속, tx-13)
-- ============================================================
--
-- 대상 스키마: MCMAPUSER   위치: oracle/mcmapuser
-- 이 파일은 그 스키마 주인으로 접속해 실행된다(앱 Flyway 또는 pdb.mjs template-schema, 운영은 DBA).
--
-- 배경 (docs/superpowers/specs/2026-10-08-job-scheduler-design.md §4.2.1):
--   MCM 이 꺼져 있었거나 판정이 늦어 늦어진 회차(DB_NOW - NEXT_RUN_AT > 2분)는 지금까지 따라잡지 않고 SKIP 1건만 남겼다.
--   작업마다 이 옵션을 켜면 SKIP 대신 한 번 실행한다(여러 회차를 놓쳐도 1회). 기본은 꺼짐('N')이라 기존 작업 동작은 그대로다.
--   - TB_MCM_JOB_DEF.MISFIRE_RUN_YN : 옵션 칸 'Y'·'N' (기본 'N')
--   - TB_MCM_JOB_RUN.TRIGGER_TP     : 'C'(놓친 회차 한 번 실행) 값을 CHECK 에 더한다. 이력에서 구분 칸에 「놓친 회차」로 보인다.
--
-- 멱등: 칼럼·제약이 이미 있으면 건너뛴다(다시 실행해도 같은 결과). 이미 적용된 V3 는 수정하지 않는다.
--   기존 행은 모두 'N' 으로 채워지고(default), TRIGGER_TP 제약은 값만 하나 늘어나므로 기존 행이 위반하지 않는다.
-- ============================================================

declare
    n number;
begin
    select count(*) into n from USER_TAB_COLUMNS where TABLE_NAME = 'TB_MCM_JOB_DEF' and COLUMN_NAME = 'MISFIRE_RUN_YN';
    if n = 0 then
        execute immediate 'alter table TB_MCM_JOB_DEF add (MISFIRE_RUN_YN char(1 char) default ''N'' not null)';
    end if;

    select count(*) into n from USER_CONSTRAINTS where TABLE_NAME = 'TB_MCM_JOB_DEF' and CONSTRAINT_NAME = 'CK_TB_MCM_JOB_DEF_MISFIRE';
    if n = 0 then
        execute immediate 'alter table TB_MCM_JOB_DEF add constraint CK_TB_MCM_JOB_DEF_MISFIRE check (MISFIRE_RUN_YN in (''Y'',''N''))';
    end if;

    -- TRIGGER_TP 제약은 값 목록이 바뀌므로 지우고 다시 만든다. 이미 ('S','M','C') 로 바뀌어 있으면 그대로 둔다.
    select count(*) into n from USER_CONSTRAINTS C
     where C.TABLE_NAME = 'TB_MCM_JOB_RUN' and C.CONSTRAINT_NAME = 'CK_TB_MCM_JOB_RUN_TRG' and C.SEARCH_CONDITION_VC like '%''C''%';
    if n = 0 then
        select count(*) into n from USER_CONSTRAINTS where TABLE_NAME = 'TB_MCM_JOB_RUN' and CONSTRAINT_NAME = 'CK_TB_MCM_JOB_RUN_TRG';
        if n > 0 then
            execute immediate 'alter table TB_MCM_JOB_RUN drop constraint CK_TB_MCM_JOB_RUN_TRG';
        end if;
        execute immediate 'alter table TB_MCM_JOB_RUN add constraint CK_TB_MCM_JOB_RUN_TRG check (TRIGGER_TP in (''S'',''M'',''C''))';
    end if;
end;
/
