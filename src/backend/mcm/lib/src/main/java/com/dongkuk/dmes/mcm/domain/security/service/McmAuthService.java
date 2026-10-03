package com.dongkuk.dmes.mcm.domain.security.service;

import com.dongkuk.dmes.cactus.autoconfigure.CactusProperties;
import com.dongkuk.dmes.cactus.security.auth.AuthService;
import com.dongkuk.dmes.cactus.security.auth.LoginRequest;
import com.dongkuk.dmes.cactus.security.auth.PasswordEncoder;
import com.dongkuk.dmes.cactus.security.auth.SecUserRepository;
import com.dongkuk.dmes.cactus.security.jwt.JwtTokenProvider;
import com.dongkuk.dmes.mcm.common.audit.McmAuditStatementInspector;
import com.dongkuk.dmes.mcm.repository.SecRoleGroupMappingRepository;
import com.dongkuk.dmes.mcm.repository.SecUserMappingRepository;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import org.hibernate.Session;
import org.springframework.context.annotation.Primary;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.sql.Statement;
import java.util.List;
import java.util.Map;

/**
 * mcm용 AuthService — JWT 의 {@code ROLE_{roleId}} 클레임 빌드.
 *
 * <p>Phase R5 재작성 (2026-06-01) — legacy {@code SecUserRoleRepository} (USER → ROLE 직접 매핑) 제거,
 * 신규 W1~W9 RBAC chain (USER → SecUserMapping → ROLE_GROUP → SecRoleGroupMapping → ROLE) 으로 swap.
 *
 * <p>JWT 클레임 형식은 동일 ({@code "ROLE_" + roleId}). 로그인 시 사용자가 소속된 RoleGroup 들의
 * 모든 Role 을 클레임으로 부여.
 */
@Service
@Primary
public class McmAuthService extends AuthService {

    private final SecUserMappingRepository secUserMappingRepository;
    private final SecRoleGroupMappingRepository secRoleGroupMappingRepository;

    @PersistenceContext(unitName = "default")
    private EntityManager entityManager;

    public McmAuthService(JwtTokenProvider tokenProvider,
                          PasswordEncoder passwordEncoder,
                          SecUserRepository secUserRepository,
                          CactusProperties properties,
                          SecUserMappingRepository secUserMappingRepository,
                          SecRoleGroupMappingRepository secRoleGroupMappingRepository) {
        super(tokenProvider, passwordEncoder, secUserRepository, properties);
        this.secUserMappingRepository = secUserMappingRepository;
        this.secRoleGroupMappingRepository = secRoleGroupMappingRepository;
    }

    /**
     * 로그인 — 로컬 SQLite 에서는 트랜잭션 첫 문장으로 쓰기 잠금을 먼저 잡는다(2026-10-03).
     *
     * <p>cactus {@link AuthService#login} 은 한 트랜잭션에서 사용자를 읽고(SHARED) 비밀번호 검증 뒤 PWD_FAIL_COUNT 를 쓴다.
     * 그사이 다른 연결(RevokedTokenPurger DELETE·다른 로그인)이 커밋하려고 PENDING 에 들어가면, SQLite 는 승격하려는 이쪽에
     * busy handler 없이 바로 SQLITE_BUSY 를 돌려준다(교착 회피) → 500 → 포털 401. 쓰기부터 시작하면 잠금을 못 얻을 때
     * busy handler(드라이버 기본 3초)로 기다리므로 교착이 생기지 않는다. 풀 전체를 IMMEDIATE 로 바꾸지 않고 이 경로만 고친다.
     * Oracle·PostgreSQL(isSqlite=false)에서는 아무 문장도 내지 않는다.
     */
    @Override
    @Transactional
    public Map<String, Object> login(LoginRequest request) {
        lockForWriteIfSqlite(entityManager);
        return super.login(request);
    }

    /**
     * SQLite 일 때만 지금 트랜잭션에서 쓰기 잠금(RESERVED)을 잡는다 — 바뀌는 행이 없는 UPDATE 도 쓰기 트랜잭션을 연다.
     * statement inspector(감사 컬럼·스키마 접두 변환)를 거치지 않게 JDBC 로 직접 낸다.
     */
    static void lockForWriteIfSqlite(EntityManager em) {
        if (!McmAuditStatementInspector.isSqlite()) return;
        em.unwrap(Session.class).doWork(c -> {
            try (Statement s = c.createStatement()) {
                s.executeUpdate("UPDATE TB_MCM_SEC_USER SET PWD_FAIL_COUNT = PWD_FAIL_COUNT WHERE 0");
            }
        });
    }

    @Override
    protected List<String> loadUserRoles(String userId) {
        List<String> roleGroupIds = secUserMappingRepository.findRoleGroupIdsByUserId(userId);
        if (roleGroupIds == null || roleGroupIds.isEmpty()) return List.of();
        List<String> roleIds = secRoleGroupMappingRepository.findRoleIdsByRoleGroupIdIn(roleGroupIds);
        if (roleIds == null || roleIds.isEmpty()) return List.of();
        return roleIds.stream()
                .distinct()
                .map(roleId -> "ROLE_" + roleId)
                .toList();
    }
}
