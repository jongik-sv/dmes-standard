package com.dongkuk.dmes.mcm.security.service;

import com.dongkuk.dmes.mcm.audit.AuditLogger;
import com.dongkuk.dmes.mcm.audit.repository.AuditLogRepository;
import com.dongkuk.dmes.mcm.common.exception.BusinessException;
import com.dongkuk.dmes.mcm.common.security.SecurityIdentity;
import com.dongkuk.dmes.mcm.csa.commUserMng.support.CommUserMngFixtures;
import com.dongkuk.dmes.mcm.csa.commUserMng.support.CommUserMngJpaTestConfig;
import com.dongkuk.dmes.mcm.repository.SecMenuFldLovRepository;
import com.dongkuk.dmes.mcm.repository.SecMenuRepository;
import com.dongkuk.dmes.mcm.repository.SecObjRepository;
import com.dongkuk.dmes.mcm.repository.SecPermRepository;
import com.dongkuk.dmes.mcm.repository.SecRoleGroupMappingRepository;
import com.dongkuk.dmes.mcm.repository.SecRoleMappingRepository;
import com.dongkuk.dmes.mcm.repository.SecUserMappingRepository;
import com.dongkuk.dmes.mcm.security.PasswordHasher;
import com.dongkuk.dmes.mcm.security.TransientUserAccount;
import com.dongkuk.dmes.mcm.security.UserAccount;
import com.dongkuk.dmes.mcm.security.UserAccountRepository;
import com.dongkuk.dmes.mcm.security.password.McmPasswordProperties;
import com.dongkuk.dmes.mcm.security.password.PasswordPolicyEvaluator;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.context.junit.jupiter.SpringJUnitConfig;
import org.springframework.transaction.support.TransactionTemplate;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import static com.dongkuk.dmes.mcm.csa.commUserMng.support.CommUserMngFixtures.row;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * {@link SecUserService#saveUsers} 의 'D'(사용자 삭제) 분기 특성 테스트.
 *
 * <p>역할그룹 매핑(TB_MCM_SEC_USER_MAPPING)은 H2 실제 저장소, 사용자 계정 SPI({@link UserAccountRepository})는
 * 사이트 어댑터(cactus) 대신 메모리 가짜로 둔다. 다음 단계에서 매핑 건별 deleteById 를 벌크 삭제로 바꿔도
 * DB 에 남는 결과가 같아야 하므로 저장소 호출은 보지 않고 남은 매핑만 본다.
 *
 * <p>운영과 같이 saveUsers 호출 하나를 트랜잭션 하나로 감싼다(벌크 삭제는 트랜잭션이 있어야 돈다).
 */
@SpringJUnitConfig(CommUserMngJpaTestConfig.class)
class SecUserServiceDeleteUsersTest {

    @Autowired SecUserMappingRepository secUserMappingRepository;
    @Autowired CommUserMngFixtures fx;
    @Autowired TransactionTemplate tx;

    final FakeUserAccountRepository accounts = new FakeUserAccountRepository();
    SecUserService service;

    @BeforeEach
    void setUp() {
        fx.clearAll();
        SecurityIdentity identity = mock(SecurityIdentity.class);
        when(identity.currentUserId()).thenReturn("admin");
        PasswordHasher hasher = new PasswordHasher() {
            @Override public String encode(String raw) { return "H(" + raw + ")"; }
            @Override public boolean matches(String raw, String hashed) { return encode(raw).equals(hashed); }
        };
        service = new SecUserService(
                accounts,
                secUserMappingRepository,
                mock(SecRoleGroupMappingRepository.class),
                mock(SecRoleMappingRepository.class),
                mock(SecPermRepository.class),
                mock(SecMenuRepository.class),
                mock(SecMenuFldLovRepository.class),
                mock(SecObjRepository.class),
                hasher,
                identity,
                new AuditLogger(mock(AuditLogRepository.class), identity),
                new PasswordPolicyEvaluator(new McmPasswordProperties()),
                false);

        accounts.put("U1", "사용자1");
        accounts.put("U2", "사용자2");
        accounts.put("U3", "사용자3");
        fx.mapping("U1", "RG1", "RG2", "RG3");
        fx.mapping("U2", "RG1", "RG2");
        fx.mapping("U3", "RG3");
    }

    int save(List<Map<String, Object>> master) {
        return tx.execute(s -> service.saveUsers(master));
    }

    @Test
    @DisplayName("사용자 삭제 — 그 사용자의 역할그룹 매핑은 모두 지워지고 사용자도 지워진다. 다른 사용자 매핑은 남는다")
    void deleteRemovesAllMappingsOfThatUserOnly() {
        int count = save(List.of(row("rowKey", "r1", "rowStatus", "D", "userId", "U1")));

        assertThat(count).isEqualTo(1);
        assertThat(fx.roleGroupIdsOf("U1")).isEmpty();
        assertThat(accounts.existsById("U1")).isFalse();
        assertThat(fx.roleGroupIdsOf("U2")).containsExactly("RG1", "RG2");
        assertThat(fx.roleGroupIdsOf("U3")).containsExactly("RG3");
        assertThat(accounts.existsById("U2")).isTrue();
    }

    @Test
    @DisplayName("한 요청에서 여러 사용자 삭제 — 각자의 매핑만 지워진다")
    void deleteSeveralUsers() {
        int count = save(List.of(
                row("rowStatus", "D", "userId", "U1"),
                row("rowStatus", "D", "userId", "U3")));

        assertThat(count).isEqualTo(2);
        assertThat(fx.roleGroupIdsOf("U1")).isEmpty();
        assertThat(fx.roleGroupIdsOf("U3")).isEmpty();
        assertThat(fx.roleGroupIdsOf("U2")).containsExactly("RG1", "RG2");
        assertThat(accounts.ids()).containsExactly("U2");
    }

    @Test
    @DisplayName("매핑이 없는 사용자·없는 사용자도 삭제 건수로 센다, userId 가 비면 건너뛴다")
    void deleteWithoutMappingsAndBlank() {
        accounts.put("U4", "매핑없음");

        int count = save(List.of(
                row("rowStatus", "D", "userId", "U4"),
                row("rowStatus", "D", "userId", "GHOST"),
                row("rowStatus", "D", "userId", " "),
                row("rowStatus", "D")));

        assertThat(count).isEqualTo(2);
        assertThat(accounts.existsById("U4")).isFalse();
        assertThat(fx.roleGroupIdsOf("U1")).containsExactly("RG1", "RG2", "RG3");
        assertThat(fx.roleGroupIdsOf("U2")).containsExactly("RG1", "RG2");
        assertThat(fx.roleGroupIdsOf("U3")).containsExactly("RG3");
    }

    @Test
    @DisplayName("삽입·수정·삭제가 섞인 요청 — 각 행이 처리되고 삭제된 사용자의 매핑만 지워진다")
    void mixedRequest() {
        int count = save(List.of(
                row("rowKey", "r1", "rowStatus", "C", "userId", "NEWU", "userNm", "새사람", "userPass", "abcd1234",
                        "deptCd", "D01"),
                row("rowKey", "r2", "rowStatus", "U", "userId", "U2", "userNm", "고친이름"),
                row("rowKey", "r3", "rowStatus", "D", "userId", "U1"),
                row("rowKey", "r4", "rowStatus", "X", "userId", "U3")));

        assertThat(count).isEqualTo(3);
        UserAccount created = accounts.findById("NEWU").orElseThrow();
        assertThat(created.getUserNm()).isEqualTo("새사람");
        assertThat(created.getUserPass()).isEqualTo("H(abcd1234)");
        assertThat(created.getUseYn()).isEqualTo("Y");
        assertThat(created.getDeptCd()).isEqualTo("D01");
        assertThat(accounts.findById("U2").orElseThrow().getUserNm()).isEqualTo("고친이름");
        assertThat(accounts.existsById("U1")).isFalse();
        assertThat(accounts.existsById("U3")).isTrue();

        assertThat(fx.roleGroupIdsOf("U1")).isEmpty();
        assertThat(fx.roleGroupIdsOf("U2")).containsExactly("RG1", "RG2");
        assertThat(fx.roleGroupIdsOf("U3")).containsExactly("RG3");
        assertThat(fx.roleGroupIdsOf("NEWU")).isEmpty();
    }

    @Test
    @DisplayName("같은 요청에 검증 오류 행이 있으면 모든 행을 처리한 뒤 BusinessException — 트랜잭션이 롤백돼 매핑 삭제도 되돌려진다")
    void validationErrorRollsBackMappingDeletion() {
        assertThatThrownBy(() -> save(List.of(
                row("rowKey", "r1", "rowStatus", "D", "userId", "U1"),
                row("rowKey", "r2", "rowStatus", "C", "userId", " ", "userPass", "abcd1234"))))
                .isInstanceOf(BusinessException.class);

        // DB(매핑)는 롤백. 계정 SPI 는 이 테스트의 메모리 가짜라 롤백되지 않으므로 보지 않는다.
        assertThat(fx.roleGroupIdsOf("U1")).containsExactly("RG1", "RG2", "RG3");
        assertThat(fx.roleGroupIdsOf("U2")).containsExactly("RG1", "RG2");
    }

    /** 사이트 어댑터 대신 쓰는 메모리 계정 저장소 — 없는 ID 삭제는 조용히 무시(Spring Data deleteById 와 같다). */
    static final class FakeUserAccountRepository implements UserAccountRepository {
        private final Map<String, UserAccount> store = new LinkedHashMap<>();

        void put(String userId, String userNm) {
            TransientUserAccount a = new TransientUserAccount();
            a.setUserId(userId);
            a.setUserNm(userNm);
            a.setUseYn("Y");
            store.put(userId, a);
        }

        List<String> ids() { return new ArrayList<>(store.keySet()); }

        @Override public Optional<UserAccount> findById(String userId) { return Optional.ofNullable(store.get(userId)); }
        @Override public boolean existsById(String userId) { return store.containsKey(userId); }
        @Override public UserAccount save(UserAccount account) { store.put(account.getUserId(), account); return account; }
        @Override public void deleteById(String userId) { store.remove(userId); }
        @Override public List<UserAccount> findAll() { return new ArrayList<>(store.values()); }
    }
}
