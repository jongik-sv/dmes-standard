-- ============================================================
-- V28: 오브젝트 유형 코드(WEB·POPUP·SUB·WIDGET)
-- ============================================================
--
-- 대상 스키마: MCMAPUSER   위치: oracle/mcmapuser
-- 이 파일은 그 스키마 주인으로 접속해 실행된다(앱 Flyway 또는 pdb.mjs template-schema, 운영은 DBA).
--
-- 배경:
--   2026-11-28 — 메뉴 관리(commMenuMng)의 「놓이지 않은 오브젝트」 목록에 팝업·화면 안 기능·도구 위젯이 섞여 나왔다. 이들은 자기 화면
--   경로가 없어 메뉴에 넣으면 열리지 않는다. TB_MCM_SEC_OBJ.OBJECT_TYPE(지금까지 자유 입력, 모든 행 'web')을 코드로 바꾼다.
--     WEB    메뉴 화면 — 포털이 메뉴로 여는 화면
--     POPUP  팝업 — 다른 화면 안에서 여는 창(모달)
--     SUB    화면 안 기능 — 다른 화면의 탭·상세·단추가 부르는 서비스 권한 키(그 화면에 합쳐진 옛 화면 포함)
--     WIDGET 도구 위젯 — 포털 홈·위젯 틀에서 쓰는 부품
--   앱은 POPUP·SUB·WIDGET 을 놓이지 않은 목록에서 빼고 메뉴 저장에서 거부한다(mcm-core entity.SecObjType). 권한은 그대로다.
--   공통 코드가 아니라 상수다(ACCESS_TP·MENU_TP 와 같은 관례). 칸 이름·길이·순서는 그대로라 재배치는 없다.
--
--   1) 기본값을 'WEB' 으로 둔다(칸을 빼고 넣는 INSERT 용. 앱은 늘 값을 넣는다).
--   2) 옛 값을 대문자 코드로 맞춘다. 'web' 등 대소문자·공백만 다른 값은 대문자로, 빈 값과 알 수 없는 값은 'WEB' 으로.
--      As-Is 는 늘 'web' 이었다. 운영·개발 DB 는 적용 전에 다른 값이 있는지 아래 문장으로 확인해 둔다.
--        SELECT OBJECT_ID, OBJECT_TYPE FROM TB_MCM_SEC_OBJ WHERE OBJECT_TYPE IS NULL OR OBJECT_TYPE <> 'web';
--   3) 메뉴에 놓이지 않은 팝업·화면 안 기능·위젯을 분류한다(화면 코드 근거 — 각 OBJECT 를 여는 곳):
--      POPUP  termRegPop(columnMng 의 모달), dataCsvUploadPop(dataItemMng 의 모달)
--      SUB    codeEdit(codeMng 오른쪽 상세로 합침), codeCateEdit(codeItemEdit 의 카테고리 탭으로 합침),
--             dataEdit(dataMng 오른쪽 상세로 합침), dataCateEdit·dataHistory(dataItemMng 의 탭·패널로 합침),
--             metaFeed(mdmCacheMng 의 강제 기록 서비스)
--      WIDGET ruleCalc(위젯 유형 rule-calc), noticeBoard(포털 홈 공지 위젯 home.notice)
--      이미 메뉴 행이 가리키는 OBJECT 는 바꾸지 않는다(메뉴 관리가 그 메뉴를 먼저 뺀 뒤 오브젝트 관리에서 바꾼다).
--   새 DB 는 시드가 Flyway 뒤에 이 OBJECT 들을 맞는 유형으로 넣는다(mcm/api init.seed MdmMenuSeeder). noticeBoard 는 시드하지
--   않는다(10-02 에 잠시 시드했던 DB 에만 있다). DML 은 다시 실행해도 같은 결과다. CHECK 제약은 두지 않는다(앱 저장이 검증한다).
-- ============================================================

alter table TB_MCM_SEC_OBJ modify (OBJECT_TYPE default 'WEB');

UPDATE TB_MCM_SEC_OBJ
   SET OBJECT_TYPE = UPPER(TRIM(OBJECT_TYPE))
 WHERE UPPER(TRIM(OBJECT_TYPE)) IN ('WEB', 'POPUP', 'SUB', 'WIDGET')
   AND OBJECT_TYPE <> UPPER(TRIM(OBJECT_TYPE));

UPDATE TB_MCM_SEC_OBJ
   SET OBJECT_TYPE = 'WEB'
 WHERE OBJECT_TYPE IS NULL
    OR OBJECT_TYPE NOT IN ('WEB', 'POPUP', 'SUB', 'WIDGET');

UPDATE TB_MCM_SEC_OBJ O
   SET O.OBJECT_TYPE = 'POPUP'
 WHERE O.OBJECT_ID IN ('termRegPop', 'dataCsvUploadPop')
   AND O.OBJECT_TYPE = 'WEB'
   AND NOT EXISTS (SELECT 1
                     FROM TB_MCM_SEC_MENU M
                    WHERE M.OBJECT_ID = O.OBJECT_ID);

UPDATE TB_MCM_SEC_OBJ O
   SET O.OBJECT_TYPE = 'SUB'
 WHERE O.OBJECT_ID IN ('codeEdit', 'codeCateEdit', 'dataEdit', 'dataCateEdit', 'dataHistory', 'metaFeed')
   AND O.OBJECT_TYPE = 'WEB'
   AND NOT EXISTS (SELECT 1
                     FROM TB_MCM_SEC_MENU M
                    WHERE M.OBJECT_ID = O.OBJECT_ID);

UPDATE TB_MCM_SEC_OBJ O
   SET O.OBJECT_TYPE = 'WIDGET'
 WHERE O.OBJECT_ID IN ('ruleCalc', 'noticeBoard')
   AND O.OBJECT_TYPE = 'WEB'
   AND NOT EXISTS (SELECT 1
                     FROM TB_MCM_SEC_MENU M
                    WHERE M.OBJECT_ID = O.OBJECT_ID);
