/*
 * 작성자: @jongik-sv
 * 작성일: 2026-11-28
 * 내용: ERP 인사 정보 수신·처리·재시도·조회 — 인터페이스 방식(배치·실시간)은 ERP 스펙을 받은 뒤 정한다(D8)
 */
package com.dongkuk.dmes.mcm.csa.commUserMng.service;

import com.dongkuk.dmes.mcm.common.exception.BusinessException;
import com.dongkuk.dmes.mcm.common.exception.ErrorCode;
import com.dongkuk.dmes.mcm.entity.SecHrEvt;
import com.dongkuk.dmes.mcm.entity.SecUser;
import com.dongkuk.dmes.mcm.repository.SecHrEvtRepository;
import com.dongkuk.dmes.mcm.repository.SecUserRepository;
import com.dongkuk.dmes.mcm.security.account.AccountState;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

import static com.dongkuk.dmes.mcm.common.util.McmValues.strOf;

/**
 * ERP 인사 정보.
 *
 * <ul>
 *   <li>{@link #receive} — 받은 정보를 {@code TB_MCM_SEC_HR_EVT} 에 담는다. 같은 EVT_ID 를 다시 받으면 건너뛴다(같은 결과)</li>
 *   <li>{@link #processPending} — 대기·실패(시도 5회 미만) 건을 발령일 순으로 한 건씩 처리한다. 예약 작업
 *       {@code mcm.hrEventProcess} 가 10분마다 부른다</li>
 *   <li>{@link #retry} — 관리자 화면 「다시 처리」</li>
 *   <li>{@link #createAccount} — 입사 「계정 생성 대기」 건으로 계정을 만든다(D12) — dmes0000 임시 상태, 7일 기한, 역할그룹 없음</li>
 * </ul>
 * ERP 가 무엇으로 보낼지(DB 링크·파일·메시지·API)는 아직 모른다. 정해지면 그 수신부가 {@link #receive} 를 부르면 된다.
 */
@Service("commUserMngHrService")
public class CommUserMngHrService {

    /** 자동 재시도 상한 — 넘으면 화면 「다시 처리」로만 돈다. */
    static final int MAX_AUTO_TRY = 5;
    private static final Set<String> TYPES = Set.of(SecHrEvt.TP_HIRE, SecHrEvt.TP_LEAVE, SecHrEvt.TP_RETURN,
            SecHrEvt.TP_RETIRE, SecHrEvt.TP_MOVE, SecHrEvt.TP_INFO);
    private static final ZoneId KST = ZoneId.of("Asia/Seoul");

    private final SecHrEvtRepository hrEvtRepository;
    private final SecUserRepository secUserRepository;
    private final HrEventProcessor processor;
    private final CommUserMngPwdWriter pwdWriter;
    private final CommUserMngHisWriter hisWriter;

    CommUserMngHrService(SecHrEvtRepository hrEvtRepository,
                         SecUserRepository secUserRepository,
                         HrEventProcessor processor,
                         CommUserMngPwdWriter pwdWriter,
                         CommUserMngHisWriter hisWriter) {
        this.hrEvtRepository = hrEvtRepository;
        this.secUserRepository = secUserRepository;
        this.processor = processor;
        this.pwdWriter = pwdWriter;
        this.hisWriter = hisWriter;
    }

    /**
     * 인사 정보를 받는다. 칸: EVT_ID(없으면 만든다)·EMP_NO·EVT_TP·EVT_DT(YYYYMMDD)·ORDER_NO·USER_NM·DEPT_CD·EMAIL·TEL_NO·MOBILE_TEL_NO.
     *
     * @return 새로 담은 건수
     */
    public int receive(List<Map<String, Object>> rows) {
        int n = 0;
        if (rows == null) return 0;
        for (Map<String, Object> row : rows) {
            if (row == null) continue;
            String evtId = strOf(row.get("EVT_ID"));
            if (evtId != null && hrEvtRepository.existsById(evtId)) continue;
            String empNo = strOf(row.get("EMP_NO"));
            String tp = strOf(row.get("EVT_TP"));
            String dt = strOf(row.get("EVT_DT"));
            if (empNo == null || tp == null || !TYPES.contains(tp) || dt == null || !dt.matches("\\d{8}")) {
                throw new BusinessException(ErrorCode.INVALID_VALUE,
                        "인사 정보 형식이 맞지 않습니다(사번·구분·발령일): " + empNo + "/" + tp + "/" + dt);
            }
            SecHrEvt e = new SecHrEvt();
            e.setEvtId(evtId != null ? evtId : "HR" + UUID.randomUUID().toString().replace("-", "").substring(0, 30));
            e.setEmpNo(empNo);
            e.setEvtTp(tp);
            e.setEvtDt(dt);
            e.setOrderNo(strOf(row.get("ORDER_NO")));
            e.setUserNm(strOf(row.get("USER_NM")));
            e.setDeptCd(strOf(row.get("DEPT_CD")));
            e.setEmail(strOf(row.get("EMAIL")));
            e.setTelNo(strOf(row.get("TEL_NO")));
            e.setMobileTelNo(strOf(row.get("MOBILE_TEL_NO")));
            hrEvtRepository.save(e);
            n++;
        }
        return n;
    }

    /** 대기·실패 건을 처리한다. 처리한 건수. */
    public int processPending() {
        int n = 0;
        for (SecHrEvt e : hrEvtRepository.findByProcStIn(List.of(SecHrEvt.ST_WAIT, SecHrEvt.ST_FAIL))) {
            if (SecHrEvt.ST_FAIL.equals(e.getProcSt()) && e.getTryCnt() != null && e.getTryCnt() >= MAX_AUTO_TRY) continue;
            runOne(e.getEvtId());
            n++;
        }
        return n;
    }

    /** 고른 건을 다시 처리한다(쉼표로 이은 EVT_ID). 결과 목록. */
    public Map<String, Object> retry(String evtIds) {
        List<Map<String, Object>> results = new ArrayList<>();
        if (evtIds != null) {
            for (String id : Arrays.stream(evtIds.split(",")).map(String::trim).filter(s -> !s.isEmpty()).toList()) {
                String st = runOne(id);
                SecHrEvt e = hrEvtRepository.findById(id).orElse(null);
                Map<String, Object> r = new LinkedHashMap<>();
                r.put("EVT_ID", id);
                r.put("PROC_ST", st);
                r.put("PROC_MSG", e == null ? null : e.getProcMsg());
                results.add(r);
            }
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("ds_hrResult", results);
        out.put("cnt_save", results.size());
        return out;
    }

    private String runOne(String evtId) {
        try {
            return processor.processOne(evtId);
        } catch (RuntimeException ex) {
            processor.markFailed(evtId, ex.getMessage() == null ? ex.toString() : ex.getMessage());
            return SecHrEvt.ST_FAIL;
        }
    }

    /** 인사 정보 목록 — 처리 상태로 거른다(비우면 FAIL·HOLD·WAIT). */
    public Map<String, Object> search(String procSt) {
        List<String> sts = procSt == null || procSt.isBlank()
                ? List.of(SecHrEvt.ST_FAIL, SecHrEvt.ST_HOLD, SecHrEvt.ST_WAIT)
                : Arrays.stream(procSt.split(",")).map(String::trim).filter(s -> !s.isEmpty()).toList();
        List<Map<String, Object>> rows = new ArrayList<>();
        for (SecHrEvt e : hrEvtRepository.findByProcStIn(sts)) {
            Map<String, Object> r = new LinkedHashMap<>();
            r.put("EVT_ID", e.getEvtId());
            r.put("EMP_NO", e.getEmpNo());
            r.put("EVT_TP", e.getEvtTp());
            r.put("EVT_DT", e.getEvtDt());
            r.put("ORDER_NO", e.getOrderNo());
            r.put("USER_NM", e.getUserNm());
            r.put("DEPT_CD", e.getDeptCd());
            r.put("USER_ID", e.getUserId());
            r.put("PROC_ST", e.getProcSt());
            r.put("PROC_MSG", e.getProcMsg());
            r.put("TRY_CNT", e.getTryCnt());
            r.put("PROC_AT", e.getProcAt());
            rows.add(r);
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("ds_hrEvt", rows);
        return out;
    }

    /**
     * 입사 「계정 생성 대기」 건으로 계정을 만든다(D12). 사용자 ID 는 관리자가 정한다.
     * 이름·부서·연락처는 인사 값, 내부 구분 'I', HR_ST='ACTIVE', 비밀번호 = 임시(7일), 역할그룹 없음.
     */
    public Map<String, Object> createAccount(String evtId, String newUserId) {
        SecHrEvt e = hrEvtRepository.findById(evtId == null ? "" : evtId.trim())
                .orElseThrow(() -> new BusinessException(ErrorCode.BUSINESS_ERROR, "HR_EVT_NOT_FOUND: 인사 정보를 찾을 수 없습니다"));
        if (!SecHrEvt.ST_HOLD.equals(e.getProcSt()) || !SecHrEvt.TP_HIRE.equals(e.getEvtTp())) {
            throw new BusinessException(ErrorCode.BUSINESS_ERROR, "NOT_HOLD: 계정 생성 대기 건이 아닙니다");
        }
        if (newUserId == null || newUserId.isBlank()) {
            throw new BusinessException(ErrorCode.REQUIRED_VALUE, "사용자 아이디를 입력하세요");
        }
        String userId = newUserId.trim();
        if (secUserRepository.existsById(userId)) {
            throw new BusinessException(ErrorCode.DUPLICATE_DATA, "이미 있는 사용자 아이디입니다");
        }
        if (!secUserRepository.findByUserEmpNo(e.getEmpNo()).isEmpty()) {
            throw new BusinessException(ErrorCode.DUPLICATE_DATA, "이 사번을 쓰는 계정이 이미 있습니다");
        }
        LocalDate today = LocalDate.now(KST);
        SecUser u = new SecUser();
        u.setUserId(userId);
        u.setUserEmpNo(e.getEmpNo());
        u.setUserNm(e.getUserNm());
        u.setDeptCd(e.getDeptCd());
        u.setEmail(e.getEmail());
        u.setTelNo(e.getTelNo());
        u.setMobileTelNo(e.getMobileTelNo());
        u.setInOutEmpTp("I");
        u.setUseTp("Y");
        u.setHrSt(AccountState.HR_ACTIVE);
        u.setLockYn("N");
        u.setLockCnt(0L);
        u.setPwdFailCount(0L);
        u.setPwdExpiryExemptYn("N");
        u.setStartActiveDate(today.atStartOfDay());
        u.setEndActiveDate(LocalDateTime.of(9999, 12, 31, 0, 0));
        secUserRepository.save(u);
        pwdWriter.resetToInitial(userId, e.getEmpNo(), true);
        hisWriter.userHis(userId, CommUserMngHisWriter.TP_CREATE, CommUserMngHisWriter.CASE_HR, e.getUserNm(),
                UserLifecycleCore.HR_PREFIX + " 입사로 계정 생성" + (e.getOrderNo() == null ? "" : ": 발령 " + e.getOrderNo()));
        e.setUserId(userId);
        e.setProcSt(SecHrEvt.ST_DONE);
        e.setProcMsg("계정 생성: " + userId);
        e.setProcAt(LocalDateTime.now(KST));
        hrEvtRepository.save(e);

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("USER_ID", userId);
        out.put("INIT_PWD", pwdWriter.initialPassword());
        out.put("cnt_save", 1);
        return out;
    }
}
