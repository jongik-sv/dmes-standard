-- ============================================================
-- V22: OBJECT 화면 코드 경로(FORM_URL) 채우기
-- ============================================================
--
-- 대상 스키마: MCMAPUSER   위치: oracle/mcmapuser
-- 이 파일은 그 스키마 주인으로 접속해 실행된다(앱 Flyway 또는 pdb.mjs template-schema, 운영은 DBA).
--
-- 배경:
--   2026-11-26 사용자 결정 — 메뉴가 OBJECT 를 참조하고 OBJECT 는 메뉴 정보를 갖지 않는다. 화면 코드 경로
--   (componentPath·fullId·pageId, 예: csa/commMenuMng)는 OBJECT 의 것이므로 TB_MCM_SEC_OBJ.FORM_URL 에서 읽는다
--   (mcm-core mcm.menu.MenuCodePath). 메뉴를 다른 폴더로 옮겨도 화면이 그대로 열려야 한다.
--   지금까지 경로는 TB_MCM_SEC_MENU.PARENT_MENU_ID || '/' || OBJECT_ID 로 만들었고, 즐겨찾기·기본 화면의 FULL_ID 와
--   화면 사용 통계·조회 기본값의 PAGE_ID 가 그 값으로 저장돼 있다. 저장된 값이 계속 맞도록 FORM_URL 이 비었거나 '/' 가
--   없는 OBJECT 에 그 옛 값을 채운다. 한 OBJECT 가 여러 메뉴에 놓였으면 MIN 으로 늘 같은 값을 고른다.
--   접속 경로(ACCESS_TP)가 외부인 OBJECT 는 FORM_URL 에 값이 있으면 건드리지 않는다(비어 있을 때만 채운다).
--   같은 문장을 앱도 갖고 있다(SecMenuNativeRepository.backfillObjectFormUrl). 시드는 Flyway 뒤에 OBJECT 를 FORM_URL 없이
--   넣으므로 새 DB 는 기동 시드 마무리(MenuFinalizer)가 채운다. 이 파일은 시드가 꺼진 기존 DB(개발계·운영 — DBA 적용)용이다.
--   DML 하나라 다시 실행해도 안전하다(채운 행은 조건에서 빠진다). 스키마(컬럼)는 바꾸지 않는다.
-- ============================================================

UPDATE TB_MCM_SEC_OBJ O
   SET O.FORM_URL = (SELECT MIN(M.PARENT_MENU_ID || '/' || M.OBJECT_ID)
                       FROM TB_MCM_SEC_MENU M
                      WHERE M.OBJECT_ID = O.OBJECT_ID
                        AND TRIM(M.PARENT_MENU_ID) IS NOT NULL)
 WHERE (TRIM(O.FORM_URL) IS NULL
        OR (INSTR(O.FORM_URL, '/') = 0 AND NVL(O.ACCESS_TP, '-') <> N'외부'))
   AND EXISTS (SELECT 1
                 FROM TB_MCM_SEC_MENU M
                WHERE M.OBJECT_ID = O.OBJECT_ID
                  AND TRIM(M.PARENT_MENU_ID) IS NOT NULL);
