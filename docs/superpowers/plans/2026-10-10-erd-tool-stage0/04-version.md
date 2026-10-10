# ERD 도구 단계 0 — Task 7~8: 공동 편집자 SPI·ERD 버전 서비스

> 공통 제약(Global Constraints)·스펙과 다르게 정한 점(P1~P10)·Review Focus·파일 구조는 [README](README.md) 에 있다. 이 문서의 모든 Task 는 README 의 Global Constraints 를 따른다.
> 이전: [03-relation-standard.md](03-relation-standard.md) · [README](README.md) · 다음: [05-command-service.md](05-command-service.md)

### Task 7: 공동 편집자 SPI (버전 엔진)

**Files:**
- Create: `src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/contract/version/VersionCoEditorSpi.java`
- Modify: `.../common/version/VersionSpiRegistry.java`, `.../common/version/DefaultVersionWriteGuard.java`
- Test: `src/backend/mdm/api/src/test/java/com/dongkuk/dmes/mdm/dma/erdEdit/ErdCoEditorGuardTest.java`

**Interfaces:**
- Produces:
  - `interface VersionCoEditorSpi { VersionTarget target(); boolean isCoEditor(VersionRef draft, String userId); }` — 선택 SPI. 등록이 없으면 소유자만 쓴다(기존 동작).
  - `VersionSpiRegistry.coEditor(VersionTarget) : Optional<VersionCoEditorSpi>`.
  - `DefaultVersionWriteGuard.beginDraftWrite` 는 소유자가 아니어도 `coEditor(target).isCoEditor(draft, userId)` 가 true 면 통과한다. 나머지 검사(row_version·DRAFT·미적용 2개)는 그대로다.

- [ ] **Step 1: 실패하는 시험 작성**

시험은 `TB_MDM_ERD_*` 행을 JDBC 로 직접 넣고, Task 8 의 SPI 구현 대신 시험 전용 SPI 빈(`@TestConfiguration`)을 등록해 가드만 본다.

```java
package com.dongkuk.dmes.mdm.dma.erdEdit;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.dongkuk.dmes.mdm.common.testdb.AbstractMdmSharedDbTest;
import com.dongkuk.dmes.mdm.contract.version.*;
import java.math.BigDecimal;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;

@SpringBootTest
@ActiveProfiles("local")
class ErdCoEditorGuardTest extends AbstractMdmSharedDbTest {

    @Autowired JdbcTemplate jdbc;
    @Autowired VersionWriteGuard guard;

    @BeforeEach
    void seed() {
        jdbc.update("DELETE FROM TB_MDM_ERD_EDITOR");
        jdbc.update("DELETE FROM TB_MDM_ERD_MODEL_VER");
        jdbc.update("DELETE FROM TB_MDM_ERD_MODEL");
        jdbc.update("INSERT INTO TB_MDM_ERD_MODEL (ERD_MODEL_ID, MODULE_ID, SCHEMA_NAME, MODEL_NAME) VALUES ('mcm','mcm','MCMAPUSER','MCM')");
        jdbc.update("INSERT INTO TB_MDM_ERD_MODEL_VER (ERD_MODEL_ID, VER, OWNER_ID, MODEL_JSON) VALUES ('mcm', 1, 'owner', '{}')");
        jdbc.update("INSERT INTO TB_MDM_ERD_EDITOR (ERD_MODEL_ID, VER, USER_ID) VALUES ('mcm', 1, 'mate')");
    }

    VersionRef draft() {
        return new VersionRef(VersionTarget.ERD_MODEL, "mcm", new BigDecimal("1.000"));
    }

    @Test
    void ownerWrites() {
        assertThat(guard.beginDraftWrite(draft(), 0, "owner")).isGreaterThan(0);
    }

    @Test
    void coEditorWrites() {
        assertThat(guard.beginDraftWrite(draft(), 0, "mate")).isGreaterThan(0);
    }

    @Test
    void strangerGetsMdm003() {
        assertThatThrownBy(() -> guard.beginDraftWrite(draft(), 0, "stranger")).hasMessageContaining("MDM003");
    }
}
```

이 시험은 Task 8 의 `ErdCoEditors`(`TB_MDM_ERD_EDITOR` 조회) 가 있어야 `coEditorWrites` 가 통과한다. 그래서 Step 3 에서 `ErdCoEditors` 를 이 Task 에 함께 만든다.

`hasMessageContaining("MDM003")` 이 맞지 않으면 기존 시험에서 MDM003 을 확인하는 방식(`grep -rn "NOT_DRAFT_OWNER" src/backend/mdm/api/src/test | head`)을 따라 고친다.

- [ ] **Step 2: 시험이 실패하는지 확인**

Run: `cd src/backend/mdm && DFLOW_HEAVY_WAIT=1800 node ../../../.claude/skills/dflow-dev/scripts/heavy.mjs ../gradlew :api:test --max-workers=2 -Pdmes.ora.test=clone --tests '*ErdCoEditorGuardTest'`
Expected: `coEditorWrites` FAIL(MDM003).

- [ ] **Step 3: 구현**

```java
// VersionCoEditorSpi.java
package com.dongkuk.dmes.mdm.contract.version;

/**
 * DRAFT 공동 편집자 판정(선택 SPI, ERD 설계 스펙 D15). 등록한 대상만 소유자 아닌 사용자의 DRAFT 쓰기를 허용한다.
 * 확정·삭제·선점·넘기기는 여전히 소유자만 한다 — 이 SPI 는 {@link VersionWriteGuard#beginDraftWrite} 에만 쓴다.
 */
public interface VersionCoEditorSpi {

    VersionTarget target();

    boolean isCoEditor(VersionRef draft, String userId);
}
```

`VersionSpiRegistry` 생성자에 네 번째 인자 `List<VersionCoEditorSpi> coEditors` 를 더하고 `byTarget(coEditors, VersionCoEditorSpi::target, "공동 편집자 SPI")` 로 맵을 만든다. 메서드 추가:
```java
    /** 공동 편집자 판정 — 선택 SPI. 없으면 empty(소유자만 쓴다). */
    public java.util.Optional<VersionCoEditorSpi> coEditor(VersionTarget target) {
        return java.util.Optional.ofNullable(coEditors.get(target));
    }
```
`new VersionSpiRegistry(...)` 를 직접 부르는 시험이 있으면 인자를 하나 더 넣는다: `grep -rn "new VersionSpiRegistry(" src/backend/mdm`.

`DefaultVersionWriteGuard.beginDraftWrite` 의 `VersionPreconditions.requireOwner(row, userId)` 호출을 아래로 바꾼다(레지스트리를 생성자로 받는다).
```java
            if (!(row.ownerId() != null && row.ownerId().equals(userId))
                    && !spiRegistry.coEditor(draft.target()).map(s -> s.isCoEditor(draft, userId)).orElse(false)) {
                VersionPreconditions.requireOwner(row, userId); // MDM003 을 그대로 던진다
            }
```

`ErdCoEditors`(Task 8 패키지에 미리 만든다):
```java
package com.dongkuk.dmes.mdm.dma.erdEdit.service;

import com.dongkuk.dmes.mdm.contract.version.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/** ERD_MODEL 공동 편집자 = TB_MDM_ERD_EDITOR 행(스펙 D15). */
@Component
public class ErdCoEditors implements VersionCoEditorSpi {

    private final JdbcTemplate jdbc;

    public ErdCoEditors(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @Override
    public VersionTarget target() {
        return VersionTarget.ERD_MODEL;
    }

    @Override
    public boolean isCoEditor(VersionRef draft, String userId) {
        Integer n = jdbc.queryForObject(
                "SELECT COUNT(*) FROM TB_MDM_ERD_EDITOR WHERE ERD_MODEL_ID = ? AND VER = ? AND USER_ID = ?",
                Integer.class, draft.objectId(), draft.ver(), userId);
        return n != null && n > 0;
    }
}
```
MDM 에서 `JdbcTemplate` 빈을 쓰는 선례가 없으면 `EntityManager` 네이티브 쿼리로 바꾼다(`grep -rln "JdbcTemplate" src/backend/mdm/lib/src/main | head -3`).

- [ ] **Step 4: 시험 통과 확인과 회귀 확인**

Run: Step 2 명령. Expected: 3건 PASS.
Run: 기존 버전 시험 — `--tests '*Version*'` 와 `--tests '*RuleSetEdit*'` 를 같은 heavy 명령으로 한 번. Expected: PASS(다른 대상의 MDM003 동작이 그대로다).
Run: `cd src/backend/mdm && ../gradlew :lib:test --max-workers=2 --tests '*VersionContractTest'` (DB 없는 계약 시험, 스펙 6절 4번). Expected: PASS.

- [ ] **Step 5: 커밋**

```bash
/usr/bin/git add src/backend/mdm
/usr/bin/git commit -m "feat(mdm): 버전 엔진 공동 편집자 SPI — ERD_MODEL DRAFT 공동 쓰기"
```

---

### Task 8: ERD 버전 서비스와 확정·삭제 SPI

**Files:**
- Modify: `.../contract/common/MdmErrorCode.java` (`ERD_MODEL_NOT_FOUND` 추가)
- Create: `.../dma/erdEdit/service/{ErdModelStore,ErdVersionService,ErdConfirmCheck,ErdDraftDeletion}.java`
- Test: `src/backend/mdm/api/src/test/java/com/dongkuk/dmes/mdm/dma/erdEdit/ErdVersionServiceTest.java`

**Interfaces:**
- Consumes: Task 2 엔티티·리포지토리, Task 3 코덱, Task 6 `ErdDictionaryLoader`·`ErdStandardJudge`, `VersionWriteGuard`, `VersionRules.nextNumber`, `VersionRowStore.markParentInUse`, `VersionStateService`.
- Produces:
  - `ErdModelStore`: `long lockRev(String modelId)`(`SELECT REV … FOR UPDATE`, 없으면 `ERD_MODEL_NOT_FOUND`), `void setRev(String modelId, long rev)`, `Optional<MdmErdModelVer> draft(String modelId)`, `Optional<MdmErdModelVer> latestReleased(String modelId)`, `MdmErdModelVer current(String modelId)`(DRAFT 우선, 없으면 최신 RELEASED), `void writeJson(VersionRef ref, String json)`.
  - `ErdVersionService`: `String createModel(String modelId, String module, String schema, String name, String me)`(빈 모델과 1.000 DRAFT), `BigDecimal newVersion(String modelId, String kind, String me)`(직전 RELEASED 의 JSON 복사, UUID 유지), `void addEditor(String modelId, String userId, String me)`, `void removeEditor(...)`(둘 다 소유자만).
  - `ErdConfirmCheck implements VersionConfirmCheckSpi` — D19.
  - `ErdDraftDeletion implements VersionDraftDeletionSpi` — DRAFT 를 지우기 전에 그 버전의 `TB_MDM_ERD_EDITOR` 행을 지운다.

- [ ] **Step 1: 실패하는 시험 작성**

```java
package com.dongkuk.dmes.mdm.dma.erdEdit;

import static org.assertj.core.api.Assertions.assertThat;

import com.dongkuk.dmes.mdm.common.testdb.AbstractMdmSharedDbTest;
import com.dongkuk.dmes.mdm.contract.version.*;
import com.dongkuk.dmes.mdm.dma.erdEdit.engine.*;
import com.dongkuk.dmes.mdm.dma.erdEdit.engine.ErdCommand.*;
import com.dongkuk.dmes.mdm.dma.erdEdit.model.*;
import com.dongkuk.dmes.mdm.dma.erdEdit.service.*;
import java.math.BigDecimal;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;

@SpringBootTest
@ActiveProfiles("local")
class ErdVersionServiceTest extends AbstractMdmSharedDbTest {

    @Autowired JdbcTemplate jdbc;
    @Autowired ErdVersionService versions;
    @Autowired ErdModelStore store;
    @Autowired ErdConfirmCheck confirmCheck;
    @Autowired VersionStateService stateService;

    @BeforeEach
    void clean() {
        for (String t : List.of("TB_MDM_ERD_CLAIM", "TB_MDM_ERD_DIAGRAM_NODE", "TB_MDM_ERD_DIAGRAM", "TB_MDM_ERD_CMD_LOG",
                "TB_MDM_ERD_EDITOR", "TB_MDM_ERD_MODEL_VER", "TB_MDM_ERD_MODEL")) jdbc.update("DELETE FROM " + t);
    }

    @Test
    void createModelMakesDraftOwnedByCreator() {
        versions.createModel("mcm", "mcm", "MCMAPUSER", "MCM", "owner");
        MdmErdModelVer d = store.draft("mcm").orElseThrow();
        assertThat(d.getOwnerId()).isEqualTo("owner");
        assertThat(ErdModelCodec.read(d.getModelJson()).model.schema).isEqualTo("MCMAPUSER");
    }

    @Test
    void newVersionCopiesJsonAndKeepsIds() {
        versions.createModel("mcm", "mcm", "MCMAPUSER", "MCM", "owner");
        ErdModel m = ((ApplyOutcome.Applied) new ErdCommandEngine(ErdNaming.NONE).apply(ErdModel.empty("mcm", "MCMAPUSER"),
                0, 1, "s", List.of(new AddTable("t-1", "TB_A", "에이", "")))).next();
        store.writeJson(new VersionRef(VersionTarget.ERD_MODEL, "mcm", new BigDecimal("1.000")), ErdModelCodec.write(m));
        jdbc.update("UPDATE TB_MDM_ERD_MODEL_VER SET STATUS='RELEASED', APPLY_FROM=SYSTIMESTAMP - 1, APPLY_TO=TIMESTAMP '9999-12-31 00:00:00' WHERE ERD_MODEL_ID='mcm'");
        BigDecimal next = versions.newVersion("mcm", "MINOR", "owner");
        MdmErdModelVer d = store.draft("mcm").orElseThrow();
        assertThat(d.getVer()).isEqualByComparingTo(next);
        assertThat(ErdModelCodec.read(d.getModelJson()).tables).containsKey("t-1");
        assertThat(d.getBaseVer()).isEqualByComparingTo("1.000");
    }

    @Test
    void confirmBlocksOnlyChangedColumnViolations() {
        versions.createModel("mcm", "mcm", "MCMAPUSER", "MCM", "owner");
        var engine = new ErdCommandEngine(ErdNaming.NONE);
        ErdModel released = ((ApplyOutcome.Applied) engine.apply(ErdModel.empty("mcm", "MCMAPUSER"), 0, 1, "s", List.of(
                new AddTable("t-1", "TB_A", "에이", ""),
                new AddColumn("c-old", "t-1", "BIZ_CD", "***코드", null, "VARCHAR2", 10, null, false, null, "", null)))).next();
        store.writeJson(new VersionRef(VersionTarget.ERD_MODEL, "mcm", new BigDecimal("1.000")), ErdModelCodec.write(released));
        jdbc.update("UPDATE TB_MDM_ERD_MODEL_VER SET STATUS='RELEASED', APPLY_FROM=SYSTIMESTAMP - 1, APPLY_TO=TIMESTAMP '9999-12-31 00:00:00' WHERE ERD_MODEL_ID='mcm'");
        BigDecimal next = versions.newVersion("mcm", "MINOR", "owner");
        VersionRef draft = new VersionRef(VersionTarget.ERD_MODEL, "mcm", next);

        var ok = confirmCheck.check(new ConfirmCheckRequest(draft, java.time.LocalDateTime.now().plusDays(1), null, "owner", java.time.LocalDateTime.now()));
        assertThat(ok.errors()).isEmpty();
        assertThat(ok.warnings()).isNotEmpty(); // 기존 위반(BIZ_CD)은 경고

        ErdModel changed = ((ApplyOutcome.Applied) engine.apply(released, 1, 2, "s", List.of(
                new AddColumn("c-new", "t-1", "ZZ_QQ", "***", null, "VARCHAR2", 1, null, false, null, "", null)))).next();
        store.writeJson(draft, ErdModelCodec.write(changed));
        var blocked = confirmCheck.check(new ConfirmCheckRequest(draft, java.time.LocalDateTime.now().plusDays(1), null, "owner", java.time.LocalDateTime.now()));
        assertThat(blocked.errors()).extracting(i -> i.itemKey()).contains("c-new");
    }

    @Test
    void deleteDraftRemovesEditorsFirst() {
        versions.createModel("mcm", "mcm", "MCMAPUSER", "MCM", "owner");
        jdbc.update("UPDATE TB_MDM_ERD_MODEL_VER SET STATUS='RELEASED', APPLY_FROM=SYSTIMESTAMP - 1, APPLY_TO=TIMESTAMP '9999-12-31 00:00:00' WHERE ERD_MODEL_ID='mcm'");
        BigDecimal next = versions.newVersion("mcm", "MINOR", "owner");
        versions.addEditor("mcm", "mate", "owner");
        MdmErdModelVer d = store.draft("mcm").orElseThrow();

        stateService.deleteDraft(new VersionRef(VersionTarget.ERD_MODEL, "mcm", next), d.getRowVersion(), "owner");

        assertThat(store.draft("mcm")).isEmpty();
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM TB_MDM_ERD_EDITOR WHERE ERD_MODEL_ID='mcm'", Integer.class)).isZero();
        assertThat(store.latestReleased("mcm")).isPresent(); // RELEASED 는 남는다
    }
}
```

`confirmBlocksOnlyChangedColumnViolations` 는 공유 시험 DB(`TPL_EMPTY` 복제) 의 용어 사전이 비어 있다는 전제로 쓴다. 사전이 비면 `BIZ_CD`·`ZZ_QQ` 둘 다 `MISS` 다.

- [ ] **Step 2: 시험이 실패하는지 확인**

Run: `… heavy.mjs ../gradlew :api:test --max-workers=2 -Pdmes.ora.test=clone --tests '*ErdVersionServiceTest'`
Expected: 컴파일 실패.

- [ ] **Step 3: 오류 코드 추가**

`MdmErrorCode` 의 마지막 상수 번호를 확인하고(`grep -n '"MDM0' MdmErrorCode.java | tail -1`) 다음 번호로 추가한다.
```java
    ERD_MODEL_NOT_FOUND("MDM0NN", 404, ErrorCode.BUSINESS_ERROR, "ERD 모델이 없습니다"),
```
`NN` 은 마지막 번호 + 1 이다. 오류 코드 목록을 문서와 대조하는 시험이 있으면(`grep -rn "MdmErrorCode.values" src/backend/mdm`) 그 문서(`docs/mdm/…`)에도 한 줄을 더한다.

- [ ] **Step 4: 구현**

```java
// ErdModelStore.java
package com.dongkuk.dmes.mdm.dma.erdEdit.service;

import com.dongkuk.dmes.mdm.common.support.MdmErrors;
import com.dongkuk.dmes.mdm.contract.common.MdmErrorCode;
import com.dongkuk.dmes.mdm.contract.version.VersionRef;
import com.dongkuk.dmes.mdm.entity.MdmErdModelVer;
import jakarta.persistence.EntityManager;
import java.util.List;
import java.util.Optional;
import org.springframework.stereotype.Component;

/** ERD 모델·버전 읽기와 네이티브 쓰기(RuleSetWrites 선례). 쓰기는 호출자의 트랜잭션 안에서만 부른다. */
@Component
public class ErdModelStore {

    private final EntityManager em;

    public ErdModelStore(EntityManager em) {
        this.em = em;
    }

    /** 모델 행을 잠그고 현재 REV 를 읽는다 — 모델 단위로 명령을 하나씩 처리하는 자리(스펙 2.1-2). */
    public long lockRev(String modelId) {
        List<?> rows = em.createNativeQuery("SELECT REV FROM TB_MDM_ERD_MODEL WHERE ERD_MODEL_ID = ? FOR UPDATE")
                .setParameter(1, modelId).getResultList();
        if (rows.isEmpty()) throw MdmErrors.of(MdmErrorCode.ERD_MODEL_NOT_FOUND);
        return ((Number) rows.get(0)).longValue();
    }

    public long rev(String modelId) {
        List<?> rows = em.createNativeQuery("SELECT REV FROM TB_MDM_ERD_MODEL WHERE ERD_MODEL_ID = ?")
                .setParameter(1, modelId).getResultList();
        if (rows.isEmpty()) throw MdmErrors.of(MdmErrorCode.ERD_MODEL_NOT_FOUND);
        return ((Number) rows.get(0)).longValue();
    }

    public void setRev(String modelId, long rev) {
        em.createNativeQuery("UPDATE TB_MDM_ERD_MODEL SET REV = ? WHERE ERD_MODEL_ID = ?")
                .setParameter(1, rev).setParameter(2, modelId).executeUpdate();
    }

    public Optional<MdmErdModelVer> draft(String modelId) {
        return em.createQuery("SELECT v FROM MdmErdModelVer v WHERE v.erdModelId = :id AND v.status = 'DRAFT'", MdmErdModelVer.class)
                .setParameter("id", modelId).getResultStream().findFirst();
    }

    public Optional<MdmErdModelVer> latestReleased(String modelId) {
        return em.createQuery("SELECT v FROM MdmErdModelVer v WHERE v.erdModelId = :id AND v.status = 'RELEASED' ORDER BY v.ver DESC",
                        MdmErdModelVer.class)
                .setParameter("id", modelId).setMaxResults(1).getResultStream().findFirst();
    }

    public MdmErdModelVer current(String modelId) {
        return draft(modelId).or(() -> latestReleased(modelId))
                .orElseThrow(() -> MdmErrors.of(MdmErrorCode.ERD_MODEL_NOT_FOUND));
    }

    public Optional<MdmErdModelVer> find(VersionRef ref) {
        return em.createQuery("SELECT v FROM MdmErdModelVer v WHERE v.erdModelId = :id AND v.ver = :ver", MdmErdModelVer.class)
                .setParameter("id", ref.objectId()).setParameter("ver", ref.ver()).getResultStream().findFirst();
    }

    public void writeJson(VersionRef ref, String json) {
        em.createNativeQuery("UPDATE TB_MDM_ERD_MODEL_VER SET MODEL_JSON = ? WHERE ERD_MODEL_ID = ? AND VER = ?")
                .setParameter(1, json).setParameter(2, ref.objectId()).setParameter(3, ref.ver()).executeUpdate();
        em.clear();
    }
}
```

`ErdVersionService` 는 `RuleSetVersionService.newVersion`(94~128행)과 같은 순서를 따른다.

```java
package com.dongkuk.dmes.mdm.dma.erdEdit.service;

import com.dongkuk.dmes.mdm.common.security.MdmCurrentUser;
import com.dongkuk.dmes.mdm.common.support.MdmErrors;
import com.dongkuk.dmes.mdm.common.version.VersionRowStore;
import com.dongkuk.dmes.mdm.common.version.VersionRules;
import com.dongkuk.dmes.mdm.contract.common.MdmErrorCode;
import com.dongkuk.dmes.mdm.contract.version.*;
import com.dongkuk.dmes.mdm.dma.erdEdit.model.ErdModel;
import com.dongkuk.dmes.mdm.dma.erdEdit.model.ErdModelCodec;
import com.dongkuk.dmes.mdm.entity.*;
import com.dongkuk.dmes.mdm.repository.*;
import java.math.BigDecimal;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/** ERD 모델 만들기·새 버전·공동 편집자(스펙 2.1-6, D15). 상태·소유자는 공통 버전 서비스가 맡는다. */
@Service
public class ErdVersionService {

    private final VersionWriteGuard writeGuard;
    private final VersionRowStore versionStore;
    private final ErdModelStore store;
    private final MdmErdModelRepository models;
    private final MdmErdModelVerRepository vers;
    private final MdmErdEditorRepository editors;
    private final TransactionTemplate tx;

    public ErdVersionService(VersionWriteGuard writeGuard, VersionRowStore versionStore, ErdModelStore store,
                             MdmErdModelRepository models, MdmErdModelVerRepository vers, MdmErdEditorRepository editors,
                             PlatformTransactionManager transactionManager) {
        this.writeGuard = writeGuard;
        this.versionStore = versionStore;
        this.store = store;
        this.models = models;
        this.vers = vers;
        this.editors = editors;
        this.tx = new TransactionTemplate(transactionManager);
    }

    public String createModel(String modelId, String module, String schema, String name, String me) {
        tx.executeWithoutResult(s -> {
            if (models.existsById(modelId)) throw MdmErrors.of(MdmErrorCode.INVALID_INPUT, "이미 있는 모델 ID 입니다: " + modelId, java.util.List.of());
            models.saveAndFlush(new MdmErdModel(modelId, module, schema, name));
            vers.saveAndFlush(new MdmErdModelVer(modelId, new BigDecimal("1.000"), "MAJOR", me,
                    ErdModelCodec.write(ErdModel.empty(module, schema))));
        });
        return modelId;
    }

    public BigDecimal newVersion(String modelId, String kind, String me) {
        writeGuard.checkCanCreateVersion(VersionTarget.ERD_MODEL, modelId); // MDM006
        var source = store.latestReleased(modelId);
        BigDecimal max = store.draft(modelId).map(MdmErdModelVer::getVer)
                .or(() -> source.map(MdmErdModelVer::getVer)).orElse(BigDecimal.ZERO);
        BigDecimal next = VersionRules.nextNumber(max, VersionRules.parseKind(kind));
        tx.executeWithoutResult(s -> {
            String json = source.map(MdmErdModelVer::getModelJson).orElseThrow(() -> MdmErrors.of(MdmErrorCode.ERD_MODEL_NOT_FOUND));
            MdmErdModelVer created = new MdmErdModelVer(modelId, next, kind, me, json);
            source.ifPresent(x -> created.setBaseVer(x.getVer()));
            vers.saveAndFlush(created);
        });
        return next;
    }

    public void addEditor(String modelId, String userId, String me) {
        MdmErdModelVer d = requireOwnedDraft(modelId, me);
        tx.executeWithoutResult(s -> editors.saveAndFlush(new MdmErdEditor(modelId, d.getVer(), userId)));
    }

    public void removeEditor(String modelId, String userId, String me) {
        MdmErdModelVer d = requireOwnedDraft(modelId, me);
        tx.executeWithoutResult(s -> editors.deleteById(new MdmErdEditorId(modelId, d.getVer(), userId)));
    }

    private MdmErdModelVer requireOwnedDraft(String modelId, String me) {
        MdmErdModelVer d = store.draft(modelId).orElseThrow(() -> MdmErrors.of(MdmErrorCode.NOT_DRAFT));
        if (!me.equals(d.getOwnerId())) throw MdmErrors.of(MdmErrorCode.NOT_DRAFT_OWNER);
        return d;
    }
}
```

`VersionRules.nextNumber`·`parseKind` 의 실제 시그니처는 `RuleSetVersionService.newVersion`(94~128행)에서 확인해 맞춘다(이 서비스는 `@Transactional` 대신 `PlatformTransactionManager` 로 만든 `TransactionTemplate` 을 쓴다 — 같은 방식을 따른다). `MdmErdModel`·`MdmErdEditor` 에 위에서 쓴 생성자를 둔다.

`ErdConfirmCheck`:
```java
package com.dongkuk.dmes.mdm.dma.erdEdit.service;

import com.dongkuk.dmes.mdm.contract.common.MdmCheckIssue;
import com.dongkuk.dmes.mdm.contract.version.*;
import com.dongkuk.dmes.mdm.dma.erdEdit.model.*;
import com.dongkuk.dmes.mdm.dma.erdEdit.standard.*;
import java.util.*;
import org.springframework.stereotype.Component;

/** ERD_MODEL 확정 검사(스펙 D19): 직전 RELEASED 와 비교해 추가·변경한 컬럼의 표준 위반만 막는다. */
@Component
public class ErdConfirmCheck implements VersionConfirmCheckSpi {

    private final ErdModelStore store;
    private final ErdDictionaryLoader dictionaries;

    public ErdConfirmCheck(ErdModelStore store, ErdDictionaryLoader dictionaries) {
        this.store = store;
        this.dictionaries = dictionaries;
    }

    @Override
    public VersionTarget target() {
        return VersionTarget.ERD_MODEL;
    }

    @Override
    public VersionDiff diff(VersionRef draft) {
        ErdModel now = ErdModelCodec.read(store.find(draft).orElseThrow().getModelJson());
        var base = store.latestReleased(draft.objectId());
        ErdModel before = base.map(b -> ErdModelCodec.read(b.getModelJson())).orElse(ErdModel.empty(now.model.module, now.model.schema));
        List<VersionDiffEntry> entries = new ArrayList<>();
        for (var e : now.columns.entrySet()) {
            ErdColumn old = before.columns.get(e.getKey());
            Map<String, Object> nv = ErdModelCodec.MAPPER.convertValue(e.getValue(), Map.class);
            nv.remove("_rev");
            if (old == null) entries.add(new VersionDiffEntry(e.getKey(), DiffKind.ADDED, null, nv));
            else {
                Map<String, Object> ov = ErdModelCodec.MAPPER.convertValue(old, Map.class);
                ov.remove("_rev");
                if (!ov.equals(nv)) entries.add(new VersionDiffEntry(e.getKey(), DiffKind.CHANGED, ov, nv));
            }
        }
        for (String id : before.columns.keySet()) {
            if (!now.columns.containsKey(id)) entries.add(new VersionDiffEntry(id, DiffKind.REMOVED, null, null));
        }
        return new VersionDiff(base.map(b -> new VersionRef(VersionTarget.ERD_MODEL, b.getErdModelId(), b.getVer())).orElse(null), draft, entries);
    }

    @Override
    public ConfirmCheckResult check(ConfirmCheckRequest request) {
        VersionDiff diff = diff(request.draft());
        Set<String> changed = new HashSet<>();
        for (VersionDiffEntry e : diff.entries()) if (e.kind() != DiffKind.REMOVED) changed.add(e.key());
        ErdModel now = ErdModelCodec.read(store.find(request.draft()).orElseThrow().getModelJson());
        Map<String, ErdColumnStatus> statuses = ErdStandardJudge.judge(now, dictionaries.load());
        List<MdmCheckIssue> errors = new ArrayList<>(), warnings = new ArrayList<>();
        statuses.forEach((id, st) -> {
            if (!st.blocksConfirm()) return;
            ErdColumn c = now.columns.get(id);
            String where = now.tables.get(c.table).phys + "." + c.phys;
            MdmCheckIssue issue = new MdmCheckIssue("ERD_STD_" + st.name(), where + " 표준 위반(" + st.name() + ")", "column", id);
            (changed.contains(id) ? errors : warnings).add(issue);
        });
        long inferred = now.relations.values().stream().filter(r -> "INFERRED".equals(r.state)).count();
        if (inferred > 0) warnings.add(new MdmCheckIssue("ERD_INFERRED_LEFT", "검토하지 않은 추정 관계 " + inferred + "개", "relation", null));
        return new ConfirmCheckResult(errors, warnings);
    }
}
```

`DiffKind` 의 실제 상수 이름은 `contract/version/DiffKind.java` 에서 확인한다.

`ErdDraftDeletion`:
```java
@Component
public class ErdDraftDeletion implements VersionDraftDeletionSpi {
    private final jakarta.persistence.EntityManager em;
    public ErdDraftDeletion(jakarta.persistence.EntityManager em) { this.em = em; }
    @Override public VersionTarget target() { return VersionTarget.ERD_MODEL; }
    /** DRAFT 의 공동 편집자 행을 먼저 지운다(FK). 다이어그램·명령 기록은 버전 밖이라 남긴다. */
    @Override public void beforeDraftDelete(VersionRef draft) {
        em.createNativeQuery("DELETE FROM TB_MDM_ERD_EDITOR WHERE ERD_MODEL_ID = ? AND VER = ?")
                .setParameter(1, draft.objectId()).setParameter(2, draft.ver()).executeUpdate();
    }
}
```

- [ ] **Step 5: 시험 통과 확인**

Run: Step 2 명령. Expected: 4건 PASS.

- [ ] **Step 6: 커밋**

```bash
/usr/bin/git add src/backend/mdm
/usr/bin/git commit -m "feat(mdm): ERD 버전 서비스·확정 검사(바뀐 컬럼 위반만 차단)·DRAFT 삭제 훅"
```
