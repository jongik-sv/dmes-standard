package com.dongkuk.dmes.mcm.security.service;

import com.dongkuk.dmes.mcm.audit.AuditLogger;
import com.dongkuk.dmes.mcm.audit.repository.AuditLogRepository;
import com.dongkuk.dmes.mcm.common.security.SecurityIdentity;
import com.dongkuk.dmes.mcm.csa.commUserMng.support.CommUserMngFixtures;
import com.dongkuk.dmes.mcm.csa.commUserMng.support.CommUserMngJpaTestConfig;
import com.dongkuk.dmes.mcm.csa.commUserMng.support.SqlStatementCounter;
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
 * 성능 근거 — {@link SecUserService#saveUsers} 'D' 분기의 역할그룹 매핑 삭제 SQL 수(perf-mcm.md P2).
 *
 * <p>매핑 3개씩 가진 사용자 2명을 한 요청에서 삭제하면 매핑 표(TB_MCM_SEC_USER_MAPPING) DELETE 는 사용자당 1회(2회),
 * 매핑 표 SELECT 는 0회여야 한다. 남은 매핑은 {@link SecUserServiceDeleteUsersTest} 가 고정하므로 여기서는 짧게만 본다.
 */
@SpringJUnitConfig(CommUserMngJpaTestConfig.class)
class SecUserServiceDeleteSqlCountTest {

    static final String MAPPING_TABLE = "TB_MCM_SEC_USER_MAPPING";

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
        accounts.put("U3", "사용자3");
        fx.mapping("U1", "RG1", "RG2", "RG3");
        fx.mapping("U2", "RG1", "RG2", "RG3");
        fx.mapping("U3", "RG1");
    }

    @Test
    @DisplayName("매핑 3개씩 가진 사용자 2명 삭제 — 매핑 DELETE 2회, 매핑 SELECT 0회")
    void bulkDeletePerUser() {
        SqlStatementCounter sql = SqlStatementCounter.INSTANCE;
        sql.reset();
        int count = tx.execute(s -> service.saveUsers(List.of(
                row("rowStatus", "D", "userId", "U1"),
                row("rowStatus", "D", "userId", "U2"))));
        List<String> seen = sql.statements();
        long deletes = sql.count("delete", MAPPING_TABLE);
        long selects = sql.count("select", MAPPING_TABLE);

        assertThat(count).isEqualTo(2);
        assertThat(fx.roleGroupIdsOf("U1")).isEmpty();
        assertThat(fx.roleGroupIdsOf("U2")).isEmpty();
        assertThat(fx.roleGroupIdsOf("U3")).containsExactly("RG1");
        assertThat(deletes).as("매핑 DELETE 수 — %s", seen).isEqualTo(2);
        assertThat(selects).as("매핑 SELECT 수 — %s", seen).isZero();
    }
}
