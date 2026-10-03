/*
 * 작성자: @junhwan-park
 * 작성일: 2026-06-01
 * 내용: commUserMng OASIS BPMN serviceTask entry point — 11 action (W5)
 *       searchCmUser / saveCmUser / regCmUser / deleteCmUser / reRegCmUser / searchUserRoleGrp /
 *       saveUserRoleGrp / searchRoleGrp / pwdinit / saveUserRoleGrpCopy / commonUserDept
 */
package com.dongkuk.dmes.mcm.csa.commUserMng.service;

import com.dongkuk.dmes.mcm.common.audit.McmAuditStatementInspector;
import com.dongkuk.dmes.mcm.common.event.RoleChangedEvent;
import com.dongkuk.dmes.mcm.csa.commUserMng.dto.CommUserMngDeptRequest;
import com.dongkuk.dmes.mcm.csa.commUserMng.dto.CommUserMngPwdInitRequest;
import com.dongkuk.dmes.mcm.csa.commUserMng.dto.CommUserMngRoleCopyRequest;
import com.dongkuk.dmes.mcm.csa.commUserMng.dto.CommUserMngSearchDeptLovRequest;
import com.dongkuk.dmes.mcm.csa.commUserMng.dto.CommUserMngSearchRequest;
import com.dongkuk.dmes.mcm.csa.commUserMng.dto.CommUserMngUserIdRequest;
import com.dongkuk.dmes.mcm.entity.DeptInfo;
import com.dongkuk.dmes.mcm.entity.SecUser;
import com.dongkuk.dmes.mcm.entity.SecUserHis;
import com.dongkuk.dmes.mcm.entity.SecUserMapping;
import com.dongkuk.dmes.mcm.entity.SecUserPwd;
import com.dongkuk.dmes.mcm.entity.SecUserRollHis;
import com.dongkuk.dmes.mcm.repository.DeptInfoRepository;
import com.dongkuk.dmes.mcm.repository.SecRoleGroupMappingRepository;
import com.dongkuk.dmes.mcm.repository.SecUserHisRepository;
import com.dongkuk.dmes.mcm.repository.SecUserMappingRepository;
import com.dongkuk.dmes.mcm.repository.SecUserPwdRepository;
import com.dongkuk.dmes.mcm.repository.SecUserRepository;
import com.dongkuk.dmes.mcm.repository.SecUserRollHisRepository;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import static com.dongkuk.dmes.mcm.common.util.McmValues.strOf;
import static com.dongkuk.dmes.mcm.common.util.McmValues.parseLocalDateTime;

/**
 * commUserMng — OASIS BPMN serviceTask entry point (W5 / csa 9 화면 5번째).
 *
 * <p>Spring bean name {@code commUserMngService} → BPMN {@code <camunda:class>commUserMngService</camunda:class>}.
 *
 * <p>BPMN action 11 (As-Is 11 → To-Be 11 — 분석 §1 / §8 / BPMN설계서):
 * <ol>
 *   <li>{@code searchCmUser}        → {@link #searchCmUser(CommUserMngSearchRequest)} — 메인 사용자 그리드 조회 + ds_mainAll 후속</li>
 *   <li>{@code saveCmUser}          → {@link #saveCmUser(List)} — 메인 그리드 저장 (status="updated" 분기만)</li>
 *   <li>{@code regCmUser}           → {@link #regCmUser(List)} — 계정 생성 (insertCommUser + mergeCommonPwdInit + 이력)</li>
 *   <li>{@code deleteCmUser}        → {@link #deleteCmUser(List)} — 계정 삭제 (END_ACTIVE_DATE 마감 + 이력)</li>
 *   <li>{@code reRegCmUser}         → {@link #reRegCmUser(List)} — 계정 재생성 (단건 처리)</li>
 *   <li>{@code searchUserRoleGrp}   → {@link #searchUserRoleGrp(CommUserMngUserIdRequest)} — 선택 사용자 보유 역할그룹</li>
 *   <li>{@code saveUserRoleGrp}     → {@link #saveUserRoleGrp(List)} — 역할그룹 추가/삭제 + 이력</li>
 *   <li>{@code searchRoleGrp}       → {@link #searchRoleGrp(CommUserMngUserIdRequest)} — 추가 가능 역할그룹 조회</li>
 *   <li>{@code pwdinit}             → {@link #pwdinit(CommUserMngPwdInitRequest, List)} — 비밀번호/SSO 초기화</li>
 *   <li>{@code saveUserRoleGrpCopy} → {@link #saveUserRoleGrpCopy(CommUserMngRoleCopyRequest)} — 역할그룹 복사</li>
 *   <li>{@code commonUserDept}      → {@link #commonUserDept(CommUserMngDeptRequest)} — 부서 팝업 조회</li>
 *   <li>{@code searchDeptLov}       → {@link #searchDeptLov(CommUserMngSearchDeptLovRequest)} — Detail 부서 LoV 모달
 *       (2026-06-04 신설 / 사용자 결정 — 직접 타이핑 ✗, 검색 버튼 + 모달 선택 → DEPT_CD/DEPT_NM 자동 세트.
 *       commRoleMng round-3 의 searchObjectLov 정합 패턴.)</li>
 * </ol>
 *
 * <p>가이드 §6-B (트랜잭션 / Proxy 안티패턴) — 본 Service 에 {@code @Transactional} ✗.
 * OASIS executor {@code SpringTransactionHandler} 가 BPMN process 단위로 자동 wrap.
 *
 * <p>To-Be 정책:
 * <ul>
 *   <li>#1 — Entity 모듈 직속, schema=MCMAPUSER, McmAuditEntity 자동</li>
 *   <li>#2 / Q-002 — DEPT_NM = DeptInfoRepository 별도 조회 (As-Is EAI scalar subquery 폐기)</li>
 *   <li>#3 (B) — As-Is 미사용 SQL 5종 폐기</li>
 *   <li>#3 (C) — TB_MCM_SEC_USER_HIS / ROLL_HIS 외부 Mapper → JPA Entity 흡수 (별도 Mapper.xml ✗)</li>
 *   <li>#3 (D) / Q-005 — D-013~015 GROUP_ID 콤보 미반영 (DB 보존만)</li>
 *   <li>#3 (E) / Q-014 — Grid STATUS row state AG Grid 자연 흡수</li>
 *   <li>#3 (F) — 본 화면 비밀번호 정책 외부화는 기존 mcm-core McmPasswordProperties 보존 (별도 신규 properties 본 cycle 미도입)</li>
 *   <li>#6 (A) — Entity 직역 (SecUser/SecUserMapping/SecUserPwd/SecUserHis/SecUserRollHis/DeptInfo)</li>
 * </ul>
 *
 * <p>BPMN definition: {@code services/csa/commUserMng/commUserMng.bpmn}.
 */
@Service("commUserMngService")
public class CommUserMngService {

    private static final Logger log = LoggerFactory.getLogger(CommUserMngService.class);

    /**
     * As-Is xfdl:863 행추가 default {@code "99991231"} 8자 (ST-002) → As-Is Mapper insertCommUser:90~95
     * `#{START_ACTIVE_DATE}` / `#{END_ACTIVE_DATE}` 직접 바인딩 (TO_DATE 변환 ✗) → Oracle DATE 자동 변환 시
     * 시분초 = 00:00:00. AsIs DB 저장 결과 = {@code 9999-12-31 00:00:00}.
     *
     * <p>2026-06-02 iter#3 — 사용자 검수 J-011 결과 23:59:59 → **00:00:00 정정** (AsIs 1:1 정합).
     * 모든 START_ACTIVE_DATE / END_ACTIVE_DATE 도 yyyy-MM-dd 입력값 → atStartOfDay (00:00:00).
     */
    private static final LocalDateTime END_OF_TIME =
            LocalDateTime.of(9999, 12, 31, 0, 0, 0);

    /**
     * 신규 계정 생성·비밀번호 초기화 시 부여하는 초기 비밀번호.
     *
     * <p><b>실 프로젝트 착수 시 반드시 바꾼다.</b> 지금은 소스 상수라 값이 저장소에 노출되므로,
     * 운영 적용 전에 설정({@code mcm.password.initial}) 또는 시크릿 저장소로 외부화하고
     * 최초 로그인 시 변경 강제(비밀번호 만료 정책)와 함께 쓴다.
     *
     * <p>2026-09-28 — {@link #pwdinit} 가 이 값을 {@code INIT_PWD} 응답으로 되돌려 관리자 화면의
     * "초기 비밀번호" 팝업에 표시한다(사용자 요청 / 기능설계서 M-032 — As-Is {@code pwdtmp} 콜백 대체).
     * 값이 화면에 노출되는 경로가 생겼으므로 외부화 과제의 우선순위는 오히려 올라간다.
     */
    private static final String DEFAULT_PASSWORD = "dmesInit!1";

    private static final DateTimeFormatter YYYYMMDD = DateTimeFormatter.ofPattern("yyyyMMdd");

    private final BCryptPasswordEncoder bcrypt = new BCryptPasswordEncoder();

    private final SecUserRepository secUserRepository;
    private final SecUserMappingRepository secUserMappingRepository;
    private final SecUserPwdRepository secUserPwdRepository;
    private final SecUserHisRepository secUserHisRepository;
    private final SecUserRollHisRepository secUserRollHisRepository;
    private final DeptInfoRepository deptInfoRepository;
    private final SecRoleGroupMappingRepository secRoleGroupMappingRepository;
    private final ApplicationEventPublisher eventPublisher;

    @PersistenceContext(unitName = "default")
    private EntityManager entityManager;

    public CommUserMngService(SecUserRepository secUserRepository,
                              SecUserMappingRepository secUserMappingRepository,
                              SecUserPwdRepository secUserPwdRepository,
                              SecUserHisRepository secUserHisRepository,
                              SecUserRollHisRepository secUserRollHisRepository,
                              DeptInfoRepository deptInfoRepository,
                              SecRoleGroupMappingRepository secRoleGroupMappingRepository,
                              ApplicationEventPublisher eventPublisher) {
        this.secUserRepository = secUserRepository;
        this.secUserMappingRepository = secUserMappingRepository;
        this.secUserPwdRepository = secUserPwdRepository;
        this.secUserHisRepository = secUserHisRepository;
        this.secUserRollHisRepository = secUserRollHisRepository;
        this.deptInfoRepository = deptInfoRepository;
        this.secRoleGroupMappingRepository = secRoleGroupMappingRepository;
        this.eventPublisher = eventPublisher;
    }

    /**
     * 사용자↔역할그룹 매핑이 바뀌면 그 그룹들이 품고 있는 역할 ID 로 {@link RoleChangedEvent} 를 발행한다.
     *
     * <p>2026-09-04 fix — 이 발행이 없어 {@code UserPermCache}(TTL 10분)가 그대로 남았고,
     * "역할그룹을 붙였는데 최대 10분간 403 / 뗐는데 계속 통과" 가 발생했다. 메뉴 트리는 DB 직독이라
     * 즉시 바뀌는데 API 만 막히는 비대칭 증상의 원인이기도 하다.
     */
    private void publishRoleChanged(Set<String> roleGroupIds) {
        if (roleGroupIds == null || roleGroupIds.isEmpty()) return;
        List<String> roleIds = secRoleGroupMappingRepository.findRoleIdsByRoleGroupIdIn(new ArrayList<>(roleGroupIds));
        if (roleIds == null || roleIds.isEmpty()) return;
        eventPublisher.publishEvent(new RoleChangedEvent(new LinkedHashSet<>(roleIds)));
    }

    // ────────────────────────────────────────────────────────────────
    // action: searchCmUser — 메인 사용자 그리드 조회 + ds_mainAll 후속 chain
    // ────────────────────────────────────────────────────────────────

    /**
     * action {@code searchCmUser} 진입점. As-Is {@code selectCommUser} (xml:7~40) + {@code selectCommUserAll}
     * (xml:42~46) BPMN Task_searchCmUser → Task_0970821 chain 통합.
     *
     * <p>처리:
     * <ol>
     *   <li>{@link SecUserRepository#searchByFilter(String, String, String)} — 본 18 컬럼 검색</li>
     *   <li>각 row 의 DEPT_NM 부착 — distinct DEPT_CD 를 DeptInfoRepository.findAllById 1회로 조회 (정책 #2 / T-008)</li>
     *   <li>{@link SecUserRepository#findAllUserIdEmpNo()} — ds_mainAll 적재 (V-004 / V-006 중복 검증용)</li>
     *   <li>{@code ds_main} + {@code ds_mainAll} 두 grid 반환</li>
     * </ol>
     */
    public Map<String, Object> searchCmUser(CommUserMngSearchRequest request) {
        String pUserKey = request != null ? request.getEdtUSERID() : null;
        String pUseTp   = request != null ? request.getCboUSETP()  : null;
        String pInOut   = request != null ? request.getCboINOUTEMPTP() : null;

        List<SecUser> rows = secUserRepository.searchByFilter(pUserKey, pUseTp, pInOut);

        Map<String, String> deptNmCache = deptNamesOf(rows);

        List<Map<String, Object>> outRows = new ArrayList<>(rows.size());
        for (SecUser u : rows) {
            outRows.add(toMainRow(u, deptNmCache.get(u.getDeptCd())));
        }

        // ds_mainAll (V-004 / V-006 전체 사용자 중복 검증용 USER_ID / USER_EMP_NO 만)
        List<Map<String, Object>> outAllRows = new ArrayList<>();
        for (Object[] row : secUserRepository.findAllUserIdEmpNo()) {
            Map<String, Object> r = new LinkedHashMap<>();
            r.put("USER_ID", row[0]);
            r.put("USER_EMP_NO", row[1]);
            outAllRows.add(r);
        }

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("ds_main", outRows);
        out.put("ds_mainAll", outAllRows);
        return out;
    }

    /**
     * 조회 행들이 쓰는 부서코드의 부서명 — distinct DEPT_CD 를 모아 {@code findAllById} 1회로 읽는다.
     *
     * <p>의미(이전 findById 루프와 같다):
     * <ul>
     *   <li>null·공백 부서코드는 조회 대상에서 뺀다 → DEPT_NM null.</li>
     *   <li>없는 부서는 맵에 없다 → DEPT_NM null.</li>
     *   <li>USE_TP 를 거르지 않는다 → 비활성 부서도 이름이 붙는다({@code searchByDeptKey} 와 다르다).</li>
     *   <li>키는 DB 가 돌려준 DEPT_CD 그대로다(정확 일치). 행 순서는 호출측이 {@code rows} 순서로 만든다.</li>
     * </ul>
     */
    private Map<String, String> deptNamesOf(List<SecUser> rows) {
        Set<String> deptCds = new LinkedHashSet<>();
        for (SecUser u : rows) {
            String deptCd = u.getDeptCd();
            if (deptCd != null && !deptCd.isBlank()) {
                deptCds.add(deptCd);
            }
        }
        Map<String, String> deptNms = new HashMap<>();
        if (deptCds.isEmpty()) return deptNms;
        for (DeptInfo d : deptInfoRepository.findAllById(deptCds)) {
            deptNms.put(d.getDeptCd(), d.getDeptNm());
        }
        return deptNms;
    }

    // ────────────────────────────────────────────────────────────────
    // action: saveCmUser — 통합 저장 (inserted/updated/deleted 분기 / 2026-06-04 사용자 결정)
    // ────────────────────────────────────────────────────────────────

    /**
     * action {@code saveCmUser} 진입점. 통합 저장 (2026-06-04 사용자 결정).
     *
     * <p>FE 의 단일 "저장" 버튼이 master rows 의 변경된 모든 row 를 일괄 전송.
     * 본 메서드가 row 별 {@code rowStatus} 를 보고 분기 처리:
     * <ul>
     *   <li>{@code "inserted"} / {@code "C"} → {@link #applyInsert(Map)} (As-Is regCmUser — TB_MCM_SEC_USER + PWD + HIS)</li>
     *   <li>{@code "updated"}  / {@code "U"} → {@link #applyUpdate(Map)} (As-Is saveCmUser — 12 컬럼 UPDATE)</li>
     *   <li>{@code "deleted"}  / {@code "D"} → {@link #applyDelete(Map)} (As-Is deleteCmUser — 논리삭제 + HIS)</li>
     * </ul>
     *
     * <p>정보처리의뢰서 (INF_REQ_NO / DESCRIPTION) 정책 제거 (2026-06-04 사용자 결정).
     * 본 메서드 내부 helper 가 row 인입 시 null 로 강제 — 이력 (USER_HIS) 의 두 컬럼은 null 적재.
     *
     * <p>응답: {@code cnt_save} = inserted + updated + deleted 처리 row 수 합산.
     */
    public Map<String, Object> saveCmUser(List<Map<String, Object>> master) {
        int cnt = 0;
        if (master != null) {
            for (Map<String, Object> row : master) {
                if (row == null) continue;
                String status = resolveStatus(row);
                String userId = strOf(row.get("USER_ID"));
                if (userId == null || userId.isBlank()) {
                    log.warn("[commUserMng.saveCmUser] USER_ID null — skip row (status={})", status);
                    continue;
                }
                if ("inserted".equals(status) || "C".equals(status)) {
                    if (applyInsert(row)) cnt++;
                } else if ("updated".equals(status) || "U".equals(status)) {
                    if (applyUpdate(row)) cnt++;
                } else if ("deleted".equals(status) || "D".equals(status)) {
                    if (applyDelete(row)) cnt++;
                } else {
                    log.debug("[commUserMng.saveCmUser] skip unknown status={} userId={}", status, userId);
                }
            }
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("cnt_save", cnt);
        return out;
    }

    /**
     * inserted 분기 — As-Is regCmUser 로직 흡수 (insertCommUser + mergeCommonPwdInit + TB_MCM_SEC_USER_HIS).
     * INF_REQ_NO / DESCRIPTION 은 null 로 적재 (정책 제거).
     */
    private boolean applyInsert(Map<String, Object> row) {
        String userId = strOf(row.get("USER_ID"));
        String userEmpNo = strOf(row.get("USER_EMP_NO"));
        if (secUserRepository.existsById(userId)) {
            log.warn("[commUserMng.saveCmUser/insert] blocked — duplicate USER_ID={} (silent skip)", userId);
            return false;
        }
        SecUser u = new SecUser();
        u.setUserId(userId);
        u.setUserEmpNo(userEmpNo);
        u.setSsoId(strOf(row.get("SSO_ID")));
        u.setUserNm(strOf(row.get("USER_NM")));
        u.setStartActiveDate(parseLocalDateTime(row.get("START_ACTIVE_DATE"), LocalDateTime.now()));
        u.setEndActiveDate(parseLocalDateTime(row.get("END_ACTIVE_DATE"), END_OF_TIME));
        u.setDeptCd(strOf(row.get("DEPT_CD")));
        u.setUserCategoryCd(strOf(row.get("USER_CATEGORY_CD")));
        u.setUseTp("Y"); // 계정 생성 default Y 강제 (java:52)
        u.setEmail(strOf(row.get("EMAIL")));
        u.setTelNo(strOf(row.get("TEL_NO")));
        u.setMobileTelNo(strOf(row.get("MOBILE_TEL_NO")));
        u.setInOutEmpTp(strOf(row.get("IN_OUT_EMP_TP")));
        u.setGroupId1(strOf(row.get("GROUP_ID1")));
        u.setGroupId2(strOf(row.get("GROUP_ID2")));
        u.setGroupId3(strOf(row.get("GROUP_ID3")));
        secUserRepository.save(u);

        upsertUserPwd(userId,
                bcrypt.encode(DEFAULT_PASSWORD),
                bcrypt.encode(userId + (userEmpNo == null ? "" : userEmpNo)));

        // TB_MCM_SEC_USER_HIS — INF_REQ_NO / DESCRIPTION null
        saveUserHis(userId, currentYyyymmdd(), "C", "M",
                strOf(row.get("USER_NM")), null, null);
        return true;
    }

    /** updated 분기 — As-Is updateCommUser (xml:110~128) 12 컬럼 UPDATE. */
    private boolean applyUpdate(Map<String, Object> row) {
        String userId = strOf(row.get("USER_ID"));
        SecUser entity = secUserRepository.findById(userId).orElse(null);
        if (entity == null) {
            log.warn("[commUserMng.saveCmUser/update] skip — USER_ID={} not found", userId);
            return false;
        }
        entity.setUserEmpNo(strOf(row.get("USER_EMP_NO")));
        entity.setSsoId(strOf(row.get("SSO_ID")));
        entity.setUserNm(strOf(row.get("USER_NM")));
        entity.setStartActiveDate(parseLocalDateTime(row.get("START_ACTIVE_DATE"), entity.getStartActiveDate()));
        entity.setEndActiveDate(parseLocalDateTime(row.get("END_ACTIVE_DATE"), entity.getEndActiveDate()));
        entity.setDeptCd(strOf(row.get("DEPT_CD")));
        entity.setUserCategoryCd(strOf(row.get("USER_CATEGORY_CD")));
        entity.setEmail(strOf(row.get("EMAIL")));
        entity.setTelNo(strOf(row.get("TEL_NO")));
        entity.setMobileTelNo(strOf(row.get("MOBILE_TEL_NO")));
        entity.setInOutEmpTp(strOf(row.get("IN_OUT_EMP_TP")));
        entity.setGroupId1(strOf(row.get("GROUP_ID1")));
        entity.setGroupId2(strOf(row.get("GROUP_ID2")));
        entity.setGroupId3(strOf(row.get("GROUP_ID3")));
        secUserRepository.save(entity);
        return true;
    }

    /**
     * deleted 분기 — As-Is deleteCmUser 로직 흡수 (논리삭제 END_ACTIVE_DATE + TB_MCM_SEC_USER_HIS).
     *
     * <p><b>2026-06-04 fix — 계정삭제 동작 점검 (사용자 명시 #3):</b> row 의 {@code END_ACTIVE_DATE} 가
     * "9999-12-31" sentinel (rowAdd default / 활성 사용자의 미지정 값) 이면 today 로 강제 정정.
     * 이전 구현은 9999-12-31 을 그대로 SET 해서 실제 마감이 일어나지 않았음 (계정삭제 무동작 원인).
     *
     * <p><b>2026-09-04 fix — {@code USE_TP='N'} 동시 SET (사용자 결정):</b> 종전에는 END_ACTIVE_DATE 만
     * 마감해서 삭제한 계정이 기본 필터({@code USE_TP='Y'}) 목록에 계속 "사용 여부 Yes" 로 남았고,
     * "계정 재생성" 버튼(FE {@code USE_TP === "Y"} 면 비활성)이 영영 열리지 않았다.
     * 되돌리는 경로는 {@link #reRegCmUser}(→ {@code updateReRegUser(…, "Y")}) 가 이미 담당한다.
     */
    private boolean applyDelete(Map<String, Object> row) {
        String userId = strOf(row.get("USER_ID"));
        LocalDateTime endDt = parseLocalDateTime(row.get("END_ACTIVE_DATE"), LocalDateTime.now());
        // 9999-12-31 sentinel → today 정정 (계정삭제 동작 fix)
        if (endDt != null && endDt.getYear() >= 9999) {
            log.info("[commUserMng.saveCmUser/delete] END_ACTIVE_DATE sentinel ({}) → today 로 정정 (userId={})",
                    endDt, userId);
            endDt = LocalDate.now().atStartOfDay();
        }
        int affected = secUserRepository.updateEndActiveDate(userId, endDt, "N");
        if (affected > 0) {
            String activeDt = endDt.format(YYYYMMDD);
            saveUserHis(userId, activeDt, "D", "M",
                    strOf(row.get("USER_NM")), null, null);
            return true;
        }
        log.warn("[commUserMng.saveCmUser/delete] UPDATE 0 rows — USER_ID={} not found", userId);
        return false;
    }

    // ────────────────────────────────────────────────────────────────
    // action: regCmUser — 계정 생성 (insertCommUser + mergeCommonPwdInit + TB_MCM_SEC_USER_HIS)
    // ────────────────────────────────────────────────────────────────

    /**
     * action {@code regCmUser} 진입점 — 2026-06-04 통합 저장 위임 (호환 유지).
     *
     * <p>FE 단일 "저장" 버튼 통합 후, 본 BPMN action 은 직접 호출되지 않지만 BPMN 정의 보존을 위해 유지.
     * 내부는 통합 {@link #saveCmUser(List)} 로 위임 — rowStatus 별 분기.
     */
    public Map<String, Object> regCmUser(List<Map<String, Object>> master) {
        return saveCmUser(master);
    }

    // ────────────────────────────────────────────────────────────────
    // action: deleteCmUser — 논리삭제 (END_ACTIVE_DATE 마감 + TB_MCM_SEC_USER_HIS)
    // ────────────────────────────────────────────────────────────────

    /**
     * action {@code deleteCmUser} 진입점 — 2026-06-04 통합 저장 위임 (호환 유지).
     *
     * <p>FE 단일 "저장" 버튼 통합 후, 본 BPMN action 은 직접 호출되지 않지만 BPMN 정의 보존을 위해 유지.
     * 내부는 통합 {@link #saveCmUser(List)} 로 위임 — rowStatus 별 분기 (9999-12-31 sentinel fix 포함).
     */
    public Map<String, Object> deleteCmUser(List<Map<String, Object>> master) {
        return saveCmUser(master);
    }

    // ────────────────────────────────────────────────────────────────
    // action: reRegCmUser — 계정 재생성 (updateReRegUser + mergeCommonPwdInit + HIS)
    // ────────────────────────────────────────────────────────────────

    /**
     * action {@code reRegCmUser} 진입점. As-Is ReRegCommUserMng.java (ds_main.get(0) 단건 처리).
     *
     * <p>처리:
     * <ol>
     *   <li>updateReRegUser — START_ACTIVE_DATE=today / END_ACTIVE_DATE=9999-12-31 / USE_TP=Y</li>
     *   <li>updateReRegUserCnt < 1 → UserException ("사용자 정보 업데이트에 실패했습니다.")</li>
     *   <li>mergeCommonPwdInit (bcrypt DEFAULT_PASSWORD + bcrypt(USER_ID+USER_EMP_NO))</li>
     *   <li>TB_MCM_SEC_USER_HIS insert — PROC_TYPE='C', PROC_CASE='M'</li>
     * </ol>
     */
    public Map<String, Object> reRegCmUser(List<Map<String, Object>> master) {
        int cnt = 0;
        if (master != null && !master.isEmpty()) {
            Map<String, Object> row = master.get(0);
            String userId = strOf(row.get("USER_ID"));
            String userEmpNo = strOf(row.get("USER_EMP_NO"));
            if (userId == null || userId.isBlank()) {
                log.warn("[commUserMng.reRegCmUser] USER_ID null — skip");
            } else {
                LocalDateTime startDt = LocalDate.now().atStartOfDay();
                int affected = secUserRepository.updateReRegUser(userId, startDt, END_OF_TIME, "Y");
                if (affected < 1) {
                    // As-Is UserException — 본 미적용 시 silent log + cnt 0 (오아시스 layer 가 응답 envelope 처리)
                    log.error("[commUserMng.reRegCmUser] 사용자 정보 업데이트에 실패했습니다. USER_ID={}", userId);
                } else {
                    upsertUserPwd(userId,
                            bcrypt.encode(DEFAULT_PASSWORD),
                            bcrypt.encode((userId == null ? "" : userId) + (userEmpNo == null ? "" : userEmpNo)));
                    // 2026-06-04 — INF_REQ_NO / DESCRIPTION 정책 제거. null 적재.
                    saveUserHis(userId, currentYyyymmdd(), "C", "M",
                            strOf(row.get("USER_NM")), null, null);
                    cnt = 1;
                }
            }
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("cnt_save", cnt);
        return out;
    }

    // ────────────────────────────────────────────────────────────────
    // action: searchUserRoleGrp — 선택 사용자의 보유 역할그룹 조회
    // ────────────────────────────────────────────────────────────────

    /**
     * action {@code searchUserRoleGrp} 진입점. As-Is {@code selectCommUserRoleGrp} (xml:152~161).
     *
     * <p>TB_MCM_SEC_USER_MAPPING A JOIN TB_MCM_SEC_ROLEGROUP B ON A.ROLE_GROUP_ID=B.ROLE_GROUP_ID
     * WHERE A.USER_ID = #{USER_ID}.
     *
     * <p>응답: {@code ds_userRolegrp} (As-Is dataset 이름 보존 / 분석 §3.8 DS-002).
     */
    @SuppressWarnings("unchecked")
    public Map<String, Object> searchUserRoleGrp(CommUserMngUserIdRequest request) {
        String userId = request != null ? request.getUSER_ID() : null;
        List<Map<String, Object>> outRows = new ArrayList<>();
        if (userId != null && !userId.isBlank()) {
            String sql =
                    "SELECT A.ROLE_GROUP_ID, B.ROLE_GROUP_NM, A.USER_ID " +
                    "  FROM MCMAPUSER.TB_MCM_SEC_USER_MAPPING A " +
                    "  JOIN MCMAPUSER.TB_MCM_SEC_ROLEGROUP B ON A.ROLE_GROUP_ID = B.ROLE_GROUP_ID " +
                    " WHERE A.USER_ID = :userId " +
                    " ORDER BY A.ROLE_GROUP_ID";
            List<Object[]> rows = entityManager.createNativeQuery(sql)
                    .setParameter("userId", userId)
                    .getResultList();
            for (Object[] row : rows) {
                Map<String, Object> r = new LinkedHashMap<>();
                r.put("ROLE_GROUP_ID", row[0]);
                r.put("ROLE_GROUP_NM", row[1]);
                r.put("USER_ID", row[2]);
                outRows.add(r);
            }
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("ds_userRolegrp", outRows);
        return out;
    }

    // ────────────────────────────────────────────────────────────────
    // action: saveUserRoleGrp — 역할그룹 추가/삭제 + 이력
    // ────────────────────────────────────────────────────────────────

    /**
     * action {@code saveUserRoleGrp} 진입점. As-Is BPMN SaveRoleGroupHis → Task_saveUserRoleGrp 통합.
     *
     * <p>입력: {@code master} = ds_userRolegrp:U (변경 행만).
     *
     * <p>status 분기 (As-Is SaveRoleGroupHis.java + CommonMultiSaveTask 통합):
     * <ul>
     *   <li>"inserted" / "C" → INSERT (TB_MCM_SEC_USER_MAPPING) + TB_MCM_SEC_USER_ROLL_HIS (RESP_GBN='A')</li>
     *   <li>"deleted"  / "D" → DELETE + TB_MCM_SEC_USER_ROLL_HIS (RESP_GBN='D')</li>
     * </ul>
     */
    public Map<String, Object> saveUserRoleGrp(List<Map<String, Object>> master) {
        int cnt = 0;
        Set<String> touchedRoleGroupIds = new LinkedHashSet<>(); // 캐시 무효화 대상
        if (master != null) {
            String today = currentYyyymmdd();
            for (Map<String, Object> row : master) {
                if (row == null) continue;
                String status = resolveStatus(row);
                String userId = strOf(row.get("USER_ID"));
                String roleGroupId = strOf(row.get("ROLE_GROUP_ID"));
                if (userId == null || userId.isBlank() || roleGroupId == null || roleGroupId.isBlank()) {
                    log.warn("[commUserMng.saveUserRoleGrp] PK null — skip (status={} USER_ID={} ROLE_GROUP_ID={})",
                            status, userId, roleGroupId);
                    continue;
                }
                SecUserMapping.PK pk = new SecUserMapping.PK(userId, roleGroupId);

                if ("inserted".equals(status) || "C".equals(status)) {
                    if (!secUserMappingRepository.existsById(pk)) {
                        SecUserMapping m = new SecUserMapping();
                        m.setUserId(userId);
                        m.setRoleGroupId(roleGroupId);
                        secUserMappingRepository.save(m);
                    }
                    // 2026-06-04 — INF_REQ_NO / DESCRIPTION 정책 제거. null 적재.
                    saveUserRollHis(today, "P", userId, roleGroupId, "A",
                            strOf(row.get("ROLE_GROUP_NM")), null, null);
                    touchedRoleGroupIds.add(roleGroupId);
                    cnt++;
                } else if ("deleted".equals(status) || "D".equals(status)) {
                    if (secUserMappingRepository.existsById(pk)) {
                        secUserMappingRepository.deleteById(pk);
                    }
                    saveUserRollHis(today, "P", userId, roleGroupId, "D",
                            strOf(row.get("ROLE_GROUP_NM")), null, null);
                    touchedRoleGroupIds.add(roleGroupId);
                    cnt++;
                } else {
                    log.debug("[commUserMng.saveUserRoleGrp] skip status={}", status);
                }
            }
        }
        publishRoleChanged(touchedRoleGroupIds);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("cnt_save", cnt);
        return out;
    }

    // ────────────────────────────────────────────────────────────────
    // action: searchRoleGrp — 추가 가능 역할그룹 조회 (활성 + 사용자 미보유)
    // ────────────────────────────────────────────────────────────────

    /**
     * action {@code searchRoleGrp} 진입점. As-Is {@code selectCommRoleGrpList} (xml:182~194).
     *
     * <p>TB_MCM_SEC_ROLEGROUP WHERE USE_TP='Y' AND today BETWEEN START_ACTIVE_DATE AND ISNULL(END_ACTIVE_DATE, today+100)
     * AND NOT EXISTS (TB_MCM_SEC_USER_MAPPING B WHERE B.USER_ID = #{USER_ID} AND B.ROLE_GROUP_ID = A.ROLE_GROUP_ID).
     *
     * <p>응답: {@code ds_rolegrpList} (As-Is dataset 이름 보존 / 분석 §3.8 DS-003).
     */
    @SuppressWarnings("unchecked")
    public Map<String, Object> searchRoleGrp(CommUserMngUserIdRequest request) {
        String userId = request != null ? request.getUSER_ID() : null;
        // GETDATE()/DATEADD/ISNULL 은 MSSQL 전용 — 로컬 SQLite 개발계에서는 등가 구문으로 분기한다.
        // (미분기 시 "no such column: day" 로 조회가 통째로 실패하고, OASIS 가 이를 HTTP 200 +
        //  meta.success=false 로 돌려줘 역할그룹 목록이 조용히 빈 채로 보였다. 2026-08-07)
        boolean sqlite = McmAuditStatementInspector.isSqlite();
        String now = sqlite ? "CURRENT_TIMESTAMP" : "GETDATE()";
        String endDefault = sqlite
                ? "IFNULL(A.END_ACTIVE_DATE, DATETIME(CURRENT_TIMESTAMP, '+100 day'))"
                : "ISNULL(A.END_ACTIVE_DATE, DATEADD(day, 100, GETDATE()))";
        String sql =
                "SELECT A.ROLE_GROUP_ID, A.ROLE_GROUP_NM " +
                "  FROM MCMAPUSER.TB_MCM_SEC_ROLEGROUP A " +
                " WHERE A.USE_TP = 'Y' " +
                "   AND " + now + " BETWEEN A.START_ACTIVE_DATE AND " + endDefault + " " +
                "   AND NOT EXISTS (SELECT 'X' FROM MCMAPUSER.TB_MCM_SEC_USER_MAPPING B " +
                "                    WHERE B.USER_ID = :userId AND B.ROLE_GROUP_ID = A.ROLE_GROUP_ID) " +
                " ORDER BY A.ROLE_GROUP_ID";
        List<Object[]> rows = entityManager.createNativeQuery(sql)
                .setParameter("userId", userId == null ? "" : userId)
                .getResultList();
        List<Map<String, Object>> outRows = new ArrayList<>(rows.size());
        for (Object[] row : rows) {
            Map<String, Object> r = new LinkedHashMap<>();
            r.put("ROLE_GROUP_ID", row[0]);
            r.put("ROLE_GROUP_NM", row[1]);
            outRows.add(r);
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("ds_rolegrpList", outRows);
        return out;
    }

    // ────────────────────────────────────────────────────────────────
    // action: pwdinit — 비밀번호 / SSO 비밀번호 초기화
    // ────────────────────────────────────────────────────────────────

    /**
     * action {@code pwdinit} 진입점. As-Is PasswordInit.java.
     *
     * <p>분기 (java:31):
     * <ul>
     *   <li>SSO_RESET_FLAG="Y" → master(ds_main) for-loop, 각 row 별 USER_SSO_PWD=bcrypt(USER_ID+USER_EMP_NO) → updateCommonSSOPwdInit</li>
     *   <li>그 외 → 단건 USER_ID — USER_ENC_PWD=bcrypt(DEFAULT_PASSWORD) + USER_SSO_PWD=bcrypt(USER_ID+USER_EMP_NO) → mergeCommonPwdInit</li>
     * </ul>
     *
     * <p><b>응답 (2026-09-28 신설)</b> — 단건 비밀번호 초기화 성공 시 발급된 평문 초기 비밀번호를
     * {@code INIT_PWD} 로 함께 돌려준다. As-Is {@code pwdtmp} 콜백이 하단 상태바에
     * "임시비밀번호가 [{strErrorMsg}] 로 전송되었습니다" 를 보여주던 것을 (분석 §5.5 / 기능설계서 M-032)
     * To-Be 화면 팝업 + 클립보드 복사로 대체하기 위한 것이다 — 초기 비밀번호가 bcrypt 해시로만 남으면
     * 관리자가 사용자에게 전달할 값 자체를 알 수 없어 "초기화는 되는데 로그인할 수 없다" 가 된다.
     *
     * <p>보안 주의: {@code INIT_PWD} 는 **응답으로만** 나가고 로그에는 남기지 않는다. 값이 고정
     * 상수인 점은 {@link #DEFAULT_PASSWORD} 주석의 외부화 선행 과제(운영 적용 전 반드시 처리) 그대로다.
     *
     * <p>SSO 일괄 분기는 초기 비밀번호를 반환하지 않는다. 대상이 그리드 전 행이라 평문 비밀번호를
     * 응답에 싣는 순간 프런트가 N건의 비밀번호를 화면에 펼쳐야 하고, 값 규칙(USER_ID+USER_EMP_NO)도
     * 사용자마다 달라 그대로 노출되면 DB 사본과 동등한 정보가 된다. 필요하면 별도 내려받기 화면을 연다.
     */
    public Map<String, Object> pwdinit(CommUserMngPwdInitRequest request, List<Map<String, Object>> master) {
        int cnt = 0;
        String initPwdUserId = null;
        boolean ssoReset = request != null && "Y".equals(request.getSSO_RESET_FLAG());
        if (ssoReset) {
            // SSO 전체 — ds_main for-loop
            if (master != null) {
                for (Map<String, Object> row : master) {
                    if (row == null) continue;
                    String userId = strOf(row.get("USER_ID"));
                    String userEmpNo = strOf(row.get("USER_EMP_NO"));
                    if (userId == null || userId.isBlank()) continue;
                    String ssoPwd = bcrypt.encode(userId + (userEmpNo == null ? "" : userEmpNo));
                    int affected = secUserPwdRepository.updateSsoPwd(userId, ssoPwd);
                    if (affected == 0) {
                        // 행이 없으면 신규 PWD 행 upsert
                        upsertUserPwd(userId, null, ssoPwd);
                    }
                    cnt++;
                }
            }
        } else {
            // 단건 PWD 초기화 — request 의 USER_ID 우선
            String userId = request != null ? request.getUSER_ID() : null;
            String userEmpNo = request != null ? request.getUSER_EMP_NO() : null;
            if (userId != null && !userId.isBlank()) {
                upsertUserPwd(userId,
                        bcrypt.encode(DEFAULT_PASSWORD),
                        bcrypt.encode(userId + (userEmpNo == null ? "" : userEmpNo)));
                cnt = 1;
                initPwdUserId = userId;
            }
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("cnt_save", cnt);
        if (initPwdUserId != null) {
            out.put("INIT_PWD", DEFAULT_PASSWORD);
            out.put("INIT_PWD_USER_ID", initPwdUserId);
        }
        return out;
    }

    // ────────────────────────────────────────────────────────────────
    // action: saveUserRoleGrpCopy — 역할그룹 복사 (USER_ID_COPY → USER_ID, 비보유분만)
    // ────────────────────────────────────────────────────────────────

    /**
     * action {@code saveUserRoleGrpCopy} 진입점. As-Is SaveRoleGroupCopyHis → Task_0v3mxy0 통합.
     *
     * <p>처리:
     * <ol>
     *   <li>selectRoleMergeObject — USER_ID_COPY 의 ROLE_GROUP 중 USER_ID 에 없는 것만 ({@link SecUserMappingRepository#findRoleGroupIdsToCopy})</li>
     *   <li>각 row 별 TB_MCM_SEC_USER_ROLL_HIS save (WORKS_CODE='P', RESP_GBN='A')</li>
     *   <li>mergeCommonCopyRoleGrp 등가 — TB_MCM_SEC_USER_MAPPING saveAll (USER_ID, ROLE_GROUP_ID)</li>
     * </ol>
     */
    public Map<String, Object> saveUserRoleGrpCopy(CommUserMngRoleCopyRequest request) {
        int cnt = 0;
        if (request != null
            && request.getUSER_ID() != null && !request.getUSER_ID().isBlank()
            && request.getUSER_ID_COPY() != null && !request.getUSER_ID_COPY().isBlank()) {
            String userId = request.getUSER_ID();
            String userIdCopy = request.getUSER_ID_COPY();
            String today = currentYyyymmdd();
            List<String> roleGroupIds = secUserMappingRepository.findRoleGroupIdsToCopy(userId, userIdCopy);
            for (String roleGroupId : roleGroupIds) {
                // ROLE_GROUP_NM — scalar subquery 결과 (xml:271~273) — 단건 lookup
                String roleGroupNm = lookupRoleGroupNm(roleGroupId);
                // 2026-06-04 — INF_REQ_NO / DESCRIPTION 정책 제거. null 적재.
                //   DTO 필드는 호환 유지 (FE 미전송 → null) — request.getINF_REQ_NO() / getDESCRIPTION() 무시.
                saveUserRollHis(today, "P", userId, roleGroupId, "A", roleGroupNm, null, null);
                // TB_MCM_SEC_USER_MAPPING upsert (mergeCommonCopyRoleGrp 등가 — NOT MATCHED INSERT)
                SecUserMapping.PK pk = new SecUserMapping.PK(userId, roleGroupId);
                if (!secUserMappingRepository.existsById(pk)) {
                    SecUserMapping m = new SecUserMapping();
                    m.setUserId(userId);
                    m.setRoleGroupId(roleGroupId);
                    secUserMappingRepository.save(m);
                }
                cnt++;
            }
            publishRoleChanged(new LinkedHashSet<>(roleGroupIds));
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("cnt_save", cnt);
        return out;
    }

    // ────────────────────────────────────────────────────────────────
    // action: commonUserDept — 부서 팝업 조회
    // ────────────────────────────────────────────────────────────────

    /**
     * action {@code commonUserDept} 진입점. As-Is {@code selectCommDept} (xml:251~263 To-Be 갱신).
     *
     * <p>정책 #2 / Q-002 해소 — EAI 폐기, DMES 자체 {@code TB_MCM_DEPT_INFO} 단독 조회.
     *
     * <p>응답: {@code ds_userDept} (As-Is dataset 이름 보존 / 분석 §3.9 FX-006 commonDynamic 정합).
     */
    public Map<String, Object> commonUserDept(CommUserMngDeptRequest request) {
        String pDeptKey = request != null ? request.getEdt_DEPT_CD() : null;
        List<DeptInfo> rows = deptInfoRepository.searchByDeptKey(pDeptKey);
        List<Map<String, Object>> outRows = new ArrayList<>(rows.size());
        for (DeptInfo d : rows) {
            Map<String, Object> r = new LinkedHashMap<>();
            r.put("DEPT_CD", d.getDeptCd());
            r.put("DEPT_NM", d.getDeptNm());
            outRows.add(r);
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("ds_userDept", outRows);
        return out;
    }

    // ────────────────────────────────────────────────────────────────
    // action: searchDeptLov — Detail 부서 LoV 모달 (2026-06-04 신설 / 사용자 결정)
    // 직접 타이핑 ✗ → 검색 버튼 + LoV 모달 그리드 (DEPT_CD/DEPT_NM) → 선택 시 자동 세트
    // ────────────────────────────────────────────────────────────────

    /**
     * action {@code searchDeptLov} 진입점 (2026-06-04 신설 / 사용자 결정).
     *
     * <p>Detail 영역 부서코드를 직접 타이핑하지 않고 검색 모달로 선택.
     * 모달 그리드: DEPT_CD / DEPT_NM (TB_MCM_DEPT_INFO 조회).
     *
     * <p>처리: {@link DeptInfoRepository#searchByDeptKey(String)} 재사용 — keyword 를
     * DEPT_CD prefix LIKE 또는 DEPT_NM 부분 LIKE (UPPER) 로 검색 (USE_TP='Y' 강제).
     *
     * <p>응답: {@code ds_deptLov} key 의 {@code List<Map>} (2 컬럼 DEPT_CD / DEPT_NM).
     *
     * <p>참고 패턴: commRoleMng round-3 {@code searchObjectLov} (분석 §5 P-001 / Q-016).
     */
    public Map<String, Object> searchDeptLov(CommUserMngSearchDeptLovRequest request) {
        String keyword = request != null ? request.getKeyword() : null;
        List<DeptInfo> rows = deptInfoRepository.searchByDeptKey(keyword);
        List<Map<String, Object>> outRows = new ArrayList<>(rows.size());
        for (DeptInfo d : rows) {
            Map<String, Object> r = new LinkedHashMap<>();
            r.put("DEPT_CD", d.getDeptCd());
            r.put("DEPT_NM", d.getDeptNm());
            outRows.add(r);
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("ds_deptLov", outRows);
        return out;
    }

    // ────────────────────────────────────────────────────────────────
    // helpers
    // ────────────────────────────────────────────────────────────────

    /**
     * As-Is {@code selectCommUser} (xml:7~40) 응답 row 조립 — 19 컬럼 (SecUser 18 + DEPT_NM scalar).
     *
     * <p>응답 컬럼명 (SNAKE_CASE) 은 As-Is dataset 컬럼명 (분석 §3.8 DS-001) 보존.
     */
    private Map<String, Object> toMainRow(SecUser u, String deptNm) {
        Map<String, Object> row = new LinkedHashMap<>();
        row.put("USER_ID", u.getUserId());
        row.put("USER_EMP_NO", u.getUserEmpNo());
        row.put("SSO_ID", u.getSsoId());
        row.put("USER_NM", u.getUserNm());
        row.put("START_ACTIVE_DATE", u.getStartActiveDate());
        row.put("END_ACTIVE_DATE", u.getEndActiveDate());
        row.put("DEPT_CD", u.getDeptCd());
        row.put("USER_CATEGORY_CD", u.getUserCategoryCd());
        row.put("USE_TP", u.getUseTp());
        row.put("EMAIL", u.getEmail());
        row.put("TEL_NO", u.getTelNo());
        row.put("MOBILE_TEL_NO", u.getMobileTelNo());
        row.put("IN_OUT_EMP_TP", u.getInOutEmpTp());
        row.put("GROUP_ID1", u.getGroupId1());
        row.put("GROUP_ID2", u.getGroupId2());
        row.put("GROUP_ID3", u.getGroupId3());
        row.put("DEPT_NM", deptNm); // 정책 #2 — DeptInfo 별도 조회 부착 (As-Is EAI scalar subquery 대체)
        return row;
    }

    /**
     * TB_MCM_SEC_USER_PWD upsert — mergeCommonPwdInit 등가.
     * encPwd 가 null 이면 SSO 만 갱신 / encPwd 있으면 둘 다 갱신.
     */
    private void upsertUserPwd(String userId, String encPwd, String ssoPwd) {
        SecUserPwd p = secUserPwdRepository.findById(userId).orElse(null);
        if (p == null) {
            p = new SecUserPwd();
            p.setUserId(userId);
        }
        if (encPwd != null) {
            p.setUserEncPwd(encPwd);
        }
        if (ssoPwd != null) {
            p.setUserSsoPwd(ssoPwd);
        }
        secUserPwdRepository.save(p);
    }

    /** TB_MCM_SEC_USER_HIS save — 정책 #3 (C) JPA Entity 흡수. */
    private void saveUserHis(String userId, String activeDt, String procType, String procCase,
                             String userNm, String infReqNo, String description) {
        if (userId == null || activeDt == null) return;
        SecUserHis h = new SecUserHis();
        h.setUserId(userId);
        h.setActiveDt(activeDt);
        h.setProcType(procType);
        h.setProcCase(procCase);
        h.setUserNm(userNm);
        h.setInfReqNo(infReqNo);
        h.setDescription(description);
        secUserHisRepository.save(h);
    }

    /** TB_MCM_SEC_USER_ROLL_HIS save — 정책 #3 (C) JPA Entity 흡수 (5 복합 PK upsert / mergePK 등가). */
    private void saveUserRollHis(String opSumupDt, String worksCode, String userId, String roleGroupId,
                                 String respGbn, String roleGroupNm, String infReqNo, String description) {
        if (userId == null || roleGroupId == null) return;
        SecUserRollHis h = new SecUserRollHis();
        h.setOpSumupDt(opSumupDt);
        h.setWorksCode(worksCode);
        h.setUserId(userId);
        h.setRoleGroupId(roleGroupId);
        h.setRespGbn(respGbn);
        h.setRoleGroupNm(roleGroupNm);
        h.setInfReqNo(infReqNo);
        h.setDescription(description);
        secUserRollHisRepository.save(h);
    }

    /** ROLE_GROUP_NM 단건 lookup — saveUserRoleGrpCopy 의 ROLL_HIS 적재 보조. */
    private String lookupRoleGroupNm(String roleGroupId) {
        if (roleGroupId == null || roleGroupId.isBlank()) return null;
        try {
            Object o = entityManager.createNativeQuery(
                    "SELECT ROLE_GROUP_NM FROM MCMAPUSER.TB_MCM_SEC_ROLEGROUP WHERE ROLE_GROUP_ID = :id")
                    .setParameter("id", roleGroupId)
                    .getSingleResult();
            return o == null ? null : String.valueOf(o);
        } catch (Exception e) {
            return null;
        }
    }

    /** rowStatus 우선, fallback !nativeeditor_status (As-Is Nexacro 시스템 컬럼). */
    private static String resolveStatus(Map<String, Object> row) {
        String status = strOf(row.get("rowStatus"));
        if (status == null || status.isBlank()) {
            status = strOf(row.get("!nativeeditor_status"));
        }
        return status;
    }

    private static String currentYyyymmdd() {
        return LocalDate.now().format(YYYYMMDD);
    }

}
