# Part D: Quick Sample - Product 도메인

> 상위 문서: [BackEnd 표준 개발 가이드 V2](../BackEnd_표준_통합_개발가이드_v2.md)


==========================================================
※ 본 문서는 표준 가이드의 placeholder 를 구체 값으로 채운 참조 예시이다.
※ 본 문서는 학습용/패턴매칭용이며, 실제 개발 시에는 표준 가이드 본문 규칙을 우선 적용한다.
==========================================================

---

## 0. 시나리오

신규 도메인 "제품(Product)" 을 처음부터 끝까지 만든다.
조회와 저장(C/U/D) 을 모두 지원하는 표준 CRUD 화면이다.

### 0-1. 결정 사항 (Part A 「2 시작 전 결정 항목」 따라 확정)

| 항목 | 값 |
|---|---|
| base-package | `com.dongkuk.dmes.mpp` (가정) |
| module | `product` |
| table | `TB_{CLIENT}_PRODUCT` |
| beanName | `productService` |
| serviceId | `product` (BPMN 파일명, process id 와 동일) |
| action 목록 | `search`, `save` |

### 0-2. 생성 파일 목록 (Part A 「3-2 케이스별 필수 파일」 "조회 + 저장")

| 순서 | 파일 | 위치 |
|---|---|---|
| 1 | `Product.java` | `src/main/java/kr/co/ksm/dmes/mpp/domain/product/` |
| 2 | `ProductRepository.java` | `src/main/java/kr/co/ksm/dmes/mpp/domain/product/` |
| 3 | `ProductSearchRequest.java` | `src/main/java/kr/co/ksm/dmes/mpp/domain/product/dto/` |
| 4 | `ProductResponse.java` | `src/main/java/kr/co/ksm/dmes/mpp/domain/product/dto/` |
| 5 | `ProductService.java` | `src/main/java/kr/co/ksm/dmes/mpp/domain/product/` |
| 6 | `product.bpmn` | `src/main/resources/services/product/` |

---

## 1. 연결 다이어그램

6개 파일이 어떻게 서로 참조하는지 한눈에 본다.

```
[Client]
   |
   | POST /api/mpp/oasis/product/search
   |   body: { meta: {...}, params: { productType: "SEAL" } }
   v
[OASIS Engine]
   |
   | URL의 "product" → 파일 검색
   v
[6] product.bpmn
   |  process id="product"
   |  actionGateway → action="search" 매칭 → flow_search
   |  searchTask:
   |    camunda:class="productService"  ──┐
   |    method="searchProducts"           │ 일치 필수
   |    dto="com.dongkuk.dmes.mpp.domain.product.dto.ProductSearchRequest"
   |    output="products"
   v                                      │
[5] ProductService.java                   │
   @Service("productService")  ←──────────┘
   public List<ProductResponse> searchProducts(ProductSearchRequest request) { ... }
   |
   | uses
   v
[2] ProductRepository.java       [3] ProductSearchRequest.java
   findByProductType(...)        [4] ProductResponse.java (from 팩토리)
   |
   | manages
   v
[1] Product.java (Entity)
   @Table(name = "TB_{CLIENT}_PRODUCT")
```

---

## 2. 테이블 정의 (전제)

```sql
CREATE TABLE TB_{CLIENT}_PRODUCT (
    PRODUCT_ID    VARCHAR2(20)  PRIMARY KEY,
    PRODUCT_NM    VARCHAR2(100) NOT NULL,
    PRODUCT_TYPE  VARCHAR2(10)  NOT NULL,
    USE_YN        CHAR(1)       NOT NULL,
    -- CactusAuditEntity 자동 컬럼
    C_USR_ID      VARCHAR2(20),
    C_AT          TIMESTAMP,
    C_SVC_ID      VARCHAR2(50),
    C_PGM_ID      VARCHAR2(50),
    U_USR_ID      VARCHAR2(20),
    U_AT          TIMESTAMP,
    U_SVC_ID      VARCHAR2(50),
    U_PGM_ID      VARCHAR2(50),
    VER           NUMBER(10)
);
```

---

## 3. 파일 1 - Product.java (Entity)

위치: `src/main/java/kr/co/ksm/dmes/mpp/domain/product/Product.java`

```java
package com.dongkuk.dmes.mpp.domain.product;

import com.dongkuk.dmes.cactus.audit.CactusAuditEntity;
import jakarta.persistence.*;

@Entity
@Table(name = "TB_{CLIENT}_PRODUCT")
public class Product extends CactusAuditEntity {

    @Id
    @Column(name = "PRODUCT_ID", length = 20)
    private String productId;

    @Column(name = "PRODUCT_NM", length = 100)
    private String productNm;

    @Column(name = "PRODUCT_TYPE", length = 10)
    private String productType;

    @Column(name = "USE_YN", length = 1)
    private String useYn;

    public Product() {}

    public String getProductId() { return productId; }
    public void setProductId(String productId) { this.productId = productId; }

    public String getProductNm() { return productNm; }
    public void setProductNm(String productNm) { this.productNm = productNm; }

    public String getProductType() { return productType; }
    public void setProductType(String productType) { this.productType = productType; }

    public String getUseYn() { return useYn; }
    public void setUseYn(String useYn) { this.useYn = useYn; }
}
```

가이드 매핑:
- BackEnd 「7-1 Entity 템플릿」 + 「8-1 Entity」 적용
- Part C 「4-1 CactusAuditEntity」 적용

---

## 4. 파일 2 - ProductRepository.java

위치: `src/main/java/kr/co/ksm/dmes/mpp/domain/product/ProductRepository.java`

```java
package com.dongkuk.dmes.mpp.domain.product;

import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;

public interface ProductRepository extends JpaRepository<Product, String> {

    List<Product> findByProductType(String productType);
    List<Product> findByUseYn(String useYn);
}
```

가이드 매핑:
- BackEnd 「7-2 Repository 템플릿」 + 「8-2 Repository」 적용

---

## 5. 파일 3 - ProductSearchRequest.java

위치: `src/main/java/kr/co/ksm/dmes/mpp/domain/product/dto/ProductSearchRequest.java`

```java
package com.dongkuk.dmes.mpp.domain.product.dto;

public class ProductSearchRequest {

    private String productType;
    private String useYn;

    public ProductSearchRequest() {}

    public String getProductType() { return productType; }
    public void setProductType(String productType) { this.productType = productType; }

    public String getUseYn() { return useYn; }
    public void setUseYn(String useYn) { this.useYn = useYn; }
}
```

가이드 매핑:
- BackEnd 「7-3 SearchRequest / Response 템플릿」 적용

---

## 6. 파일 4 - ProductResponse.java

위치: `src/main/java/kr/co/ksm/dmes/mpp/domain/product/dto/ProductResponse.java`

```java
package com.dongkuk.dmes.mpp.domain.product.dto;

import com.dongkuk.dmes.mpp.domain.product.Product;

public class ProductResponse {

    private String productId;
    private String productNm;
    private String productType;
    private String useYn;

    public ProductResponse() {}

    public static ProductResponse from(Product entity) {
        ProductResponse r = new ProductResponse();
        r.productId = entity.getProductId();
        r.productNm = entity.getProductNm();
        r.productType = entity.getProductType();
        r.useYn = entity.getUseYn();
        return r;
    }

    public String getProductId() { return productId; }
    public void setProductId(String productId) { this.productId = productId; }

    public String getProductNm() { return productNm; }
    public void setProductNm(String productNm) { this.productNm = productNm; }

    public String getProductType() { return productType; }
    public void setProductType(String productType) { this.productType = productType; }

    public String getUseYn() { return useYn; }
    public void setUseYn(String useYn) { this.useYn = useYn; }
}
```

가이드 매핑:
- BackEnd 「7-3 SearchRequest / Response 템플릿」 + 「8-3 DTO」 적용

---

## 7. 파일 5 - ProductService.java

위치: `src/main/java/kr/co/ksm/dmes/mpp/domain/product/ProductService.java`

```java
package com.dongkuk.dmes.mpp.domain.product;

import com.dongkuk.dmes.cactus.common.BusinessException;
import com.dongkuk.dmes.cactus.common.ErrorCode;
import com.dongkuk.dmes.cactus.web.response.ErrorDetail;
import com.dongkuk.dmes.mpp.domain.product.dto.ProductResponse;
import com.dongkuk.dmes.mpp.domain.product.dto.ProductSearchRequest;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

@Service("productService")
public class ProductService {

    private final ProductRepository productRepository;

    public ProductService(ProductRepository productRepository) {
        this.productRepository = productRepository;
    }

    /** 조회 (BPMN action=search) */
    public List<ProductResponse> searchProducts(ProductSearchRequest request) {
        List<Product> entities;

        if (request.getProductType() != null && !request.getProductType().isBlank()) {
            entities = productRepository.findByProductType(request.getProductType());
        } else if (request.getUseYn() != null && !request.getUseYn().isBlank()) {
            entities = productRepository.findByUseYn(request.getUseYn());
        } else {
            entities = productRepository.findAll();
        }

        return entities.stream().map(ProductResponse::from).toList();
    }

    /** 저장 (BPMN action=save) */
    public int saveProducts(List<Map<String, Object>> master) {
        if (master == null || master.isEmpty()) return 0;

        List<ErrorDetail> listErrors = new ArrayList<>();
        int intAffected = 0;

        for (int i = 0; i < master.size(); i++) {
            Map<String, Object> mapRow = master.get(i);
            String strRowStatus = (String) mapRow.get("rowStatus");

            // R 또는 미지정 행은 건너뜀 (BackEnd 가이드 §8-5)
            if ("R".equals(strRowStatus) || strRowStatus == null || strRowStatus.isBlank()) {
                continue;
            }

            // PK 필수값 검증 (§8-5)
            String strProductId = (String) mapRow.get("productId");
            if (strProductId == null || strProductId.isBlank()) {
                listErrors.add(ErrorDetail.ofGrid("master", null, i,
                    "productId", "E001", "제품코드는 필수입니다."));
                continue;
            }

            // rowStatus 분기 처리 (§8-5)
            switch (strRowStatus) {
                case "C" -> {
                    Product product = new Product();
                    product.setProductId(strProductId);
                    product.setProductNm((String) mapRow.get("productNm"));
                    product.setProductType((String) mapRow.get("productType"));
                    product.setUseYn("Y");
                    productRepository.save(product);
                    intAffected++;
                }
                case "U" -> {
                    productRepository.findById(strProductId).ifPresent(p -> {
                        if (mapRow.containsKey("productNm"))
                            p.setProductNm((String) mapRow.get("productNm"));
                        if (mapRow.containsKey("productType"))
                            p.setProductType((String) mapRow.get("productType"));
                        if (mapRow.containsKey("useYn"))
                            p.setUseYn((String) mapRow.get("useYn"));
                        productRepository.save(p);
                    });
                    intAffected++;
                }
                case "D" -> {
                    productRepository.deleteById(strProductId);
                    intAffected++;
                }
                default -> listErrors.add(ErrorDetail.ofGrid("master", strProductId, i,
                    "rowStatus", "E001", "지원하지 않는 rowStatus 입니다."));
            }
        }

        // 에러 일괄 throw (§8-5)
        if (!listErrors.isEmpty()) {
            throw new BusinessException(ErrorCode.REQUIRED_VALUE,
                "입력값을 확인해주세요.", listErrors);
        }
        return intAffected;
    }
}
```

가이드 매핑:
- BackEnd 「7-4 조회 Service 템플릿」 + 「7-5 저장/삭제 Service 템플릿」 적용
- BackEnd 「8-4 Service 메서드 시그니처」 + 「8-5 저장 로직 규칙」 + 「8-6 타입 변환 기준」 적용
- Part C 「4-2 BusinessException」 + 「4-3 ErrorDetail」 + 「3-2 ErrorCode」 적용

---

## 8. 파일 6 - product.bpmn

위치: `src/main/resources/services/product/product.bpmn`

bpmn-tool create 입력 JSON 스펙 (`product.spec.json`):

```json
{
  "definitions": {
    "id": "Definitions_1",
    "targetNamespace": "http://bpmn.io/schema/bpmn"
  },
  "process": {
    "id": "product",
    "name": "제품 관리",
    "isExecutable": true
  },
  "nodes": [
    { "id": "start", "type": "bpmn:StartEvent" },
    {
      "id": "actionGateway",
      "type": "bpmn:ExclusiveGateway",
      "camunda": {
        "properties": [{ "name": "input", "value": "action" }]
      }
    },
    {
      "id": "searchTask",
      "type": "bpmn:ServiceTask",
      "name": "제품 조회",
      "camunda": {
        "class": "productService",
        "properties": [
          { "name": "method", "value": "searchProducts" },
          { "name": "dto",    "value": "com.dongkuk.dmes.mpp.domain.product.dto.ProductSearchRequest" },
          { "name": "output", "value": "products" }
        ]
      }
    },
    {
      "id": "saveTask",
      "type": "bpmn:ServiceTask",
      "name": "제품 저장",
      "camunda": {
        "class": "productService",
        "properties": [
          { "name": "method", "value": "saveProducts" },
          { "name": "output", "value": "savedCount" }
        ]
      }
    },
    { "id": "end", "type": "bpmn:EndEvent" }
  ],
  "flows": [
    { "id": "flow_to_action",  "source": "start",         "target": "actionGateway" },
    { "id": "flow_search",     "source": "actionGateway", "target": "searchTask", "condition": "search" },
    { "id": "flow_save",       "source": "actionGateway", "target": "saveTask",   "condition": "save" },
    { "id": "flow_search_end", "source": "searchTask",    "target": "end" },
    { "id": "flow_save_end",   "source": "saveTask",      "target": "end" }
  ]
}
```

생성 명령:

```bash
bpmn-tool create < product.spec.json > src/main/resources/services/product/product.bpmn
bpmn-tool validate src/main/resources/services/product/product.bpmn   # 유효: true 확인
```

가이드 매핑:
- BPMN 「7-1 기본 CRUD 템플릿」 적용
- BPMN 「3 핵심 일치 규칙」 6가지 모두 만족 (§10 일치 검증 표 참조)

---

## 9. 동작 검증

### 9-1. 조회 호출

요청:
```
POST /api/mpp/oasis/product/search
Content-Type: application/json

{
  "productType": "SEAL"
}
```

개발자가 맞춰야 하는 일치 항목 (프로젝트 표준 기준):

| 축 | 일치 대상 |
|---|---|
| URL `serviceId` = `product` | BPMN 파일명 `product.bpmn` = `<bpmn:process id="product">` |
| URL `action` = `search` | BPMN `flow_search` 의 `conditionExpression="search"` |
| BPMN `camunda:class="productService"` | `@Service("productService")` |
| BPMN `method="searchProducts"` | Service 메서드명 `searchProducts` |
| BPMN `dto="...ProductSearchRequest"` | 실제 DTO FQCN |
| BPMN `output="products"` | 응답에서 해당 grid 를 식별하는 키(`grids.products`) |

- 위 일치 항목을 충족하면 표준 경로로 동작한다.
- 엔진이 BPMN 파일 로드·라우팅·DTO 바인딩·컨텍스트 매핑을 어떤 내부 로직으로 수행하는지는 본 가이드의 단정 범위 밖이다. 동작이 본 표준과 어긋나면 BPMN `input="from->to"` 매핑(Part B §8-2) 으로 맞춘다.

응답:
```json
{
  "meta":  { "success": true, "code": "0000" },
  "data":  null,
  "grids": {
    "products": {
      "rows": [
        { "productId": "P001", "productNm": "벨로우즈", "productType": "SEAL", "useYn": "Y" }
      ]
    }
  },
  "errors": null
}
```

- 이 응답 예시는 BE/OASIS 가 내려보내는 **표준 응답 구조** 를 보여주기 위한 것이다(Part C §4-6 참조).
- FE `*-api.ts` 의 `searchProducts(...)` 반환 타입(예: `Promise<ProductRow[]>`) 은 **Frontend 가이드** 의 본체 규칙(§10, §14-1) 을 따른다. 즉 FE 는 위 응답의 `grids.products.rows` 부분을 자기 도메인 타입으로 받아들이는 형태로 계약되며, BE 응답의 전체 구조(`meta` / `data` / `grids` / `errors`) 를 프런트 반환 타입에 그대로 노출하지 않는다.

### 9-2. 저장 호출

요청:
```
POST /api/mpp/oasis/product/save
Content-Type: application/json

{
  "master": [
    { "productId": "P002", "productNm": "자성유체씰", "productType": "SEAL", "rowStatus": "C" },
    { "productId": "P001", "useYn": "N", "rowStatus": "U" }
  ]
}
```

- 본문 최상위 키 `master` 는 `ProductService.saveProducts(List<Map<String,Object>> master)` 의 파라미터명과 동일(Part A §8-4 프로젝트 표준 규칙).
- 단일 Grid 저장이므로 Master-Detail 구조가 아니다. Master-Detail 인 경우 `{ "master": [...], "detail": [...] }` 형태가 된다.
- 엔진의 기본 바인딩이 본 키 규칙과 다르게 동작하면 BPMN `input="from->to"` 매핑으로 맞춘다(Part B §8-2).

응답(성공):
```json
{
  "meta":   { "success": true, "code": "0000" },
  "data":   { "savedCount": 2 },
  "grids":  null,
  "errors": null
}
```

응답(검증 실패 — Level A + Level B):
```json
{
  "meta":   { "success": false, "code": "E001", "message": "입력값을 확인해주세요." },
  "data":   null,
  "grids":  null,
  "errors": [
    { "grid": "master", "rowKey": null, "rowIndex": 0,
      "field": "productId", "code": "E001",
      "message": "제품코드는 필수입니다." }
  ]
}
```

- 응답 shape 의 계약은 Part C §4-6 참조.
- FE 는 최소한 `meta.message` 를 표시한다(Level A, MUST). `errors` 배열을 이용한 행/셀 하이라이트는 Frontend 가이드 §8-4 Level B 조건부 SHOULD.

---

## 10. 6가지 일치 검증 (Part B 「3」 핵심 일치 규칙)

| 검증 항목 | BPMN 측 값 | BackEnd 측 값 | 일치 여부 |
|---|---|---|---|
| 파일명 = serviceId | `product.bpmn` → `product` | URL 의 `product` | OK |
| process id = 파일명 | `<process id="product">` | `product` | OK |
| Bean 이름 | `camunda:class="productService"` | `@Service("productService")` | OK |
| 메서드명 (조회) | `method="searchProducts"` | `searchProducts(...)` | OK |
| 메서드명 (저장) | `method="saveProducts"` | `saveProducts(...)` | OK |
| DTO FQCN | `dto="com.dongkuk.dmes.mpp.domain.product.dto.ProductSearchRequest"` | 동일 패키지 동일 클래스명 | OK |
| action 분기 (조회) | `<conditionExpression>search</...>` | URL 의 `search` | OK |
| action 분기 (저장) | `<conditionExpression>save</...>` | URL 의 `save` | OK |

---

## 11. 본 샘플의 사용법

- Agent 가 새 도메인을 만들 때, 본 샘플을 패턴으로 활용한다.
- 단, base-package 와 도메인명, 컬럼 구성은 Part A 의 「2 시작 전 결정 항목」에 따라 실제 값으로 결정한 후 적용한다.
- 본 샘플의 구체 값(`com.dongkuk.dmes.mpp`, `Product`, `productService` 등) 은 예시일 뿐, 무조건 복사하지 않는다.
- 변형 케이스(복합 PK, Master-Detail, MyBatis 등) 는 표준 가이드의 해당 섹션을 참조한다.
