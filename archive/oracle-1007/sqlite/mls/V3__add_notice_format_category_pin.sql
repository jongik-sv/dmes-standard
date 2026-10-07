-- ============================================================
-- V3: 공지 본문 형식·분류·상단 고정 컬럼 추가
-- ============================================================
--
-- 배경:
--   포털 홈 화면에 공지를 보여 주면서(noticeBoard) 본문을 서식 있게 쓰고, 점검·긴급 공지를 구분하고,
--   중요한 공지를 목록 위에 고정해야 한다. 정본: docs/mls/design/noticeMgmt/noticeMgmt_기능설계서.md §4·§10.
--
--   CONTENT_FORMAT  본문 형식  TEXT(일반 글) / MD(마크다운) / HTML(서버가 소독한 HTML)
--   NOTICE_CATEGORY 공지 분류  NORMAL(일반) / MAINT(점검) / URGENT(긴급)
--   PIN_YN          상단 고정  Y / N
--
--   세 컬럼 모두 NOT NULL + 상수 DEFAULT 라 SQLite 의 ALTER TABLE ADD COLUMN 으로 바로 붙는다.
--   기존 행(V2 시드 3건 포함)은 DEFAULT 값(TEXT·NORMAL·N)을 받는다. 테이블 재생성은 하지 않는다.
--
-- CONTENT 4000자 제한 해제:
--   V2 는 CONTENT 를 VARCHAR(4000) 으로 선언했지만 SQLite 는 VARCHAR 길이를 강제하지 않는다(TEXT 친화도).
--   그래서 SQLite 체인에서는 컬럼 타입을 바꿀 필요가 없고, 제한은 엔티티 @Column 길이와 서비스 검증(V-003)에서만
--   걸려 있었다 — 둘 다 이 변경과 함께 없앴다. SQLite 는 ALTER COLUMN 이 없어 타입을 바꾸려면 테이블을 재생성해야
--   하는데, 강제되지 않는 길이 하나 때문에 재생성 위험(컬럼 매핑 실수·데이터 유실)을 질 이유가 없다.
--   ⚠ 운영 방언(Oracle·PostgreSQL·MSSQL) 폴더를 만들 때는 CONTENT 를 CLOB / TEXT / NVARCHAR(MAX) 로 선언해야 한다.
--
-- 대응: 공통 위치(db/migration/mls) 단일 파일. 방언 폴더 없음(mls 는 SQLite 한 벌).
-- ============================================================

ALTER TABLE TB_MLS_NOTICE ADD COLUMN CONTENT_FORMAT VARCHAR(10) NOT NULL DEFAULT 'TEXT';

ALTER TABLE TB_MLS_NOTICE ADD COLUMN NOTICE_CATEGORY VARCHAR(10) NOT NULL DEFAULT 'NORMAL';

ALTER TABLE TB_MLS_NOTICE ADD COLUMN PIN_YN CHAR(1) NOT NULL DEFAULT 'N';

-- 시드 1건을 마크다운 예시로 바꾼다 — 홈 화면에서 MD 렌더링·점검 분류·상단 고정을 바로 눈으로 확인하려는 용도.
-- V2 파일은 고치지 않는다(이미 적용된 DB 의 Flyway 체크섬이 깨진다). 사용자가 이미 고친 행은 건드리지 않도록
-- V2 시드 원문 그대로일 때만 바꾼다.
UPDATE TB_MLS_NOTICE
   SET CONTENT_FORMAT  = 'MD',
       NOTICE_CATEGORY = 'MAINT',
       PIN_YN          = 'Y',
       CONTENT         = '## 정기 점검 안내' || char(10) || char(10)
                      || '매월 **첫째 주 토요일 02:00~04:00** 에 정기 점검이 진행됩니다.' || char(10) || char(10)
                      || '- 점검 중에는 포털 접속이 끊길 수 있습니다.' || char(10)
                      || '- 작업 중인 내용은 점검 시작 전에 저장해 주세요.',
       U_SVC_ID        = 'flyway',
       U_PGM_ID        = 'V3__add_notice_format_category_pin'
 WHERE NOTICE_ID = 'NT202609030001'
   AND CONTENT = '매월 첫째 주 토요일 02:00~04:00 정기 점검이 진행됩니다.';
