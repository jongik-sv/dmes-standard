# 룰 세트 디버거·케이스 실행 — 내 DRAFT 룰 시험 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 룰 세트 편집 화면의 디버거·테스트 케이스 일괄 실행이 「룰 버전: 적용 중(기본) / 내 DRAFT 우선」 을 골라, 내 DRAFT 룰·하위 세트로 세트를 시험하게 한다.

**Architecture:** 서버는 정의 조회기(`StoredDefinitionLookup`)가 생성자로 받은 버전 선택 모드(`RuleVersionPick`)로 룰·세트 버전을 고르고, DRAFT 로 실제 실행한 것을 기록한다. 디버거 서비스가 요청 칸 `ruleVersions` 로 세션을 만들고 응답 칸 `draftVersions` 를 싣는다. 화면은 `useSimulation` 이 모드를 들고 요청·최근 입력·비교에 쓰며, 실행 기록에 DRAFT 를 표시한다. 확정 검사는 RELEASED 그대로이고 케이스 실패 문구 뒤에 안내만 붙인다.

**Tech Stack:** Java 21 · Spring Boot · JPA(SQLite 시험) · JUnit 5 / React 19 · TypeScript · vitest(happy-dom) · `@dk-oasis/shared`

**Spec:** `docs/superpowers/specs/2026-10-06-rule-set-draft-rule-test-design.md` (승인 2026-10-06, 판단 (a)(b)(c) 권장안)

## Global Constraints

- 엔진 모듈(`src/backend/maru-mdm-engine`)·엔진 계약(`RunTrace`·`DefinitionLookup` 타입·스키마)을 바꾸지 않는다.
- `RuleSetAnalyzer`·`RuleIoReader`·`set-model.ts`(화면 검사)를 바꾸지 않는다.
- 확정 동작(차단·경고 확인·확정 시 실행 버전)을 바꾸지 않는다. 새 확정 이슈(코드)를 만들지 않는다.
- `@dk-oasis/shared` 기존 컴포넌트를 바꾸지 않는다. 선택 칸은 `@dk-oasis/shared/form` 의 `Select` 를 props 그대로 쓴다.
- 소유 밖 파일은 `common/rule/confirm/RuleSetConfirmChecks.java` 하나만 고친다(조정자 허용 (a)).
- 요청 모드 값: `RELEASED`(기본, 빈 값 포함) · `MY_DRAFT`. 그 밖은 `INVALID_VALUE` "룰 버전은 RELEASED 또는 MY_DRAFT 여야 합니다: {값}".
- 「내 DRAFT」 = `STATUS` 가 정확히 `DRAFT` 이고 `OWNER_ID` 가 `MdmCurrentUser.userId()` 인 행. REQUESTED·APPROVED·남의 DRAFT 는 고르지 않는다.
- DRAFT 는 판정 시각과 무관하게 고른다. 없으면 `RuleVersions.currentReleased(versions, t)`.
- 사용자 ID 없음 → RELEASED 로 실행, 경고 `DRAFT_USER_UNKNOWN` "로그인 사용자를 알 수 없어 적용 중 버전으로 실행했다"(경고 목록 맨 앞).
- 응답 `draftVersions` 모양 `{ "rules": {id: "1.003"}, "sets": {id: "2.001"} }`, 키 늘 있음, VER 는 `VersionNumbers.plain`.
- 확정 안내 문구(실패 문구 뒤): `" — 룰 R1·R2 에 확정하지 않은 DRAFT 가 있다. 확정 검사는 적용 중 버전으로 돌리므로, 그 DRAFT 로 시험해 통과했다면 룰 DRAFT 를 먼저 확정한다"`. 기준은 확정 대상 세트 버전의 `OWNER_ID`.
- 화면 문구: 선택 칸 이름 "룰 버전", 항목 "적용 중(기본)"·"내 DRAFT 우선", 검사 안내 "검사 결과(거부·경고)는 적용 중 버전 기준이다. 실행만 내 DRAFT 를 쓴다".
- localStorage 키 `rsf:ruleVersions`(세트와 무관). 최근 입력에 모드 저장, 예전 항목은 RELEASED.
- 시험은 SQLite 만, 도커 금지. gradle·vitest workers 2. git 은 `/usr/bin/git`. gradle 은 `JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home`.
- 셸 명령은 짧게 나누고, 파일 수정은 Edit·Write 도구로 한다. `node_modules` 가 심링크면 그 안에서 `pnpm install` 하지 않는다.

시험 명령(이 계획 전체에서 같다):

```bash
# 서버 시험 하나(작업 디렉터리 src/backend)
cd /Users/jji/project/dmes-standard-wt/ruleset-draft-test/src/backend
JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home ./gradlew :mdm:api:test --tests 'com.dongkuk.dmes.mdm.<패키지>.<클래스>' --max-workers=2 -q
# 화면 시험 하나(작업 디렉터리 src/frontend/m-mdm)
cd /Users/jji/project/dmes-standard-wt/ruleset-draft-test/src/frontend/m-mdm
npx vitest run --config vitest.config.ts --maxWorkers=2 tests/dme/ruleSetEdit/<파일>
```

`:mdm:api:test` 경로가 included build 라 안 잡히면 `cd src/backend/mdm && ../gradlew :api:test …` 로 돌린다.

## Review Focus

1. **prefetch 와 load 의 버전 어긋남** — `MY_DRAFT` 에서 prefetch 가 RELEASED VER 를 미리 읽고 load 가 DRAFT 를 고르면 정의가 섞인다. 같은 `pick` 을 써야 한다(Task 1 시험 `prefetch_뒤_rule_도_DRAFT`).
2. **실행하지 않은 갈래의 DRAFT 표시** — prefetch 가 읽은 룰을 DRAFT 사용으로 기록하면 화면이 지나지 않은 룰에 DRAFT 를 붙인다(Task 1 시험 `prefetch_만_한_룰은_draftRules_에_없다`).
3. **모드 없는 경로의 회귀** — 확정 검사·OASIS `execute`·`RELEASED` 디버거가 내 DRAFT 를 읽으면 운영 판정이 바뀐다(Task 2 시험 `RELEASED_와_execute_는_DRAFT_를_읽지_않는다`, Task 3 시험).
4. **모드를 바꾼 뒤 낡은 기록 재사용** — 모드만 바꾸고 [한 단계]를 누르면 예전 모드 기록으로 이어 가면 안 된다(Task 4 시험 `모드를_바꾸면_새로_실행`).
5. **예전 최근 입력(모드 없음) 불러오기** — 저장소의 옛 항목이 모드 없이 있어도 깨지지 않고 RELEASED 로 읽어야 한다(Task 4 시험 `local-store 옛 항목`).

---

### Task 1: 버전 선택 모드와 정의 조회기

**Files:**
- Create: `src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/common/rule/definition/RuleVersionPick.java`
- Modify: `src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/common/rule/definition/StoredDefinitionLookup.java` (생성자 :71, prefetch :117, loadSet :159~168, load :201~222)
- Modify: `src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/common/rule/RuleSetRunner.java` (session :120~133, traceDefinition 주석 :157)
- Test: `src/backend/mdm/api/src/test/java/com/dongkuk/dmes/mdm/common/rule/StoredDefinitionLookupDraftTest.java`

**Interfaces:**
- Produces:
  - `public record RuleVersionPick(String draftOwner)` — `static final RuleVersionPick RELEASED`, `static RuleVersionPick myDraft(String userId)`, `boolean draftFirst()`, `<T extends VersionedRow> Optional<T> pick(Collection<T> versions, Function<T, String> owner, LocalDateTime at)`
  - `StoredDefinitionLookup(RuleQueries, StoredRuleDefinitions, MdmRuleRepository, RuleSetVersionQueries, MdmRuleSetRepository, RuleVersionPick)` (5인자 생성자는 RELEASED 로 위임해 남김)
  - `StoredDefinitionLookup.draftRules(): Map<String, BigDecimal>`, `draftSets(): Map<String, MdmRuleSetVer>` (넣은 순서, 읽기 전용 사본)
  - `RuleSetRunner.session(RuleVersionPick pick): Session`, `Session.draftRules()`, `Session.draftSets()`

- [ ] **Step 1: 실패하는 시험 쓰기**

```java
package com.dongkuk.dmes.mdm.common.rule;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.dongkuk.dmes.mdm.common.rule.definition.RuleVersionPick;
import com.dongkuk.dmes.mdm.common.rule.definition.StoredDefinitionException;
import com.dongkuk.dmes.mdm.common.rule.definition.StoredDefinitionLookup;
import com.dongkuk.dmes.mdm.common.rule.definition.StoredRuleDefinitions;
import com.dongkuk.dmes.mdm.common.testdb.AbstractMdmSharedDbTest;
import com.dongkuk.dmes.mdm.dme.DmeTestSupport;
import com.dongkuk.dmes.mdm.repository.MdmRuleRepository;
import com.dongkuk.dmes.mdm.repository.MdmRuleSetRepository;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;

/** 룰 세트 DRAFT 시험(spec 2026-10-06 §3·§4.2) — MY_DRAFT 조회기는 내 DRAFT 를 판정 시각과 무관하게 고르고, 실제 load 한 것만 기록한다. */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.MOCK)
@ActiveProfiles("local")
@Import(DmeTestSupport.Config.class)
class StoredDefinitionLookupDraftTest extends AbstractMdmSharedDbTest {

    static final Instant AT = Instant.parse("2026-03-01T00:00:00Z");
    /** 모든 RELEASED 의 적용 시작(2026-01-01 KST)보다 이른 시각. */
    static final Instant EARLY = Instant.parse("2025-06-01T00:00:00Z");

    @Autowired JdbcTemplate jdbc;
    @Autowired RuleQueries queries;
    @Autowired StoredRuleDefinitions stored;
    @Autowired MdmRuleRepository ruleRepository;
    @Autowired MdmRuleSetRepository setRepository;
    @Autowired RuleSetVersionQueries setVersions;

    @BeforeEach
    void seed() {
        DmeTestSupport.clear(jdbc);
        DmeTestSupport.clearDictionary(jdbc);
        // R_MINE: v1 RELEASED + v2 내(kim) DRAFT
        DmeTestSupport.rule(jdbc, "R_MINE", "내 DRAFT 룰", "DECISION", "INUSE");
        DmeTestSupport.released(jdbc, "R_MINE", 1, "FIRST", "2026-01-01 00:00:00", null);
        DmeTestSupport.var(jdbc, "R_MINE", 1, 1, "RESULT", "Value", "OUT_V", 1, "STRING");
        DmeTestSupport.pending(jdbc, "R_MINE", 2, "DRAFT", "kim", "FIRST", 1);
        DmeTestSupport.var(jdbc, "R_MINE", 2, 1, "RESULT", "Value", "OUT_V", 1, "STRING");
        // R_OTHER: v1 RELEASED + v2 남(lee) DRAFT
        DmeTestSupport.rule(jdbc, "R_OTHER", "남 DRAFT 룰", "DECISION", "INUSE");
        DmeTestSupport.released(jdbc, "R_OTHER", 1, "FIRST", "2026-01-01 00:00:00", null);
        DmeTestSupport.var(jdbc, "R_OTHER", 1, 1, "RESULT", "Value", "OUT_V", 1, "STRING");
        DmeTestSupport.pending(jdbc, "R_OTHER", 2, "DRAFT", "lee", "FIRST", 1);
        DmeTestSupport.var(jdbc, "R_OTHER", 2, 1, "RESULT", "Value", "OUT_V", 1, "STRING");
        // R_REQ: v1 RELEASED + v2 내 REQUESTED
        DmeTestSupport.rule(jdbc, "R_REQ", "승인 요청 룰", "DECISION", "INUSE");
        DmeTestSupport.released(jdbc, "R_REQ", 1, "FIRST", "2026-01-01 00:00:00", null);
        DmeTestSupport.var(jdbc, "R_REQ", 1, 1, "RESULT", "Value", "OUT_V", 1, "STRING");
        DmeTestSupport.pending(jdbc, "R_REQ", 2, "REQUESTED", "kim", "FIRST", 1);
        DmeTestSupport.var(jdbc, "R_REQ", 2, 1, "RESULT", "Value", "OUT_V", 1, "STRING");
        // R_NEW: RELEASED 없이 내 DRAFT v1 만
        DmeTestSupport.rule(jdbc, "R_NEW", "새 룰", "DECISION", "CREATED");
        DmeTestSupport.pending(jdbc, "R_NEW", 1, "DRAFT", "kim", "FIRST", null);
        DmeTestSupport.var(jdbc, "R_NEW", 1, 1, "RESULT", "Value", "OUT_V", 1, "STRING");
    }

    private StoredDefinitionLookup lookup(RuleVersionPick pick) {
        return new StoredDefinitionLookup(queries, stored, ruleRepository, setVersions, setRepository, pick);
    }

    @Test
    void MY_DRAFT_는_내_DRAFT_를_고르고_남의_DRAFT_와_REQUESTED_는_RELEASED() {
        StoredDefinitionLookup l = lookup(RuleVersionPick.myDraft("kim"));
        assertEquals(new BigDecimal("2.000"), l.rule("R_MINE", AT).orElseThrow().ver());
        assertEquals(new BigDecimal("1.000"), l.rule("R_OTHER", AT).orElseThrow().ver());
        assertEquals(new BigDecimal("1.000"), l.rule("R_REQ", AT).orElseThrow().ver());
        assertEquals(new BigDecimal("1.000"), l.rule("R_NEW", AT).orElseThrow().ver()); // RELEASED 없이 DRAFT 만
    }

    @Test
    void DRAFT_는_판정_시각과_무관하다() {
        StoredDefinitionLookup l = lookup(RuleVersionPick.myDraft("kim"));
        assertEquals(new BigDecimal("2.000"), l.rule("R_MINE", EARLY).orElseThrow().ver());
        assertTrue(l.rule("R_OTHER", EARLY).isEmpty()); // RELEASED 적용 시작 전 = 지금처럼 없음
    }

    @Test
    void RELEASED_와_기본_생성자는_DRAFT_를_읽지_않는다() {
        StoredDefinitionLookup released = lookup(RuleVersionPick.RELEASED);
        StoredDefinitionLookup legacy = new StoredDefinitionLookup(queries, stored, ruleRepository, setVersions, setRepository);
        assertEquals(new BigDecimal("1.000"), released.rule("R_MINE", AT).orElseThrow().ver());
        assertEquals(new BigDecimal("1.000"), legacy.rule("R_MINE", AT).orElseThrow().ver());
        assertTrue(legacy.rule("R_NEW", AT).isEmpty());
        assertTrue(released.draftRules().isEmpty());
    }

    @Test
    void 사용자_ID_가_없으면_RELEASED_다() {
        assertEquals(RuleVersionPick.RELEASED, RuleVersionPick.myDraft(null));
        assertEquals(RuleVersionPick.RELEASED, RuleVersionPick.myDraft(" "));
    }

    @Test
    void prefetch_뒤_rule_도_DRAFT() {
        StoredDefinitionLookup l = lookup(RuleVersionPick.myDraft("kim"));
        l.prefetch(List.of("R_MINE", "R_OTHER"), AT);
        assertEquals(new BigDecimal("2.000"), l.rule("R_MINE", AT).orElseThrow().ver());
        assertEquals(new BigDecimal("1.000"), l.rule("R_OTHER", AT).orElseThrow().ver());
    }

    @Test
    void prefetch_만_한_룰은_draftRules_에_없다() {
        StoredDefinitionLookup l = lookup(RuleVersionPick.myDraft("kim"));
        l.prefetch(List.of("R_MINE", "R_NEW"), AT);
        l.rule("R_NEW", AT);
        assertEquals(java.util.Map.of("R_NEW", new BigDecimal("1.000")), l.draftRules());
    }

    @Test
    void 내_DRAFT_세트를_고르고_draftSets_에_남긴다() {
        DmeTestSupport.ruleSet(jdbc, "S_SUB", "하위", "[\"R_OTHER\"]", "INUSE", 0);
        DmeTestSupport.ruleSetDraft(jdbc, "S_SUB", "2.000", "kim", "[\"R_MINE\"]", 0);
        StoredDefinitionLookup l = lookup(RuleVersionPick.myDraft("kim"));
        assertEquals(List.of("R_MINE"), l.ruleSet("S_SUB", AT).orElseThrow().ruleIds());
        assertEquals(new BigDecimal("2.000"), l.draftSets().get("S_SUB").getVer().setScale(3));
        assertEquals(List.of("R_OTHER"), lookup(RuleVersionPick.RELEASED).ruleSet("S_SUB", AT).orElseThrow().ruleIds());
    }

    @Test
    void 깨진_내_DRAFT_는_머리말을_붙여_던진다() {
        DmeTestSupport.row(jdbc, "R_MINE", 2, 1, 1, "NORMAL", "{\"9\":{\"op\":\"GT\",\"left\":\"1\"},\"1\":{\"val\":\"X\"}}");
        StoredDefinitionException e = assertThrows(StoredDefinitionException.class,
                () -> lookup(RuleVersionPick.myDraft("kim")).rule("R_MINE", AT));
        assertTrue(e.getMessage().startsWith("룰 R_MINE 의 내 DRAFT 버전 2.000: "), e.getMessage());
    }
}
```

- [ ] **Step 2: 시험이 실패하는지 확인**

Run: 위 서버 시험 명령에 `common.rule.StoredDefinitionLookupDraftTest`
Expected: 컴파일 실패 — `RuleVersionPick` 없음, 6인자 생성자 없음

- [ ] **Step 3: `RuleVersionPick` 쓰기**

```java
package com.dongkuk.dmes.mdm.common.rule.definition;

import com.dongkuk.dmes.mdm.common.rule.RuleVersions;
import com.dongkuk.dmes.mdm.common.version.VersionedRow;
import java.time.LocalDateTime;
import java.util.Collection;
import java.util.Comparator;
import java.util.Optional;
import java.util.function.Function;

/**
 * 정의 조회기의 버전 선택 모드(spec 2026-10-06 §3, D-156). {@link #RELEASED} 는 판정 시각 RELEASED(지금 동작), {@link #myDraft} 는
 * {@code draftOwner} 가 소유한 DRAFT(상태가 정확히 DRAFT — REQUESTED·APPROVED 는 아니다)를 판정 시각과 무관하게 먼저 고르고, 없으면 판정 시각
 * RELEASED. 사용자 ID 는 요청이 아니라 서버의 {@code MdmCurrentUser} 에서만 온다.
 */
public record RuleVersionPick(String draftOwner) {

    public static final RuleVersionPick RELEASED = new RuleVersionPick(null);

    /** 사용자 ID 가 null·빈 글자면 {@link #RELEASED}. */
    public static RuleVersionPick myDraft(String userId) {
        return userId == null || userId.isBlank() ? RELEASED : new RuleVersionPick(userId);
    }

    public boolean draftFirst() {
        return draftOwner != null;
    }

    /** 내 DRAFT(여럿이면 VER 최대) → 없으면 {@link RuleVersions#currentReleased}. 소유자는 엔티티마다 다른 게터라 함수로 받는다. */
    public <T extends VersionedRow> Optional<T> pick(Collection<T> versions, Function<T, String> owner, LocalDateTime at) {
        if (draftOwner != null) {
            Optional<T> mine = versions.stream()
                    .filter(v -> "DRAFT".equals(v.getStatus()) && draftOwner.equals(owner.apply(v)))
                    .max(Comparator.comparing(VersionedRow::getVer));
            if (mine.isPresent()) {
                return mine;
            }
        }
        return RuleVersions.currentReleased(versions, at);
    }
}
```

- [ ] **Step 4: `StoredDefinitionLookup` 고치기**

필드·생성자(:59~78 부근):

```java
    private final RuleVersionPick pick;
    private final Map<String, BigDecimal> draftRules = new LinkedHashMap<>();
    private final Map<String, MdmRuleSetVer> draftSets = new LinkedHashMap<>();

    public StoredDefinitionLookup(RuleQueries queries, StoredRuleDefinitions stored, MdmRuleRepository rules,
                                  RuleSetVersionQueries setVersions, MdmRuleSetRepository sets) {
        this(queries, stored, rules, setVersions, sets, RuleVersionPick.RELEASED);
    }

    /**
     * 버전 선택 모드를 받는 생성자(spec 2026-10-06 §4.2). 모드는 인스턴스마다 고정이라 캐시 키({@code ruleId@evalTs}·{@code setId@evalTs})에
     * 모드를 넣지 않는다.
     */
    public StoredDefinitionLookup(RuleQueries queries, StoredRuleDefinitions stored, MdmRuleRepository rules,
                                  RuleSetVersionQueries setVersions, MdmRuleSetRepository sets, RuleVersionPick pick) {
        this.queries = queries;
        this.stored = stored;
        this.rules = rules;
        this.setVersions = setVersions;
        this.sets = sets;
        this.pick = pick;
    }

    /** DRAFT 로 실제 정의를 돌려준 룰 → VER({@link #rule} 이 읽은 것만, prefetch 는 아니다). 넣은 순서. */
    public Map<String, BigDecimal> draftRules() {
        return Collections.unmodifiableMap(new LinkedHashMap<>(draftRules));
    }

    /** DRAFT 로 실제 정의를 돌려준 세트 → 그 버전 행({@link #ruleSet} 이 읽은 것만). 넣은 순서. */
    public Map<String, MdmRuleSetVer> draftSets() {
        return Collections.unmodifiableMap(new LinkedHashMap<>(draftSets));
    }
```

prefetch(:117) 한 줄:

```java
            pick.pick(versions.get(id), MdmRuleVer::getOwnerId, now).map(MdmRuleVer::getVer)
```

loadSet(:164~167):

```java
        LocalDateTime at = LocalDateTime.ofInstant(evalTs, MdmClockConfig.KST);
        List<MdmRuleSetVer> versions = setVersions.versions(setId);
        String status = RuleVersions.effectiveStatus(parent.get().getStatus(), versions, at);
        Optional<MdmRuleSetVer> v = pick.pick(versions, MdmRuleSetVer::getOwnerId, at);
        if (v.isEmpty()) {
            return Optional.empty();
        }
        if (!isDraft(v.get())) {
            return Optional.of(toDefinition(setId, status, v.get()));
        }
        RuleSetDefinition def = draftLabeled("세트 " + setId, v.get().getVer(), () -> toDefinition(setId, status, v.get()));
        draftSets.put(setId, v.get());
        return Optional.of(def);
```

load(:206~221):

```java
        LocalDateTime now = LocalDateTime.ofInstant(evalTs, MdmClockConfig.KST);
        Optional<MdmRuleVer> ver = pick.pick(versions(ruleId), MdmRuleVer::getOwnerId, now);
        if (ver.isEmpty()) {
            return Optional.empty();
        }
        MdmRuleVer v = ver.get();
        String key = key(ruleId, v.getVer());
        Optional<RuleDefinition> known = definitions.get(key);
        if (known == null) {
            // 저장값 손상은 캐시하지 않는다 — 던지면 다음 호출이 다시 읽는다(예전과 같다).
            Raw raw = prefetched.remove(key);
            Supplier<RuleDefinition> read = () -> readStored(() -> definition(ruleId, rule.getRuleKind(),
                    raw == null ? stored.read(ruleId, v, scope()) : stored.read(ruleId, v, raw.vars(), raw.rows(), scope())));
            known = Optional.of(isDraft(v) ? draftLabeled("룰 " + ruleId, v.getVer(), read) : read.get());
            definitions.put(key, known);
        }
        if (isDraft(v)) {
            draftRules.put(ruleId, v.getVer());
        }
        return known;
```

도우미(클래스 끝 가까이):

```java
    private static boolean isDraft(VersionedRow v) {
        return "DRAFT".equals(v.getStatus()); // pick 은 RELEASED 가 아니면 내 DRAFT 만 돌려준다
    }

    /** 내 DRAFT 를 읽다 난 손상 예외에 {@code "{대상} 의 내 DRAFT 버전 x.xxx: "} 머리말을 붙인다(spec §4.2·§8). */
    private static <T> T draftLabeled(String target, BigDecimal ver, Supplier<T> read) {
        try {
            return read.get();
        } catch (StoredDefinitionException e) {
            throw new StoredDefinitionException(target + " 의 내 DRAFT 버전 " + VersionNumbers.plain(ver) + ": " + e.getMessage(), e.getCause());
        }
    }
```

import 추가: `java.util.Collections`, `com.dongkuk.dmes.mdm.common.version.VersionedRow`. 클래스 Javadoc 첫 문단 끝에 "버전 선택은 {@link RuleVersionPick}(기본 RELEASED, 디버거 MY_DRAFT — spec 2026-10-06)." 한 문장을 더한다.

- [ ] **Step 5: `RuleSetRunner.session(pick)` 더하기**

```java
    public Session session() {
        return session(RuleVersionPick.RELEASED);
    }

    /** 버전 선택 모드를 정한 실행 묶음(spec 2026-10-06 §4.3) — 디버거·케이스 일괄 실행만 MY_DRAFT 를 넘긴다. 확정 검사·운영은 {@link #session()}. */
    public Session session(RuleVersionPick pick) {
        return new Session(new StoredDefinitionLookup(queries, stored, rules, setVersions, sets, pick));
    }
```

`Session` 안:

```java
        /** {@link StoredDefinitionLookup#draftRules()}. */
        public Map<String, java.math.BigDecimal> draftRules() {
            return lookup.draftRules();
        }

        /** {@link StoredDefinitionLookup#draftSets()}. */
        public Map<String, MdmRuleSetVer> draftSets() {
            return lookup.draftSets();
        }
```

`traceDefinition` Javadoc 의 "룰은 판정 시각의 RELEASED." 를 "룰 버전은 세션 모드를 따른다(확정 검사는 {@link #session()} = RELEASED)." 로 바꾼다. import `RuleVersionPick`.

- [ ] **Step 6: 시험 통과 확인**

Run: `StoredDefinitionLookupDraftTest`, 이어서 `StoredDefinitionLookupTest`·`RuleSetRunnerTest`·`RuleSetRunnerSubsetTest`
Expected: 모두 PASS

- [ ] **Step 7: 커밋**

```bash
/usr/bin/git add src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/common/rule/definition/RuleVersionPick.java src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/common/rule/definition/StoredDefinitionLookup.java src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/common/rule/RuleSetRunner.java src/backend/mdm/api/src/test/java/com/dongkuk/dmes/mdm/common/rule/StoredDefinitionLookupDraftTest.java
/usr/bin/git commit -m "feat(rule): 정의 조회기가 내 DRAFT 우선 모드로 룰·세트 버전을 고른다"
```

---

### Task 2: 디버거 요청·응답 칸과 부른 세트 흐름

**Files:**
- Modify: `src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/dme/ruleSetEdit/dto/RuleSetSimulateRequest.java`
- Modify: `src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/dme/ruleSetEdit/dto/RuleSetSimulateResult.java`
- Modify: `src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/dme/ruleSetEdit/service/RuleSetEditService.java` (simulate :638~, runCases :725~)
- Modify: `src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/dme/ruleSetEdit/service/RuleSetCalledFlows.java` (of :52~)
- Modify: `src/backend/mdm/api/src/main/resources/services/dme/ruleSetEdit.bpmn` (헤더 documentation :13 부근, 문구만)
- Test: `src/backend/mdm/api/src/test/java/com/dongkuk/dmes/mdm/dme/ruleSetEdit/RuleSetDraftRunTest.java`

**Interfaces:**
- Consumes: Task 1 `RuleVersionPick`, `RuleSetRunner.session(RuleVersionPick)`, `Session.draftRules()`, `Session.draftSets()`
- Produces:
  - 요청 `RuleSetSimulateRequest.ruleVersions: String` (getter·setter)
  - 응답 `RuleSetSimulateResult.ruleVersions: String`(기본 `"RELEASED"`), `draftVersions: Map<String, Object>`(기본 `{rules:{}, sets:{}}`)
  - `RuleSetCalledFlows.of(RunTrace, Map<String, MdmRuleSetVer> drafts)`

- [ ] **Step 1: 실패하는 시험 쓰기**

`RuleSetSimulateTest` 와 같은 Spring 설정(`@SpringBootTest(MOCK)`·`@ActiveProfiles("local")`·`@Import(DmeTestSupport.Config.class)`·`extends AbstractMdmSharedDbTest`)을 쓴다. 시드:

```java
    static final String TS = "2026-03-01 09:00:00";
    static final String TS_EARLY = "2025-06-01 09:00:00";

    @Autowired RuleSetEditService service;
    @Autowired RuleSetRunner runner;
    @Autowired MutableCurrentUser currentUser;
    @Autowired JdbcTemplate jdbc;

    @BeforeEach
    void seed() {
        DmeTestSupport.clear(jdbc);
        DmeTestSupport.clearDictionary(jdbc);
        valueRule("R_A", 1, "RELEASED", null, "old");   // R_A v1 RELEASED → OUT_A "old"
        valueRule("R_A", 2, "DRAFT", "kim", "new");     // R_A v2 kim DRAFT → "new"
        valueRule("R_B", 1, "RELEASED", null, "b1");
        valueRule("R_B", 2, "DRAFT", "lee", "b2");      // 남의 DRAFT
        currentUser.set("kim", STEWARD);
    }

    /** 결과 열 하나(var 1, OUT_{ID 끝 글자}), 기본 행 하나. RELEASED 면 2026-01-01 부터. */
    private void valueRule(String id, int ver, String status, String owner, String value) {
        if (ver == 1) {
            DmeTestSupport.rule(jdbc, id, id + " 룰", "DECISION", "INUSE");
            jdbc.update("UPDATE TB_MDM_RULE SET LAST_VAR_ID = 1, LAST_ROW_ID = 1 WHERE MARU_RULE_ID = ?", id);
        }
        if ("RELEASED".equals(status)) {
            DmeTestSupport.released(jdbc, id, ver, "FIRST", "2026-01-01 00:00:00", null);
        } else {
            DmeTestSupport.pending(jdbc, id, ver, status, owner, "FIRST", 1);
        }
        String out = "OUT_" + id.substring(id.length() - 1);
        DmeTestSupport.var(jdbc, id, ver, 1, "RESULT", "Value", out, 1, "STRING");
        DmeTestSupport.row(jdbc, id, ver, 1, 0, "DEFAULT", "{\"1\":{\"val\":\"" + value + "\"}}");
    }

    private static RuleSetSimulateRequest req(String flowJson, String evalTs, String mode) {
        RuleSetSimulateRequest r = new RuleSetSimulateRequest();
        r.setFlowJson(flowJson);
        r.setRecordJson("{}");
        r.setEvalTs(evalTs);
        r.setRuleVersions(mode);
        return r;
    }

    private static final String FLOW_AB = DmeTestSupport.line(DmeTestSupport.ruleNode("n1", "R_A"), DmeTestSupport.ruleNode("n2", "R_B"));
```

시험(`finalValues` 는 `RunTraceJson` 맵의 `"finalValues"` 칸 — 값 모양은 `RuleSetSimulateTest` 의 기존 단언을 보고 맞춘다. 아래 `finalText(result, name)` 는 그 칸에서 글자 값을 꺼내는 이 파일의 작은 도우미다):

```java
    @Test
    void MY_DRAFT_는_내_DRAFT_룰로_실행하고_draftVersions_에_싣는다() {
        RuleSetSimulateResult r = service.simulate(req(FLOW_AB, TS, "MY_DRAFT"));
        assertEquals("new", finalText(r, "OUT_A"));
        assertEquals("b1", finalText(r, "OUT_B"));                 // 남의 DRAFT 는 RELEASED
        assertEquals("MY_DRAFT", r.getRuleVersions());
        assertEquals(Map.of("R_A", "2.000"), ((Map<?, ?>) r.getDraftVersions().get("rules")));
        assertEquals(Map.of(), r.getDraftVersions().get("sets"));
    }

    @Test
    void 빈_모드와_RELEASED_는_지금과_같다() {
        RuleSetSimulateResult r = service.simulate(req(FLOW_AB, TS, null));
        assertEquals("old", finalText(r, "OUT_A"));
        assertEquals("RELEASED", r.getRuleVersions());
        assertEquals(Map.of("rules", Map.of(), "sets", Map.of()), r.getDraftVersions());
    }

    @Test
    void 판정_시각이_일러도_DRAFT_는_고른다() {
        RuleSetSimulateResult r = service.simulate(req(FLOW_AB, TS_EARLY, "MY_DRAFT"));
        assertEquals("new", finalText(r, "OUT_A"));
    }

    @Test
    void 잘못된_모드_값은_거부한다() {
        BusinessException e = assertThrows(BusinessException.class, () -> service.simulate(req(FLOW_AB, TS, "DRAFT")));
        assertEquals("룰 버전은 RELEASED 또는 MY_DRAFT 여야 합니다: DRAFT", e.getMessage());
    }

    @Test
    void 사용자를_모르면_RELEASED_로_돌리고_경고한다() {
        currentUser.set(null, STEWARD);
        RuleSetSimulateResult r = service.simulate(req(FLOW_AB, TS, "MY_DRAFT"));
        assertEquals("old", finalText(r, "OUT_A"));
        assertEquals("RELEASED", r.getRuleVersions());
        assertEquals("DRAFT_USER_UNKNOWN", r.getWarnings().get(0).get("code"));
    }

    @Test
    void 하위_DRAFT_세트로_실행하고_calledFlows_는_DRAFT_흐름이다() {
        DmeTestSupport.ruleSet(jdbc, "S_SUB", "하위", "[\"R_B\"]", "INUSE", 0);
        DmeTestSupport.ruleSetDraft(jdbc, "S_SUB", "2.000", "kim", "[\"R_A\"]", 0);
        String flow = DmeTestSupport.line(DmeTestSupport.setNode("s1", "S_SUB"));
        RuleSetSimulateResult r = service.simulate(req(flow, TS, "MY_DRAFT"));
        assertEquals("new", finalText(r, "OUT_A"));
        assertEquals(Map.of("S_SUB", "2.000"), r.getDraftVersions().get("sets"));
        assertEquals(List.of("R_A"), ((Map<?, ?>) r.getCalledFlows().get("S_SUB")).get("ruleIds"));
    }

    @Test
    void 케이스_일괄_실행도_모드를_따르고_draftVersions_는_한_묶음() {
        DmeTestSupport.ruleSet(jdbc, "S_T", "시험 세트", "[\"R_A\"]", "INUSE", 0);
        jdbc.update("INSERT INTO TB_MDM_RULE_SET_TEST_CASE (MARU_RULE_SET_ID, CASE_ID, CASE_NAME, INPUT_JSON, EXPECTED_JSON, EVAL_TS, ROW_VERSION) "
                + "VALUES ('S_T', 1, 'c1', '{}', '{\"OUT_A\":\"new\"}', ?, 0)", TS);
        jdbc.update("INSERT INTO TB_MDM_RULE_SET_TEST_CASE (MARU_RULE_SET_ID, CASE_ID, CASE_NAME, INPUT_JSON, EXPECTED_JSON, EVAL_TS, ROW_VERSION) "
                + "VALUES ('S_T', 2, 'c2', '{}', '{\"OUT_A\":\"new\"}', ?, 0)", TS_EARLY);
        RuleSetSimulateRequest q = req(DmeTestSupport.line(DmeTestSupport.ruleNode("n1", "R_A")), null, "MY_DRAFT");
        q.setSetId("S_T");
        q.setRunCases(true);
        RuleSetSimulateResult r = service.simulate(q);
        assertEquals(List.of(true, true), r.getCases().stream().map(c -> c.get("pass")).toList());
        assertEquals(Map.of("R_A", "2.000"), r.getDraftVersions().get("rules"));
    }

    @Test
    void RELEASED_와_execute_는_DRAFT_를_읽지_않는다() {
        DmeTestSupport.ruleSet(jdbc, "S_RUN", "운영 세트", "[\"R_A\"]", "INUSE", 0);
        RuleSetRunRequest run = new RuleSetRunRequest();
        run.setSetId("S_RUN");
        run.setEvalTs(TS);
        assertEquals("old", String.valueOf(runner.execute(run).getFinalValues().get("OUT_A")));
        assertEquals("old", finalText(service.simulate(req(FLOW_AB, TS, "RELEASED")), "OUT_A"));
    }
```

시험 케이스 표 칸 이름(`TB_MDM_RULE_SET_TEST_CASE` 의 열·감사 열)은 `RuleSetCaseRunTest` 의 시드 INSERT 를 그대로 옮겨 맞춘다. `currentUser.set(null, …)` 이 받아지지 않으면 `MutableCurrentUser` 에 맞는 방법(빈 글자)을 쓴다.

- [ ] **Step 2: 시험이 실패하는지 확인**

Run: `dme.ruleSetEdit.RuleSetDraftRunTest`
Expected: 컴파일 실패 — `setRuleVersions`·`getDraftVersions` 없음

- [ ] **Step 3: DTO 칸 더하기**

`RuleSetSimulateRequest`: 필드 `private String ruleVersions;`, getter·setter, 클래스 Javadoc 끝에
`<p>{@code ruleVersions} 는 룰 버전 모드(spec 2026-10-06) — {@code RELEASED}(비면 이것) 또는 {@code MY_DRAFT}. 단건·케이스 일괄 실행 모두 읽는다.`

`RuleSetSimulateResult`:

```java
    /** 실제로 쓴 룰 버전 모드(spec 2026-10-06 §4.5) — 사용자를 몰라 되돌렸으면 RELEASED. */
    private String ruleVersions = "RELEASED";
    /** DRAFT 로 실행한 룰·세트 — {@code {rules: {룰 ID: VER}, sets: {세트 ID: VER}}}, VER 는 scale 3 글자. 키는 늘 있다. 케이스 일괄 실행은 한 묶음. */
    private Map<String, Object> draftVersions = Map.of("rules", Map.of(), "sets", Map.of());

    public String getRuleVersions() { return ruleVersions; }
    public void setRuleVersions(String v) { this.ruleVersions = v; }
    public Map<String, Object> getDraftVersions() { return draftVersions; }
    public void setDraftVersions(Map<String, Object> v) { this.draftVersions = v; }
```

- [ ] **Step 4: `RuleSetCalledFlows.of(trace, drafts)`**

```java
    /** 기록에서 부른 세트 → 그 세트의 흐름 요약. 없으면 빈 맵. */
    public Map<String, Object> of(RunTrace trace) {
        return of(trace, Map.of());
    }

    /**
     * {@code drafts}(조회기가 DRAFT 로 실행한 세트 → 버전 행, spec 2026-10-06 §4.7)에 있는 세트는 그 행을, 나머지는 판정 시각 RELEASED 를 쓴다.
     * 노드 제목용 {@code rules} 는 RELEASED 기준({@link RuleIoReader#readAt}) 그대로다(후속 F1).
     */
    public Map<String, Object> of(RunTrace trace, Map<String, MdmRuleSetVer> drafts) {
```

반복문 안 선택 한 줄:

```java
            Optional<MdmRuleSetVer> v = drafts.containsKey(id) ? Optional.of(drafts.get(id))
                    : RuleVersions.currentReleased(versions.getOrDefault(id, List.of()), at);
```

- [ ] **Step 5: `RuleSetEditService.simulate`·`runCases` 고치기**

상수·도우미(서비스 안, simulate 위):

```java
    static final String RELEASED_MODE = "RELEASED";
    static final String MY_DRAFT_MODE = "MY_DRAFT";

    /** 요청 룰 버전 모드 → 선택 모드(spec 2026-10-06 §3.1). 비면 RELEASED, 두 값 밖이면 INVALID_VALUE. */
    private RuleVersionPick pickOf(String mode) {
        if (mode == null || mode.isBlank() || RELEASED_MODE.equals(mode)) {
            return RuleVersionPick.RELEASED;
        }
        if (!MY_DRAFT_MODE.equals(mode)) {
            throw new BusinessException(ErrorCode.INVALID_VALUE, "룰 버전은 RELEASED 또는 MY_DRAFT 여야 합니다: " + mode);
        }
        return RuleVersionPick.myDraft(currentUser.userId());
    }

    /** 모드·DRAFT 사용 칸을 응답에 싣는다. MY_DRAFT 를 요청했는데 사용자를 몰라 RELEASED 로 돌렸으면 경고를 맨 앞에. */
    private static RuleSetSimulateResult withDraftInfo(RuleSetSimulateResult result, String requested, RuleVersionPick pick,
                                                       RuleSetRunner.Session session) {
        result.setRuleVersions(pick.draftFirst() ? MY_DRAFT_MODE : RELEASED_MODE);
        Map<String, Object> rules = new LinkedHashMap<>();
        session.draftRules().forEach((id, ver) -> rules.put(id, VersionNumbers.plain(ver)));
        Map<String, Object> sets = new LinkedHashMap<>();
        session.draftSets().forEach((id, v) -> sets.put(id, VersionNumbers.plain(v.getVer())));
        result.setDraftVersions(Map.of("rules", rules, "sets", sets));
        if (MY_DRAFT_MODE.equals(requested) && !pick.draftFirst()) {
            List<Map<String, Object>> warns = new ArrayList<>();
            warns.add(RuleSetRunner.warning("DRAFT_USER_UNKNOWN", null, "로그인 사용자를 알 수 없어 적용 중 버전으로 실행했다"));
            warns.addAll(result.getWarnings() == null ? List.of() : result.getWarnings());
            result.setWarnings(warns);
        }
        return result;
    }
```

`simulate`: `requireFlowJson` 바로 뒤에 `RuleVersionPick pick = pickOf(request.getRuleVersions());` 를 두고(잘못된 모드는 runCases 분기 전에 거부), `runCases(flowJson, request, pick)` 로 넘긴다. `runner.session()` → `runner.session(pick)`. 끝:

```java
        RuleSetSimulateResult result = new RuleSetSimulateResult(RunTraceJson.toMap(trace), simulateWarnings(session, flowJson, trace));
        result.setCalledFlows(calledFlows.of(trace, session.draftSets()));
        return withDraftInfo(result, request.getRuleVersions(), pick, session);
```

`runCases(String flowJson, RuleSetSimulateRequest request, RuleVersionPick pick)`: `runner.session()` → `runner.session(pick)`, 끝을
`return withDraftInfo(new RuleSetSimulateResult(null, List.of(), out), request.getRuleVersions(), pick, session);` 로.

섹션 머리 주석(:633 부근) "원장의 RELEASED 룰로" 를 "원장의 RELEASED 룰(요청 ruleVersions=MY_DRAFT 면 내 DRAFT 우선)로" 로 고친다. import `RuleVersionPick`, `VersionNumbers`(이미 있으면 생략).

- [ ] **Step 6: BPMN 헤더 문구**

`ruleSetEdit.bpmn` :13 부근 헤더 documentation 의 execute 설명 끝에 `ruleVersions(RELEASED|MY_DRAFT, 비면 RELEASED) — 내 DRAFT 우선 시험(D-156).` 을 더한다. 바인딩·흐름은 바꾸지 않는다.

- [ ] **Step 7: 시험 통과 확인**

Run: `RuleSetDraftRunTest`, `RuleSetSimulateTest`, `RuleSetCaseRunTest`, `RuleSetCalledFlowsSqliteTest`, `RuleSetEditQueryCountTest`, `RuleSetSubsetServiceTest`
Expected: 모두 PASS(골든·쿼리 수 무변경)

- [ ] **Step 8: 커밋**

```bash
/usr/bin/git add src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/dme/ruleSetEdit src/backend/mdm/api/src/main/resources/services/dme/ruleSetEdit.bpmn src/backend/mdm/api/src/test/java/com/dongkuk/dmes/mdm/dme/ruleSetEdit/RuleSetDraftRunTest.java
/usr/bin/git commit -m "feat(ruleSetEdit): 디버거·케이스 실행이 룰 버전 모드를 받고 DRAFT 사용을 응답한다"
```

---

### Task 3: 확정 검사 케이스 실패 안내

**Files:**
- Modify: `src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/common/rule/confirm/RuleSetConfirmReport.java` (report :68~, 케이스 실패 :117·:121)
- Modify(소유 밖, 허용됨): `src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/common/rule/confirm/RuleSetConfirmChecks.java` (report :87~116)
- Test: `src/backend/mdm/api/src/test/java/com/dongkuk/dmes/mdm/common/rule/confirm/RuleSetConfirmReportTest.java`(추가), `src/backend/mdm/api/src/test/java/com/dongkuk/dmes/mdm/dme/ruleSetConfirm/RuleSetConfirmChecksSqliteTest.java`(추가)

**Interfaces:**
- Produces: `RuleSetConfirmReport.report(VersionRef, List<RuleSetCheck>, List<FutureChecks>, List<String>, LocalDateTime, List<Map<String,Object>>, String, List<String> ownerDraftRules)` (7인자 형은 `List.of()` 로 위임), `static String draftHint(List<String> ruleIds)`

- [ ] **Step 1: 실패하는 시험 쓰기**

`RuleSetConfirmReportTest` 에 더한다(그 파일의 기존 케이스 결과 맵·`VersionRef` 만드는 도우미를 그대로 쓴다):

```java
    @Test
    void 케이스_실패이고_작성자의_룰_DRAFT_가_있으면_실패_문구_뒤에_안내한다() {
        Map<String, Object> failed = new LinkedHashMap<>(Map.of("caseId", 1, "caseName", "c1", "pass", false,
                RuleSetConfirmReport.HAS_EXPECTED, true, "mismatches", List.of(), "errors", List.of()));
        RuleSetConfirmReport.Report r = RuleSetConfirmReport.report(DRAFT, List.of(), List.of(), List.of(), APPLY_FROM,
                List.of(failed), null, List.of("R1", "R2"));
        MdmCheckIssue issue = caseIssues(r).get(0);
        assertEquals(RuleConfirmReport.CASE_FAILED, issue.code());
        assertTrue(issue.message().endsWith(RuleSetConfirmReport.draftHint(List.of("R1", "R2"))), issue.message());
        assertEquals(" — 룰 R1·R2 에 확정하지 않은 DRAFT 가 있다. 확정 검사는 적용 중 버전으로 돌리므로, 그 DRAFT 로 시험해 통과했다면 룰 DRAFT 를 먼저 확정한다",
                RuleSetConfirmReport.draftHint(List.of("R1", "R2")));
    }

    @Test
    void DRAFT_룰이_없으면_문구와_이슈_수가_그대로다() {
        Map<String, Object> failed = new LinkedHashMap<>(Map.of("caseId", 1, "caseName", "c1", "pass", false,
                RuleSetConfirmReport.HAS_EXPECTED, true, "mismatches", List.of(), "errors", List.of()));
        RuleSetConfirmReport.Report before = RuleSetConfirmReport.report(DRAFT, List.of(), List.of(), List.of(), APPLY_FROM, List.of(failed), null);
        RuleSetConfirmReport.Report after = RuleSetConfirmReport.report(DRAFT, List.of(), List.of(), List.of(), APPLY_FROM, List.of(failed), null, List.of());
        assertEquals(before, after);
        assertEquals("", RuleSetConfirmReport.draftHint(List.of()));
    }

    @Test
    void 일괄_실행이_끝나지_못해도_안내한다() {
        RuleSetConfirmReport.Report r = RuleSetConfirmReport.report(DRAFT, List.of(), List.of(), List.of(), APPLY_FROM, List.of(), "boom", List.of("R1"));
        MdmCheckIssue issue = caseIssues(r).get(0);
        assertEquals(RuleConfirmReport.CASE_RUN_FAILED, issue.code());
        assertTrue(issue.message().endsWith(RuleSetConfirmReport.draftHint(List.of("R1"))), issue.message());
    }
```

`DRAFT`·`APPLY_FROM`·`caseIssues(Report)`(TEST_CASES 항목의 이슈 목록) 가 그 파일에 없으면 파일 머리에 작은 상수·도우미로 만든다. `Report` 가 record 라 `assertEquals(before, after)` 가 이슈 목록까지 견준다.

`RuleSetConfirmChecksSqliteTest` 에 더한다(그 파일의 세트·케이스 시드 방식을 따른다): 세트 DRAFT 작성자 kim, 흐름 룰 R1 에 kim DRAFT 가 있고 기대값이 RELEASED 값과 다른 케이스 → `CASE_FAILED` 문구 끝이 `draftHint(List.of("R1"))`; R1 DRAFT 작성자가 lee 면 안내 없음.

- [ ] **Step 2: 시험 실패 확인**

Run: `common.rule.confirm.RuleSetConfirmReportTest`
Expected: 컴파일 실패 — 8인자 `report`·`draftHint` 없음

- [ ] **Step 3: `RuleSetConfirmReport` 고치기**

```java
    /** 7인자 형 — 안내할 DRAFT 룰 없음. */
    public static Report report(VersionRef draft, List<RuleSetCheck> checks, List<FutureChecks> future, List<String> notReleased,
                                LocalDateTime applyFrom, List<Map<String, Object>> caseResults, String caseRunFailure) {
        return report(draft, checks, future, notReleased, applyFrom, caseResults, caseRunFailure, List.of());
    }

    /**
     * 케이스 실패 안내 문구(spec 2026-10-06 §6) — 비었으면 "". 새 이슈를 만들지 않고 CASE_FAILED·CASE_RUN_FAILED 문구 뒤에 붙인다
     * (WARNING 을 더하면 확정 서비스가 경고 확인을 요구해 확정 절차가 바뀐다).
     */
    public static String draftHint(List<String> ruleIds) {
        return ruleIds.isEmpty() ? "" : " — 룰 " + String.join("·", ruleIds)
                + " 에 확정하지 않은 DRAFT 가 있다. 확정 검사는 적용 중 버전으로 돌리므로, 그 DRAFT 로 시험해 통과했다면 룰 DRAFT 를 먼저 확정한다";
    }
```

기존 `report(...)` 본문을 8인자 형으로 옮기고(`@param ownerDraftRules 확정 대상 세트 버전 작성자가 DRAFT 를 가진 흐름 룰 ID` 를 Javadoc 에 더함), 본문 안에서 `String hint = draftHint(ownerDraftRules);` 를 두고 두 곳만 바꾼다:

```java
            issues.get(tests).add(error(RuleConfirmReport.CASE_FAILED, "케이스 " + c.get("caseId") + " " + c.get("caseName") + ": " + caseDetail(c) + hint,
                    tests, "CASE:" + c.get("caseId")));
```

```java
            issues.get(tests).add(error(RuleConfirmReport.CASE_RUN_FAILED, "테스트 케이스를 끝내지 못했다: " + caseRunFailure + hint, tests, null));
```

- [ ] **Step 4: `RuleSetConfirmChecks.report` 고치기(소유 밖, 최소)**

`return RuleSetConfirmReport.report(...)` 줄을 다음으로 바꾸고, 도우미 하나를 더한다:

```java
        return RuleSetConfirmReport.report(draft, checks, future, notReleased, applyFrom, cases, caseFailure,
                caseFailed(cases, caseFailure) ? ownerDraftRules(ids, v.getOwnerId()) : List.of());
```

```java
    /** 안내가 붙을 실패가 있는가 — 기대값 있는 케이스의 pass=false 또는 일괄 실행 실패. 없으면 원장을 더 읽지 않는다. */
    private static boolean caseFailed(List<Map<String, Object>> cases, String caseFailure) {
        return caseFailure != null || cases.stream().anyMatch(c -> Boolean.FALSE.equals(c.get("pass"))
                && !Boolean.FALSE.equals(c.get(RuleSetConfirmReport.HAS_EXPECTED)));
    }

    /** 흐름 룰 가운데 {@code owner} 의 DRAFT 가 있는 룰 ID(흐름 순서, spec 2026-10-06 §6). 작성자가 없으면 빈 목록. */
    private List<String> ownerDraftRules(List<String> ids, String owner) {
        if (owner == null || ids.isEmpty()) {
            return List.of();
        }
        Set<String> drafted = new HashSet<>();
        for (MdmRuleVer r : ruleQueries.versionsOf(ids)) {
            if (VersionStatus.DRAFT.name().equals(r.getStatus()) && owner.equals(r.getOwnerId())) {
                drafted.add(r.getMaruRuleId());
            }
        }
        return ids.stream().distinct().filter(drafted::contains).toList();
    }
```

`VersionStatus.DRAFT` 가 없으면 `"DRAFT"` 글자로 쓴다. 필요한 import(`HashSet`·`Set`·`MdmRuleVer`)를 더한다.

- [ ] **Step 5: 시험 통과 확인**

Run: `RuleSetConfirmReportTest`, `RuleSetConfirmChecksSqliteTest`
Expected: PASS

- [ ] **Step 6: 커밋**

```bash
/usr/bin/git add src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/common/rule/confirm/RuleSetConfirmReport.java src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/common/rule/confirm/RuleSetConfirmChecks.java src/backend/mdm/api/src/test/java/com/dongkuk/dmes/mdm/common/rule/confirm/RuleSetConfirmReportTest.java src/backend/mdm/api/src/test/java/com/dongkuk/dmes/mdm/dme/ruleSetConfirm/RuleSetConfirmChecksSqliteTest.java
/usr/bin/git commit -m "feat(ruleSetConfirm): 케이스 실패 문구에 작성자의 룰 DRAFT 를 먼저 확정하라는 안내를 붙인다"
```

---

### Task 4: 화면 — 모드 상태·요청·선택 칸·기억

**Files:**
- Modify: `src/frontend/m-mdm/pages/dme/ruleSetEdit/types.ts` (`RuleSetSimulateResult` :400, `RuleSetCaseRunResult` :339)
- Modify: `src/frontend/m-mdm/pages/dme/ruleSetEdit/api.ts` (simulate :90, runCases :155)
- Modify: `src/frontend/m-mdm/pages/dme/ruleSetEdit/debugger/local-store.ts`
- Modify: `src/frontend/m-mdm/pages/dme/ruleSetEdit/debugger/useSimulation.ts` (`DebugInput` :50, `SimResult` :56, `Simulation` :75~, `sameInput` :162, `inputOf` :210, 상태 :241, `fresh` :470~)
- Modify: `src/frontend/m-mdm/pages/dme/ruleSetEdit/debugger/InputForm.tsx`
- Test: `src/frontend/m-mdm/tests/dme/ruleSetEdit/local-store.test.ts`(추가), `src/frontend/m-mdm/tests/dme/ruleSetEdit/use-simulation.test.ts`(추가), `src/frontend/m-mdm/tests/dme/ruleSetEdit/draft-mode.test.ts`(새, InputForm)

**Interfaces:**
- Consumes: 서버 요청 칸 `ruleVersions`, 응답 칸 `ruleVersions`·`draftVersions`(Task 2)
- Produces:
  - `types.ts`: `export type RuleVersionMode = "RELEASED" | "MY_DRAFT"`, `export interface DraftVersions { rules: Record<string, string>; sets: Record<string, string> }`, `export const NO_DRAFTS: DraftVersions`
  - `api.ts`: `simulate(flowJson, recordJson, evalTs, editsJson?, ruleVersions?: RuleVersionMode)`, `runCases(setId, flowJson, caseIds, ruleVersions?: RuleVersionMode)`
  - `local-store.ts`: `storeKeys.ruleVersions = "rsf:ruleVersions"`, `loadRuleVersions(): RuleVersionMode`, `saveRuleVersions(v)`, `StoredInput.ruleVersions?: RuleVersionMode`
  - `useSimulation.ts`: `DebugInput.ruleVersions?: RuleVersionMode`, `SimResult.draftVersions: DraftVersions`, `SimResult.ruleVersions: RuleVersionMode`, `Simulation.ruleVersions: RuleVersionMode`, `Simulation.setRuleVersions(v)`, `modeOf(input: DebugInput): RuleVersionMode`
  - `InputForm.tsx`: `export const DRAFT_CHECK_NOTE`, `export const RULE_VERSION_OPTIONS`

- [ ] **Step 1: 실패하는 시험 쓰기**

`local-store.test.ts` 에 더한다:

```ts
import { loadInputs, loadRuleVersions, saveInputs, saveRuleVersions, storeKeys } from "../../../pages/dme/ruleSetEdit/debugger/local-store";

describe("룰 버전 모드 기억(spec 2026-10-06 §7.2)", () => {
  it("저장한 값을 읽고 잘못된 값은 RELEASED", () => {
    expect(loadRuleVersions()).toBe("RELEASED");
    saveRuleVersions("MY_DRAFT");
    expect(loadRuleVersions()).toBe("MY_DRAFT");
    localStorage.setItem(storeKeys.ruleVersions, JSON.stringify("DRAFT"));
    expect(loadRuleVersions()).toBe("RELEASED");
  });
  it("최근 입력에 모드를 저장하고 옛 항목(모드 없음)은 RELEASED 로 읽는다", () => {
    saveInputs("k", [{ recordJson: "{}", evalTs: "", ruleVersions: "MY_DRAFT" }]);
    expect(loadInputs("k")).toEqual([{ recordJson: "{}", evalTs: "", ruleVersions: "MY_DRAFT" }]);
    localStorage.setItem("k2", JSON.stringify([{ recordJson: "{}", evalTs: "" }]));
    expect(loadInputs("k2")).toEqual([{ recordJson: "{}", evalTs: "", ruleVersions: "RELEASED" }]);
  });
});
```

`use-simulation.test.ts` 에 더한다(그 파일의 `mount`·`executes()`·`replies` 를 쓴다):

```ts
describe("룰 버전 모드(spec 2026-10-06 §7.3)", () => {
  it("모드가 execute 요청에 실린다", async () => {
    await mount();
    act(() => h.current.setRuleVersions("MY_DRAFT"));
    await act(() => h.current.next());
    expect((executes()[0][2] as { ruleVersions?: string }).ruleVersions).toBe("MY_DRAFT");
    expect(localStorage.getItem("rsf:ruleVersions")).toBe(JSON.stringify("MY_DRAFT"));
  });
  it("모드를 바꾸면 새로 실행", async () => {
    await mount();
    await act(() => h.current.next());
    act(() => h.current.setRuleVersions("MY_DRAFT"));
    expect(h.current.canEditValues).toBe(false);
    await act(() => h.current.next());
    expect(executes()).toHaveLength(2);
  });
  it("RELEASED 는 칸을 보내지 않는다", async () => {
    await mount();
    await act(() => h.current.next());
    expect((executes()[0][2] as Record<string, unknown>).ruleVersions).toBeUndefined();
  });
  it("최근 입력을 불러오면 모드도 바뀌고 케이스 입력(모드 없음)은 지금 모드를 둔다", async () => {
    await mount();
    act(() => h.current.loadInput({ recordJson: "{}", evalTs: "", ruleVersions: "MY_DRAFT" }));
    expect(h.current.ruleVersions).toBe("MY_DRAFT");
    act(() => h.current.loadInput({ recordJson: "{}", evalTs: "" }));
    expect(h.current.ruleVersions).toBe("MY_DRAFT");
  });
  it("응답 draftVersions 가 기록에 남고 없으면 빈 묶음", async () => {
    replies = [{ ...golden("IF_FIRST_TRUE").result, ruleVersions: "MY_DRAFT", draftVersions: { rules: { GT_GRADE: "2.000" }, sets: {} } }];
    await mount();
    await act(() => h.current.next());
    expect(h.current.last?.draftVersions.rules).toEqual({ GT_GRADE: "2.000" });
    expect(h.current.last?.ruleVersions).toBe("MY_DRAFT");
  });
});
```

`golden(...)` 이 응답 객체를 어떻게 내는지는 `helpers/rule-set-golden.ts` 를 보고 맞춘다(`replies` 에 넣는 기존 사례와 같은 모양). `beforeEach` 에서 `localStorage.clear()` 가 되는지 확인하고, 안 되면 이 describe 안에서 한다.

`draft-mode.test.ts`(새 파일, `/** @vitest-environment happy-dom */`): `InputForm` 을 `use-simulation.test.ts` 와 같은 방식(작은 Probe + `createRoot`)으로 그려,
- `dbg-rule-versions` 가 있고 기본값이 "적용 중(기본)",
- `sim.ruleVersions === "MY_DRAFT"` 일 때만 `dbg-draft-check-note` 가 `DRAFT_CHECK_NOTE` 글로 보임
을 확인한다. `InputForm` 이 받는 `sim` 은 `Simulation` 의 필요한 칸만 채운 객체(`fields: []`, `json: ""`, `evalTs: ""`, `ruleVersions`, `setRuleVersions: vi.fn()` 등)를 `as unknown as Simulation` 으로 넘긴다.

- [ ] **Step 2: 시험 실패 확인**

Run: `local-store.test.ts`, `use-simulation.test.ts`, `draft-mode.test.ts`
Expected: FAIL — `loadRuleVersions`·`setRuleVersions` 없음

- [ ] **Step 3: 타입·API**

`types.ts`:

```ts
/** 룰 버전 모드(spec 2026-10-06 §3.1) — 적용 중(기본) · 내 DRAFT 우선. */
export type RuleVersionMode = "RELEASED" | "MY_DRAFT";
/** DRAFT 로 실행한 룰·하위 세트 → VER(scale 3 글자). 서버 `RuleSetSimulateResult.draftVersions`. */
export interface DraftVersions { rules: Record<string, string>; sets: Record<string, string> }
export const NO_DRAFTS: DraftVersions = Object.freeze({ rules: {}, sets: {} }) as DraftVersions;
```

`RuleSetSimulateResult` 에 `ruleVersions?: RuleVersionMode; draftVersions?: DraftVersions;`, `RuleSetCaseRunResult` 에 `warnings?: SimWarning[]; ruleVersions?: RuleVersionMode; draftVersions?: DraftVersions;`.

`api.ts`:

```ts
export function simulate(flowJson: string, recordJson: string, evalTs: string | undefined, editsJson?: string, ruleVersions?: RuleVersionMode): Promise<RuleSetSimulateResult> {
  return callOasis<RuleSetSimulateResult>(SERVICE, "execute", {
    flowJson, recordJson, evalTs: blankToUndefined(evalTs), editsJson: blankToUndefined(editsJson), ruleVersions: draftOnly(ruleVersions),
  });
}

export function runCases(setId: string, flowJson: string, caseIds: readonly number[], ruleVersions?: RuleVersionMode): Promise<RuleSetCaseRunResult> {
  return callOasis<RuleSetCaseRunResult>(SERVICE, "execute", { setId, flowJson, runCases: true, caseIds: caseIds.join(","), ruleVersions: draftOnly(ruleVersions) });
}

/** RELEASED 는 서버 기본이라 칸을 보내지 않는다(요청이 지금과 같게). */
const draftOnly = (v: RuleVersionMode | undefined) => (v === "MY_DRAFT" ? v : undefined);
```

`draftOnly` 는 두 함수보다 위에 둔다(`const` 호이스팅 없음).

- [ ] **Step 4: `local-store.ts`**

```ts
export interface StoredInput { recordJson: string; evalTs: string; ruleVersions?: RuleVersionMode }
```

`storeKeys` 에 `/** 디버거 룰 버전 모드(세트와 무관한 보는 사람 설정, 기본 RELEASED, spec 2026-10-06). */ ruleVersions: "rsf:ruleVersions",`

```ts
const modeOrReleased = (v: unknown): RuleVersionMode => (v === "MY_DRAFT" ? "MY_DRAFT" : "RELEASED");

/** [룰 버전] 마지막 선택. 두 값이 아니면 RELEASED. */
export const loadRuleVersions = (): RuleVersionMode => modeOrReleased(read(storeKeys.ruleVersions));
export const saveRuleVersions = (v: RuleVersionMode) => write(storeKeys.ruleVersions, v);
```

`loadInputs` 의 `.map` 을 `({ recordJson: x.recordJson, evalTs: x.evalTs, ruleVersions: modeOrReleased(x.ruleVersions) })` 로. import `RuleVersionMode`.

- [ ] **Step 5: `useSimulation.ts`**

```ts
export interface DebugInput {
  recordJson: string;
  evalTs: string;
  /** 룰 버전 모드(spec 2026-10-06). 없으면 RELEASED — 케이스 입력은 모드가 없다. */
  ruleVersions?: RuleVersionMode;
}

export const modeOf = (input: DebugInput): RuleVersionMode => input.ruleVersions ?? "RELEASED";
/** 두 입력이 같은가 — 레코드 JSON 글자·판정 시각·룰 버전 모드가 모두 같아야 같다. */
export const sameInput = (a: DebugInput, b: DebugInput) => a.recordJson === b.recordJson && a.evalTs === b.evalTs && modeOf(a) === modeOf(b);
```

(기존 `sameInput` 위의 주석 "두 입력이 같은가 — 레코드 JSON 글자와 판정 시각이 모두 같아야 같다." 는 지운다 — 지금 `kstRequestTs` 위에 잘못 붙어 있다.)

`SimResult` 에 `/** DRAFT 로 실행한 룰·세트(spec §4.5). 서버가 주지 않으면 NO_DRAFTS. */ draftVersions: DraftVersions; /** 이 기록을 만든 모드(서버 응답, 없으면 입력 모드). */ ruleVersions: RuleVersionMode;`
`Simulation` 에 `ruleVersions: RuleVersionMode; setRuleVersions(v: RuleVersionMode): void;`

`Inputs` 상태(:185 부근 인터페이스, :241 초기값)에 `ruleVersions: RuleVersionMode` 를 더하고 초기값은 `loadRuleVersions()`. `inputOf` 가 돌려주는 객체에 `ruleVersions: inputs.ruleVersions` 를 더한다.

```ts
  const setRuleVersions = useCallback((v: RuleVersionMode) => {
    writeInputs({ ruleVersions: v });
    saveRuleVersions(v);
  }, [writeInputs]);
```

(`writeInputs` 가 부분 갱신을 받는 기존 함수다 — `setEvalTs` 가 `writeInputs({ evalTs: v })` 로 쓰는 것과 같다.)

`loadInput(input)` 안에서 `if (input.ruleVersions) setRuleVersions(input.ruleVersions);` 를 더한다.

`fresh` 의 `simulate(...)` 호출에 다섯째 인자 `modeOf(input)` 를 넘기고, `record` 에
`draftVersions: res.draftVersions ?? NO_DRAFTS, ruleVersions: res.ruleVersions ?? modeOf(input)` 를 더한다.
반환 객체에 `ruleVersions: inputs.ruleVersions, setRuleVersions` 를 더한다.

- [ ] **Step 6: `InputForm.tsx` 선택 칸**

```tsx
import { Checkbox, Input, Select } from "@dk-oasis/shared/form";
import type { RuleVersionMode } from "../types";

/** 룰 버전 선택 항목(spec 2026-10-06 §7.1). */
export const RULE_VERSION_OPTIONS: { value: RuleVersionMode; label: string }[] = [
  { value: "RELEASED", label: "적용 중(기본)" },
  { value: "MY_DRAFT", label: "내 DRAFT 우선" },
];
/** 내 DRAFT 우선일 때 검사 기준 안내(spec §7.4) — 화면 검사는 이번에 DRAFT 를 읽지 않는다(후속 F1). */
export const DRAFT_CHECK_NOTE = "검사 결과(거부·경고)는 적용 중 버전 기준이다. 실행만 내 DRAFT 를 쓴다";
```

판정 시각 `<label>` 바로 뒤:

```tsx
      <label className="rsf-dbg-evalts">
        <span className="rsf-dbg-label">룰 버전</span>
        <Select
          data-testid="dbg-rule-versions"
          aria-label="룰 버전"
          value={sim.ruleVersions}
          options={RULE_VERSION_OPTIONS}
          onChange={(v) => sim.setRuleVersions(v === "MY_DRAFT" ? "MY_DRAFT" : "RELEASED")}
        />
      </label>
      {sim.ruleVersions === "MY_DRAFT" && (
        <p className="rsf-panel-note" data-testid="dbg-draft-check-note" role="status">
          {DRAFT_CHECK_NOTE}
        </p>
      )}
```

`Select` 의 실제 props 이름(`options`·`data`, `onChange` 인자 모양, `data-testid` 전달)은 `src/frontend/shared/src/components/form/Select.tsx` 와 `mantine-aggrid-ui` 스킬 문서를 보고 맞춘다. props 를 바꾸지 않는다. 컴포넌트 머리 주석에 `룰 버전(dbg-rule-versions)` 을 더한다.

- [ ] **Step 7: 시험 통과 확인 + 타입 검사**

Run: 세 시험 파일, 이어서 `debug-mode.test.ts`·`debug-edit.test.ts`·`test-cases.test.ts`·`catch-debug.test.ts`
Run: `cd src/frontend/m-mdm && npx tsc --noEmit -p .`
Expected: PASS, 타입 오류 0(새 워크트리라 형제 패키지 dist 오류가 나면 해당 패키지 폴더에서 `npx tsup` 한 번 — 메모리 worktree-git-usr-bin)

- [ ] **Step 8: 커밋**

```bash
/usr/bin/git add src/frontend/m-mdm/pages/dme/ruleSetEdit/types.ts src/frontend/m-mdm/pages/dme/ruleSetEdit/api.ts src/frontend/m-mdm/pages/dme/ruleSetEdit/debugger/local-store.ts src/frontend/m-mdm/pages/dme/ruleSetEdit/debugger/useSimulation.ts src/frontend/m-mdm/pages/dme/ruleSetEdit/debugger/InputForm.tsx src/frontend/m-mdm/tests/dme/ruleSetEdit/local-store.test.ts src/frontend/m-mdm/tests/dme/ruleSetEdit/use-simulation.test.ts src/frontend/m-mdm/tests/dme/ruleSetEdit/draft-mode.test.ts
/usr/bin/git commit -m "feat(ruleSetEdit): 디버거에 룰 버전 선택 칸을 두고 요청·최근 입력에 모드를 싣는다"
```

---

### Task 5: 화면 — DRAFT 표시·케이스 일괄 실행·비교 안내

**Files:**
- Modify: `src/frontend/m-mdm/pages/dme/ruleSetEdit/debugger/TraceDetail.tsx` (props :95~, RULE 블록 :220~226)
- Modify: `src/frontend/m-mdm/pages/dme/ruleSetEdit/debugger/VariablePanel.tsx` (:365 TraceDetail 호출)
- Modify: `src/frontend/m-mdm/pages/dme/ruleSetEdit/debugger/FrameDetail.tsx` (props, 제목 :36, TraceDetail 호출 :47)
- Modify: `src/frontend/m-mdm/pages/dme/ruleSetEdit/RuleSetEditor.tsx` (:238 useTestCases, :1014 FrameDetail)
- Modify: `src/frontend/m-mdm/pages/dme/ruleSetEdit/debugger/DebugToolbar.tsx` (상태 줄, `dbg-stale` 옆)
- Modify: `src/frontend/m-mdm/pages/dme/ruleSetEdit/debugger/RunCompare.tsx`
- Modify: `src/frontend/m-mdm/pages/dme/ruleSetEdit/debugger/useTestCases.ts` (시그니처 :54, runAll :141~)
- Modify: `src/frontend/m-mdm/pages/dme/ruleSetEdit/debugger/TestCasePanel.tsx` (결과 머리, 기대값 채우기 :134~147)
- Modify: `src/frontend/m-mdm/pages/dme/ruleSetEdit/debugger/CaseEditModal.tsx` (안내 한 줄)
- Modify: `src/frontend/m-mdm/pages/dme/ruleSetEdit/debugger/debug-model.ts` (문구 상수·판정 함수)
- Modify: `src/frontend/m-mdm/pages/dme/ruleSetEdit/debugger/DebugInputs.tsx` (`recentLabel` :29, 호출 :42)
- Test: `src/frontend/m-mdm/tests/dme/ruleSetEdit/draft-mode.test.ts`(추가), `src/frontend/m-mdm/tests/dme/ruleSetEdit/test-cases.test.ts`(추가)

**Interfaces:**
- Consumes: Task 4 `DraftVersions`·`NO_DRAFTS`·`RuleVersionMode`·`SimResult.draftVersions`·`SimResult.ruleVersions`·`Simulation.ruleVersions`·`runCases(..., ruleVersions)`
- Produces (`debug-model.ts`):
  - `export function isDraftNode(drafts: DraftVersions, ruleId: string | null | undefined, ver: string | number | null | undefined): boolean`
  - `export function draftRunText(drafts: DraftVersions): string` → `"내 DRAFT 우선으로 실행 · DRAFT 룰 n개·세트 m개"`
  - `export const MODE_LABEL: Record<RuleVersionMode, string>` = `{ RELEASED: "적용 중", MY_DRAFT: "내 DRAFT 우선" }`
  - `export function modeDiffNote(before: RuleVersionMode, now: RuleVersionMode): string | null` → 다르면 `"이전 실행은 {before}, 지금은 {now} 으로 돌렸다"`
  - `export const DRAFT_CASES_NOTE = "내 DRAFT 우선으로 돌렸다 — 확정 검사는 적용 중 버전으로 돌린다"`
  - `export const DRAFT_EXPECTED_NOTE = "내 DRAFT 우선으로 돌린 결과다. 룰 DRAFT 를 확정해야 세트 확정 검사가 이 기대값으로 통과한다"`
  - `export const DRAFT_CORRUPT_TIP = "[적용 중(기본)] 으로 바꾸면 RELEASED 로 돌릴 수 있다"`
  - `TraceDetailProps.draftVersions?: DraftVersions`, `FrameDetailProps.draftVersions?: DraftVersions`
  - `TestCases.draft: { ruleVersions: RuleVersionMode; draftVersions: DraftVersions } | null`
  - `useTestCases(setId, initial, flowVersion, flowJson, ruleVersions: () => RuleVersionMode = () => "RELEASED")`

- [ ] **Step 1: 실패하는 시험 쓰기**

`draft-mode.test.ts` 에 더한다:

```ts
import { DRAFT_CASES_NOTE, draftRunText, isDraftNode, modeDiffNote } from "../../../pages/dme/ruleSetEdit/debugger/debug-model";

describe("DRAFT 표시 판정(spec 2026-10-06 §7.4)", () => {
  const drafts = { rules: { R_A: "2.000" }, sets: { S_SUB: "2.001" } };
  it("룰 ID 와 VER 가 같을 때만 DRAFT", () => {
    expect(isDraftNode(drafts, "R_A", 2)).toBe(true);
    expect(isDraftNode(drafts, "R_A", "2.000")).toBe(true);
    expect(isDraftNode(drafts, "R_A", 1)).toBe(false);
    expect(isDraftNode(drafts, "R_B", 2)).toBe(false);
    expect(isDraftNode(drafts, null, 2)).toBe(false);
  });
  it("실행 요약과 모드 차이 문구", () => {
    expect(draftRunText(drafts)).toBe("내 DRAFT 우선으로 실행 · DRAFT 룰 1개·세트 1개");
    expect(modeDiffNote("RELEASED", "MY_DRAFT")).toBe("이전 실행은 적용 중, 지금은 내 DRAFT 우선으로 돌렸다");
    expect(modeDiffNote("MY_DRAFT", "MY_DRAFT")).toBeNull();
  });
  it("케이스 결과 안내 문구", () => {
    expect(DRAFT_CASES_NOTE).toBe("내 DRAFT 우선으로 돌렸다 — 확정 검사는 적용 중 버전으로 돌린다");
  });
  it("최근 입력 라벨은 내 DRAFT 우선 항목에만 DRAFT 를 붙인다", () => {
    expect(recentLabel("", "{}", "MY_DRAFT")).toBe("DRAFT · 지금 · {}");
    expect(recentLabel("", "{}", "RELEASED")).toBe("지금 · {}");
    expect(recentLabel("", "{}")).toBe("지금 · {}");
  });
});
```

(`recentLabel` 은 `../../../pages/dme/ruleSetEdit/debugger/DebugInputs` 에서 가져온다.)

같은 파일에서 `TraceDetail` 을 그려(`node.kind = "RULE"`, `ruleId: "R_A"`, `ver: 2`, `draftVersions` 포함) `sim-detail-draft` 가 보이고, `ver: 1` 이면 없음을 확인한다. `TraceDetail` 이 쓰는 `@/shell`·`@dk-oasis/shared` 목은 `debug-mode.test.ts` 머리의 `vi.mock` 을 그대로 옮긴다.

`test-cases.test.ts` 에 더한다(그 파일의 훅 렌더 방식을 쓴다):
- `useTestCases(..., () => "MY_DRAFT")` 로 `runAll()` → `callOasis` execute 인자에 `ruleVersions: "MY_DRAFT"`, 응답 `draftVersions` 가 `tests.draft` 에 남음.
- `() => "RELEASED"` 면 `ruleVersions` 칸 없음, `tests.draft === null`.

- [ ] **Step 2: 시험 실패 확인**

Run: `draft-mode.test.ts`, `test-cases.test.ts`
Expected: FAIL — `isDraftNode` 등 없음

- [ ] **Step 3: `debug-model.ts` 판정·문구**

```ts
import { normVer } from "@/shell";
import type { DraftVersions, RuleVersionMode } from "../types";

/** 이 룰 노드가 DRAFT 로 돌았는가(spec 2026-10-06 §4.5) — 응답 draftVersions 의 그 룰 VER 와 노드 VER 가 같을 때만. VER 는 룰마다 유일하다. */
export function isDraftNode(drafts: DraftVersions, ruleId: string | null | undefined, ver: string | number | null | undefined): boolean {
  if (!ruleId || ver == null) return false;
  const want = drafts.rules[ruleId];
  return want != null && normVer(want) === normVer(ver);
}

export const MODE_LABEL: Record<RuleVersionMode, string> = { RELEASED: "적용 중", MY_DRAFT: "내 DRAFT 우선" };

/** 기록 머리 요약(spec §7.4). */
export const draftRunText = (d: DraftVersions) =>
  `내 DRAFT 우선으로 실행 · DRAFT 룰 ${Object.keys(d.rules).length}개·세트 ${Object.keys(d.sets).length}개`;

/** 두 실행의 모드가 다르면 안내(spec §7.3), 같으면 null. */
export const modeDiffNote = (before: RuleVersionMode, now: RuleVersionMode): string | null =>
  before === now ? null : `이전 실행은 ${MODE_LABEL[before]}, 지금은 ${MODE_LABEL[now]}으로 돌렸다`;

export const DRAFT_CASES_NOTE = "내 DRAFT 우선으로 돌렸다 — 확정 검사는 적용 중 버전으로 돌린다";
export const DRAFT_EXPECTED_NOTE = "내 DRAFT 우선으로 돌린 결과다. 룰 DRAFT 를 확정해야 세트 확정 검사가 이 기대값으로 통과한다";
export const DRAFT_CORRUPT_TIP = "[적용 중(기본)] 으로 바꾸면 RELEASED 로 돌릴 수 있다";
```

(`normVer` 의 import 경로는 `TraceDetail.tsx` 가 쓰는 것과 같게 한다.)

- [ ] **Step 4: `TraceDetail`·`VariablePanel`·`FrameDetail`·`RuleSetEditor`**

`TraceDetailProps` 에 `/** DRAFT 로 실행한 룰·세트(spec 2026-10-06). 없으면 표시하지 않는다. */ draftVersions?: DraftVersions;`, 구조 분해에 `draftVersions = NO_DRAFTS`. RULE 블록:

```tsx
          <p className="rsf-panel-note">
            <code>{node.ruleId}</code>
            {node.ver != null ? ` · 버전 ${fmtVer(normVer(node.ver))}` : ""}
            {isDraftNode(draftVersions, node.ruleId, node.ver) && (
              <span data-testid="sim-detail-draft" style={{ ...badgeStyle("warning"), marginLeft: "var(--spacing-xs)" }}>DRAFT</span>
            )}
          </p>
```

`VariablePanel` :365 호출에 `draftVersions={last.draftVersions}`.
`FrameDetailProps` 에 `draftVersions?: DraftVersions`, 제목:

```tsx
        <p className="rsf-dbg-title">
          {`하위 세트 ${frame.setId}`}
          {draftVersions?.sets[frame.setId] && (
            <span data-testid="frame-detail-draft" style={{ ...badgeStyle("warning"), marginLeft: "var(--spacing-xs)" }}>
              {`DRAFT ${fmtVer(normVer(draftVersions.sets[frame.setId]))}`}
            </span>
          )}
        </p>
```

FrameDetail 안 `TraceDetail` 호출에도 `draftVersions={draftVersions}`. `RuleSetEditor` :1014 에 `draftVersions={last?.draftVersions}`.

- [ ] **Step 5: `DebugToolbar`·`RunCompare`**

`DebugToolbar` 의 `dbg-stale` 앞에:

```tsx
      {sim.last?.ruleVersions === "MY_DRAFT" && (
        <span data-testid="dbg-draft-run" style={badgeStyle("warning")}>{draftRunText(sim.last.draftVersions)}</span>
      )}
```

같은 파일의 오류 문구(`alert`)가 서버 MDM026 이고 `sim.ruleVersions === "MY_DRAFT"` 이면 끝에 ` ${DRAFT_CORRUPT_TIP}` 를 붙인다. 판정은 오류 글에 `"내 DRAFT 버전"` 이 들어 있는지로 한다(서버 머리말, Task 1).

`RunCompare` 표 위(이전 실행이 있을 때):

```tsx
  const modeNote = sim.previous && sim.last ? modeDiffNote(sim.previous.ruleVersions, sim.last.ruleVersions) : null;
  ...
      {modeNote && <p className="rsf-panel-note" data-testid="run-compare-mode" role="status">{modeNote}</p>}
```

`DebugInputs.tsx` 최근 입력 라벨(spec §7.3):

```ts
/** 최근 입력 한 줄 라벨 — 내 DRAFT 우선이면 "DRAFT · " + 판정 시각(없으면 "지금") + 레코드 JSON 앞 40자. */
export function recentLabel(evalTs: string, recordJson: string, ruleVersions?: RuleVersionMode): string {
  const head = recordJson.length > 40 ? `${recordJson.slice(0, 40)}…` : recordJson;
  return `${ruleVersions === "MY_DRAFT" ? "DRAFT · " : ""}${evalTs || "지금"} · ${head}`;
}
```

호출(:42)을 `recentLabel(r.evalTs, r.recordJson, r.ruleVersions)` 로. 최근 입력을 고르는 처리(:44)는 `sim.loadInput` 을 거치므로(Task 4) 모드도 함께 바뀐다.

- [ ] **Step 6: `useTestCases`·`TestCasePanel`·`CaseEditModal`**

`useTestCases` 시그니처에 다섯째 인자 `ruleVersions: () => RuleVersionMode = () => "RELEASED"`, `TestCases` 에 `/** 마지막 일괄 실행이 내 DRAFT 우선이었으면 그 모드·DRAFT 목록, 아니면 null. */ draft: {...} | null`. `runAll` 의 `runCases(forSet, flowJsonRef.current(), [])` → `runCases(forSet, flowJsonRef.current(), [], ruleVersions())`, 응답을 받은 자리에서 `setDraft(res.ruleVersions === "MY_DRAFT" ? { ruleVersions: "MY_DRAFT", draftVersions: res.draftVersions ?? NO_DRAFTS } : null)`. `ruleVersions` 인자는 ref 로 들고(렌더마다 바뀌어도 `runAll` 참조가 바뀌지 않게, Local-Rules §16) 실행 때 읽는다.

`RuleSetEditor` :238 → `useTestCases(setId, initialCases, state.flowVersion, flowJson, () => simRef.current.ruleVersions)` — `sim` 이 그 뒤에 만들어지면 `useRef` 로 최신 `sim` 을 담는 기존 방식(파일 안에 있으면 그것)을 쓰고, 없으면 `const simModeRef = useRef<RuleVersionMode>("RELEASED")` 를 두고 `sim` 생성 뒤 `simModeRef.current = sim.ruleVersions` 로 갱신한다.

`TestCasePanel` 결과 요약 위:

```tsx
      {tests.draft && (
        <p className="rsf-panel-note" data-testid="case-draft-run" role="status">
          {`${DRAFT_CASES_NOTE} · DRAFT 룰 ${Object.keys(tests.draft.draftVersions.rules).join("·") || "없음"}`}
        </p>
      )}
```

기대값 채우기(:140)는 막지 않는다. 새 케이스 창을 열 때 `last.ruleVersions === "MY_DRAFT"` 이고 `expectedJson` 을 채웠으면 `CaseEditModal` 에 `note={DRAFT_EXPECTED_NOTE}` 를 넘기고, `CaseEditModal` 은 `note` 가 있으면 본문 위에 `<p className="rsf-panel-note" data-testid="case-edit-draft-note">{note}</p>` 를 그린다(선택 prop 하나 추가).

- [ ] **Step 7: 시험 통과 확인 + 타입 검사**

Run: `draft-mode.test.ts`, `test-cases.test.ts`, `debug-mode.test.ts`, `debug-subset.test.ts`, `catch-debug.test.ts`, `use-simulation.test.ts`
Run: `npx tsc --noEmit -p .`
Expected: PASS, 타입 오류 0

- [ ] **Step 8: 커밋**

```bash
/usr/bin/git add src/frontend/m-mdm/pages/dme/ruleSetEdit src/frontend/m-mdm/tests/dme/ruleSetEdit/draft-mode.test.ts src/frontend/m-mdm/tests/dme/ruleSetEdit/test-cases.test.ts
/usr/bin/git commit -m "feat(ruleSetEdit): 실행 기록·케이스 결과에 DRAFT 실행을 표시하고 검사·확정 기준을 안내한다"
```

---

### Task 6: 결정·기능설계서·전체 시험

**Files:**
- Modify: `docs/mdm/decisions.md` (D-155 뒤에 D-156)
- Modify: `docs/mdm/screens/ruleSetEdit/ruleSetEdit_기능설계서.md`

**Interfaces:**
- Consumes: Task 1~5 의 이름·문구(그대로 옮긴다)

- [ ] **Step 1: D-156 쓰기**

D-155 의 머리 형식(`## D-156 (2026-10-06T00:00:00Z)`)과 절 구성을 그대로 따라 쓴다. 담을 결정:
1. 디버거·케이스 일괄 실행 요청 `ruleVersions`(RELEASED 기본·MY_DRAFT). 운영 `execute`·확정 검사는 모드를 받지 않는다.
2. 「내 DRAFT」 = 상태 DRAFT + OWNER_ID = 현재 사용자. REQUESTED·APPROVED·남의 DRAFT 제외. 판정 시각과 무관하게 고르고 없으면 판정 시각 RELEASED. 하위 세트도 같다.
3. 모드는 조회기 인스턴스마다 고정 → 캐시 키 무변경. DRAFT 사용 기록은 load·loadSet 만.
4. 응답 `draftVersions`·`ruleVersions`, 엔진 계약 무변경.
5. 확정 검사는 RELEASED 유지. 케이스 실패 문구 뒤에 세트 DRAFT 작성자의 룰 DRAFT 안내(새 이슈 없음 — WARNING 은 확인 절차를 바꾼다).
6. 화면 검사는 RELEASED 기준 유지, 안내만(후속 F1~F4 는 spec §11).
근거 링크: spec `docs/superpowers/specs/2026-10-06-rule-set-draft-rule-test-design.md`.

- [ ] **Step 2: 기능설계서 갱신**

디버거 입력 절에 「룰 버전」 칸(항목·기본값·기억 키·검사 기준 안내), 실행 기록 절에 DRAFT 표시(룰 노드·하위 세트 머리·도구 막대 요약), 케이스 일괄 실행 절에 모드·결과 안내·기대값 채우기 안내, 실행 비교 절에 모드 차이 안내, 확정 검사 절에 실패 문구 안내를 더한다. 문구는 Global Constraints·Task 5 상수와 글자까지 같게 한다.

- [ ] **Step 3: 전체 시험(머지 요청 직전 한 번)**

```bash
cd /Users/jji/project/dmes-standard-wt/ruleset-draft-test
.claude/skills/dflow-dev/scripts/heavy.sh bash -c 'cd src/backend && JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home ./gradlew :mdm:api:test --max-workers=2 -q'
.claude/skills/dflow-dev/scripts/heavy.sh bash -c 'cd src/frontend/m-mdm && pnpm test -- --maxWorkers=2'
```

Expected: 둘 다 실패 0. 실패하면 시험 실패 사다리(sonnet/medium → sonnet/high → opus/high, 항목당 3회)로 고친다.

- [ ] **Step 4: 커밋**

```bash
/usr/bin/git add docs/mdm/decisions.md docs/mdm/screens/ruleSetEdit/ruleSetEdit_기능설계서.md
/usr/bin/git commit -m "docs(mdm): D-156 룰 세트 디버거의 내 DRAFT 우선 모드와 기능설계서를 기록한다"
```
