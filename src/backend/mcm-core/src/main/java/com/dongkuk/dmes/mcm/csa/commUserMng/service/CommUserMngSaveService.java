/*
 * 내용: commUserMng 저장 action — saveCmUser(regCmUser·deleteCmUser 위임 포함) / reRegCmUser /
 *       saveUserRoleGrp / saveUserRoleGrpCopy. BPMN 진입점은 퍼사드 {@link CommUserMngService}(빈 commUserMngService).
 */
package com.dongkuk.dmes.mcm.csa.commUserMng.service;

import com.dongkuk.dmes.mcm.common.event.RoleChangedEvent;
import com.dongkuk.dmes.mcm.common.exception.BusinessException;
import com.dongkuk.dmes.mcm.common.exception.ErrorCode;
import com.dongkuk.dmes.mcm.csa.commPerm.SysadminGuard;
import com.dongkuk.dmes.mcm.csa.commUserMng.dto.CommUserMngRoleCopyRequest;
import com.dongkuk.dmes.mcm.entity.SecUser;
import com.dongkuk.dmes.mcm.entity.SecUserHis;
import com.dongkuk.dmes.mcm.entity.SecUserMapping;
import com.dongkuk.dmes.mcm.entity.SecUserRollHis;
import com.dongkuk.dmes.mcm.repository.SecRoleGroupMappingRepository;
import com.dongkuk.dmes.mcm.repository.SecUserHisRepository;
import com.dongkuk.dmes.mcm.repository.SecUserMappingRepository;
import com.dongkuk.dmes.mcm.repository.SecUserRepository;
import com.dongkuk.dmes.mcm.repository.SecUserRollHisRepository;
import com.dongkuk.dmes.mcm.security.account.AccountState;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

import static com.dongkuk.dmes.mcm.common.util.McmValues.parseLocalDateTime;
import static com.dongkuk.dmes.mcm.common.util.McmValues.strOf;

/**
 * commUserMng 저장 — 사용자 통합 저장·계정 재생성·역할그룹 추가/삭제·역할그룹 복사.
 *
 * <p>BPMN 이 직접 부르지 않는다. {@link CommUserMngService} 퍼사드가 위임한다({@code regCmUser}·{@code deleteCmUser} 는
 * 퍼사드에서 {@link #saveCmUser(List)} 로 위임).
 * {@code @Transactional} 을 붙이지 않는다 — OASIS {@code SpringTransactionHandler} 가 BPMN 프로세스 단위로 감싼다.
 *
 * <p>로그 범주는 분할 전과 같게 {@code CommUserMngService} 로거를 쓴다.
 */
@Service("commUserMngSaveService")
public class CommUserMngSaveService {

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

    private static final DateTimeFormatter YYYYMMDD = DateTimeFormatter.ofPattern("yyyyMMdd");

    private final SecUserRepository secUserRepository;
    private final SecUserMappingRepository secUserMappingRepository;
    private final SecUserHisRepository secUserHisRepository;
    private final SecUserRollHisRepository secUserRollHisRepository;
    private final SecRoleGroupMappingRepository secRoleGroupMappingRepository;
    private final ApplicationEventPublisher eventPublisher;
    private final CommUserMngPwdWriter pwdWriter;
    private final SysadminGuard sysadminGuard;
    private final CommUserMngHisWriter hisWriter;
    private final UserLifecycleCore lifecycle;

    /** 본인 계정 삭제·끄기·기한 지난 날짜 막기(perm-crudfix c5 a). */
    static final String SELF_ACCOUNT_MSG = "본인 계정은 삭제하거나 끌 수 없습니다";

    @PersistenceContext(unitName = "default")
    private EntityManager entityManager;

    CommUserMngSaveService(SecUserRepository secUserRepository,
                           SecUserMappingRepository secUserMappingRepository,
                           SecUserHisRepository secUserHisRepository,
                           SecUserRollHisRepository secUserRollHisRepository,
                           SecRoleGroupMappingRepository secRoleGroupMappingRepository,
                           ApplicationEventPublisher eventPublisher,
                           CommUserMngPwdWriter pwdWriter,
                           SysadminGuard sysadminGuard,
                           CommUserMngHisWriter hisWriter,
                           UserLifecycleCore lifecycle) {
        this.secUserRepository = secUserRepository;
        this.secUserMappingRepository = secUserMappingRepository;
        this.secUserHisRepository = secUserHisRepository;
        this.secUserRollHisRepository = secUserRollHisRepository;
        this.secRoleGroupMappingRepository = secRoleGroupMappingRepository;
        this.eventPublisher = eventPublisher;
        this.pwdWriter = pwdWriter;
        this.sysadminGuard = sysadminGuard;
        this.hisWriter = hisWriter;
        this.lifecycle = lifecycle;
    }

    /** 마지막 시스템관리자·본인 SYSADMIN 해제 거절(c5 b) — {@link SysadminGuard.Check#verify}. */
    private static void verifySysadmin(SysadminGuard.Check check) {
        if (check != null) {
            check.verify(SysadminGuard.LAST_SYSADMIN, SysadminGuard.LAST_MSG,
                    SysadminGuard.SELF_LOCKOUT, SysadminGuard.SELF_ROLE_MSG);
        }
    }

    /** 이 줄들 중 status 가 하나라도 있나. */
    private static boolean anyStatus(List<Map<String, Object>> master, String... statuses) {
        if (master == null) return false;
        for (Map<String, Object> row : master) {
            if (row == null) continue;
            String s = resolveStatus(row);
            for (String want : statuses) {
                if (want.equals(s)) return true;
            }
        }
        return false;
    }

    /**
     * 본인 계정 잠금 막기(c5 a) — 로그인한 사용자의 줄이 삭제이거나, 수정으로 유효 기간이 오늘을 벗어나면
     * {@code SELF_LOCKOUT} 으로 거절한다(아무것도 쓰기 전). 수정 줄은 USE_TP 를 쓰지 않으므로(applyUpdate) 기간만 본다.
     */
    private void requireNotSelfLockout(List<Map<String, Object>> master) {
        String me = sysadminGuard.currentUserId();
        if (me == null || master == null) return;
        LocalDate today = sysadminGuard.today();
        for (Map<String, Object> row : master) {
            if (row == null) continue;
            String userId = strOf(row.get("USER_ID"));
            if (userId == null || !me.equalsIgnoreCase(userId.trim())) continue;
            String status = resolveStatus(row);
            boolean lock = "deleted".equals(status) || "D".equals(status);
            if ("updated".equals(status) || "U".equals(status)) {
                LocalDateTime end = parseLocalDateTime(row.get("END_ACTIVE_DATE"), null);
                LocalDateTime start = parseLocalDateTime(row.get("START_ACTIVE_DATE"), null);
                lock = (end != null && end.toLocalDate().isBefore(today))
                       || (start != null && start.toLocalDate().isAfter(today));
            }
            if (lock) {
                throw new BusinessException(ErrorCode.BUSINESS_ERROR, SysadminGuard.SELF_LOCKOUT + ": " + SELF_ACCOUNT_MSG);
            }
        }
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
    // action: saveCmUser — 통합 저장 (inserted/updated/deleted 분기 / 2026-06-04 사용자 결정)
    // ────────────────────────────────────────────────────────────────

    /**
     * action {@code saveCmUser} 본문. 통합 저장 (2026-06-04 사용자 결정).
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
        requireNotSelfLockout(master);
        // c5 b — 삭제·기간 수정은 SYSADMIN 보유자를 줄일 수 있다. 쓰기 전에 잠그고 저장 뒤 다시 본다.
        SysadminGuard.Check sysadminCheck = anyStatus(master, "updated", "U", "deleted", "D")
                ? sysadminGuard.begin(SysadminGuard.PERM_BUSY) : null;
        int cnt = 0;
        List<LocalDate> sysadminEnds = new ArrayList<>(); // SYSADMIN 보유자에게 넣은 미래 기한일(D15)
        if (master != null) {
            for (Map<String, Object> row : master) {
                if (row == null) continue;
                String status = resolveStatus(row);
                String userId = strOf(row.get("USER_ID"));
                if (userId == null || userId.isBlank()) {
                    log.warn("[commUserMng.saveCmUser] USER_ID null — skip row (status={})", status);
                    continue;
                }
                if (sysadminCheck != null && ("updated".equals(status) || "U".equals(status))
                        && containsIgnoreCase(sysadminCheck.before(), userId)) {
                    LocalDateTime end = parseLocalDateTime(row.get("END_ACTIVE_DATE"), null);
                    if (end != null) sysadminEnds.add(end.toLocalDate());
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
        verifySysadmin(sysadminCheck);
        if (sysadminCheck != null) sysadminGuard.verifyFutureEnd(sysadminEnds, SysadminGuard.LAST_SYSADMIN);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("cnt_save", cnt);
        return out;
    }

    private static boolean containsIgnoreCase(Set<String> ids, String id) {
        for (String s : ids) {
            if (s.equalsIgnoreCase(id.trim())) return true;
        }
        return false;
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
        // V24 — 잠금 없음, 인사 상태 비움(인사 연동이 사번으로 이으면 ACTIVE), 사용 기간 제외는 행 값(기본 N)
        u.setLockYn("N");
        u.setLockCnt(0L);
        u.setPwdFailCount(0L);
        u.setPwdExpiryExemptYn(yn(row.get("PWD_EXPIRY_EXEMPT_YN")));
        secUserRepository.save(u);

        // 임시 비밀번호(D9) — 마지막 변경일 빈칸, 신규 계정은 7일 뒤 23:59:59 까지(D10)
        pwdWriter.resetToInitial(userId, userEmpNo, true);

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
        if (row.containsKey("PWD_EXPIRY_EXEMPT_YN")) {
            entity.setPwdExpiryExemptYn(yn(row.get("PWD_EXPIRY_EXEMPT_YN")));
        }
        secUserRepository.save(entity);
        return true;
    }

    /** Y/N 칸 — 'Y' 만 Y, 나머지(빈칸 포함)는 N. */
    private static String yn(Object v) {
        return "Y".equalsIgnoreCase(strOf(v)) ? "Y" : "N";
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
        // 2026-11-28 (시안 「사용자 비활성화·퇴직 처리」) — 계정 삭제 = 퇴직 처리. 유효 기한일 오늘 + USE_TP='N',
        // 역할그룹 회수, 사용자 쿼리 배정 해제, 이력 R(사유 「계정 삭제」). 담당 데이터는 「인계 대기」로 남는다(D4).
        // 행의 END_ACTIVE_DATE 는 더 쓰지 않는다(퇴직일 = 처리한 날).
        String userId = strOf(row.get("USER_ID"));
        SecUser u = secUserRepository.findById(userId).orElse(null);
        if (u == null) {
            log.warn("[commUserMng.saveCmUser/delete] skip — USER_ID={} not found", userId);
            return false;
        }
        if (lifecycle.stateOf(u) == AccountState.RETIRED) {
            log.info("[commUserMng.saveCmUser/delete] skip — USER_ID={} 이미 퇴직", userId);
            return false;
        }
        lifecycle.retire(u, "계정 삭제", false, null);
        return true;
    }

    // ────────────────────────────────────────────────────────────────
    // action: reRegCmUser — 계정 재생성 (updateReRegUser + mergeCommonPwdInit + HIS)
    // ────────────────────────────────────────────────────────────────

    /**
     * action {@code reRegCmUser} 본문. As-Is ReRegCommUserMng.java (ds_main.get(0) 단건 처리).
     *
     * <p>처리:
     * <ol>
     *   <li>updateReRegUser — START_ACTIVE_DATE=today / END_ACTIVE_DATE=9999-12-31 / USE_TP=Y</li>
     *   <li>updateReRegUserCnt < 1 → UserException ("사용자 정보 업데이트에 실패했습니다.")</li>
     *   <li>역할그룹 회수·잠금 해제(D7 — 역할 없이 새로 시작, 2026-11-28)</li>
     *   <li>mergeCommonPwdInit (bcrypt 임시 비밀번호 + bcrypt(USER_ID+USER_EMP_NO)) — 마지막 변경일 빈칸, 7일 기한</li>
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
                SecUser existing = secUserRepository.findById(userId).orElse(null);
                if (existing != null && AccountState.HR_RETIRED.equals(existing.getHrSt())) {
                    // 퇴직은 인사가 이긴다 — 재입사는 ERP 입사 정보로 처리한다(연동 규칙)
                    throw new BusinessException(ErrorCode.BUSINESS_ERROR,
                            "HR_RETIRED: ERP 인사에서 퇴직한 사람입니다. 재입사는 인사 입사 정보로 처리합니다");
                }
                LocalDateTime startDt = LocalDate.now().atStartOfDay();
                int affected = secUserRepository.updateReRegUser(userId, startDt, END_OF_TIME, "Y");
                if (affected < 1) {
                    // As-Is UserException — 본 미적용 시 silent log + cnt 0 (오아시스 layer 가 응답 envelope 처리)
                    log.error("[commUserMng.reRegCmUser] 사용자 정보 업데이트에 실패했습니다. USER_ID={}", userId);
                } else {
                    // D7 — 역할그룹 없이 새로 시작한다(퇴직 때 회수했지만 그 전에 삭제한 계정은 남아 있을 수 있다).
                    // 잠금도 푼다. 비밀번호는 임시(신규와 같이 7일).
                    lifecycle.revokeRoleGroups(userId, "계정 재생성 — 역할 없이 시작");
                    secUserRepository.clearLock(userId);
                    pwdWriter.resetToInitial(userId, userEmpNo, true);
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
    // action: saveUserRoleGrp — 역할그룹 추가/삭제 + 이력
    // ────────────────────────────────────────────────────────────────

    /**
     * action {@code saveUserRoleGrp} 본문. As-Is BPMN SaveRoleGroupHis → Task_saveUserRoleGrp 통합.
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
        // m19 — 시스템관리자·SYSADMIN 전용 화면 권한이 든 그룹을 붙이고 떼는 일은 SYSADMIN 만(잠금 전에 거절)
        requireSysadminForGroups(groupsOf(master));
        // c5 b — 그룹 빼기(SYSADMIN 그룹 포함)가 마지막 시스템관리자·본인 SYSADMIN 을 없애면 거절
        SysadminGuard.Check sysadminCheck = anyStatus(master, "deleted", "D")
                ? sysadminGuard.begin(SysadminGuard.PERM_BUSY) : null;
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
        verifySysadmin(sysadminCheck);
        publishRoleChanged(touchedRoleGroupIds);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("cnt_save", cnt);
        return out;
    }

    // ────────────────────────────────────────────────────────────────
    // action: saveUserRoleGrpCopy — 역할그룹 복사 (USER_ID_COPY → USER_ID, 비보유분만)
    // ────────────────────────────────────────────────────────────────

    /**
     * action {@code saveUserRoleGrpCopy} 본문. As-Is SaveRoleGroupCopyHis → Task_0v3mxy0 통합.
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
            // m19 — 복사할 그룹에 시스템관리자 권한이 들어 있으면 SYSADMIN 만
            requireSysadminForGroups(roleGroupIds);
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
    // helpers
    // ────────────────────────────────────────────────────────────────

    /** TB_MCM_SEC_USER_HIS — {@link CommUserMngHisWriter#userHisOn}(V24 순번). */
    private void saveUserHis(String userId, String activeDt, String procType, String procCase,
                             String userNm, String infReqNo, String description) {
        hisWriter.userHisOn(userId, activeDt, procType, procCase, userNm, infReqNo, description);
    }

    /** TB_MCM_SEC_USER_ROLL_HIS — {@link CommUserMngHisWriter#rollHis}. */
    private void saveUserRollHis(String opSumupDt, String worksCode, String userId, String roleGroupId,
                                 String respGbn, String roleGroupNm, String infReqNo, String description) {
        hisWriter.rollHis(opSumupDt, worksCode, userId, roleGroupId, respGbn, roleGroupNm, infReqNo, description);
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
    /** 행들의 ROLE_GROUP_ID(빈 값 제외). */
    private static List<String> groupsOf(List<Map<String, Object>> master) {
        List<String> out = new ArrayList<>();
        if (master == null) return out;
        for (Map<String, Object> row : master) {
            String g = row == null ? null : strOf(row.get("ROLE_GROUP_ID"));
            if (g != null && !g.isBlank()) out.add(g.trim());
        }
        return out;
    }

    /** 민감한 그룹(SYSADMIN 역할·SYSADMIN 전용 오브젝트 퍼미션이 든 그룹)이 있으면 SYSADMIN 만(m19, {@link SysadminGuard#sensitiveGroups}). */
    private void requireSysadminForGroups(java.util.Collection<String> groupIds) {
        if (groupIds == null || groupIds.isEmpty()) return;
        if (sysadminGuard.currentUserId() == null) return;
        if (!sysadminGuard.sensitiveGroups(groupIds).isEmpty()) {
            sysadminGuard.requireSysadmin();
        }
    }

    static String resolveStatus(Map<String, Object> row) {
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
