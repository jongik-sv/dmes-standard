package com.dongkuk.dmes.mcm.security.service;

import com.dongkuk.dmes.mcm.audit.AuditLogger;
import com.dongkuk.dmes.mcm.audit.repository.AuditLogRepository;
import com.dongkuk.dmes.mcm.common.security.SecurityIdentity;
import com.dongkuk.dmes.mcm.csa.commUserMng.support.CommUserMngFixtures;
import com.dongkuk.dmes.mcm.csa.commUserMng.support.CommUserMngJpaTestConfig;
import com.dongkuk.dmes.mcm.entity.SecUserMapping;
import com.dongkuk.dmes.mcm.repository.SecMenuFldLovRepository;
import com.dongkuk.dmes.mcm.repository.SecMenuRepository;
import com.dongkuk.dmes.mcm.repository.SecObjRepository;
import com.dongkuk.dmes.mcm.repository.SecPermRepository;
import com.dongkuk.dmes.mcm.repository.SecRoleGroupMappingRepository;
import com.dongkuk.dmes.mcm.repository.SecRoleMappingRepository;
import com.dongkuk.dmes.mcm.repository.SecUserMappingRepository;
import com.dongkuk.dmes.mcm.security.PasswordHasher;
import com.dongkuk.dmes.mcm.security.password.McmPasswordProperties;
import com.dongkuk.dmes.mcm.security.password.PasswordPolicyEvaluator;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.context.junit.jupiter.SpringJUnitConfig;
import org.springframework.transaction.support.TransactionTemplate;

import java.util.List;

import static com.dongkuk.dmes.mcm.csa.commUserMng.support.CommUserMngFixtures.row;
import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * {@link SecUserMappingRepository#bulkDeleteByUserId} 에 {@code flushAutomatically} 가 없어도
 * 같은 트랜잭션에서 flush 하지 않고 저장한 매핑이 'D' 행의 벌크 DELETE 보다 먼저 INSERT 되는지 고정하는 회귀 시험.
 *
 * <p>Hibernate 는 벌크 DELETE 실행 직전에 영향 표(TB_MCM_SEC_USER_MAPPING)에 미뤄 둔 변경이 있으면 auto-flush 한다.
 * 이 순서가 깨지면 INSERT 가 커밋 때 DELETE 뒤에 나가 RG9 매핑이 남는다.
 *
 * <p>구성은 {@link SecUserServiceDeleteUsersTest} 와 같다(매핑은 H2 실제 저장소, 계정 SPI 는 메모리 가짜).
 */
@SpringJUnitConfig(CommUserMngJpaTestConfig.class)
class SecUserServiceDeleteAutoFlushTest {

    @Autowired SecUserMappingRepository secUserMappingRepository;
    @Autowired CommUserMngFixtures fx;
    @Autowired TransactionTemplate tx;

    final SecUserServiceDeleteUsersTest.FakeUserAccountRepository accounts =
            new SecUserServiceDeleteUsersTest.FakeUserAccountRepository();
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
        fx.mapping("U1", "RG1", "RG2");
        fx.mapping("U2", "RG1");
    }

    @Test
    @DisplayName("같은 트랜잭션에서 flush 없이 저장한 매핑도 뒤이은 사용자 삭제의 벌크 DELETE 로 지워진다(INSERT → DELETE 순서)")
    void pendingInsertIsFlushedBeforeBulkDelete() {
        int count = tx.execute(s -> {
            SecUserMapping m = new SecUserMapping();
            m.setUserId("U1");
            m.setRoleGroupId("RG9");
            secUserMappingRepository.save(m); // flush 하지 않는다 — INSERT 는 영속성 컨텍스트에 미뤄진다
            return service.saveUsers(List.of(row("rowKey", "r1", "rowStatus", "D", "userId", "U1")));
        });

        assertThat(count).isEqualTo(1);
        assertThat(fx.roleGroupIdsOf("U1")).isEmpty();
        assertThat(accounts.existsById("U1")).isFalse();
        assertThat(fx.roleGroupIdsOf("U2")).containsExactly("RG1");
    }
}
