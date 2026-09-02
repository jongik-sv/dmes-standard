package com.dongkuk.dmes.mcm.security.endpoint;

import com.dongkuk.dmes.mcm.entity.SecObj;
import com.dongkuk.dmes.mcm.entity.SecPerm;
import com.dongkuk.dmes.mcm.entity.SecRoleMapping;
import com.dongkuk.dmes.mcm.repository.SecObjRepository;
import com.dongkuk.dmes.mcm.repository.SecPermRepository;
import com.dongkuk.dmes.mcm.repository.SecRoleGroupMappingRepository;
import com.dongkuk.dmes.mcm.repository.SecRoleMappingRepository;
import com.dongkuk.dmes.mcm.repository.SecUserMappingRepository;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * {@link UserPermCache#toKeyStrings(String)} 단위 테스트 — BFF RBAC Phase 1.
 *
 * <p>검증: SYSADMIN 실키 열거(순수 RBAC 기본) / 브레이크글라스 시 ["*"] / 일반 사용자
 * module/objId/action 소문자 정렬 / 미매핑 → 빈 List. (2026-07-30 프리패스 제거)
 */
@ExtendWith(MockitoExtension.class)
class UserPermCacheTest {

    @Mock SecUserMappingRepository secUserMappingRepository;
    @Mock SecRoleGroupMappingRepository secRoleGroupMappingRepository;
    @Mock SecRoleMappingRepository secRoleMappingRepository;
    @Mock SecObjRepository secObjRepository;
    @Mock SecPermRepository secPermRepository;

    /** 기본 = 순수 RBAC (sysadmin-freepass=false). */
    private UserPermCache cache() {
        return cache(false);
    }

    private UserPermCache cache(boolean sysadminFreepass) {
        return new UserPermCache(secUserMappingRepository, secRoleGroupMappingRepository,
                secRoleMappingRepository, secObjRepository, secPermRepository, sysadminFreepass);
    }

    @Test
    @DisplayName("toKeyStrings — 브레이크글라스(freepass=true) 시에만 SYSADMIN 와일드카드 [\"*\"]")
    void sysadmin_wildcard_breakglass_only() {
        when(secUserMappingRepository.findRoleGroupIdsByUserId("admin"))
                .thenReturn(List.of("ROLE_GROUP_SYSADMIN"));
        when(secRoleGroupMappingRepository.findRoleIdsByRoleGroupIdIn(List.of("ROLE_GROUP_SYSADMIN")))
                .thenReturn(List.of("SYSADMIN"));

        assertThat(cache(true).toKeyStrings("admin")).containsExactly("*");
    }

    @Test
    @DisplayName("toKeyStrings — 순수 RBAC(기본) 은 SYSADMIN 도 실키 열거 (2026-07-30 프리패스 제거)")
    void sysadmin_real_keys_by_default() {
        when(secUserMappingRepository.findRoleGroupIdsByUserId("admin"))
                .thenReturn(List.of("ROLE_GROUP_SYSADMIN"));
        when(secRoleGroupMappingRepository.findRoleIdsByRoleGroupIdIn(List.of("ROLE_GROUP_SYSADMIN")))
                .thenReturn(List.of("SYSADMIN"));

        SecRoleMapping rm = mock(SecRoleMapping.class);
        when(rm.getObjectId()).thenReturn("commObjMng");
        when(rm.getPermissionId()).thenReturn("PERM_ALL");
        when(secRoleMappingRepository.findByRoleIdIn(List.of("SYSADMIN"))).thenReturn(List.of(rm));

        SecObj obj = mock(SecObj.class);
        when(obj.getObjectId()).thenReturn("commObjMng");
        when(obj.getSystemCode()).thenReturn("mcm");
        when(secObjRepository.findAllById(any())).thenReturn(List.of(obj));

        SecPerm perm = mock(SecPerm.class);
        when(perm.getPermissionId()).thenReturn("PERM_ALL");
        when(perm.getPermissionCommon()).thenReturn("search,save");
        when(secPermRepository.findAllById(any())).thenReturn(List.of(perm));

        assertThat(cache().toKeyStrings("admin"))
                .containsExactly("mcm/commobjmng/save", "mcm/commobjmng/search");
    }

    @Test
    @DisplayName("toKeyStrings — 일반 사용자: module/objId/action 소문자 정렬, serviceId 드롭")
    void normal_keys() {
        when(secUserMappingRepository.findRoleGroupIdsByUserId("test3"))
                .thenReturn(List.of("ROLE_GROUP_MCM_VIEWER"));
        when(secRoleGroupMappingRepository.findRoleIdsByRoleGroupIdIn(List.of("ROLE_GROUP_MCM_VIEWER")))
                .thenReturn(List.of("MCM_VIEWER"));

        SecRoleMapping rm = mock(SecRoleMapping.class);
        when(rm.getObjectId()).thenReturn("tcErrorList");
        when(rm.getPermissionId()).thenReturn("PERM_VIEW");
        when(secRoleMappingRepository.findByRoleIdIn(List.of("MCM_VIEWER"))).thenReturn(List.of(rm));

        SecObj obj = mock(SecObj.class);
        when(obj.getObjectId()).thenReturn("tcErrorList");
        when(obj.getSystemCode()).thenReturn("mcm");
        when(secObjRepository.findAllById(any())).thenReturn(List.of(obj));

        SecPerm perm = mock(SecPerm.class);
        when(perm.getPermissionId()).thenReturn("PERM_VIEW");
        when(perm.getPermissionCommon()).thenReturn("search");
        when(perm.getPermissionAction()).thenReturn("searchDetail");
        when(secPermRepository.findAllById(any())).thenReturn(List.of(perm));

        // serviceId("oasis") 드롭, camelCase objId/action 소문자화, 정렬
        assertThat(cache().toKeyStrings("test3"))
                .containsExactly("mcm/tcerrorlist/search", "mcm/tcerrorlist/searchdetail");
    }

    @Test
    @DisplayName("toKeyStrings — roleGroup 미매핑 사용자는 빈 List")
    void empty_user() {
        when(secUserMappingRepository.findRoleGroupIdsByUserId("ghost")).thenReturn(List.of());

        assertThat(cache().toKeyStrings("ghost")).isEmpty();
    }
}
