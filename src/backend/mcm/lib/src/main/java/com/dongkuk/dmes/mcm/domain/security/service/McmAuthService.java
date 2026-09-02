package com.dongkuk.dmes.mcm.domain.security.service;

import com.dongkuk.dmes.cactus.autoconfigure.CactusProperties;
import com.dongkuk.dmes.cactus.security.auth.AuthService;
import com.dongkuk.dmes.cactus.security.auth.PasswordEncoder;
import com.dongkuk.dmes.cactus.security.auth.SecUserRepository;
import com.dongkuk.dmes.cactus.security.jwt.JwtTokenProvider;
import com.dongkuk.dmes.mcm.repository.SecRoleGroupMappingRepository;
import com.dongkuk.dmes.mcm.repository.SecUserMappingRepository;
import org.springframework.context.annotation.Primary;
import org.springframework.stereotype.Service;

import java.util.List;

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
