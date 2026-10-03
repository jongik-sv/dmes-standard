-- 2026-10-03 — 레이아웃 확정 때 컬럼 속성(DATA_TYPE·UNIT_CODE·SCALE)을 항목 행에 고정한다(D-151, 스펙
--   docs/superpowers/specs/2026-10-02-mdm-object-versioning-design.md §7 후속 P3-28, 3단계 최종 검토 I1 의 장기 대책).
--
-- 왜: RELEASED 레이아웃(전문·헤더) 버전을 시각 T 로 합성할 때 항목의 타입(NUM/CHAR)·단위·소수 자릿수를 그때의 컬럼 사전
--   (컬럼 → 유효 도메인)에서 읽어, 확정 뒤 사전을 고치면 확정 없이 RELEASED 합성이 바뀌었다. 길이·오프셋은 저장 때 LENGTH·OFFSET 에
--   이미 굳는다. 이제 확정이 그 버전 항목 행 전부를 고정 표시(PINNED_YN 'Y')하고 확정 시점 유효값을 복사하며(값이 없으면 NULL 로
--   고정), 확정 취소가 표시와 값을 비우고, 새 버전 복사는 옮기지 않는다(DRAFT 는 'N'). 합성은 고정 표시 행이면 NULL 까지 그 값을,
--   아니면 지금 사전 값을 쓴다(팀장 결정 2026-10-03 — 브리프 결정 4 의 "칸별 NULL 이면 지금 사전" 을 바꿨다).
-- 칼럼: 같은 의미의 도메인 칸과 같은 타입 — DATA_TYPE VARCHAR(20)(도메인 최상위의 DATA_TYPE), UNIT_CODE VARCHAR(20)(단위 원장 FK,
--   도메인 UNIT_CODE·항목 TRANS_UNIT 과 같다 — 고정한 단위가 지워지면 RELEASED 직렬화의 단위 환산이 깨진다), SCALE INTEGER. 모두 NULL 허용.
--   PINNED_YN VARCHAR(1) NOT NULL DEFAULT 'N' — 세 값이 실제로 NULL 일 수 있어(도메인 없는 컬럼의 타입, 문자 도메인의 소수 등) 값만으로는
--   "NULL 로 고정" 과 "고정한 적 없음" 을 가를 수 없다. 버전 상태로 가르면 확정 경로를 거치지 않고 RELEASED 항목을 넣는 곳(로컬 샘플·e2e
--   고정 데이터·시험 준비)이 조용히 "값 없음 고정"(숫자가 문자로 직렬화)이 되므로 행에 표시를 둔다. CHECK: Y·N 만, 'N' 이면 세 칸 NULL.
-- 표 재생성: ADD COLUMN 대신 다시 만든다 — 칼럼 순서 불변식(업무 칼럼 + 감사 9칼럼, MdmInterfaceLayoutExpectations, V14 와 같은 판단).
--   TB_MDM_LAYOUT_ITEM 을 참조하는 FK 는 없다. V21 처럼 RENAME 을 쓰지 않고 _BAK 복사 → DROP → 최종 이름으로 생성 → 칼럼명을 모두
--   적어 복사 → _BAK DROP 순서로 한다. PRAGMA 를 쓰지 않는다(V13 주석). 인덱스는 원래 없다.
--
-- 이행 채움(기존 데이터): 확정 이후 버전(STATUS 가 DRAFT 가 아니고 LEGACY_SNAPSHOT_YN = 'N')의 항목 전부를 고정 표시하고, 물리명
--   있는 항목에 이 시점 사전 유효값을 한 번 채운다(유효값이 없으면 NULL 로 고정). 유효값 계산은 LayoutDictionary(DomainTreeSnapshot.chainRootFirst + DomainChainAssembler)와 같다.
--   · 컬럼 → DOMAIN_ID. 도메인이 없거나(V16 이후 NULL 허용) 그 도메인 행이 없으면 세 칸 모두 NULL.
--   · 사슬은 자신부터 PARENT_DOMAIN_ID 로 올라간다. 부모가 NULL 이거나 부모 행이 없으면 거기서 끝 — 그 노드가 최상위다.
--   · 노드 52개째에 닿으면(순환이면 늘 닿는다) 순환으로 보고 세 칸 모두 NULL(깊이 가드 MAX_DEPTH 50 — 노드 51개까지 허용).
--   · DATA_TYPE = 최상위의 DATA_TYPE. SCALE·UNIT_CODE = 자신부터 위로 처음 만나는 NULL 아닌 값.
--   SQL(재귀 CTE)로 같은 결과를 낼 수 있어 기동 러너를 두지 않았다(판단 근거: D-151). 재귀 CTE 는 저장소 기본형이다 — RECURSIVE
--   키워드 없이 칼럼 목록을 붙이고(docs/guide/Database/dialect-neutral-sql.md §3, DomainImpactQueries 선례), 처음 만나는 값은 LIMIT
--   대신 MIN(DEPTH) 조인으로 고른다(운영 방언으로 옮길 때 다시 쓸 곳을 줄인다). 식 조립 실패는 이 세 값에 영향이 없다
--   (조립기는 길이·소수·단위를 식과 따로 접는다). 이행 전후 합성이 같다는 시험: LayoutPinMigrationEquivalenceSqliteTest
--   (아래 「채움 시작」~「채움 끝」 블록을 잘라 다시 돌린다 — 그 블록 안 주석에는 문장 끝 기호를 쓰지 않는다).
--   REQUESTED·APPROVED·CANCELLED 는 레이아웃에서 쓰지 않는 상태지만 행이 있으면 함께 채운다(DRAFT 만 지금 사전을 읽는 상태).
--
-- 되돌리려면: 새 마이그레이션에서 같은 _BAK 패턴으로 세 칸을 뺀 V21 모양 표를 다시 만든다. 확정 고정값은 사라지고 합성은 다시
--   지금 사전을 읽는다.

-- ① 임시 복사(제약 없음)
CREATE TABLE TB_MDM_LAYOUT_ITEM_BAK AS SELECT * FROM TB_MDM_LAYOUT_ITEM;

-- ② 옛 표 삭제 — 이 표를 가리키는 FK 가 없어 위반·연쇄 삭제가 없다
DROP TABLE TB_MDM_LAYOUT_ITEM;

-- ③ 새 표 — V21 정의 + DATA_TYPE·UNIT_CODE·SCALE(LENGTH 뒤) + 단위 FK
CREATE TABLE TB_MDM_LAYOUT_ITEM (
    LAYOUT_ID INTEGER NOT NULL,
    VER NUMERIC(7,3) NOT NULL,
    SEQ INTEGER NOT NULL,
    FILL_KIND VARCHAR(20) NOT NULL,
    COLUMN_PHYS VARCHAR(50),
    TRANS_UNIT VARCHAR(20),
    UNIT_ITEM VARCHAR(50),
    NUM_FORMAT VARCHAR(50),
    DEFAULT_VALUE VARCHAR(50),
    FILLER_LENGTH INTEGER,
    `OFFSET` INTEGER NOT NULL DEFAULT 0,
    `LENGTH` INTEGER NOT NULL DEFAULT 0,
    DATA_TYPE VARCHAR(20),
    UNIT_CODE VARCHAR(20),
    SCALE INTEGER,
    PINNED_YN VARCHAR(1) NOT NULL DEFAULT 'N',
    C_USR_ID VARCHAR(100),
    C_AT TIMESTAMP,
    C_SVC_ID VARCHAR(100),
    C_PGM_ID VARCHAR(100),
    U_USR_ID VARCHAR(100),
    U_AT TIMESTAMP,
    U_SVC_ID VARCHAR(100),
    U_PGM_ID VARCHAR(100),
    AUD_VER BIGINT,
    CONSTRAINT PK_TB_MDM_LAYOUT_ITEM PRIMARY KEY (LAYOUT_ID, VER, SEQ),
    CONSTRAINT FK_TB_MDM_LAYOUT_ITEM_VER FOREIGN KEY (LAYOUT_ID, VER) REFERENCES TB_MDM_LAYOUT_VER (LAYOUT_ID, VER),
    CONSTRAINT FK_TB_MDM_LAYOUT_ITEM_COLUMN FOREIGN KEY (COLUMN_PHYS) REFERENCES TB_MDM_COLUMN (PHYS_NAME),
    CONSTRAINT FK_TB_MDM_LAYOUT_ITEM_UNIT FOREIGN KEY (TRANS_UNIT) REFERENCES TB_MDM_UNIT (UNIT_CODE),
    CONSTRAINT FK_TB_MDM_LAYOUT_ITEM_UNIT_CODE FOREIGN KEY (UNIT_CODE) REFERENCES TB_MDM_UNIT (UNIT_CODE),
    CONSTRAINT CK_TB_MDM_LAYOUT_ITEM_FILL_KIND CHECK (FILL_KIND IN ('DATA','CONST','AUTO','FILLER')),
    CONSTRAINT CK_TB_MDM_LAYOUT_ITEM_UNIT CHECK (TRANS_UNIT IS NULL OR UNIT_ITEM IS NULL),
    CONSTRAINT CK_TB_MDM_LAYOUT_ITEM_PINNED CHECK (PINNED_YN IN ('Y','N')
        AND (PINNED_YN = 'Y' OR (DATA_TYPE IS NULL AND UNIT_CODE IS NULL AND SCALE IS NULL)))
);

-- ④ 복사 — 칼럼명을 모두 적는다(V78 교훈 — SELECT * 금지). 새 칸은 NULL, 고정 표시는 기본 'N'
INSERT INTO TB_MDM_LAYOUT_ITEM (LAYOUT_ID, VER, SEQ, FILL_KIND, COLUMN_PHYS, TRANS_UNIT, UNIT_ITEM, NUM_FORMAT, DEFAULT_VALUE,
    FILLER_LENGTH, `OFFSET`, `LENGTH`, C_USR_ID, C_AT, C_SVC_ID, C_PGM_ID, U_USR_ID, U_AT, U_SVC_ID, U_PGM_ID, AUD_VER)
SELECT LAYOUT_ID, VER, SEQ, FILL_KIND, COLUMN_PHYS, TRANS_UNIT, UNIT_ITEM, NUM_FORMAT, DEFAULT_VALUE,
    FILLER_LENGTH, `OFFSET`, `LENGTH`, C_USR_ID, C_AT, C_SVC_ID, C_PGM_ID, U_USR_ID, U_AT, U_SVC_ID, U_PGM_ID, AUD_VER
FROM TB_MDM_LAYOUT_ITEM_BAK;

DROP TABLE TB_MDM_LAYOUT_ITEM_BAK;

-- ⑤ 이행 채움 — 확정 이후 버전의 항목을 이 시점 사전 유효값으로
-- [V22 채움 시작]
-- 쓰이는 도메인마다 자신부터 위로 올라간 사슬(깊이 0 = 자신). 깊이 51(노드 52개째)까지만 만든다 — 그 행이 있으면 순환 또는 깊이 가드
CREATE TABLE TB_MDM_LAYOUT_V22_CHAIN AS
WITH chain(START_ID, DEPTH, PARENT_ID, DATA_TYPE, SCALE, UNIT_CODE) AS (
    SELECT d.DOMAIN_ID, 0, d.PARENT_DOMAIN_ID, d.DATA_TYPE, d.SCALE, d.UNIT_CODE
    FROM TB_MDM_DOMAIN d
    WHERE d.DOMAIN_ID IN (
        SELECT c.DOMAIN_ID
        FROM TB_MDM_LAYOUT_ITEM i
        JOIN TB_MDM_LAYOUT_VER v ON v.LAYOUT_ID = i.LAYOUT_ID AND v.VER = i.VER
        JOIN TB_MDM_COLUMN c ON c.PHYS_NAME = i.COLUMN_PHYS
        WHERE v.STATUS <> 'DRAFT' AND v.LEGACY_SNAPSHOT_YN = 'N')
    UNION ALL
    SELECT ch.START_ID, ch.DEPTH + 1, p.PARENT_DOMAIN_ID, p.DATA_TYPE, p.SCALE, p.UNIT_CODE
    FROM chain ch
    JOIN TB_MDM_DOMAIN p ON p.DOMAIN_ID = ch.PARENT_ID
    WHERE ch.DEPTH < 51
)
SELECT START_ID, DEPTH, DATA_TYPE, SCALE, UNIT_CODE FROM chain;

-- 도메인마다 유효값 — 순환·깊이 가드(깊이 51 행이 있는 사슬)는 행을 두지 않는다(세 칸 NULL)
-- 타입은 가장 깊은 행(최상위), 소수·단위는 NULL 아닌 값이 있는 가장 얕은 깊이의 행 — 사슬마다 깊이 하나에 행 하나다
CREATE TABLE TB_MDM_LAYOUT_V22_EFF AS
SELECT s.START_ID AS DOMAIN_ID, t.DATA_TYPE AS DATA_TYPE, sc.SCALE AS SCALE, un.UNIT_CODE AS UNIT_CODE
FROM (SELECT START_ID, MAX(DEPTH) AS MAX_DEPTH FROM TB_MDM_LAYOUT_V22_CHAIN GROUP BY START_ID) s
JOIN TB_MDM_LAYOUT_V22_CHAIN t ON t.START_ID = s.START_ID AND t.DEPTH = s.MAX_DEPTH
LEFT JOIN (SELECT START_ID, MIN(DEPTH) AS DEPTH FROM TB_MDM_LAYOUT_V22_CHAIN
            WHERE SCALE IS NOT NULL GROUP BY START_ID) sd ON sd.START_ID = s.START_ID
LEFT JOIN TB_MDM_LAYOUT_V22_CHAIN sc ON sc.START_ID = sd.START_ID AND sc.DEPTH = sd.DEPTH
LEFT JOIN (SELECT START_ID, MIN(DEPTH) AS DEPTH FROM TB_MDM_LAYOUT_V22_CHAIN
            WHERE UNIT_CODE IS NOT NULL GROUP BY START_ID) ud ON ud.START_ID = s.START_ID
LEFT JOIN TB_MDM_LAYOUT_V22_CHAIN un ON un.START_ID = ud.START_ID AND un.DEPTH = ud.DEPTH
WHERE s.MAX_DEPTH < 51;

-- 확정 이후 버전의 항목 전부를 고정 표시하고 유효값을 복사 — 물리명이 없거나 도메인 유효값이 없으면 NULL 로 고정
UPDATE TB_MDM_LAYOUT_ITEM
SET PINNED_YN = 'Y',
    DATA_TYPE = (SELECT e.DATA_TYPE FROM TB_MDM_COLUMN c JOIN TB_MDM_LAYOUT_V22_EFF e ON e.DOMAIN_ID = c.DOMAIN_ID
                  WHERE c.PHYS_NAME = TB_MDM_LAYOUT_ITEM.COLUMN_PHYS),
    UNIT_CODE = (SELECT e.UNIT_CODE FROM TB_MDM_COLUMN c JOIN TB_MDM_LAYOUT_V22_EFF e ON e.DOMAIN_ID = c.DOMAIN_ID
                  WHERE c.PHYS_NAME = TB_MDM_LAYOUT_ITEM.COLUMN_PHYS),
    SCALE = (SELECT e.SCALE FROM TB_MDM_COLUMN c JOIN TB_MDM_LAYOUT_V22_EFF e ON e.DOMAIN_ID = c.DOMAIN_ID
              WHERE c.PHYS_NAME = TB_MDM_LAYOUT_ITEM.COLUMN_PHYS)
WHERE EXISTS (SELECT 1 FROM TB_MDM_LAYOUT_VER v
               WHERE v.LAYOUT_ID = TB_MDM_LAYOUT_ITEM.LAYOUT_ID AND v.VER = TB_MDM_LAYOUT_ITEM.VER
                 AND v.STATUS <> 'DRAFT' AND v.LEGACY_SNAPSHOT_YN = 'N');

DROP TABLE TB_MDM_LAYOUT_V22_EFF;
DROP TABLE TB_MDM_LAYOUT_V22_CHAIN;
-- [V22 채움 끝]
