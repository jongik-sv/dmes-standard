/*
 * 작성자: @jongik-sv
 * 작성일: 2026-11-28
 * 내용: commUserMng 사용자 이력(TB_MCM_SEC_USER_HIS)·역할 이력(TB_MCM_SEC_USER_ROLL_HIS) 쓰기 — 저장·상태 처리·인사 연동이 같이 쓴다
 */
package com.dongkuk.dmes.mcm.csa.commUserMng.service;

import com.dongkuk.dmes.mcm.entity.SecUserHis;
import com.dongkuk.dmes.mcm.entity.SecUserRollHis;
import com.dongkuk.dmes.mcm.repository.SecUserHisRepository;
import com.dongkuk.dmes.mcm.repository.SecUserRollHisRepository;
import org.springframework.stereotype.Component;

import java.time.LocalDate;
import java.time.format.DateTimeFormatter;

/**
 * 이력 쓰기.
 *
 * <p>사용자 이력 PROC_TYPE(1자): {@code C} 생성·재생성 · {@code D} 삭제(옛 동작) · {@code U} 정보 변경(인사 부서 이동 등) ·
 * {@code L} 잠금 해제 · {@code S} 비활성 · {@code A} 다시 사용(활성) · {@code R} 퇴직 · {@code H} 인계 · {@code P} 비밀번호 초기화.
 * PROC_CASE(1자): {@code M} 관리자 · {@code H} ERP 인사. 사유는 DESCRIPTION 에 쓴다(A안 — 비워 두던 칸).
 * 처리자는 감사 칸(C_USR_ID)에 남는다. 인사 처리는 처리자가 시스템이므로 DESCRIPTION 앞에 「ERP 인사」를 붙인다.
 *
 * <p>V24 — 사용자 이력 PK 에 HIS_SEQ 를 더했다. 같은 날 여러 번 처리해도 줄이 쌓인다.
 */
@Component("commUserMngHisWriter")
class CommUserMngHisWriter {

    static final String TP_CREATE = "C";
    static final String TP_DELETE = "D";
    static final String TP_UPDATE = "U";
    static final String TP_UNLOCK = "L";
    static final String TP_SUSPEND = "S";
    static final String TP_RESUME = "A";
    static final String TP_RETIRE = "R";
    static final String TP_HANDOVER = "H";
    static final String TP_PWD_INIT = "P";

    static final String CASE_MANUAL = "M";
    static final String CASE_HR = "H";

    private static final DateTimeFormatter YYYYMMDD = DateTimeFormatter.ofPattern("yyyyMMdd");
    /** DESCRIPTION 칸 길이. */
    private static final int DESC_MAX = 300;

    private final SecUserHisRepository secUserHisRepository;
    private final SecUserRollHisRepository secUserRollHisRepository;

    CommUserMngHisWriter(SecUserHisRepository secUserHisRepository, SecUserRollHisRepository secUserRollHisRepository) {
        this.secUserHisRepository = secUserHisRepository;
        this.secUserRollHisRepository = secUserRollHisRepository;
    }

    static String today() {
        return LocalDate.now().format(YYYYMMDD);
    }

    /** 오늘 날짜로 사용자 이력 한 줄. */
    void userHis(String userId, String procType, String procCase, String userNm, String description) {
        userHisOn(userId, today(), procType, procCase, userNm, null, description);
    }

    /** 날짜를 주고 사용자 이력 한 줄 — 같은 날 마지막 순번 + 1. */
    void userHisOn(String userId, String activeDt, String procType, String procCase,
                   String userNm, String infReqNo, String description) {
        if (userId == null || activeDt == null) return;
        SecUserHis h = new SecUserHis();
        h.setUserId(userId);
        h.setActiveDt(activeDt);
        h.setHisSeq(secUserHisRepository.findMaxSeq(userId, activeDt) + 1);
        h.setProcType(procType);
        h.setProcCase(procCase);
        h.setUserNm(userNm);
        h.setInfReqNo(infReqNo);
        h.setDescription(clip(description));
        secUserHisRepository.saveAndFlush(h);
    }

    /**
     * TB_MCM_SEC_USER_ROLL_HIS save — 5 복합 PK upsert / mergePK 등가.
     *
     * <p>PK 가 날짜까지라 같은 날 같은 그룹을 다시 주면(또는 다시 빼면) 앞 행을 고친다. perm-crudfix c3 — 전에는 새 엔티티를
     * {@code save}(merge) 해서 C_USR_ID·C_AT 가 null 로 덮였다. 있는 행을 읽어 내용 칸만 바꾼다 → 감사 리스너가 U_* 만 채운다.
     */
    void rollHis(String opSumupDt, String worksCode, String userId, String roleGroupId,
                 String respGbn, String roleGroupNm, String infReqNo, String description) {
        if (userId == null || roleGroupId == null) return;
        SecUserRollHis h = secUserRollHisRepository
                .findById(new SecUserRollHis.PK(opSumupDt, worksCode, userId, roleGroupId, respGbn))
                .orElseGet(SecUserRollHis::new);
        h.setOpSumupDt(opSumupDt);
        h.setWorksCode(worksCode);
        h.setUserId(userId);
        h.setRoleGroupId(roleGroupId);
        h.setRespGbn(respGbn);
        h.setRoleGroupNm(roleGroupNm);
        h.setInfReqNo(infReqNo);
        h.setDescription(clip(description));
        if (h.getCreatedAt() != null) {
            // 같은 값으로 다시 줘도 다시 준 시각이 남게 한다(값이 같으면 dirty 가 아니라 PreUpdate 가 돌지 않는다)
            h.setUpdatedAt(java.time.Instant.now());
        }
        secUserRollHisRepository.save(h);
    }

    private static String clip(String s) {
        if (s == null) return null;
        return s.length() <= DESC_MAX ? s : s.substring(0, DESC_MAX);
    }
}
