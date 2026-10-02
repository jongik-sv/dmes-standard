-- 2026-10-02 — MDM 메타 변경 기록(spec docs/superpowers/specs/2026-10-02-mdm-meta-cache-design.md §3.1).
--
-- 왜: 업무 모듈 캐시가 "순번 N 이후 바뀐 키"만 받아 지운다(D2). 원장 쓰기 서비스가 같은 트랜잭션에서 한 행씩 쌓는다
-- (MetaRevisionRecorder). 조회는 늘 REV_SEQ > :since 라 인덱스는 PK 하나로 충분하다.
-- REV_SEQ 는 AUTOINCREMENT — 지운 최댓값을 다시 쓰지 않아 순번이 되돌지 않는다. DB 를 새로 만들면 1 부터 다시 시작하고,
-- 클라이언트는 latestSeq 가 자기 appliedSeq 보다 작아진 것(역행, §5.3-4)을 보고 캐시를 비운다.
-- 감사 9칼럼은 다른 TB_MDM_* 와 같다(ADR-0001). 스펙 표의 REG_DT·REG_ID 는 C_AT·C_USR_ID 가 맡는다.
-- 보관 정리(30일)는 이번 범위가 아니다.
-- 되돌리려면: DROP TABLE TB_MDM_META_REV (변경 기록이 사라진다 — 업무 모듈은 역행으로 보고 캐시를 비운다).

CREATE TABLE TB_MDM_META_REV (
    REV_SEQ INTEGER CONSTRAINT PK_TB_MDM_META_REV PRIMARY KEY AUTOINCREMENT,
    TARGET_TYPE VARCHAR(20) NOT NULL,
    TARGET_KEY VARCHAR(100) NOT NULL,
    CHANGE_KIND VARCHAR(10) NOT NULL,
    C_USR_ID VARCHAR(100),
    C_AT TIMESTAMP,
    C_SVC_ID VARCHAR(100),
    C_PGM_ID VARCHAR(100),
    U_USR_ID VARCHAR(100),
    U_AT TIMESTAMP,
    U_SVC_ID VARCHAR(100),
    U_PGM_ID VARCHAR(100),
    VER BIGINT,
    CONSTRAINT CK_TB_MDM_META_REV_TYPE CHECK (TARGET_TYPE IN ('COLUMN','DOMAIN','RULE','RULE_SET','CODE','LAYOUT')),
    CONSTRAINT CK_TB_MDM_META_REV_KIND CHECK (CHANGE_KIND IN ('SAVE','EVICT','RELOAD'))
);
