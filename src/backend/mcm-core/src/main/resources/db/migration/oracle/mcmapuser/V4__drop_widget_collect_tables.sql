-- ============================================================
-- V4: 위젯 자동 수집 빈 표 2개 삭제
-- ============================================================
--
-- 대상 스키마: MCMAPUSER   위치: oracle/mcmapuser
-- 이 파일은 그 스키마 주인으로 접속해 실행된다(앱 Flyway 또는 pdb.mjs template-schema, 운영은 DBA).
--
-- 배경 (docs/superpowers/specs/2026-10-08-job-scheduler-design.md §3.3·§6, 사용자 삭제 승인 2026-10-09):
--   위젯 「자동 수집(collect)」 유형을 없애고 수집은 예약 작업(jobCollect, TB_MCM_JOB_COLLECT_DATA)이 맡는다.
--   V1 의 TB_MCM_WIDGET_COLLECT_RUN·TB_MCM_WIDGET_COLLECT_DATA 는 더 쓰는 코드가 없고, 삭제 전에 L_MAIN 에서 두 표 모두
--   0행임을 확인했다. 색인(PK·IX_MCM_WCOL_*_SLOT)은 표와 함께 지워지고 시퀀스는 없다.
--   PURGE 없이 지운다(운영에서 실수였을 때 휴지통에서 되살릴 수 있게).
-- ============================================================

drop table TB_MCM_WIDGET_COLLECT_RUN;

drop table TB_MCM_WIDGET_COLLECT_DATA;
