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

import java.time.LocalDateTime;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;

/**
 * perm-bench r0 — 옛 모델(legacy) {@link UserPermCache} 의 지금 거르기 규칙을 시험으로 고정한다.
 *
 * <p>고정하는 사실(2026-11-27, 기준 6dfcf8c3c):
 * <ul>
 *   <li>역할·역할 그룹의 USE_TP·유효 기간을 보지 않는다 — 역할·그룹 엔티티를 읽지 않고 매핑 ID 만 따라간다.</li>
 *   <li>오브젝트(SecObj)·퍼미션(SecPerm)의 USE_TP·유효 기간도 보지 않는다.</li>
 *   <li>SYSADMIN 특례 = {@code mcm.security.sysadmin-freepass=true} 일 때만 {@code ["*"]}. 기본은 매핑 그대로.
 *       역할 ID {@code SYSADMIN}·{@code ROLE_SYSADMIN} 둘 다 특례 대상.</li>
 *   <li>action 토큰 = COMMON·CUSTOM·POPUP_BTN·ACTION 네 칸 콤마 분할·trim·빈 값 제거·합집합.</li>
 *   <li>키 = {@code lower(SYSTEM_CODE ?: "mcm")/lower(OBJECT_ID)/lower(action)}.</li>
 *   <li>DB 에 없는 오브젝트·퍼미션을 가리키는 매핑은 건너뛴다.</li>
 * </ul>
 *
 * <p>결정 D35(조정자): v2 resolver 는 역할·그룹·오브젝트 USE_TP=N·유효 기간 밖을 뺀다 — 의도된 동작 변경.
 * 이 시험은 legacy 경로(perm-model=legacy)의 동작 기준이다.
 */
@ExtendWith(MockitoExtension.class)
class UserPermCacheCurrentRuleTest {

    @Mock SecUserMappingRepository userMapping;
    @Mock SecRoleGroupMappingRepository groupMapping;
    @Mock SecRoleMappingRepository roleMapping;
    @Mock SecObjRepository objRepo;
    @Mock SecPermRepository permRepo;

    private UserPermCache cache(boolean freepass) {
        return new UserPermCache(userMapping, groupMapping, roleMapping, objRepo, permRepo, freepass);
    }

    private static SecRoleMapping rm(String roleId, String objectId, String permissionId) {
        SecRoleMapping m = new SecRoleMapping();
        m.setRoleId(roleId);
        m.setObjectId(objectId);
        m.setPermissionId(permissionId);
        return m;
    }

    private static SecObj obj(String objectId, String systemCode, String useTp, LocalDateTime end) {
        SecObj o = new SecObj();
        o.setObjectId(objectId);
        o.setSystemCode(systemCode);
        o.setUseTp(useTp);
        o.setEndActiveDate(end);
        return o;
    }

    private static SecPerm perm(String id, String common, String custom, String popup, String action, String useTp) {
        SecPerm p = new SecPerm();
        p.setPermissionId(id);
        p.setPermissionCommon(common);
        p.setPermissionCustom(custom);
        p.setPopupBtn(popup);
        p.setPermissionAction(action);
        p.setUseTp(useTp);
        return p;
    }

    private void chain(String userId, String groupId, String roleId) {
        when(userMapping.findRoleGroupIdsByUserId(userId)).thenReturn(List.of(groupId));
        when(groupMapping.findRoleIdsByRoleGroupIdIn(List.of(groupId))).thenReturn(List.of(roleId));
    }

    @Test
    @DisplayName("오브젝트 USE_TP=N·유효 기간 지남 — 지금은 거르지 않고 키를 만든다")
    void unusedOrExpiredObject_notFiltered() {
        chain("u1", "G1", "R1");
        when(roleMapping.findByRoleIdIn(List.of("R1"))).thenReturn(List.of(rm("R1", "objOff", "P1")));
        when(objRepo.findAllById(any())).thenReturn(List.of(
                obj("objOff", "mcm", "N", LocalDateTime.of(2000, 1, 1, 0, 0))));
        when(permRepo.findAllById(any())).thenReturn(List.of(perm("P1", "search", null, null, null, "Y")));

        assertThat(cache(false).toKeyStrings("u1")).containsExactly("mcm/objoff/search");
    }

    @Test
    @DisplayName("퍼미션 USE_TP=N — 지금은 거르지 않는다")
    void unusedPerm_notFiltered() {
        chain("u1", "G1", "R1");
        when(roleMapping.findByRoleIdIn(List.of("R1"))).thenReturn(List.of(rm("R1", "objA", "P1")));
        when(objRepo.findAllById(any())).thenReturn(List.of(obj("objA", "mcm", "Y", null)));
        when(permRepo.findAllById(any())).thenReturn(List.of(perm("P1", "search", null, null, null, "N")));

        assertThat(cache(false).toKeyStrings("u1")).containsExactly("mcm/obja/search");
    }

    @Test
    @DisplayName("역할·그룹 USE_TP·유효 기간 — 생성자에 역할·그룹 저장소가 없어 볼 수 없다(매핑 ID 만 따라간다)")
    void roleAndGroupMeta_neverRead() {
        // 역할·그룹 엔티티 저장소(SecRoleRepository·SecRoleGroupRepository)는 의존성에 없다.
        // 매핑에 있으면 사용 여부와 무관하게 키가 만들어진다.
        assertThat(UserPermCache.class.getConstructors()[0].getParameterTypes())
                .doesNotContain(com.dongkuk.dmes.mcm.repository.SecRoleRepository.class,
                        com.dongkuk.dmes.mcm.repository.SecRoleGroupRepository.class);

        chain("u1", "G_OFF", "R_OFF");
        when(roleMapping.findByRoleIdIn(List.of("R_OFF"))).thenReturn(List.of(rm("R_OFF", "objA", "P1")));
        when(objRepo.findAllById(any())).thenReturn(List.of(obj("objA", "mcm", "Y", null)));
        when(permRepo.findAllById(any())).thenReturn(List.of(perm("P1", "save", null, null, null, "Y")));

        assertThat(cache(false).toKeyStrings("u1")).containsExactly("mcm/obja/save");
    }

    @Test
    @DisplayName("네 칸 토큰 합집합·trim·빈 값 제거, 대문자 action·objId 소문자, SYSTEM_CODE null → mcm")
    void tokens_union_and_keyShape() {
        chain("u1", "G1", "R1");
        when(roleMapping.findByRoleIdIn(List.of("R1"))).thenReturn(List.of(rm("R1", "MdmObj", "P1")));
        when(objRepo.findAllById(any())).thenReturn(List.of(obj("MdmObj", null, "Y", null)));
        when(permRepo.findAllById(any())).thenReturn(List.of(
                perm("P1", " search , ,save", "excelDown", "openPopup", "searchDetail,search", "Y")));

        assertThat(cache(false).toKeyStrings("u1")).containsExactly(
                "mcm/mdmobj/exceldown", "mcm/mdmobj/openpopup", "mcm/mdmobj/save",
                "mcm/mdmobj/search", "mcm/mdmobj/searchdetail");
    }

    @Test
    @DisplayName("SYSTEM_CODE 는 소문자로 모듈 자리에 쓴다")
    void systemCode_lowercased() {
        chain("u1", "G1", "R1");
        when(roleMapping.findByRoleIdIn(List.of("R1"))).thenReturn(List.of(rm("R1", "itemMng", "P1")));
        when(objRepo.findAllById(any())).thenReturn(List.of(obj("itemMng", " MDM ", "Y", null)));
        when(permRepo.findAllById(any())).thenReturn(List.of(perm("P1", "search", null, null, null, "Y")));

        assertThat(cache(false).toKeyStrings("u1")).containsExactly("mdm/itemmng/search");
    }

    @Test
    @DisplayName("DB 에 없는 오브젝트·퍼미션을 가리키는 매핑은 건너뛴다")
    void danglingMapping_skipped() {
        chain("u1", "G1", "R1");
        when(roleMapping.findByRoleIdIn(List.of("R1"))).thenReturn(List.of(
                rm("R1", "objA", "P1"), rm("R1", "ghostObj", "P1"), rm("R1", "objA", "GHOST_PERM")));
        when(objRepo.findAllById(any())).thenReturn(List.of(obj("objA", "mcm", "Y", null)));
        when(permRepo.findAllById(any())).thenReturn(List.of(perm("P1", "search", null, null, null, "Y")));

        assertThat(cache(false).toKeyStrings("u1")).containsExactly("mcm/obja/search");
    }

    @Test
    @DisplayName("여러 그룹이 같은 역할을 주어도 키는 한 번씩")
    void sameRoleViaTwoGroups_dedup() {
        when(userMapping.findRoleGroupIdsByUserId("u1")).thenReturn(List.of("G1", "G2"));
        when(groupMapping.findRoleIdsByRoleGroupIdIn(List.of("G1", "G2"))).thenReturn(List.of("R1", "R1"));
        when(roleMapping.findByRoleIdIn(List.of("R1", "R1"))).thenReturn(List.of(rm("R1", "objA", "P1")));
        when(objRepo.findAllById(any())).thenReturn(List.of(obj("objA", "mcm", "Y", null)));
        when(permRepo.findAllById(any())).thenReturn(List.of(perm("P1", "search", null, null, null, "Y")));

        assertThat(cache(false).toKeyStrings("u1")).containsExactly("mcm/obja/search");
    }

    @Test
    @DisplayName("SYSADMIN 기본(freepass=false) — 특례 없이 매핑 그대로. 매핑 없으면 빈 목록")
    void sysadmin_default_noSpecialCase() {
        chain("admin", "ROLE_GROUP_SYSADMIN", "SYSADMIN");
        when(roleMapping.findByRoleIdIn(List.of("SYSADMIN"))).thenReturn(List.of());

        assertThat(cache(false).toKeyStrings("admin")).isEmpty();
    }

    @Test
    @DisplayName("freepass=true — 역할 ID ROLE_SYSADMIN 도 와일드카드")
    void freepass_roleSysadminAlias() {
        chain("admin", "G_ADM", "ROLE_SYSADMIN");

        assertThat(cache(true).toKeyStrings("admin")).containsExactly("*");
    }

    @Test
    @DisplayName("freepass=true 라도 SYSADMIN 이 아니면 매핑 그대로")
    void freepass_nonSysadmin_mappingOnly() {
        // isSysadmin 판정과 build 가 같은 저장소를 각각 부른다.
        chain("u1", "G1", "R1");
        when(roleMapping.findByRoleIdIn(List.of("R1"))).thenReturn(List.of(rm("R1", "objA", "P1")));
        when(objRepo.findAllById(any())).thenReturn(List.of(obj("objA", "mcm", "Y", null)));
        when(permRepo.findAllById(any())).thenReturn(List.of(perm("P1", "search", null, null, null, "Y")));

        assertThat(cache(true).toKeyStrings("u1")).containsExactly("mcm/obja/search");
    }

    @Test
    @DisplayName("그룹은 있으나 역할 없음 → 빈 목록")
    void groupWithoutRole_empty() {
        when(userMapping.findRoleGroupIdsByUserId("u1")).thenReturn(List.of("G_EMPTY"));
        when(groupMapping.findRoleIdsByRoleGroupIdIn(List.of("G_EMPTY"))).thenReturn(List.of());

        assertThat(cache(false).toKeyStrings("u1")).isEmpty();
    }

    @Test
    @DisplayName("빈 userId → 빈 목록, 저장소를 부르지 않는다")
    void blankUser_empty() {
        assertThat(cache(false).toKeyStrings(" ")).isEmpty();
        assertThat(cache(false).toKeyStrings(null)).isEmpty();
    }
}
