-- ============================================================
-- V8: 옛 환율 표 TB_MCM_EXCHANGE_RATE 삭제
-- ============================================================
--
-- 대상 스키마: MCMAPUSER   위치: oracle/mcmapuser
-- 이 파일은 그 스키마 주인으로 접속해 실행된다(앱 Flyway 또는 pdb.mjs template-schema, 운영은 DBA).
--
-- 배경 (docs/superpowers/specs/2026-10-09-mdm-fx-master-design.md, 사용자 삭제 승인 2026-10-09):
--   환율은 MDM 마스터 FX_RATE(날짜 한 행·통화 칼럼)에 모이고 위젯은 FxMasterReader 로 읽는다.
--   V1 의 TB_MCM_EXCHANGE_RATE 를 쓰던 엔티티·저장소·ExchangeRateWriter 는 이 버전과 함께 지웠다.
--   L_MAIN 의 표는 130행(2026-09-03~10-08)이었다. PK(PK_TB_MCM_EXCHANGE_RATE)는 표와 함께 지워지고
--   시퀀스는 없다. PURGE 없이 지운다(운영에서 실수였을 때 휴지통에서 되살릴 수 있게).
--
-- 멱등: 표가 이미 없으면 건너뛴다(다시 실행해도 같은 결과). 이미 적용된 V1 은 수정하지 않는다.
-- ============================================================

declare
    n number;
begin
    select count(*) into n from USER_TABLES where TABLE_NAME = 'TB_MCM_EXCHANGE_RATE';
    if n > 0 then
        execute immediate 'drop table TB_MCM_EXCHANGE_RATE';
    end if;
end;
/
