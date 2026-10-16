# mcm-core 보안 — 보관한 사용자 관리 죽은 경로 (BE 리팩토링 2회차 F7)

이 폴더와 `archive/test/security/` 의 파일은 빌드·테스트에 들어가지 않는다. mcm-core 와 mcm 은 기본 sourceSets(`src/main/java`·`src/test/java`·`src/main/resources`)만 컴파일하고, `archive/` 는 그 밖에 있다. 이력을 남기려고 `git mv` 로 옮겼다.

근거 보드: `docs/refactor-be-2026-10/README.md` F7 · `docs/refactor-be-2026-10/findings.md` §F7.

## 왜 보관했나

`SecUserService` 의 `searchUsers`·`saveUsers`·`resetPassword` 는 동작하지 않는 죽은 경로였다.

- 호출 사슬: BPMN `secUser` 의 `search`·`save`·`resetPassword` 분기 → `SecUserService` → `UserAccountRepository` → mcm/lib `SecUserAccountRepositoryAdapter` → cactus `SecUserRepository`.
- cactus `SecUserRepository` 의 실제 `@Primary` 빈은 mcm/lib `domain/security/service/McmSecUserRepository` 다. 이 빈은 cactus 로그인(AuthService)이 쓰는 메서드만 구현한다.
  - `findAll()` 은 늘 빈 목록을 돌려준다. 그래서 `searchUsers` 는 늘 0건이었다.
  - `save()`·`deleteById()` 는 `UnsupportedOperationException` 을 던진다. 그래서 `saveUsers` 의 C·U·D 분기와 `resetPassword` 는 늘 실패했다.
- 호출자가 없다. FE·e2e·시드는 `secUser` 의 `myMenus`·`myMenusTree`·`myPermissions`·`myButtonEndpoints` 만 부른다. 다른 모듈(mdm·mls·mpp·mqc·mpn·aps-core·cactus-core) 의 main 코드에도 이 클래스들을 쓰는 곳이 없다.
- 실제 사용자 관리는 `csa/commUserMng/*` (`CommUserMngSaveService`·`CommUserMngPasswordService` 등) 가 맡는다.

살아 있는 읽기 경로는 그대로 둔다. `SecUserService` 의 `getMyMenus`·`getMyMenusTree`·`getMyPermissions`·`getMyButtonEndpoints`·`collectAncestorFolderIds` 와 그 helper, BPMN `secUser` 의 my* 네 분기다.

## 옮긴 파일 (from → to)

경로는 `src/backend/` 기준이다.

### mcm-core main → `mcm-core/archive/main/security/`

| 원래 위치 | 보관 위치 |
|---|---|
| `mcm-core/src/main/java/com/dongkuk/dmes/mcm/security/service/SecUserService.java` | `mcm-core/archive/main/security/SecUserService.java` (보관 전 원본 전체) |
| `mcm-core/src/main/java/com/dongkuk/dmes/mcm/security/dto/SecUserSearchRequest.java` | `mcm-core/archive/main/security/SecUserSearchRequest.java` |
| `mcm-core/src/main/java/com/dongkuk/dmes/mcm/security/TransientUserAccount.java` | `mcm-core/archive/main/security/TransientUserAccount.java` |
| `mcm-core/src/main/java/com/dongkuk/dmes/mcm/security/UserAccountRepository.java` | `mcm-core/archive/main/security/UserAccountRepository.java` |
| `mcm-core/src/main/java/com/dongkuk/dmes/mcm/security/UserAccount.java` | `mcm-core/archive/main/security/UserAccount.java` |
| `mcm-core/src/main/java/com/dongkuk/dmes/mcm/security/PasswordHasher.java` | `mcm-core/archive/main/security/PasswordHasher.java` |

`SecUserService.java` 는 원래 위치에 my* 읽기만 남긴 새 파일로 다시 만들었다. 생성자에서 죽은 경로만 쓰던 의존 4개(`UserAccountRepository`·`PasswordHasher`·`AuditLogger`·`PasswordPolicyEvaluator`)를 뺐다. `@Value("${mcm.security.sysadmin-freepass:false}")` 는 my* 경로가 쓰므로 남겼다.

### mcm-core test → `mcm-core/archive/test/security/`

`saveUsers` 의 'D'(사용자 삭제) 분기만 시험하던 특성·성능 테스트다.

| 원래 위치 | 보관 위치 |
|---|---|
| `mcm-core/src/test/java/com/dongkuk/dmes/mcm/security/service/SecUserServiceDeleteUsersTest.java` | `mcm-core/archive/test/security/SecUserServiceDeleteUsersTest.java` |
| `mcm-core/src/test/java/com/dongkuk/dmes/mcm/security/service/SecUserServiceDeleteAutoFlushTest.java` | `mcm-core/archive/test/security/SecUserServiceDeleteAutoFlushTest.java` |
| `mcm-core/src/test/java/com/dongkuk/dmes/mcm/security/service/SecUserServiceDeleteSqlCountTest.java` | `mcm-core/archive/test/security/SecUserServiceDeleteSqlCountTest.java` |

### mcm/lib 어댑터 → `mcm/archive/lib/src/main/java/com/dongkuk/dmes/mcm/adapter/`

cactus 타입을 위 SPI(`UserAccount`·`UserAccountRepository`·`PasswordHasher`)로 바꾸던 사이트 어댑터다. SPI 와 함께 쓰는 곳이 없어졌다.

| 원래 위치 | 보관 위치 |
|---|---|
| `mcm/lib/src/main/java/com/dongkuk/dmes/mcm/adapter/SecUserAccountRepositoryAdapter.java` | `mcm/archive/lib/src/main/java/com/dongkuk/dmes/mcm/adapter/SecUserAccountRepositoryAdapter.java` |
| `mcm/lib/src/main/java/com/dongkuk/dmes/mcm/adapter/SecUserAccountAdapter.java` | `mcm/archive/lib/src/main/java/com/dongkuk/dmes/mcm/adapter/SecUserAccountAdapter.java` |
| `mcm/lib/src/main/java/com/dongkuk/dmes/mcm/adapter/CactusPasswordHasherAdapter.java` | `mcm/archive/lib/src/main/java/com/dongkuk/dmes/mcm/adapter/CactusPasswordHasherAdapter.java` |

### mcm/api BPMN → `mcm/archive/api/src/main/resources/services/security/`

| 원래 위치 | 보관 위치 |
|---|---|
| `mcm/api/src/main/resources/services/security/secUser.bpmn` | `mcm/archive/api/src/main/resources/services/security/secUser.bpmn` (보관 전 원본 전체) |

`secUser.bpmn` 은 원래 위치에 다시 만들었다. `search`·`save`·`resetPassword` 의 흐름·serviceTask·endEvent 와 그 DI 모양·선을 뺐다. process id `secUser`, 게이트웨이 `actionGateway`(`input=action`), my* 네 분기는 그대로다. 없는 action 은 다른 분기처럼 기본 흐름 없이 OASIS 분기 실패 오류로 끝난다.

## 지운 메서드 — `SecUserMappingRepository.bulkDeleteByUserId`

위치: `mcm-core/src/main/java/com/dongkuk/dmes/mcm/repository/SecUserMappingRepository.java`. 호출자는 `saveUsers` 의 'D' 분기 하나뿐이었다. 인터페이스 메서드라 파일째 옮길 수 없어 원래 줄을 아래에 그대로 남긴다. 이 메서드만 쓰던 `import org.springframework.data.jpa.repository.Modifying;` 도 함께 지웠다. 차이 설명은 `docs/refactor-2026-10/perf-mcm.md` P2 에 있다.

보관 직전 원본(커밋 69c2f9ce2 기준) 64~98줄:

```java
    /**
     * 한 사용자의 역할그룹 매핑 전체를 DELETE 한 번으로 지운다 — 사용자 삭제(SecUserService 'D' 분기) 용.
     *
     * <p>JPQL 벌크 DELETE 라 엔티티를 읽지 않고 영속성 컨텍스트·엔티티 콜백을 거치지 않는다.
     * {@link SecUserMapping} 에는 {@code @PreRemove}·cascade·연관이 없고 감사 리스너는 PrePersist·PreUpdate 만 다루므로
     * 건별 {@code deleteById} 와 DB 결과가 같다. (파생 {@code deleteBy…} 는 행마다 읽고 지우므로 쓰지 않는다.)
     *
     * <ul>
     *   <li>{@code flushAutomatically} 는 쓰지 않는다 — Hibernate 가 벌크 DELETE 실행 직전에 영향 표(매핑 표)에 미뤄 둔
     *       변경이 있으면 스스로 auto-flush 하므로({@code StandardJdbcMutationExecutor} 의 {@code autoFlushIfRequired})
     *       같은 트랜잭션에서 앞서 저장한 매핑의 INSERT → 이 DELETE 순서가 지켜진다(SecUserServiceDeleteAutoFlushTest).
     *       'D' 행이 하나인 요청은 옛 경로(매핑 ID SELECT 뒤 건별 {@code deleteById})와 flush 시점·결과가 같다.
     *       'D' 행이 둘 이상이고 앞 'D' 사용자에게 매핑이 있었으면 달라진다 — 옛 경로는 {@code deleteById} 가 남긴
     *       매핑 DELETE(미뤄 둔 {@code em.remove}) 때문에 다음 'D' 행의 JPQL SELECT 에서 Hibernate 가 계정까지 전체 flush 했고,
     *       지금은 벌크 DELETE 가 바로 실행돼 매핑 표에 미뤄 둔 것이 없으므로 사용자 계정 변경이 커밋 때(또는 뒤 'C' 행의
     *       {@code existsById} 계정 count 쿼리가 계정 표 auto-flush 를 일으키는 시점) 나간다.
     *       그래서 같은 요청에서 고친('U') 계정의 VER 이 옛 경로와 다르게 오르고 U_AT 도 다르다 — 예를 들어 'U' 행 뒤에
     *       'D' 행이 둘 이상 오면 옛 경로의 +2 대신 ('U' 행 뒤에 오는 'D' 행 수 + 1) 만큼 오른다
     *       (Hibernate 는 '필요 없음' 으로 끝나는 auto-flush 검사에서도 dirty 엔티티의 {@code @PreUpdate} 를 부른다).
     *       계정 INSERT·UPDATE·DELETE 의 DB 오류도 {@code saveUsers} 안의 두 번째 'D' 행이 아니라 그 뒤 시점에 난다.
     *       이 save 를 부르는 화면이 아직 없어 그대로 두며, 차이 설명은 docs/refactor-2026-10/perf-mcm.md P2 에 있다.</li>
     *   <li>{@code clearAutomatically} 는 쓰지 않는다 — 호출하는 {@code saveUsers}(secUser.bpmn saveTask) 는 이 삭제 뒤
     *       같은 트랜잭션에서 매핑을 다시 읽지 않고, 비우면 같은 영속성 단위의 다른 관리 엔티티(사이트 어댑터의 사용자 등)까지
     *       분리돼 버린다. 이 메서드를 새로 쓰는 곳이 삭제 뒤 매핑 엔티티를 다시 읽는다면 그쪽에서 판단한다.
     *       특히 같은 트랜잭션에서 이 사용자의 매핑을 미리 읽어 두었다면, 벌크 삭제 뒤 같은 PK 로 다시 저장할 때 지워진 행에
     *       UPDATE 가 나가 {@code StaleStateException} 으로 실패하므로 그 호출부에서 {@code em.clear}·{@code detach} 를 판단한다.
     *       (이는 새 인스턴스를 save 해 {@code merge} 가 관리 인스턴스를 dirty 로 만드는 경우다. 미리 읽어 둔 관리 인스턴스를
     *       그대로 다시 save 하면 dirty 가 아니어서 UPDATE·INSERT 가 나가지 않고, 다시 넣으려던 행이 오류 없이 사라진다.)</li>
     * </ul>
     *
     * @return 지운 행 수
     */
    @Modifying
    @Query("DELETE FROM SecUserMapping m WHERE m.userId = :userId")
    int bulkDeleteByUserId(@Param("userId") String userId);
```

## 남은 후속

- `mcm-core/src/main/java/com/dongkuk/dmes/mcm/audit/AuditLogger.java` 는 main 코드에서 쓰는 곳이 없어졌다(유일한 사용처가 `saveUsers`·`resetPassword` 였다). F7 승인 목록에 없어 그대로 두었다.
- `McmSecurityDefaults` 의 `secUser/save`·`secUser/resetPassword` SYSADMIN matcher 정리는 별도 커밋에서 한다.
