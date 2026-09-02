# Part C: cactus-core 레퍼런스

> 상위 문서: [BackEnd 표준 개발 가이드 V2](../BackEnd_표준_통합_개발가이드_v2.md)


---

## 1. 사용 정책

### 1-1. 등급
| 등급 | 의미 |
|---|---|
| MUST | 반드시 본 문서에 명시된 것만 사용한다. |
| MUST NOT | 본 문서에 없는 클래스/코드를 임의로 추측하여 사용하지 않는다. |
| ASK | 본 문서에 없는 케이스가 필요하면 작업을 멈추고 사용자 또는 프레임워크 담당자에게 확인한다. |

### 1-2. 임의 생성 금지

- ErrorCode 의 새 값을 임의로 생성하지 않는다.
  - (ex) `ErrorCode.PRODUCT_NOT_FOUND` 와 같이 본 문서에 없는 상수 임의 사용 금지
- cactus-core 의 클래스를 추측하여 import 하지 않는다.
  - (ex) `com.dongkuk.dmes.cactus.util.SomeUtil` 과 같이 존재 여부가 확인되지 않은 클래스 사용 금지

---

## 2. 공통 클래스 import 경로

표준 가이드 작성 시 사용하는 cactus-core 공통 클래스의 정확한 import 경로이다.

| 클래스 | import 경로 | 용도 |
|---|---|---|
| CactusAuditEntity | `com.dongkuk.dmes.cactus.audit.CactusAuditEntity` | Entity 의 상위 클래스, 감사 컬럼 자동관리 |
| BusinessException | `com.dongkuk.dmes.cactus.common.BusinessException` | 비즈니스 예외 |
| ErrorCode | `com.dongkuk.dmes.cactus.common.ErrorCode` | 에러 코드 enum |
| ErrorDetail | `com.dongkuk.dmes.cactus.web.response.ErrorDetail` | 행 단위 에러 상세 |
| CactusRequest | `com.dongkuk.dmes.cactus.web.request.CactusRequest` | 표준 요청 객체 (참조용, 직접 작성 안함) |
| CactusResponse | `com.dongkuk.dmes.cactus.web.response.CactusResponse` | 표준 응답 객체 (참조용, 직접 작성 안함) |
| CactusMybatisAuditInterceptor | `com.dongkuk.dmes.cactus.audit.CactusMybatisAuditInterceptor` | MyBatis 감사 컬럼 자동주입 |

### 2-1. 검증되지 않은 항목

다음 클래스는 가이드 본문에 등장하지만 본 문서에서는 정확한 경로가 확정되지 않았다.
사용 전 사용자 또는 프레임워크 담당자에게 확인이 필요하다.

| 항목 | 비고 |
|---|---|
| 추가 유틸 클래스 | 프레임워크 담당자 확인 필요 |
| 감사 컬럼 필드 getter 명 | CactusAuditEntity 의 정확한 필드명 / 메서드명 |
| Audit Holder | AuditHolder 클래스의 정확한 import |

---

## 3. ErrorCode 카탈로그

### 3-1. 카테고리 분류

| 카테고리 | 접두사 | HTTP 상태 | 설명 |
|---|---|---|---|
| Business | E0xx | 400 | 비즈니스 규칙 위반 |
| Auth | A0xx | 401 / 403 | 인증/인가 오류 |
| System | S0xx | 500 | 시스템 오류 |

### 3-2. 사용 가능한 ErrorCode 상수

가이드와 원본 문서에서 명시적으로 등장하는 ErrorCode 만 나열한다.

| ErrorCode 상수 | 카테고리 | HTTP | 사용 기준 |
|---|---|---|---|
| `ErrorCode.REQUIRED_VALUE` | Business / E001 | 400 | 필수 입력값 누락, 일반 검증 실패 |
| `ErrorCode.TOKEN_EXPIRED` | Auth / A002 | 401 | JWT 토큰 만료 (참고) |
| `ErrorCode.TOKEN_INVALID` | Auth / A003 | 401 | JWT 토큰 무효 (참고) |

### 3-3. ErrorCode 사용 원칙

- MUST: 가이드 본문(BackEnd / BPMN 표준 가이드) 의 시나리오는 기본적으로 `ErrorCode.REQUIRED_VALUE` 로 처리한다.
- MUST: 메시지로 구분 가능한 경우(중복 키, 데이터 없음, 상태 전이 불가, 권한 위반 등) 는 `REQUIRED_VALUE` 로 통일하고 메시지에 원인을 명시한다.
- MUST NOT: §3-2 카탈로그에 없는 상수(`ErrorCode.PRODUCT_NOT_FOUND` 등) 를 임의로 import 하지 않는다.
- MAY: 새로운 의미적 구분이 반복적으로 필요하면 사용자 확인 후 §3-2 카탈로그에 정식 상수를 추가한 뒤 사용한다.
- (권한 위반용 정식 ErrorCode 상수는 본 가이드 작성 시점에 확정되지 않았다. 확정 전까지는 메시지 구분 + `REQUIRED_VALUE` 또는 §3-2 카탈로그 확장 ASK 로 처리한다.)

---

## 4. 클래스별 사용법

### 4-1. CactusAuditEntity

Entity 의 상위 클래스. 상속 시 다음 9개 컬럼이 자동 관리된다.

| 컬럼 | 설명 | INSERT | UPDATE |
|---|---|---|---|
| C_USR_ID | 생성 사용자 | O | |
| C_AT | 생성 일시 | O | |
| C_SVC_ID | 생성 서비스 ID | O | |
| C_PGM_ID | 생성 프로그램 ID | O | |
| U_USR_ID | 수정 사용자 | O | O |
| U_AT | 수정 일시 | O | O |
| U_SVC_ID | 수정 서비스 ID | O | O |
| U_PGM_ID | 수정 프로그램 ID | O | O |
| VER | 낙관적 잠금 버전 | 0 | +1 |

```java
import com.dongkuk.dmes.cactus.audit.CactusAuditEntity;
import jakarta.persistence.*;

@Entity
@Table(name = "TB_{CLIENT}_PRODUCT")
public class Product extends CactusAuditEntity {
    // ...
}
```

- MUST: Entity 의 기본 상위 클래스로 사용한다.
- MUST NOT: 감사 컬럼을 직접 정의하지 않는다 (자동 관리됨).

### 4-2. BusinessException

비즈니스 로직에서 throw 하는 예외.

```java
import com.dongkuk.dmes.cactus.common.BusinessException;
import com.dongkuk.dmes.cactus.common.ErrorCode;
import com.dongkuk.dmes.cactus.web.response.ErrorDetail;
```

생성자는 3가지 형태가 있다.

| 형태 | 사용 시점 |
|---|---|
| `new BusinessException(ErrorCode)` | 단순 예외 |
| `new BusinessException(ErrorCode, message)` | 메시지 포함 |
| `new BusinessException(ErrorCode, message, List<ErrorDetail>)` | 그리드 행 단위 에러 포함 |

- MUST: 비즈니스 규칙 위반 시 본 클래스를 사용한다.
- MUST NOT: 일반 `RuntimeException` 또는 `Exception` 을 그대로 throw 하지 않는다.

### 4-3. ErrorDetail

행 단위 에러 정보. 그리드 검증 시 사용한다.

```java
ErrorDetail.ofGrid(
    "master",       // 그리드 이름
    rowKey,         // 행 PK 값
    rowIndex,       // 행 인덱스 (0-based)
    "fieldName",    // 에러 발생 필드명
    "E001",         // 에러 코드
    "에러 메시지"     // 사용자 표시 메시지
)
```

| 파라미터 | 타입 | 설명 |
|---|---|---|
| gridName | String | 프론트엔드 그리드 ID |
| rowKey | String | 행 PK 값 (없으면 null) |
| rowIndex | int | 0부터 시작하는 순번 |
| fieldName | String | 에러 발생 필드명 |
| code | String | 에러 코드 문자열 |
| message | String | 사용자에게 표시할 메시지 |

**BE 가 FE 에 내려보내는 응답 shape**

`BusinessException(ErrorCode, message, List<ErrorDetail>)` 로 throw 한 에러는 CactusResponse 를 통해 다음 JSON shape 으로 직렬화되어 FE 에 전달된다. 상세 규격은 §4-6 「에러 응답 공식 shape」 참조.

```json
{
  "meta":  { "success": false, "code": "E001", "message": "입력값을 확인해주세요." },
  "data":  null,
  "grids": null,
  "errors": [
    { "grid": "master", "rowKey": null, "rowIndex": 0,
      "field": "productId", "code": "E001",
      "message": "제품코드는 필수입니다." }
  ]
}
```

- MUST: JSON 키는 위 6개(`grid`, `rowKey`, `rowIndex`, `field`, `code`, `message`) 로 고정한다.
- MUST: `ErrorDetail.ofGrid("master", ...)` 의 첫 번째 인자(gridName) 는 JSON 의 `grid` 키로 직렬화된다. FE 가 대상 그리드를 식별하는 값이므로 **저장 API 의 body 최상위 키와 동일** 해야 한다.
- FE 측에서 이 JSON 이 JS 객체의 어떤 경로로 노출되는지는 `shared/http` 의 구현에 따르며, 본 가이드는 **JSON 필드명과 의미만** 고정한다.

- MUST: 저장 검증 에러는 `ErrorDetail.ofGrid` 로 생성한다.
- MUST: 검증 중 발견되어도 즉시 throw 하지 않고 List 에 수집한다.
- MUST: 모든 행 검증 완료 후 List 가 비어있지 않으면 한 번에 throw 한다.

### 4-4. CactusRequest / CactusResponse

표준 요청/응답 객체. 개발자는 직접 작성하지 않으며, OASIS 가 자동 변환한다.
참조용으로만 알아두면 된다.

| 객체 | 구성 |
|---|---|
| CactusRequest | meta / params / grids |
| CactusResponse | meta / data / grids / errors |

상세는 Part A 의 「9. 요청/응답 흐름」 참조.

### 4-5. CactusMybatisAuditInterceptor

MyBatis 사용 시 감사 컬럼 값을 파라미터에 자동 주입하는 인터셉터.
개발자가 직접 호출하거나 설정할 필요는 없다.

- MUST: MyBatis Mapper XML 의 INSERT/UPDATE 에 `#{cUsrId}`, `#{uAt}` 등의 바인딩을 직접 작성한다.
- 인터셉터가 파라미터 Map 에 값을 주입하지만, SQL 자체는 수정하지 않기 때문이다.

### 4-6. 에러 응답 공식 shape

BE 가 FE 에 내려보내는 에러 응답 JSON 은 다음 두 레벨로 구성한다.

**Level A — 공통 메시지 (MUST)**

모든 BusinessException 은 `meta.success=false`, `meta.code`, `meta.message` 를 반드시 채운다.

```json
{
  "meta":   { "success": false, "code": "E001", "message": "입력값을 확인해주세요." },
  "data":   null,
  "grids":  null,
  "errors": null
}
```

- MUST: BE 는 모든 에러 응답에서 `meta.message` 를 비우지 않는다.
- MUST: FE 는 `meta.message` 를 1회 사용자 메시지로 표시한다(Frontend 가이드 §8-4 Level A).

**Level B — 그리드 행/셀 상세 (BE MUST 구성, FE 활용은 조건부)**

그리드 저장 검증 실패 시, BE 는 `errors` 배열을 Level A 와 함께 내려보낸다.

```json
{
  "meta":   { "success": false, "code": "E001", "message": "입력값을 확인해주세요." },
  "data":   null,
  "grids":  null,
  "errors": [
    { "grid": "master", "rowKey": "P002", "rowIndex": 1,
      "field": "productNm", "code": "E001", "message": "제품명은 필수입니다." }
  ]
}
```

- MUST: `errors` 배열의 각 원소는 §4-3 의 6필드를 모두 포함한다.
- MUST: `grid` 값은 저장 API 의 body 최상위 키와 동일하다(예: `master`, `detail`).
- MUST NOT: `errors` 배열의 필드명을 변경하거나 추가 필드를 임의로 포함하지 않는다.
- FE 가 이 배열을 실제 행/셀 하이라이트에 활용할지 여부는 Frontend 가이드 §8-4 Level B 규칙에 따른다.

---

## 5. 표준 import 모음

표준 가이드의 Service 템플릿에 사용하는 표준 import 묶음이다.

### 5-1. Entity

```java
import com.dongkuk.dmes.cactus.audit.CactusAuditEntity;
import jakarta.persistence.*;
```

### 5-2. Repository (JPA)

```java
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
```

### 5-3. Repository (MyBatis Mapper)

```java
import org.apache.ibatis.annotations.Mapper;
import java.util.List;
import java.util.Map;
```

### 5-4. Service

```java
import com.dongkuk.dmes.cactus.common.BusinessException;
import com.dongkuk.dmes.cactus.common.ErrorCode;
import com.dongkuk.dmes.cactus.web.response.ErrorDetail;
import org.springframework.stereotype.Service;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
```

---

## 6. 본 문서 외 케이스 대응

표준 가이드와 본 문서의 범위를 벗어나는 시나리오가 발생하면 다음 절차를 따른다.

1. 임의 구현하지 않는다.
2. 가이드 또는 본 문서에 누락된 항목이 없는지 다시 확인한다.
3. 그래도 해결되지 않으면 개발을 멈추고 사용자에게 확인을 요청한다.
4. 결정 사항은 본 문서에 추가하여 다음 작업부터 표준화한다.

다음 항목은 본 문서의 범위를 벗어나며, 별도 결정이 필요하다.

- 페이지네이션 (Pageable, Page<T>)
- 정렬 옵션 (Sort)
- 파일 업로드/다운로드
- 비동기 작업, 스케줄 작업
- WebSocket
- 외부 시스템 연동 (Kafka 등)
- 1:N 관계 매핑 (현 가이드는 N:M 관계 테이블만 다룸)

---
