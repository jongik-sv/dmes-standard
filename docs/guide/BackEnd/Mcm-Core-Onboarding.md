# mcm-core Onboarding 가이드

> 다음 프로젝트에 권한관리·메뉴·즐겨찾기·마스터코드·롤그룹·감사로그를 가져다 쓰는 방법.
> aps-core 와 동일한 cactus/oasis 비의존 패턴.

## 두 가지 모드

| 모드 | 설명 | 대표 사이트 |
|------|------|-------------|
| 모드 A | cactus + oasis 사용 (BPMN 기반) | {CLIENT} (현 dmes-standard) |
| 모드 B | cactus/oasis 미사용 (REST 기반) | 외부 SI 프로젝트 |

mcm-core 자체는 동일하다. 사이트 통합 방식만 다름.

---

## 모드 A — cactus + oasis 사용

### 1. 의존 추가

```gradle
dependencies {
    api 'com.dongkuk.dmes:mcm-core'      // ← 도메인 라이브러리 (버전은 프로젝트 BOM/버전 카탈로그를 따른다)
    api 'com.dongkuk.dmes:cactus-core'   // ← 인증/OASIS 인프라

    api 'org.springframework.boot:spring-boot-starter-data-jpa'
    api 'org.springframework.boot:spring-boot-starter-security'
    api 'org.springframework.boot:spring-boot-starter-web'
    runtimeOnly 'org.xerial:sqlite-jdbc:3.45.3.0'
}
```

### 2. 부팅 클래스

```java
@SpringBootApplication(scanBasePackages = {
    "com.dongkuk.dmes.cactus",
    "com.dongkuk.dmes.mcm",
    "<사이트 패키지>"
})
@EnableJpaRepositories(basePackages = {"com.dongkuk.dmes.mcm", "<사이트>"})
@EntityScan(basePackages = {
    "com.dongkuk.dmes.cactus.security.auth",
    "com.dongkuk.dmes.mcm",
    "<사이트>"
})
public class SiteApplication { ... }
```

### 3. BPMN 복사

권한관리·메뉴·역할·즐겨찾기·코드·감사로그 BPMN 은 mcm-core 가 아니라 **사이트**가 보유한다. {CLIENT} 의 `mcm/api/src/main/resources/services/` 아래 다음을 자기 사이트로 복사한다.

- `csa/{name}/{name}.bpmn` — `commObjMng`, `commMenuMng`, `commRoleMng`, `commRoleGrpMng`, `commUserMng`, `commPermMng`, `commSyncMng`, `commUserRoleCopy`
- `security/secUser.bpmn`
- `roleManagement/secFavorite.bpmn`
- `code/secCodeGroup.bpmn`, `code/secCodeItem.bpmn`
- `audit/auditLog.bpmn`

OASIS `OasisController` 가 `camunda:class="xxxService"` 의 Spring bean name 으로 자동 매칭한다.

> 구 `roleManagement/{secObj,secRole,secPerm,secMenu,secUserRole}` + `rolegroup/secRoleGroup` 명명은 `csa/comm*Mng` 로 이관되었다. secUser 는 `security/`, 즐겨찾기는 `roleManagement/secFavorite` 로 남아 있다.

### 4. SecurityIdentity override

`mcm-core` 의 default `SpringSecurityIdentity` 대신 cactus `UserContextHolder` 기반을 등록:

```java
@Component
@Primary
public class CactusSecurityIdentity implements SecurityIdentity {
    @Override public String currentUserId() {
        UserInfo info = UserContextHolder.get();
        return (info != null) ? info.userId() : null;
    }
    @Override public boolean hasAuthority(String authority) { /* ... */ }
}
```

### 5. McmAuthService extends

{CLIENT} 처럼 cactus `AuthService` 를 상속해 ROLE_ prefix 처리:

```java
@Service
@Primary
public class SiteAuthService extends AuthService {
    private final SecUserRoleRepository secUserRoleRepository;
    // ... constructor + loadUserRoles override (com.dongkuk.dmes.mcm.security.repository 사용)
}
```

---

## 모드 B — cactus/oasis 미사용

### 1. 의존 추가 (cactus-core 한 줄 빠짐)

```gradle
dependencies {
    api 'com.dongkuk.dmes:mcm-core'        // ← 한 줄, 이게 전부

    api 'org.springframework.boot:spring-boot-starter-data-jpa'
    api 'org.springframework.boot:spring-boot-starter-security'
    api 'org.springframework.boot:spring-boot-starter-web'
    runtimeOnly 'org.xerial:sqlite-jdbc:3.45.3.0'
}
```

### 2. 부팅 클래스

```java
@SpringBootApplication(scanBasePackages = {
    "com.dongkuk.dmes.mcm",
    "<사이트 패키지>"
})
@EnableJpaRepositories(basePackages = {"com.dongkuk.dmes.mcm", "<사이트>"})
@EntityScan(basePackages = {"com.dongkuk.dmes.mcm", "<사이트>"})
public class SiteApplication { ... }
```

### 3. 자체 REST Controller

mcm-core 의 Service 를 자기 컨트롤러에서 직접 호출:

```java
@RestController
@RequestMapping("/api/sec-role")
public class SecRoleController {
    private final SecRoleService secRoleService;
    public SecRoleController(SecRoleService secRoleService) { this.secRoleService = secRoleService; }

    @PostMapping("/search")
    public List<SecRole> search(@RequestBody SecRoleSearchRequest req) {
        return secRoleService.searchRoles(req);
    }
    @PostMapping("/save")
    public int save(@RequestBody List<Map<String, Object>> master) {
        return secRoleService.saveRoles(master);
    }
}
```

같은 방식으로 SecPermController, SecRolePermController, SecMenuController, SecObjController, SecUserRoleController, SecFavoriteController, SecRoleGroupController, SecCodeGroupController, SecCodeItemController, AuditLogController 작성.

### 4. SecurityIdentity (default)

mcm-core 의 default `SpringSecurityIdentity` 가 그대로 동작 — Spring Security `SecurityContextHolder` 기반.
사이트가 SecurityFilterChain 만 표준 패턴으로 구성하면 됨.

---

## Flyway 마이그레이션

자동 적용 (mcm-core 가 `db/migration/sqlite/` 에 V1__init.sql, V2__role_group.sql, V3__audit_log.sql 보유).
사이트 특이 테이블은 **V100 부터** 새 prefix 로:

```
src/main/resources/db/migration/sqlite/
├── V100__site_user_ext.sql    ← 사이트 특이
├── V101__site_seed.sql
└── ...
```

---

## 사이트 특이사항 추가 패턴

### 빈 override

mcm-core 의 default Service 를 사이트가 교체할 때. OASIS BPMN `camunda:class="secRoleGroupService"` 는 Spring bean name 으로 매칭되므로, 사이트 빈이 `@Service @Primary` 면 자동으로 사이트 빈이 호출된다.

```java
@Service
@Primary
public class KsmRoleGroupService extends SecRoleGroupService {
    public KsmRoleGroupService(SecRoleGroupRepository g, SecRoleGroupRoleRepository r,
                               SecRoleGroupUserRepository u) {
        super(g, r, u);
    }

    @Override
    public int assignUsers(SecRoleGroupAssignRequest req) {
        validateAgainstErp(req.getUserIds());   // {CLIENT} 특이 룰 (예: ERP 직원 마스터 검증)
        return super.assignUsers(req);
    }
}
```

### 엔티티 확장

mcm-core 의 SecUser/SecRole 등에 컬럼을 추가하지 않고 별도 1:1 테이블로 확장한다. mcm-core Repository 와 사이트 확장 Repository 를 사이트 service 가 조립한다.

```sql
-- V100__site_user_ext.sql (사이트가 작성)
CREATE TABLE TB_{CLIENT}_USER_EXT (
    USER_ID    TEXT PRIMARY KEY,
    PLANT_CD   TEXT,
    DEPT_CD    TEXT
);
```

### 사이트 시드 데이터

`V100__site_seed.sql` 또는 `ApplicationRunner` 로 적재한다.

> mcm-core 는 `AutoConfiguration.imports` 로 자동 활성화되지만, cactus 사용 사이트는 빈 충돌 방지를 위해 `@SpringBootApplication(scanBasePackages=...)` 에 cactus·mcm-core 를 모두 명시하는 편이 안전하다(§2 부팅 클래스 참조).

---

## 검증 체크리스트

- [ ] `./gradlew dependencies` 로 cactus-core/oasis-core 0 hits (모드 B 만)
- [ ] 부팅 시 mcm-core 의 V1/V2/V3 마이그레이션이 자동 적용되어 테이블 생성
- [ ] 권한관리 화면 (사용자/롤/권한/메뉴/오브젝트) 동작
- [ ] 즐겨찾기 별 버튼 토글 동작
- [ ] 롤 그룹 일괄 부여 시 사용자가 effective ROLE 받음
- [ ] 마스터코드 그룹/항목 CRUD 동작
- [ ] 감사 로그 화면에서 권한 변경/롤 변경/사용자 변경 이력 조회 가능
