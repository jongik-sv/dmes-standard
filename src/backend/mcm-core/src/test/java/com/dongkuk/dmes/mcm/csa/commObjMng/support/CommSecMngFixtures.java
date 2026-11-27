package com.dongkuk.dmes.mcm.csa.commObjMng.support;

import com.dongkuk.dmes.mcm.entity.SecMenu;
import com.dongkuk.dmes.mcm.entity.SecObj;
import com.dongkuk.dmes.mcm.entity.SecRole;
import com.dongkuk.dmes.mcm.entity.SecRoleGroup;
import com.dongkuk.dmes.mcm.entity.SecRoleGroupMapping;
import com.dongkuk.dmes.mcm.entity.SecRoleMapping;
import com.dongkuk.dmes.mcm.entity.SecRolePerm;
import com.dongkuk.dmes.mcm.entity.SecUserMapping;
import com.dongkuk.dmes.mcm.repository.SecMenuRepository;
import com.dongkuk.dmes.mcm.repository.SecObjRepository;
import com.dongkuk.dmes.mcm.repository.SecPermRepository;
import com.dongkuk.dmes.mcm.repository.SecRoleGroupMappingRepository;
import com.dongkuk.dmes.mcm.repository.SecRoleGroupRepository;
import com.dongkuk.dmes.mcm.repository.SecRoleMappingRepository;
import com.dongkuk.dmes.mcm.repository.SecRolePermRepository;
import com.dongkuk.dmes.mcm.repository.SecRoleRepository;
import com.dongkuk.dmes.mcm.repository.SecUserMappingRepository;

import org.springframework.jdbc.core.JdbcTemplate;

import javax.sql.DataSource;
import java.time.LocalDateTime;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * 권한 관리 옛 화면 4종 서비스 시험의 자료 준비·정리. 저장소 표준 save 만 쓰므로 서비스 구현과 무관하다.
 */
public class CommSecMngFixtures {

    public static final LocalDateTime START = LocalDateTime.of(2026, 1, 1, 0, 0, 0);
    public static final LocalDateTime END = LocalDateTime.of(9999, 12, 31, 0, 0, 0);

    private final SecObjRepository secObjRepository;
    private final SecRoleRepository secRoleRepository;
    private final SecPermRepository secPermRepository;
    private final SecRoleMappingRepository secRoleMappingRepository;
    private final SecRoleGroupRepository secRoleGroupRepository;
    private final SecRoleGroupMappingRepository secRoleGroupMappingRepository;
    private final SecMenuRepository secMenuRepository;
    private final SecRolePermRepository secRolePermRepository;
    private final SecUserMappingRepository secUserMappingRepository;
    private final JdbcTemplate jdbc;

    public CommSecMngFixtures(SecObjRepository secObjRepository,
                              SecRoleRepository secRoleRepository,
                              SecPermRepository secPermRepository,
                              SecRoleMappingRepository secRoleMappingRepository,
                              SecRoleGroupRepository secRoleGroupRepository,
                              SecRoleGroupMappingRepository secRoleGroupMappingRepository,
                              SecMenuRepository secMenuRepository,
                              SecRolePermRepository secRolePermRepository,
                              SecUserMappingRepository secUserMappingRepository,
                              DataSource dataSource) {
        this.secObjRepository = secObjRepository;
        this.secRoleRepository = secRoleRepository;
        this.secPermRepository = secPermRepository;
        this.secRoleMappingRepository = secRoleMappingRepository;
        this.secRoleGroupRepository = secRoleGroupRepository;
        this.secRoleGroupMappingRepository = secRoleGroupMappingRepository;
        this.secMenuRepository = secMenuRepository;
        this.secRolePermRepository = secRolePermRepository;
        this.secUserMappingRepository = secUserMappingRepository;
        this.jdbc = new JdbcTemplate(dataSource);
    }

    /** 시험이 건드리는 표를 모두 비운다. 자식 표부터 지운다. 컨텍스트가 클래스 사이에 공유되므로 매 시험 앞에서 부른다. */
    public void clearAll() {
        secRolePermRepository.deleteAllInBatch();
        secUserMappingRepository.deleteAllInBatch();
        secRoleMappingRepository.deleteAllInBatch();
        secRoleGroupMappingRepository.deleteAllInBatch();
        secMenuRepository.deleteAllInBatch();
        jdbc.update("DELETE FROM MCMAPUSER.TB_MCM_SEC_MENU_FLD");
        secPermRepository.deleteAllInBatch();
        secRoleGroupRepository.deleteAllInBatch();
        secRoleRepository.deleteAllInBatch();
        secObjRepository.deleteAllInBatch();
    }

    public SecObj obj(String objectId, String useTp) {
        SecObj o = new SecObj();
        o.setObjectId(objectId);
        o.setObjectNm("오브젝트 " + objectId);
        o.setSystemCode("mcm");
        o.setUseTp(useTp);
        o.setStartActiveDate(START);
        o.setEndActiveDate(END);
        return secObjRepository.save(o);
    }

    /** 허용 값(BTN_PERM·POPUP_PERM, 콤마)을 가진 오브젝트. */
    public SecObj obj(String objectId, String useTp, String btnPerm, String popupPerm) {
        SecObj o = new SecObj();
        o.setObjectId(objectId);
        o.setObjectNm("오브젝트 " + objectId);
        o.setSystemCode("mcm");
        o.setUseTp(useTp);
        o.setBtnPerm(btnPerm);
        o.setPopupPerm(popupPerm);
        o.setStartActiveDate(START);
        o.setEndActiveDate(END);
        return secObjRepository.save(o);
    }

    /** 새 퍼미션 한 건(TB_MCM_SEC_ROLE_PERM). */
    public SecRolePerm rolePerm(String roleId, String objectId, String btnPerm, String popupPerm) {
        SecRolePerm p = new SecRolePerm();
        p.setRoleId(roleId);
        p.setObjectId(objectId);
        p.setBtnPerm(btnPerm);
        p.setPopupPerm(popupPerm);
        return secRolePermRepository.save(p);
    }

    /** 사용자 → 역할 그룹 한 줄(TB_MCM_SEC_USER_MAPPING). 사용자 행은 만들지 않는다(FK 없음). */
    public SecUserMapping userGroup(String userId, String roleGroupId) {
        SecUserMapping m = new SecUserMapping();
        m.setUserId(userId);
        m.setRoleGroupId(roleGroupId);
        return secUserMappingRepository.save(m);
    }

    public SecRole role(String roleId, String useTp) {
        SecRole r = new SecRole();
        r.setRoleId(roleId);
        r.setRoleNm("역할 " + roleId);
        r.setUseTp(useTp);
        r.setStartActiveDate(START);
        r.setEndActiveDate(END);
        return secRoleRepository.save(r);
    }

    public SecRoleGroup group(String roleGroupId, String useTp) {
        SecRoleGroup g = new SecRoleGroup();
        g.setRoleGroupId(roleGroupId);
        g.setRoleGroupNm("그룹 " + roleGroupId);
        g.setUseTp(useTp);
        return secRoleGroupRepository.save(g);
    }

    public SecRoleGroupMapping groupRole(String roleGroupId, String roleId) {
        SecRoleGroupMapping m = new SecRoleGroupMapping();
        m.setRoleGroupId(roleGroupId);
        m.setRoleId(roleId);
        return secRoleGroupMappingRepository.save(m);
    }

    /** 옛 매핑 한 줄(TB_MCM_SEC_ROLE_MAPPING). 옛 검사 유지 확인용. */
    public SecRoleMapping legacyMapping(String roleId, String objectId, String permissionId) {
        SecRoleMapping m = new SecRoleMapping();
        m.setRoleId(roleId);
        m.setObjectId(objectId);
        m.setPermissionId(permissionId);
        return secRoleMappingRepository.save(m);
    }

    public SecMenu menu(String menuId, String parentMenuId, String objectId) {
        SecMenu m = new SecMenu();
        m.setMenuId(menuId);
        m.setParentMenuId(parentMenuId);
        m.setMenuNm("메뉴 " + menuId);
        m.setMenuTp("WEB");
        m.setObjectId(objectId);
        m.setUseTp("Y");
        m.setMenuViewYn("Y");
        return secMenuRepository.save(m);
    }

    /** 메뉴 폴더 한 줄(TB_MCM_SEC_MENU_FLD). parentMenuId = null 이면 모듈(뿌리). 엔티티가 없어 JDBC 로 넣는다. */
    public void folder(String menuId, String parentMenuId, String menuSeq) {
        jdbc.update("INSERT INTO MCMAPUSER.TB_MCM_SEC_MENU_FLD (MENU_ID, MENU_NM, PARENT_MENU_ID, MENU_SEQ, USE_TP, MENU_VIEW_YN) "
                + "VALUES (?, ?, ?, ?, 'Y', 'Y')", menuId, "폴더 " + menuId, parentMenuId, menuSeq);
    }

    /** 키·값 차례로 받아 순서 있는 Map 을 만든다. */
    public static Map<String, Object> row(Object... kv) {
        Map<String, Object> m = new LinkedHashMap<>();
        for (int i = 0; i + 1 < kv.length; i += 2) {
            m.put((String) kv[i], kv[i + 1]);
        }
        return m;
    }
}
