-- ============================================================
-- V25: commUserMng 퇴직 미리 보기·받을 사람 찾기 action 권한
-- ============================================================
--
-- 대상 스키마: MCMAPUSER   위치: oracle/mcmapuser
-- 이 파일은 그 스키마 주인으로 접속해 실행된다(앱 Flyway 또는 pdb.mjs template-schema, 운영은 DBA).
--
-- 배경:
--   commUserMng BPMN 에 조회 action 두 개가 생겼다(2026-11-28 시안 「사용자 비활성화·퇴직 처리」 후속).
--     searchRetirePreview  퇴직 처리 팝업 미리 보기 — 회수할 역할그룹 수·해제할 사용자 쿼리 배정 수·MDM 담당 건수
--     searchActiveUserLov  받을 사람 찾기 — 상태 활성·잠금 사용자만
--   이미 적용된 V21·V24 에는 없다. 그래서 옮긴 DB 의 SYSADMIN(효과 = 오브젝트 BTN_PERM)과 직무가 부를 수 없다.
--   V24 7절과 같은 모양으로 오브젝트 허용 값에 더하고, 조회(search) 권한을 가진 직무에 준다.
--   저장(save) 권한을 가진 직무도 받는다 — 그 직무는 V24 에서 퇴직(retire)·인계(handover)를 받았고, 두 팝업이 이 조회를 쓴다.
--
-- 재실행: DML 만 있다. INSTR 조건이 이미 더한 행을 건너뛰므로 다시 실행해도 같다.
-- ============================================================

-- 오브젝트 허용 값
UPDATE TB_MCM_SEC_OBJ
   SET BTN_PERM = BTN_PERM || ',searchActiveUserLov,searchRetirePreview'
 WHERE OBJECT_ID = 'commUserMng'
   AND BTN_PERM IS NOT NULL
   AND INSTR(',' || BTN_PERM || ',', ',searchRetirePreview,') = 0;

-- 조회 권한(search)·저장 권한(save)을 가진 직무
UPDATE TB_MCM_SEC_ROLE_PERM
   SET BTN_PERM = BTN_PERM || ',searchActiveUserLov,searchRetirePreview'
 WHERE OBJECT_ID = 'commUserMng'
   AND (INSTR(',' || BTN_PERM || ',', ',search,') > 0
        OR INSTR(',' || BTN_PERM || ',', ',save,') > 0)
   AND INSTR(',' || BTN_PERM || ',', ',searchRetirePreview,') = 0;

COMMIT;
