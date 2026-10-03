package com.dongkuk.dmes.mcm.csa.commUserMng.support;

import com.dongkuk.dmes.mcm.audit.repository.AuditLogRepository;
import com.dongkuk.dmes.mcm.entity.DeptInfo;
import com.dongkuk.dmes.mcm.entity.SecRoleGroup;
import com.dongkuk.dmes.mcm.entity.SecRoleGroupMapping;
import com.dongkuk.dmes.mcm.entity.SecUser;
import com.dongkuk.dmes.mcm.entity.SecUserMapping;
import com.dongkuk.dmes.mcm.entity.SecUserPwd;
import com.dongkuk.dmes.mcm.repository.DeptInfoRepository;
import com.dongkuk.dmes.mcm.repository.SecRoleGroupMappingRepository;
import com.dongkuk.dmes.mcm.repository.SecRoleGroupRepository;
import com.dongkuk.dmes.mcm.repository.SecUserHisRepository;
import com.dongkuk.dmes.mcm.repository.SecUserMappingRepository;
import com.dongkuk.dmes.mcm.repository.SecUserPwdRepository;
import com.dongkuk.dmes.mcm.repository.SecUserRepository;
import com.dongkuk.dmes.mcm.repository.SecUserRollHisRepository;
import org.springframework.stereotype.Component;

import java.time.LocalDateTime;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 특성 테스트 공통 데이터 준비·정리. 저장소의 표준 save 만 쓰므로 서비스 구현과 무관하다.
 * 저장은 저장소 호출마다 짧은 트랜잭션으로 끝나고, 테스트에서 다시 읽을 때도 새 영속성 컨텍스트로 읽힌다.
 */
@Component
public class CommUserMngFixtures {

    private final SecUserRepository secUserRepository;
    private final SecUserMappingRepository secUserMappingRepository;
    private final SecUserPwdRepository secUserPwdRepository;
    private final SecUserHisRepository secUserHisRepository;
    private final SecUserRollHisRepository secUserRollHisRepository;
    private final DeptInfoRepository deptInfoRepository;
    private final SecRoleGroupRepository secRoleGroupRepository;
    private final SecRoleGroupMappingRepository secRoleGroupMappingRepository;
    private final AuditLogRepository auditLogRepository;

    public CommUserMngFixtures(SecUserRepository secUserRepository,
                               SecUserMappingRepository secUserMappingRepository,
                               SecUserPwdRepository secUserPwdRepository,
                               SecUserHisRepository secUserHisRepository,
                               SecUserRollHisRepository secUserRollHisRepository,
                               DeptInfoRepository deptInfoRepository,
                               SecRoleGroupRepository secRoleGroupRepository,
                               SecRoleGroupMappingRepository secRoleGroupMappingRepository,
                               AuditLogRepository auditLogRepository) {
        this.secUserRepository = secUserRepository;
        this.secUserMappingRepository = secUserMappingRepository;
        this.secUserPwdRepository = secUserPwdRepository;
        this.secUserHisRepository = secUserHisRepository;
        this.secUserRollHisRepository = secUserRollHisRepository;
        this.deptInfoRepository = deptInfoRepository;
        this.secRoleGroupRepository = secRoleGroupRepository;
        this.secRoleGroupMappingRepository = secRoleGroupMappingRepository;
        this.auditLogRepository = auditLogRepository;
    }

    /** 테스트가 건드리는 모든 테이블을 비운다. 컨텍스트가 테스트 클래스 사이에 공유되므로 매 테스트 앞에서 부른다. */
    public void clearAll() {
        secUserMappingRepository.deleteAllInBatch();
        secUserRollHisRepository.deleteAllInBatch();
        secUserHisRepository.deleteAllInBatch();
        secUserPwdRepository.deleteAllInBatch();
        secUserRepository.deleteAllInBatch();
        deptInfoRepository.deleteAllInBatch();
        secRoleGroupMappingRepository.deleteAllInBatch();
        secRoleGroupRepository.deleteAllInBatch();
        auditLogRepository.deleteAllInBatch();
    }

    /** 사용자 한 명. 나머지 컬럼은 {@link #user(SecUser)} 로 직접 채워 저장한다. */
    public SecUser user(String userId, String deptCd, LocalDateTime startActiveDate) {
        SecUser u = new SecUser();
        u.setUserId(userId);
        u.setUserEmpNo("E" + userId);
        u.setUserNm("이름" + userId);
        u.setDeptCd(deptCd);
        u.setStartActiveDate(startActiveDate);
        u.setEndActiveDate(LocalDateTime.of(9999, 12, 31, 0, 0));
        u.setUseTp("Y");
        u.setInOutEmpTp("I");
        return secUserRepository.save(u);
    }

    public SecUser user(SecUser u) {
        return secUserRepository.save(u);
    }

    public DeptInfo dept(String deptCd, String deptNm, String useTp) {
        DeptInfo d = new DeptInfo();
        d.setDeptCd(deptCd);
        d.setDeptNm(deptNm);
        d.setUseTp(useTp);
        return deptInfoRepository.save(d);
    }

    public SecRoleGroup roleGroup(String roleGroupId, String roleGroupNm, String useTp,
                                  LocalDateTime start, LocalDateTime end) {
        SecRoleGroup g = new SecRoleGroup();
        g.setRoleGroupId(roleGroupId);
        g.setRoleGroupNm(roleGroupNm);
        g.setUseTp(useTp);
        g.setStartActiveDate(start);
        g.setEndActiveDate(end);
        return secRoleGroupRepository.save(g);
    }

    /** 사용자↔역할그룹 매핑 (TB_MCM_SEC_USER_MAPPING). */
    public void mapping(String userId, String... roleGroupIds) {
        for (String rg : roleGroupIds) {
            SecUserMapping m = new SecUserMapping();
            m.setUserId(userId);
            m.setRoleGroupId(rg);
            secUserMappingRepository.save(m);
        }
    }

    /** 역할그룹↔역할 매핑 (TB_MCM_SEC_ROLEGROUP_MAPPING) — RoleChangedEvent 의 역할 ID 원천. */
    public void roleGroupRoles(String roleGroupId, String... roleIds) {
        for (String roleId : roleIds) {
            SecRoleGroupMapping m = new SecRoleGroupMapping();
            m.setRoleGroupId(roleGroupId);
            m.setRoleId(roleId);
            secRoleGroupMappingRepository.save(m);
        }
    }

    public SecUserPwd pwd(String userId, String encPwd, String ssoPwd) {
        SecUserPwd p = new SecUserPwd();
        p.setUserId(userId);
        p.setUserEncPwd(encPwd);
        p.setUserSsoPwd(ssoPwd);
        return secUserPwdRepository.save(p);
    }

    /** 비밀번호 두 컬럼 밖의 네 컬럼(SALT·마지막 변경일·임시 비밀번호·임시 만료일)까지 채운 행. 초 단위 시각만 쓴다. */
    public SecUserPwd pwd(String userId, String encPwd, String ssoPwd,
                          String salt, LocalDateTime lastPwdChngDate,
                          String encTempPwd, LocalDateTime tempPwdExpirationDate) {
        SecUserPwd p = new SecUserPwd();
        p.setUserId(userId);
        p.setUserEncPwd(encPwd);
        p.setUserSsoPwd(ssoPwd);
        p.setSalt(salt);
        p.setLastPwdChngDate(lastPwdChngDate);
        p.setUserEncTempPwd(encTempPwd);
        p.setTempPwdExpirationDate(tempPwdExpirationDate);
        return secUserPwdRepository.save(p);
    }

    /** 사용자에게 남은 역할그룹 ID (정렬). */
    public List<String> roleGroupIdsOf(String userId) {
        return secUserMappingRepository.findAll().stream()
                .filter(m -> userId.equals(m.getUserId()))
                .map(SecUserMapping::getRoleGroupId)
                .sorted()
                .toList();
    }

    /** 키·값을 번갈아 받아 순서 있는 행 맵을 만든다. */
    public static Map<String, Object> row(Object... kv) {
        Map<String, Object> m = new LinkedHashMap<>();
        for (int i = 0; i < kv.length; i += 2) {
            m.put((String) kv[i], kv[i + 1]);
        }
        return m;
    }
}
