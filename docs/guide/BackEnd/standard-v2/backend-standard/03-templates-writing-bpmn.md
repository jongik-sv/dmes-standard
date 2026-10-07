# 03. 템플릿, 작성 규칙, BPMN 연계

> 상위 문서: [BackEnd 표준 개발 가이드 V2](../../BackEnd_표준_통합_개발가이드_v2.md)

## 7. 표준 템플릿

아래 템플릿은 **형태를 고정하기 위한 골격**이다. 코드 생성 시 구조를 유지하고 값만 치환한다.
import 문은 「Part C: cactus-core 레퍼런스」 「5. 표준 import 모음」 과 일치해야 한다.

> **패키지 레이아웃 정본 = [02 §3-1](02-structure-naming-constraints.md)**: `entity/`·`repository/` 는 모듈 공유(`{base-package}.entity`·`{base-package}.repository`), service·dto·mapper 는 `{base-package}.{moduleGroup}.{screenId}` 아래 둔다. 아래 템플릿의 `domain.{module}` 표기는 이 형식으로 치환한다(mcm·mpp 가 정본 준수, mqc `domain.*` 는 레거시).

### 7-1. Entity 템플릿
패키지 경로 = `{base-package}.entity` (모듈 단위 공유 — §3-1).
컬럼 = **본 테이블 모든 실 컬럼 1:1** (§3-1 / §6-A-1).

```java
package {base-package}.entity;

import com.dongkuk.dmes.cactus.audit.CactusAuditEntity;
import jakarta.persistence.*;

@Entity
@Table(name = "{TABLE_NAME}")
public class {Entity} extends CactusAuditEntity {

    @Id
    @Column(name = "{PK_COLUMN}")
    private String {pkField};

    /** 본 테이블의 모든 컬럼을 1:1 로 선언 — 현 화면 미사용 컬럼이라도 누락 금지 (§3-1). */
    @Column(name = "{COLUMN_NAME}")
    private String {field};

    public {Entity}() {}

    public String get{PkField}() { return {pkField}; }
    public void set{PkField}(String {pkField}) { this.{pkField} = {pkField}; }
    public String get{Field}() { return {field}; }
    public void set{Field}(String {field}) { this.{field} = {field}; }
}
```

### 7-2. Repository 템플릿
```java
package {base-package}.domain.{module};

import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;

public interface {Entity}Repository extends JpaRepository<{Entity}, {PkType}> {
    List<{Entity}> findBy{Field}(String value);
}
```

### 7-3. SearchRequest / Response 템플릿
```java
package {base-package}.domain.{module}.dto;

public class {Module}SearchRequest {
    private String keyword;

    public {Module}SearchRequest() {}
    public String getKeyword() { return keyword; }
    public void setKeyword(String keyword) { this.keyword = keyword; }
}
```

```java
package {base-package}.domain.{module}.dto;

import {base-package}.domain.{module}.{Entity};

public class {Module}Response {
    private String {pkField};
    private String {nameField};

    public {Module}Response() {}

    public static {Module}Response from({Entity} entity) {
        {Module}Response r = new {Module}Response();
        r.{pkField} = entity.get{PkField}();
        r.{nameField} = entity.get{NameField}();
        return r;
    }

    public String get{PkField}() { return {pkField}; }
    public void set{PkField}(String {pkField}) { this.{pkField} = {pkField}; }
    public String get{NameField}() { return {nameField}; }
    public void set{NameField}(String {nameField}) { this.{nameField} = {nameField}; }
}
```

### 7-4. 조회 Service 템플릿

- **MUST**: 메서드는 **List 또는 단일값을 직접 반환** (cactus CactusResponseConverter 자동 분리). Map 반환은 비표준 — §6-D 참조.
- **MUST**: 본 템플릿의 Service 클래스 / 메서드에 `@Transactional` 어노테이션 추가 금지. §6-B 참조.
- 대응 BPMN serviceTask 에 `<camunda:property name="output" value="{listKey}"/>` 필수 명시 (누락 시 응답 결과 손실). §6-C 참조.

```java
package {base-package}.domain.{module};

import {base-package}.domain.{module}.dto.{Module}Response;
import {base-package}.domain.{module}.dto.{Module}SearchRequest;
import org.springframework.stereotype.Service;
import java.util.List;

@Service("{beanName}")
public class {Module}Service {

    private final {Entity}Repository repository;

    public {Module}Service({Entity}Repository repository) {
        this.repository = repository;
    }

    public List<{Module}Response> {searchMethod}({Module}SearchRequest request) {
        List<{Entity}> entities;

        if (request.getKeyword() != null && !request.getKeyword().isBlank()) {
            entities = repository.findBy{Field}(request.getKeyword());
        } else {
            entities = repository.findAll();
        }

        return entities.stream().map({Module}Response::from).toList();
    }
}
```

### 7-5. 저장/삭제 Service 템플릿

- MUST: 메서드 파라미터명은 **클라이언트가 body 최상위 키로 사용하는 이름** 과 동일하다.
- MUST: 단일 Grid 저장의 표준 파라미터명은 `master` 이다.
- MUST: 단일 Grid 저장의 body 최상위 키는 `grids.master.rows` 로 고정한다. List 는 반드시 `grids` 영역. **`params.master = [...]` 형태로 전송 시 `Generic type` exception** — §6-E-2 참조.
- 자세한 규칙은 §8-4 「Service 메서드 시그니처」 하단 참조.
- **MUST NOT**: 본 템플릿의 Service 클래스 / 메서드에 `@Transactional` 어노테이션을 추가하지 않는다. CGLIB proxy 생성으로 OASIS executor 의 reflection 이 실패한다 — §6-B 참조.
- 대응 BPMN serviceTask 에 `<camunda:property name="output" value="{countKey}"/>` 명시. `<camunda:property name="grid" value="..."/>` 사용 금지 — §6-C 참조.

```java
package {base-package}.domain.{module};

import com.dongkuk.dmes.cactus.common.BusinessException;
import com.dongkuk.dmes.cactus.common.ErrorCode;
import com.dongkuk.dmes.cactus.web.response.ErrorDetail;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

@Service("{beanName}")
public class {Module}Service {

    private final {Entity}Repository repository;

    public {Module}Service({Entity}Repository repository) {
        this.repository = repository;
    }

    public int {saveMethod}(List<Map<String, Object>> master) {
        if (master == null || master.isEmpty()) return 0;

        List<ErrorDetail> errors = new ArrayList<>();
        int affected = 0;

        for (int i = 0; i < master.size(); i++) {
            Map<String, Object> row = master.get(i);
            String rowStatus = (String) row.get("rowStatus");

            // R 또는 미지정 행은 건너뜀
            if ("R".equals(rowStatus) || rowStatus == null || rowStatus.isBlank()) {
                continue;
            }

            // PK 필수값 검증
            String {pkField} = (String) row.get("{pkField}");
            if ({pkField} == null || {pkField}.isBlank()) {
                errors.add(ErrorDetail.ofGrid("master", null, i,
                    "{pkField}", "E001", "{pkField명} 은(는) 필수입니다."));
                continue;
            }

            switch (rowStatus) {
                case "C" -> {
                    // create
                    affected++;
                }
                case "U" -> {
                    // update
                    affected++;
                }
                case "D" -> {
                    // delete
                    affected++;
                }
                default -> errors.add(ErrorDetail.ofGrid("master", {pkField}, i,
                    "rowStatus", "E001", "지원하지 않는 rowStatus 입니다."));
            }
        }

        if (!errors.isEmpty()) {
            throw new BusinessException(ErrorCode.REQUIRED_VALUE,
                "입력값을 확인해주세요.", errors);
        }
        return affected;
    }
}
```

### 7-6. Master-Detail 저장 템플릿
```java
public int {saveMethod}(List<Map<String, Object>> master,
                        List<Map<String, Object>> detail) {
    // 파라미터명 master / detail 은 고정값이며, body 최상위 키와 동일하다.
    // 각각 §7-5 저장 패턴(R/미지정 스킵 → PK 검증 → 에러 수집 → 일괄 throw)으로 처리한다.
    return 0;
}
```

- MUST: Master-Detail 저장의 파라미터명은 `master`, `detail` 로 고정한다.
- MUST: body 최상위 키도 `master`, `detail` 로 고정한다.
- MUST: 다중 Grid 저장이 세 개 이상 필요한 경우(예: master/detail/sub) 는 본 가이드 범위 외이며, §11 ASK 절차를 따른다.

### 7-7. MyBatis Mapper 템플릿
```java
package {base-package}.domain.{module};

import org.apache.ibatis.annotations.Mapper;
import java.util.List;
import java.util.Map;

@Mapper
public interface {Module}Mapper {
    List<Map<String, Object>> selectList(Map<String, Object> param);
    int insert{Entity}(Map<String, Object> param);
    int update{Entity}(Map<String, Object> param);
}
```

```xml
<?xml version="1.0" encoding="UTF-8" ?>
<!DOCTYPE mapper PUBLIC "-//mybatis.org//DTD Mapper 3.0//EN"
        "http://mybatis.org/dtd/mybatis-3-mapper.dtd">
<mapper namespace="{base-package}.domain.{module}.{Module}Mapper">

    <!-- 정적 SQL: 동적 태그(<if> 등)·${} 를 쓰지 않는다. 선택 조건은 WHERE 에서 (#{p} IS NULL OR ...) 로 처리한다 -->
    <select id="selectList" parameterType="map" resultType="map">
        <![CDATA[
        SELECT A.{COL1} {ALIAS1}
             , A.{COL2} {ALIAS2}
        FROM   {TABLE_NAME} A
        WHERE  (#{ {cond} } IS NULL OR A.{COL1} = #{ {cond} })
        ]]>
    </select>

    <!-- INSERT: 감사 컬럼 8개 + VER=0 바인딩 필수 -->
    <insert id="insert{Entity}" parameterType="map">
        INSERT INTO {TABLE_NAME} (
            {COL1}, {COL2},
            C_USR_ID, C_AT, C_SVC_ID, C_PGM_ID,
            U_USR_ID, U_AT, U_SVC_ID, U_PGM_ID, VER
        ) VALUES (
            #{ {field1} }, #{ {field2} },
            #{cUsrId}, #{cAt}, #{cSvcId}, #{cPgmId},
            #{uUsrId}, #{uAt}, #{uSvcId}, #{uPgmId}, 0
        )
    </insert>

    <!-- UPDATE: U_ 계열 4개 + VER = VER + 1 바인딩 필수 -->
    <update id="update{Entity}" parameterType="map">
        UPDATE {TABLE_NAME}
           SET {COL2}     = #{ {field2} }
             , U_USR_ID   = #{uUsrId}
             , U_AT       = #{uAt}
             , U_SVC_ID   = #{uSvcId}
             , U_PGM_ID   = #{uPgmId}
             , VER        = VER + 1
         WHERE {PK_COL}   = #{ {pkField} }
    </update>

</mapper>
```

- MUST: SQL 은 정적으로 쓴다. MyBatis `<if>`·`<choose>`·`<where>`·`<trim>`·`<set>`·`<foreach>`·`${}` 로 SQL 글자를 바꾸지 않고 선택 조건·칼럼 선택·`IN` 목록·정렬 선택은 `WHERE`/`ORDER BY` 조건으로 처리한다. 본문은 `<![CDATA[ … ]]>` 로 감싼다. 규칙·예시는 [`oracle-sql-rules.md` 4.7](../../../Database/oracle-sql-rules.md#47-정적-sql하드-파싱-줄이기).
- (why?) 값에 따라 SQL 글자가 바뀌면 글자마다 하드 파싱·커서가 따로 생기고, XML 태그가 낀 SQL 은 복사해 SQL Developer 에서 그대로 돌릴 수 없다.
- MUST: INSERT/UPDATE 시 감사 컬럼 바인딩(`#{cUsrId}`, `#{uAt}` 등) 을 직접 작성한다.
- MUST: INSERT 는 `VER = 0`, UPDATE 는 `VER = VER + 1` 을 포함한다.
- (why?) `CactusMybatisAuditInterceptor` 가 파라미터 Map 에 값을 자동 주입하지만, SQL 자체는 수정하지 않기 때문이다.

---

## 8. 작성 규칙

### 8-1. Entity
- MUST: `@Table(name="...")`, `@Column(name="...")` 를 명시한다.
- MUST: **To-Be 신규 생성·재생성되는 모든 테이블의 Entity 는 `CactusAuditEntity` 를 상속한다** (cactus-core audit 9 컬럼 자동 적용). schema 가 As-Is 운영본 / 동기화본 / 백업본 등 복수로 존재하는 경우에도 모든 schema 의 동일 테이블에 audit 9 컬럼을 동일하게 적용한다.
  - 예외 (MUST NOT 상속) — view / 외부 시스템 read-only 테이블 / 동기화 대상이 아닌 임시 테이블처럼 audit 의미가 없는 객체에 한한다. 예외 적용 시 설계 §11 (특이사항) 에 사유를 명시한다.
- MUST: 기본 생성자를 둔다.
- MUST: getter/setter 를 명시적으로 작성한다.

### 8-2. Repository
- MUST: 기본 Repository 는 `JpaRepository<Entity, PK>` 를 상속한다.
- MUST: UPDATE/DELETE JPQL 은 `@Modifying` 을 사용한다.
- MUST: MyBatis 사용 시 `mapper.xml` namespace 와 인터페이스 FQCN 을 일치시킨다.

### 8-3. DTO
- MUST: 조회 API 는 SearchRequest DTO 와 Response DTO 를 사용한다.
- MUST: SearchRequest 와 Response 는 기본 생성자 + getter/setter 를 가진다.
- MUST: Response 는 `static from(Entity)` 변환 메서드를 가진다.

### 8-4. Service 메서드 시그니처
| 케이스 | 표준 시그니처 | 반환값 |
|---|---|---|
| 조회 | `(SearchRequest dto)` | `List<Response>` |
| 저장 | `(List<Map<String, Object>> master)` | `int` |
| 삭제 | `(List<Map<String, Object>> master)` | `int` |
| Master-Detail 저장 | `(List<Map<String, Object>> master, List<Map<String, Object>> detail)` | `int` |

- MUST: 저장/삭제 메서드의 **파라미터명은 고정값** 이다.
  - 단일 Grid 저장: `master`
  - Master-Detail 저장: `master`, `detail`
- MUST: 파라미터명 = **그리드명(§7-5 `ErrorDetail.ofGrid` 의 gridName)** = **클라이언트 body 최상위 키** 3자가 동일해야 한다.
- MUST NOT: `rows`, `payload`, `data`, `items` 같은 임의 키를 body 최상위에 사용하지 않는다.
- 본 3자 일치는 **프로젝트 표준 규칙** 이다. 엔진의 기본 바인딩이 이와 달리 동작할 경우, BPMN `input="from->to"` 매핑(Part B §8-2) 을 사용하여 반드시 3자 일치 상태를 맞춘다. 프런트나 BE 한쪽만 키를 다르게 쓰는 것은 허용하지 않는다.

---

**요약: 3자 일치 규칙 (신규/개정 API 필수)**

저장 API 의 다음 3자 이름은 동일해야 한다.

| 축 | 값의 위치 |
|---|---|
| Service 메서드 파라미터명 | `saveXxx(List<Map<String,Object>> {여기})` |
| `ErrorDetail.ofGrid` 의 gridName (§7-5) | `ErrorDetail.ofGrid("{여기}", ...)` |
| FE 요청 body 최상위 키 (Frontend 가이드 §10-3) | `{ "{여기}": [...] }` |

- **단일 Grid 저장**: 세 값 모두 `master` 로 고정.
- **Master-Detail 저장**: 세 값 모두 `master`, `detail` 로 고정.
- **레거시 API 예외**: 이미 다른 키(예: `rows`, `payload`) 를 쓰는 기존 API 에 한해, 설계서에 명시 + BPMN `input="from->to"` 매핑(Part B §8-2) 으로 3자 일치를 유지하는 조건에서 해당 키를 계속 사용할 수 있다(Frontend 가이드 §10-3 레거시 예외 절).
- 프런트가 임의로 새 키를 만드는 것은 MUST NOT.

---

### 8-5. 저장 로직 규칙
- MUST: `rowStatus` 는 `C/U/D/R` 만 사용한다.
- MUST: `R` 은 미변경 행으로 간주하고 건너뛴다.
- MUST: PK 필수값 검증을 가장 먼저 수행한다.
- MUST: 반환 `int` 는 **실제 반영 건수** 기준으로 계산한다.
- MUST: 검증 오류는 `ErrorDetail` 로 수집 후 한 번에 throw 한다.
- SHOULD: 부분 수정은 `row.containsKey("field")` 확인 후 반영한다.

### 8-6. 타입 변환 기준
| 타입 | 표준 처리 |
|---|---|
| String | `(String) row.get("key")` |
| Integer | `row.get("key") instanceof Number n ? n.intValue() : null` |
| Boolean | `row.get("key") instanceof Boolean b ? b : null` |
| LocalDate | 값 존재 시 `LocalDate.parse(...)` |

### 8-7. 로깅 최소 원칙

- MUST NOT: `System.out.println`, `printStackTrace()` 를 사용한다.
- MUST: 민감 정보(비밀번호, 주민번호, 토큰, 개인식별정보) 를 로그로 출력하지 않는다.
- MUST: 로깅은 프로젝트의 공통 로깅 방식(SLF4J 등) 을 따른다.
- 자동 로깅(서비스 진입/완료, 감사 등) 의 범위와 포맷은 프레임워크/프로젝트 설정에 따르며, 본 가이드에서 단정하지 않는다. 필요한 경우 §11 ASK 절차로 확인한다.

---

## 9. BPMN 연계 규칙

### 9-0. 작성·검증 도구 (MUST)

- **BPMN 파일 작성·수정·검증은 반드시 [bpmn-skill](../../../../../.claude/skills/bpmn-skill/SKILL.md) (= `bpmn-tool` CLI) 을 통한다.** 직접 XML 편집 금지 — DI 좌표·네임스페이스·id 참조가 깨질 수 있다.
  - 신규 BPMN 작성: `bpmn-tool create < spec.json > {serviceId}.bpmn` (Part B §7-1, Part D §8 의 JSON 스펙 형식)
  - 기존 BPMN 수정: `bpmn-tool modify {serviceId}.bpmn -i < ops.json` (Part B §7-2 ~ §7-6 의 modify ops 형식, in-place + validate/preview 자동 출력)
  - 검증: `bpmn-tool validate {serviceId}.bpmn` 가 `유효: true` 인지 확인 (모든 경로가 EndEvent 로 종료, ExclusiveGateway default flow 지정, EventBasedGateway 후속 노드 제약 등 schema·연결 무결성 자동 검증)
  - **⚠ 직접 XML 작성 절대 금지 — DI 누락 사고 방지 (MUST)**: 손으로 `.bpmn` XML 을 작성하면 `<bpmndi:BPMNDiagram>`(도형 좌표 = BPMNShape/BPMNEdge) 가 빠져 **Camunda Modeler 에서 다이어그램이 렌더되지 않는다.** XML·OASIS 실행은 정상이라 놓치기 쉬운 함정 — **실제 사고: 2026-05-27 `plateSlittingMgmt.bpmn` 가 직접 작성돼 DI 누락 → Modeler 빈 화면.** `bpmn-tool create/modify` 는 DI(Shape/Edge·좌표·waypoint) 를 자동 생성하므로 이 문제가 원천 차단된다.
  - **완료 게이트 (DoD)**: BPMN 작성/수정 후 ① `bpmn-tool validate` = `유효: true` + ② 파일에 `<bpmndi:BPMNDiagram>` 블록 존재 + ③ (가능 시) Camunda Modeler 로 열어 도형 렌더 확인. 이미 직접 작성돼 DI 가 없는 레거시 파일은 `bpmn-tool modify -i` 로 재처리하거나 DI 를 보강한 뒤 다시 validate 한다.
- **OASIS 런타임 시맨틱**(JavaServiceTask/ScriptTask 의 PropertyEL/MethodBinding 바인딩, UserException → Error End Event 흐름, `ServiceResult.path()`/`messages()` 테스트, Error Boundary Event 동작) 디버깅·검증은 [oasis-project-support](../../../../../.claude/skills/oasis-project-support/SKILL.md) skill 을 호출한다.
- **분담**: bpmn-skill = BPMN 구조(요소·흐름·DI), oasis-project-support = OASIS 런타임(태스크 바인딩·예외 흐름·테스트). 한 작업이 두 영역에 걸치면 bpmn-skill 로 구조 편집 → oasis-project-support 로 런타임 정합 검증 (체인).

### 9-1. 6 자 일치 매핑

다음 6개는 MUST 이다. **MES 4 모듈 (mls/mqc/mpp/mas) 에서는 추가로 `serviceId = screenId = pageId = beanName` 까지 단일 camelCase 식별자 — §3-1 / §5 의 단일 식별자 룰 참조**.

| 항목 | BackEnd 기준 | BPMN 기준 | MES 예시 (`plateSlittingMgmt`) |
|---|---|---|---|
| serviceId | BPMN 파일명과 일치 (= `screenId` = `pageId`) | `{serviceId}.bpmn` | `plateSlittingMgmt.bpmn` |
| process id | BPMN 파일명과 일치 | `<process id="{serviceId}">` | `<process id="plateSlittingMgmt">` |
| beanName | `@Service("beanName")` (MES 는 = `serviceId`) | `camunda:class="beanName"` | `camunda:class="plateSlittingMgmt"` |
| method | Service 메서드명 | `property name="method"` | `searchPlateSlitting` |
| dto | DTO FQCN | `property name="dto"` | `com.dongkuk.dmes.mls.domain...PlateSlittingMgmtSearchRequest` |
| action | API path 마지막 값 | `conditionExpression` | `search` / `save` / `delete` |

**[MES 단일 식별자 룰 — MUST · MES 4 모듈 한정]**

`mls` / `mqc` / `mpp` / `mas` 에서는 위 6 자 중 **serviceId = beanName 까지 모두 동일한 camelCase 값 (`screenId`)** 이다. 따라서 BPMN 측 `<process id>` / `{serviceId}.bpmn` 파일명 / `camunda:class` 값 / Spring `@Service("...")` 값 / FE `pageId` 가 **전부 같은 문자열**이다.

- 예: `plateSlittingMgmt` → `services/plateSlittingMgmt/plateSlittingMgmt.bpmn` + `@Service("plateSlittingMgmt")` + `camunda:class="plateSlittingMgmt"` + `POST /oasis/plateSlittingMgmt/search` + FE `pageId = "plateSlittingMgmt"`.
- 위 5축 중 한 곳이라도 다른 문자열이면 §12-3 ✗ 자동 → §12-4 재개발 의무 발동.

**[APS / mpn 예외 — MUST]**

`mpn` 모듈 (APS 사이트, `aps-core` 기반) 은 본 단일 식별자 룰을 적용하지 않는다. APS 측 명명 규약 (별도 BPMN flow + Manager / Service / Handler) 을 따른다. 본 §9-1 의 MES 예시 / 단일 식별자 룰은 mls/mqc/mpp/mas 한정.

**표준 URL**

```text
# BE 매핑 (cactus OasisController)
POST /oasis/{serviceId}/{action}
Content-Type: application/json

# UI→BFF (Next.js BFF)
POST /api/{moduleId}/oasis/{serviceId}/{action}
```

| 구성요소 | 결정 기준 |
|---|---|
| `moduleId` | UI 측 모듈 prefix. `mls`, `mqc`, `mpp`, `mas`, `mpn`, `portal` 등. **BE 매핑에는 포함되지 않는다** (BFF→BE 호출 시 BFF 가 `/oasis/{serviceId}/{action}` 로 변환) |
| `serviceId` | BPMN 파일명(확장자 제외). MES 4 모듈은 `{화면명}` 단일 토큰 camelCase 형식 (= `screenId` = `pageId`, 모듈명·그룹명 prefix 없음). BPMN `<process id>` 와 동일. APS (mpn) 은 별도 규약 |
| `action` | BPMN `actionGateway` 의 `conditionExpression` 값(예: `search`, `save`, `delete`) |

- MUST: 같은 `serviceId` 내의 CRUD 는 **동일 BPMN + 다른 action** 으로 구현한다.
- MUST: BE 매핑은 cactus `OasisController` 가 제공하는 단일 `/oasis/{serviceId}/{action}` 컨벤션을 사용한다. `serviceGroup` placeholder 는 더 이상 존재하지 않는다.
- MUST NOT: 복수형(`products`) 또는 `/api/{group}/{resource}/{action}` 순서를 사용하지 않는다.
- MUST NOT: 옛 `/${cactus.oasis.service-group}/api` 형태 / `/api/backend/...` / `/{serviceGroup}/api/...` 패턴은 사용하지 않는다.
- MUST NOT (MES 4 모듈): `serviceId` 와 다른 짧은 별칭 (`plateSlitting` 처럼 임의로 줄인 형태) 또는 모듈명 prefix 부착형 (`mlsPlateSlittingMgmt`) 으로 BPMN 파일 / bean 을 만들지 않는다. 한 화면 = 한 식별자 = 화면명 단일 토큰.

### 9-2. BPMN 기능 식별자 (D4)

BPMN 내부의 ServiceTask / ScriptTask / SendTask 등 **기능 단위 id** 는 다음 표준 식별자 형식을 따른다. (URL `serviceId` / `action` 매핑과는 별개 — 본 식별자는 BPMN 내 추적용)

- **형식**: **`{화면명}_{기능명}`** (= `{serviceId}_{기능명}` = `{screenId}_{기능명}` — `screenId` 와 동일 prefix, 모듈명·그룹명 없음)
  - **화면명 (= screenId)**: camelCase 단일 토큰 화면 식별 (예: `moldMaster`, `moldAttach`, `plateSlittingMgmt`) — 모듈명·그룹명 prefix 없음
  - **기능명**: lowercase camelCase 단일 동사 또는 동사구 (예: `save`, `delete`, `searchHistory`)
- **예시 (MES)**:
  - `plateSlittingMgmt_save` — MLS 모듈 / 후판 슬리팅 관리 / 저장
  - `moldMaster_save` — MPP 모듈 / 금형 마스터 / 저장
  - `moldInspect_search` — MQC 모듈 / 금형 검사 / 조회
  - `workOrderIssue_save` — MAS 모듈 / 작업지시 발행 / 저장
- **정본 정의**: [01_Agent부속_가이드.md §A.3](../../../design/identifier-dictionary/01-modules-and-screens.md) 및 [§A.4](../../../design/identifier-dictionary/02-naming-conventions.md) 인용 (Wave G-2 신설, 본 문서에서는 중복 기술하지 않는다).
- **§9-1 6 자 일치 매핑 (serviceId / process id / beanName / method / dto / action) 과의 정합**:
  - 6 자 일치 매핑은 **API 경로 ↔ BPMN process ↔ Service Bean** 5축 연결 규칙으로 **계속 유효**하다 (해체 아님).
  - 본 §9-2 의 기능 식별자는 BPMN **내부 노드 id** 의 명명 표준으로, 6 자 일치 매핑과 **레이어가 다르다** (URL/Bean 축 vs. BPMN 내 노드 축).
  - 새 형식 우선 적용 — 기존 BPMN 의 단순 `searchTask` / `saveTask` 형식 노드는 **마이그레이션 대상** 으로 표기 (별도 PR). 본 PR 에서는 신규 작성 BPMN 만 새 형식 적용.

### 9-3. BPMN serviceTask camunda property 표준 (cross-ref §6-C)

BPMN serviceTask 의 `<camunda:property>` 작성 표준은 §6-C 정본에 따른다. 핵심 요약:

| property | 사용 | 비고 |
|---|---|---|
| `method` | ✅ 필수 | Service bean 의 method 이름 |
| `output` | ✅ 필수 | method 반환값을 저장할 process variable key. 누락 시 응답 결과 손실 (§6-C-2) |
| `dto` | ✅ 권장 | request body 를 binding 할 DTO 클래스 FQN. 단일값 파라미터일 때 명시 |
| `grid` | ❌ 금지 | JavaServiceTask 미지원. method parameter 이름 = body grid key 자동 매칭 (§6-C-1) |

sequenceFlow 의 분기:
- ✅ `<bpmn:sequenceFlow id="..." name="action명" sourceRef="actionGateway" .../>` 만 명시
- ❌ `<bpmn:conditionExpression>action명</bpmn:conditionExpression>` 명시 금지 (§6-C-3)

CactusRequest body 표준은 §6-E 정본 참조.

---
