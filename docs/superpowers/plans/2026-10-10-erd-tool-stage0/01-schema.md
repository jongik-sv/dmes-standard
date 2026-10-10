# ERD 도구 단계 0 — Task 1~2: 화면 등재·스키마

> 공통 제약(Global Constraints)·스펙과 다르게 정한 점(P1~P10)·Review Focus·파일 구조는 [README](README.md) 에 있다. 이 문서의 모든 Task 는 README 의 Global Constraints 를 따른다.
> [README](README.md) · 다음: [02-model-engine.md](02-model-engine.md)

### Task 1: 화면 식별자 등재와 기능설계서

**Files:**
- Modify: `docs/mdm/screens/README.md` (§3 표에 `dma` 행 추가)
- Modify: `docs/guide/design/identifier-dictionary/01-modules-and-screens.md` (§A.3.2 에 화면 행 추가)
- Create: `docs/mdm/screens/erdEdit/erdEdit_기능설계서.md`

**Interfaces:**
- Produces: screenId `erdEdit`, 그룹 `dma`, serviceId = BPMN process id = `erdEdit`, componentPath `dma/erdEdit`. 뒤 Task 가 모두 이 이름을 쓴다.

- [ ] **Step 1: README §3 표에 행 추가**

`| dma | \`columnMng\` | ...` 행 아래, `termRegPop` 행 다음에 넣는다.

```markdown
| dma | `erdEdit` | ERD 설계(모델·다이어그램 편집, 여러 사람·LLM 동시 편집) | 독립 | 2026-10-10 ERD 설계 | 스펙 docs/superpowers/specs/2026-10-10-erd-tool-design.md |
```

표 아래 "screenId 유일성" 문장의 "24종" 을 "25종" 으로 고친다.

- [ ] **Step 2: 식별자 사전 §A.3.2 등재**

`01-modules-and-screens.md` 의 §A.3.2 mdm 화면 표에서 `columnMng` 행을 찾아 그 형식을 그대로 따라 `erdEdit` 행을 넣는다(열 순서·표기는 기존 행을 복사해 값만 바꾼다). 값: 모듈 `mdm`, 그룹 `dma`, screenId `erdEdit`, 화면명 `ERD 설계`, 형태 `독립`.

- [ ] **Step 3: 기능설계서 작성**

`docs/mdm/screens/erdEdit/erdEdit_기능설계서.md` 를 아래 골격으로 쓴다. 상세 정본은 스펙이므로 반복하지 않고 절 번호로 가리킨다.

```markdown
# erdEdit 기능설계서 — ERD 설계

- 정본: [ERD 도구 설계](../../../superpowers/specs/2026-10-10-erd-tool-design.md). 이 문서는 MDM 화면 규약(screens/README.md §5)에 맞춘 색인이다.
- 그룹 `dma`, screenId·serviceId `erdEdit`, componentPath `dma/erdEdit`.
- 버전 대상 `ERD_MODEL`(모듈 하나 = 객체 하나, 스펙 D2). 확정은 소유자가 직접 한다(ADR-0002).

## 1. 액션

| 액션 | 뜻 | 권한 세트 |
|---|---|---|
| search | 모델 목록 | READ |
| view | 모델 하나(JSON·다이어그램·rev·편집자·접속자) 또는 `sinceRev` 이후 델타 | READ |
| compare | 논리명·물리명 미리보기(표준 판정) | READ |
| validate | 확정 검사 미리보기 | READ |
| reg | 빈 모델 만들기 | EDIT |
| save | 명령 묶음 적용(`apply`) | EDIT |
| restore | 명령 되돌리기 | EDIT |
| execute | 세션 명령(선택 상태·작업 중 표시)과 공동 편집자 등록·해제 | EDIT |
| copy | 새 버전(DRAFT) | EDIT |
| delete | DRAFT 삭제 | EDIT |
| lock / unlock / handover | DRAFT 선점·해제·넘기기 | EDIT |
| confirm | 확정 | CONFIRM |
| import | DB 가져오기(단계 1) | EDIT |

## 2. 데이터

스펙 3절. 표는 `TB_MDM_ERD_MODEL`, `_MODEL_VER`, `_EDITOR`, `_CMD_LOG`, `_DIAGRAM`, `_DIAGRAM_NODE`, `_CLAIM`.

## 3. 판정과 오류

스펙 4.2~4.5절. 거절 코드 `INVALID`·`CONFLICT`·`NOT_FOUND`·`NOT_EDITOR`·`NEEDS_CHOICE`.

## 4. 실시간 채널

`GET /api/mdm/erd/stream/{modelId}?session=&sinceRev=` (포털 경유 `/api/mdm/rest/erdEdit/view/api/mdm/erd/stream/{modelId}`). 이벤트 `change`·`presence`·`claim`·`reload`·`ping`.
```

- [ ] **Step 4: 커밋**

```bash
/usr/bin/git add docs/mdm/screens/README.md docs/mdm/screens/erdEdit docs/guide/design/identifier-dictionary/01-modules-and-screens.md
/usr/bin/git commit -m "docs(mdm): erdEdit 화면 식별자 등재·기능설계서"
```

---

### Task 2: 스키마(V6)·버전 대상·엔티티

**Files:**
- Create: `src/backend/mdm/api/src/main/resources/db/migration/mdm/oracle/V6__erd_model.sql` (번호는 `migration_tool.mjs status --module mdm` 결과를 쓴다. V6 이 아니면 아래 이름의 번호만 바꾼다)
- Modify: `src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/contract/version/VersionTarget.java`
- Modify: `src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/common/version/DefaultVersionTableRegistry.java`
- Create: `.../entity/MdmErdModel.java`, `MdmErdModelVer.java`, `MdmErdModelVerId.java`, `MdmErdEditor.java`, `MdmErdEditorId.java`, `MdmErdCmdLog.java`, `MdmErdCmdLogId.java`, `MdmErdDiagram.java`, `MdmErdDiagramNode.java`, `MdmErdDiagramNodeId.java`, `MdmErdClaim.java`, `MdmErdClaimId.java`
- Create: `.../repository/MdmErdModelRepository.java` 외 6개(엔티티마다 하나)
- Test: `src/backend/mdm/api/src/test/java/com/dongkuk/dmes/mdm/dma/erdEdit/ErdSchemaTest.java`

**Interfaces:**
- Produces: `VersionTarget.ERD_MODEL("TB_MDM_ERD_MODEL_VER", 3)`. 표 7개(아래 DDL). 엔티티 `MdmErdModelVer` 의 `getModelJson()`. 리포지토리 7개.

- [ ] **Step 1: 채번과 스캐폴딩**

```bash
node .claude/skills/flyway-migration-add/scripts/migration_tool.mjs status --module mdm
node .claude/skills/flyway-migration-add/scripts/migration_tool.mjs scaffold --module mdm --slug erd_model --title "ERD 모델·버전·명령 기록·다이어그램"
```
Expected: `V6__erd_model.sql` 이 생긴다.

- [ ] **Step 2: 실패하는 시험 작성**

```java
package com.dongkuk.dmes.mdm.dma.erdEdit;

import static org.assertj.core.api.Assertions.assertThat;

import com.dongkuk.dmes.mdm.common.testdb.AbstractMdmSharedDbTest;
import com.dongkuk.dmes.mdm.contract.version.VersionTarget;
import com.dongkuk.dmes.mdm.common.version.DefaultVersionTableRegistry;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;

@SpringBootTest
@ActiveProfiles("local")
class ErdSchemaTest extends AbstractMdmSharedDbTest {

    @Autowired JdbcTemplate jdbc;
    @Autowired DefaultVersionTableRegistry registry;

    @Test
    void erdTablesExist() {
        List<String> names = jdbc.queryForList(
                "SELECT TABLE_NAME FROM USER_TABLES WHERE TABLE_NAME LIKE 'TB_MDM_ERD%' ORDER BY TABLE_NAME", String.class);
        assertThat(names).containsExactly("TB_MDM_ERD_CLAIM", "TB_MDM_ERD_CMD_LOG", "TB_MDM_ERD_DIAGRAM",
                "TB_MDM_ERD_DIAGRAM_NODE", "TB_MDM_ERD_EDITOR", "TB_MDM_ERD_MODEL", "TB_MDM_ERD_MODEL_VER");
    }

    @Test
    void modelJsonMustBeJson() {
        jdbc.update("INSERT INTO TB_MDM_ERD_MODEL (ERD_MODEL_ID, MODULE_ID, SCHEMA_NAME, MODEL_NAME) VALUES ('t1','mcm','MCMAPUSER','시험')");
        org.assertj.core.api.Assertions.assertThatThrownBy(() -> jdbc.update(
                "INSERT INTO TB_MDM_ERD_MODEL_VER (ERD_MODEL_ID, VER, MODEL_JSON) VALUES ('t1', 1, 'not json')"))
                .hasMessageContaining("CK_TB_MDM_ERD_MODEL_VER_JSON");
    }

    @Test
    void registryKnowsErdModel() {
        var spec = registry.spec(VersionTarget.ERD_MODEL);
        assertThat(spec.versionTable()).isEqualTo("TB_MDM_ERD_MODEL_VER");
        assertThat(spec.objectIdColumn()).isEqualTo("ERD_MODEL_ID");
        assertThat(spec.parentTable()).isEqualTo("TB_MDM_ERD_MODEL");
    }
}
```

- [ ] **Step 3: 시험이 실패하는지 확인**

Run: `cd src/backend/mdm && DFLOW_HEAVY_WAIT=1800 node ../../../.claude/skills/dflow-dev/scripts/heavy.mjs ../gradlew :api:test --max-workers=2 -Pdmes.ora.test=clone --tests '*ErdSchemaTest'`
Expected: 컴파일 실패(`ERD_MODEL` 없음).

- [ ] **Step 4: DDL 작성**

`V6__erd_model.sql` 본문:

```sql
-- ERD 모델(모듈 하나 = 버전 객체 하나, 스펙 D2). REV 는 모델 단위 명령 순번(계획 P1).
CREATE TABLE TB_MDM_ERD_MODEL (
    ERD_MODEL_ID   VARCHAR2(50 CHAR)  NOT NULL,
    MODULE_ID      VARCHAR2(20 CHAR)  NOT NULL,
    SCHEMA_NAME    VARCHAR2(128 CHAR) NOT NULL,
    MODEL_NAME     VARCHAR2(200 CHAR) NOT NULL,
    STATUS         VARCHAR2(20 CHAR)  DEFAULT 'CREATED' NOT NULL,
    REV            NUMBER(19)         DEFAULT 0 NOT NULL,
    C_USR_ID       VARCHAR2(100 CHAR),
    C_AT           TIMESTAMP(6),
    C_SVC_ID       VARCHAR2(100 CHAR),
    C_PGM_ID       VARCHAR2(100 CHAR),
    U_USR_ID       VARCHAR2(100 CHAR),
    U_AT           TIMESTAMP(6),
    U_SVC_ID       VARCHAR2(100 CHAR),
    U_PGM_ID       VARCHAR2(100 CHAR),
    VER            NUMBER(19),
    CONSTRAINT PK_TB_MDM_ERD_MODEL PRIMARY KEY (ERD_MODEL_ID),
    CONSTRAINT CK_TB_MDM_ERD_MODEL_STATUS CHECK (STATUS IN ('CREATED','INUSE','DEPRECATED'))
);

-- 버전(룰 세트 _VER 과 같은 골격). MODEL_JSON 이 모델 전체다(스펙 3.1).
CREATE TABLE TB_MDM_ERD_MODEL_VER (
    ERD_MODEL_ID   VARCHAR2(50 CHAR)  NOT NULL,
    VER            NUMBER(7,3)        NOT NULL,
    VER_KIND       VARCHAR2(20 CHAR)  DEFAULT 'MAJOR' NOT NULL,
    STATUS         VARCHAR2(20 CHAR)  DEFAULT 'DRAFT' NOT NULL,
    BASE_VER       NUMBER(7,3),
    OWNER_ID       VARCHAR2(50 CHAR),
    APPLY_FROM     TIMESTAMP(6),
    APPLY_TO       TIMESTAMP(6),
    MODEL_JSON     CLOB               NOT NULL,
    REQUESTED_BY   VARCHAR2(50 CHAR),
    REQUESTED_AT   TIMESTAMP(6),
    RELEASED_AT    TIMESTAMP(6),
    ROW_VERSION    NUMBER(19)         DEFAULT 0 NOT NULL,
    C_USR_ID       VARCHAR2(100 CHAR),
    C_AT           TIMESTAMP(6),
    C_SVC_ID       VARCHAR2(100 CHAR),
    C_PGM_ID       VARCHAR2(100 CHAR),
    U_USR_ID       VARCHAR2(100 CHAR),
    U_AT           TIMESTAMP(6),
    U_SVC_ID       VARCHAR2(100 CHAR),
    U_PGM_ID       VARCHAR2(100 CHAR),
    AUD_VER        NUMBER(19),
    CONSTRAINT PK_TB_MDM_ERD_MODEL_VER PRIMARY KEY (ERD_MODEL_ID, VER),
    CONSTRAINT FK_TB_MDM_ERD_MODEL_VER_MODEL FOREIGN KEY (ERD_MODEL_ID) REFERENCES TB_MDM_ERD_MODEL (ERD_MODEL_ID),
    CONSTRAINT CK_TB_MDM_ERD_MODEL_VER_JSON CHECK (MODEL_JSON IS JSON STRICT),
    CONSTRAINT CK_TB_MDM_ERD_MODEL_VER_STATUS CHECK (STATUS IN ('DRAFT','REQUESTED','APPROVED','RELEASED','CANCELLED')),
    CONSTRAINT CK_TB_MDM_ERD_MODEL_VER_KIND CHECK (VER_KIND IN ('MAJOR','MINOR')),
    CONSTRAINT CK_TB_MDM_ERD_MODEL_VER_APPLY CHECK (STATUS = 'DRAFT' OR (APPLY_FROM IS NOT NULL AND APPLY_TO IS NOT NULL))
);

-- 공동 편집자(스펙 D15). 소유자는 _VER.OWNER_ID 에 있고 여기에는 넣지 않는다.
CREATE TABLE TB_MDM_ERD_EDITOR (
    ERD_MODEL_ID   VARCHAR2(50 CHAR)  NOT NULL,
    VER            NUMBER(7,3)        NOT NULL,
    USER_ID        VARCHAR2(50 CHAR)  NOT NULL,
    C_USR_ID VARCHAR2(100 CHAR), C_AT TIMESTAMP(6), C_SVC_ID VARCHAR2(100 CHAR), C_PGM_ID VARCHAR2(100 CHAR),
    U_USR_ID VARCHAR2(100 CHAR), U_AT TIMESTAMP(6), U_SVC_ID VARCHAR2(100 CHAR), U_PGM_ID VARCHAR2(100 CHAR),
    AUD_VER        NUMBER(19),
    CONSTRAINT PK_TB_MDM_ERD_EDITOR PRIMARY KEY (ERD_MODEL_ID, VER, USER_ID),
    CONSTRAINT FK_TB_MDM_ERD_EDITOR_MODEL_VER FOREIGN KEY (ERD_MODEL_ID, VER) REFERENCES TB_MDM_ERD_MODEL_VER (ERD_MODEL_ID, VER)
);

-- 명령 기록(버전 밖). REV 는 TB_MDM_ERD_MODEL.REV 와 같은 순번이다. CHANGES_JSON 이 델타(스펙 4.4, getChangesSince).
CREATE TABLE TB_MDM_ERD_CMD_LOG (
    ERD_MODEL_ID   VARCHAR2(50 CHAR)  NOT NULL,
    REV            NUMBER(19)         NOT NULL,
    MODEL_VER      NUMBER(7,3),
    USER_ID        VARCHAR2(50 CHAR)  NOT NULL,
    SESSION_NM     VARCHAR2(100 CHAR) NOT NULL,
    SOURCE         VARCHAR2(10 CHAR)  NOT NULL,
    CMD_JSON       CLOB               NOT NULL,
    INVERSE_JSON   CLOB               NOT NULL,
    CHANGES_JSON   CLOB               NOT NULL,
    C_USR_ID VARCHAR2(100 CHAR), C_AT TIMESTAMP(6), C_SVC_ID VARCHAR2(100 CHAR), C_PGM_ID VARCHAR2(100 CHAR),
    U_USR_ID VARCHAR2(100 CHAR), U_AT TIMESTAMP(6), U_SVC_ID VARCHAR2(100 CHAR), U_PGM_ID VARCHAR2(100 CHAR),
    VER            NUMBER(19),
    CONSTRAINT PK_TB_MDM_ERD_CMD_LOG PRIMARY KEY (ERD_MODEL_ID, REV),
    CONSTRAINT FK_TB_MDM_ERD_CMD_LOG_MODEL FOREIGN KEY (ERD_MODEL_ID) REFERENCES TB_MDM_ERD_MODEL (ERD_MODEL_ID),
    CONSTRAINT CK_TB_MDM_ERD_CMD_LOG_SOURCE CHECK (SOURCE IN ('UI','MCP','CLI','SYSTEM')),
    CONSTRAINT CK_TB_MDM_ERD_CMD_LOG_CMD CHECK (CMD_JSON IS JSON STRICT),
    CONSTRAINT CK_TB_MDM_ERD_CMD_LOG_INV CHECK (INVERSE_JSON IS JSON STRICT),
    CONSTRAINT CK_TB_MDM_ERD_CMD_LOG_CHG CHECK (CHANGES_JSON IS JSON STRICT)
);

-- 다이어그램(버전 밖, 스펙 D6).
CREATE TABLE TB_MDM_ERD_DIAGRAM (
    DIAGRAM_ID     VARCHAR2(50 CHAR)  NOT NULL,
    ERD_MODEL_ID   VARCHAR2(50 CHAR)  NOT NULL,
    AREA_NAME      VARCHAR2(200 CHAR) NOT NULL,
    DIAGRAM_NAME   VARCHAR2(200 CHAR) NOT NULL,
    SORT_SEQ       NUMBER(10)         DEFAULT 0 NOT NULL,
    C_USR_ID VARCHAR2(100 CHAR), C_AT TIMESTAMP(6), C_SVC_ID VARCHAR2(100 CHAR), C_PGM_ID VARCHAR2(100 CHAR),
    U_USR_ID VARCHAR2(100 CHAR), U_AT TIMESTAMP(6), U_SVC_ID VARCHAR2(100 CHAR), U_PGM_ID VARCHAR2(100 CHAR),
    VER            NUMBER(19),
    CONSTRAINT PK_TB_MDM_ERD_DIAGRAM PRIMARY KEY (DIAGRAM_ID),
    CONSTRAINT FK_TB_MDM_ERD_DIAGRAM_MODEL FOREIGN KEY (ERD_MODEL_ID) REFERENCES TB_MDM_ERD_MODEL (ERD_MODEL_ID)
);
CREATE INDEX IX_TB_MDM_ERD_DIAGRAM_MODEL ON TB_MDM_ERD_DIAGRAM (ERD_MODEL_ID);

-- 다이어그램 위의 표(TABLE_UUID 는 MODEL_JSON 의 표 키. 지금 버전에 없으면 그리지 않는다).
CREATE TABLE TB_MDM_ERD_DIAGRAM_NODE (
    DIAGRAM_ID     VARCHAR2(50 CHAR)  NOT NULL,
    TABLE_UUID     VARCHAR2(50 CHAR)  NOT NULL,
    POS_X          NUMBER(10)         DEFAULT 0 NOT NULL,
    POS_Y          NUMBER(10)         DEFAULT 0 NOT NULL,
    FOLD_MODE      VARCHAR2(10 CHAR)  DEFAULT 'NONE' NOT NULL,
    C_USR_ID VARCHAR2(100 CHAR), C_AT TIMESTAMP(6), C_SVC_ID VARCHAR2(100 CHAR), C_PGM_ID VARCHAR2(100 CHAR),
    U_USR_ID VARCHAR2(100 CHAR), U_AT TIMESTAMP(6), U_SVC_ID VARCHAR2(100 CHAR), U_PGM_ID VARCHAR2(100 CHAR),
    VER            NUMBER(19),
    CONSTRAINT PK_TB_MDM_ERD_DIAGRAM_NODE PRIMARY KEY (DIAGRAM_ID, TABLE_UUID),
    CONSTRAINT FK_TB_MDM_ERD_DIAGRAM_NODE_DIAGRAM FOREIGN KEY (DIAGRAM_ID) REFERENCES TB_MDM_ERD_DIAGRAM (DIAGRAM_ID),
    CONSTRAINT CK_TB_MDM_ERD_DIAGRAM_NODE_FOLD CHECK (FOLD_MODE IN ('NONE','KEYS','NAME'))
);

-- 작업 중 표시(권고용, 스펙 D17). 만료가 지나면 무시한다.
CREATE TABLE TB_MDM_ERD_CLAIM (
    ERD_MODEL_ID   VARCHAR2(50 CHAR)  NOT NULL,
    TABLE_UUID     VARCHAR2(50 CHAR)  NOT NULL,
    SESSION_NM     VARCHAR2(100 CHAR) NOT NULL,
    USER_ID        VARCHAR2(50 CHAR)  NOT NULL,
    EXPIRES_AT     TIMESTAMP(6)       NOT NULL,
    C_USR_ID VARCHAR2(100 CHAR), C_AT TIMESTAMP(6), C_SVC_ID VARCHAR2(100 CHAR), C_PGM_ID VARCHAR2(100 CHAR),
    U_USR_ID VARCHAR2(100 CHAR), U_AT TIMESTAMP(6), U_SVC_ID VARCHAR2(100 CHAR), U_PGM_ID VARCHAR2(100 CHAR),
    VER            NUMBER(19),
    CONSTRAINT PK_TB_MDM_ERD_CLAIM PRIMARY KEY (ERD_MODEL_ID, TABLE_UUID),
    CONSTRAINT FK_TB_MDM_ERD_CLAIM_MODEL FOREIGN KEY (ERD_MODEL_ID) REFERENCES TB_MDM_ERD_MODEL (ERD_MODEL_ID)
);
```

`TB_MDM_ERD_EDITOR` 는 업무 칼럼 `VER`(모델 버전 번호)를 가지므로, 감사 카운터를 버전 표처럼 `AUD_VER` 로 둔다(D-034). 엔티티도 `@AttributeOverride(name="version", column=@Column(name="AUD_VER"))` 를 단다.

- [ ] **Step 5: `VersionTarget`·레지스트리 추가**

`VersionTarget.java` 마지막 상수 `LAYOUT(...)` 뒤에 추가:
```java
    /** ERD 모델 — 모듈 하나 = 객체 하나(ERD 설계 스펙 D2). */
    ERD_MODEL("TB_MDM_ERD_MODEL_VER", 3);
```
`DefaultVersionTableRegistry.spec` 의 `switch` 에 추가:
```java
            case ERD_MODEL -> new VersionTableSpec(target.versionTable(), "ERD_MODEL_ID", "VER",
                    "TB_MDM_ERD_MODEL", "ERD_MODEL_ID", AUDIT_COUNTER, PARENT_AUDIT_COUNTER);
```
`VersionTarget` 의 값 개수를 세는 시험이 있으면 함께 고친다: `grep -rn "VersionTarget.values()" src/backend/mdm --include=*.java`.

- [ ] **Step 6: 엔티티·리포지토리 작성**

`MdmRuleSetVer`·`MdmRuleSetVerId` 를 열어 구조를 그대로 따른다(Lombok 없음, 필드 + getter, 보호 생성자, `@IdClass`). 버전 표 엔티티는 아래처럼 쓴다.

```java
package com.dongkuk.dmes.mdm.entity;

import com.dongkuk.dmes.cactus.audit.CactusAuditEntity;
import jakarta.persistence.AttributeOverride;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.IdClass;
import jakarta.persistence.Lob;
import jakarta.persistence.Table;
import java.math.BigDecimal;
import java.time.LocalDateTime;

/** ERD 모델 버전 — {@code TB_MDM_ERD_MODEL_VER}. 상태·소유자·적용 기간·ROW_VERSION 은 공통 버전 서비스가 네이티브 SQL 로만 바꾼다. */
@Entity
@Table(name = "TB_MDM_ERD_MODEL_VER")
@IdClass(MdmErdModelVerId.class)
@AttributeOverride(name = "version", column = @Column(name = "AUD_VER"))
public class MdmErdModelVer extends CactusAuditEntity {

    @Id @Column(name = "ERD_MODEL_ID") private String erdModelId;
    @Id @Column(name = "VER", precision = 7, scale = 3) private BigDecimal ver;
    @Column(name = "VER_KIND", nullable = false) private String verKind;
    @Column(name = "STATUS", nullable = false, updatable = false) private String status;
    @Column(name = "BASE_VER", precision = 7, scale = 3) private BigDecimal baseVer;
    @Column(name = "OWNER_ID", updatable = false) private String ownerId;
    @Column(name = "APPLY_FROM", updatable = false) private LocalDateTime applyFrom;
    @Column(name = "APPLY_TO", updatable = false) private LocalDateTime applyTo;
    @Lob @Column(name = "MODEL_JSON", nullable = false, updatable = false) private String modelJson;
    @Column(name = "ROW_VERSION", nullable = false, updatable = false) private long rowVersion;

    protected MdmErdModelVer() {
    }

    public MdmErdModelVer(String erdModelId, BigDecimal ver, String verKind, String ownerId, String modelJson) {
        this.erdModelId = erdModelId;
        this.ver = ver;
        this.verKind = verKind;
        this.status = "DRAFT";
        this.ownerId = ownerId;
        this.modelJson = modelJson;
    }

    public String getErdModelId() { return erdModelId; }
    public BigDecimal getVer() { return ver; }
    public String getVerKind() { return verKind; }
    public String getStatus() { return status; }
    public BigDecimal getBaseVer() { return baseVer; }
    public void setBaseVer(BigDecimal baseVer) { this.baseVer = baseVer; }
    public String getOwnerId() { return ownerId; }
    public LocalDateTime getApplyFrom() { return applyFrom; }
    public LocalDateTime getApplyTo() { return applyTo; }
    public String getModelJson() { return modelJson; }
    public long getRowVersion() { return rowVersion; }
}
```

`STATUS` 를 INSERT 에서도 쓰려면 `updatable=false` 만 두고 `insertable` 은 기본값(true)으로 둔다. 나머지 엔티티의 필드(모두 칼럼 이름 그대로 camelCase):

| 엔티티 | 키 | 필드 |
|---|---|---|
| `MdmErdModel` | `erdModelId` | `moduleId`, `schemaName`, `modelName`, `status`(updatable=false), `rev`(updatable=false). 감사 카운터 `VER` 는 `CactusAuditEntity` 기본 |
| `MdmErdEditor` (`@IdClass MdmErdEditorId`) | `erdModelId`, `ver`, `userId` | 없음. `@AttributeOverride(name="version", column=@Column(name="AUD_VER"))` |
| `MdmErdCmdLog` (`@IdClass MdmErdCmdLogId`) | `erdModelId`, `rev` | `modelVer`, `userId`, `sessionNm`, `source`, `cmdJson`(@Lob), `inverseJson`(@Lob), `changesJson`(@Lob) |
| `MdmErdDiagram` | `diagramId` | `erdModelId`, `areaName`, `diagramName`, `sortSeq` |
| `MdmErdDiagramNode` (`@IdClass MdmErdDiagramNodeId`) | `diagramId`, `tableUuid` | `posX`, `posY`, `foldMode` |
| `MdmErdClaim` (`@IdClass MdmErdClaimId`) | `erdModelId`, `tableUuid` | `sessionNm`, `userId`, `expiresAt` |

리포지토리는 `MdmRuleSetVerRepository` 처럼 메서드 없이 쓴다.
```java
package com.dongkuk.dmes.mdm.repository;

import com.dongkuk.dmes.mdm.entity.MdmErdModelVer;
import com.dongkuk.dmes.mdm.entity.MdmErdModelVerId;
import org.springframework.data.jpa.repository.JpaRepository;

public interface MdmErdModelVerRepository extends JpaRepository<MdmErdModelVer, MdmErdModelVerId> {
}
```

- [ ] **Step 7: 시험 통과 확인**

Run: Step 3 명령. Expected: 3건 PASS.
Run: `cd src/backend/mdm && ../gradlew :lib:test --max-workers=2`. Expected: PASS(`VersionTarget` 값 개수 시험이 있으면 Step 5 에서 고친 상태).

- [ ] **Step 8: 커밋**

```bash
/usr/bin/git add src/backend/mdm
/usr/bin/git commit -m "feat(mdm): ERD 모델 스키마(V6)·ERD_MODEL 버전 대상·엔티티"
```
