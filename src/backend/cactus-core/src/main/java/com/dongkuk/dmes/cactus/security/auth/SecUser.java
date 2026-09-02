package com.dongkuk.dmes.cactus.security.auth;

import com.dongkuk.dmes.cactus.audit.CactusAuditEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.LocalDate;

/**
 * TB_SEC_USER 엔티티.
 * RBAC 엑셀 스키마 기준. 감사 컬럼은 CactusAuditEntity에서 상속.
 */
@Entity
@Table(name = "TB_SEC_USER")
public class SecUser extends CactusAuditEntity {

    /** 사용자 ID (PK) */
    @Id
    @Column(name = "USER_ID", length = 100)
    private String userId;

    /** 사용자 이름 */
    @Column(name = "USER_NM", length = 200)
    private String userNm;

    /** 사번 */
    @Column(name = "USER_NO", length = 50)
    private String userNo;

    /** 비밀번호 (BCrypt) */
    @Column(name = "USER_PASS", length = 100)
    private String userPass;

    /** 사용여부 (Y/N) */
    @Column(name = "USE_YN", length = 1)
    private String useYn;

    /** 잠금여부 (Y/N) */
    @Column(name = "LOCK_YN", length = 1)
    private String lockYn;

    /** 로그인 시도 횟수 */
    @Column(name = "TRY_CNT")
    private Integer tryCnt;

    /** 비밀번호 초기화 여부 (Y/N) */
    @Column(name = "PASS_INIT_YN", length = 1)
    private String passInitYn;

    /** 비밀번호 설정 일자 */
    @Column(name = "PASS_SET_DD")
    private LocalDate passSetDd;

    /** 부서 코드 */
    @Column(name = "DEPT_CD", length = 30)
    private String deptCd;

    /** 유효 시작일 */
    @Column(name = "VALID_STR_DD")
    private LocalDate validStrDd;

    /** 유효 종료일 */
    @Column(name = "VALID_END_DD")
    private LocalDate validEndDd;

    /** JPA 기본 생성자 */
    public SecUser() {
    }

    public String getUserId() { return userId; }
    public String getUserNm() { return userNm; }
    public String getUserNo() { return userNo; }
    public String getUserPass() { return userPass; }
    public String getUseYn() { return useYn; }
    public String getLockYn() { return lockYn; }
    public Integer getTryCnt() { return tryCnt; }
    public String getPassInitYn() { return passInitYn; }
    public LocalDate getPassSetDd() { return passSetDd; }
    public String getDeptCd() { return deptCd; }
    public LocalDate getValidStrDd() { return validStrDd; }
    public LocalDate getValidEndDd() { return validEndDd; }

    public void setUserId(String userId) { this.userId = userId; }
    public void setUserNm(String userNm) { this.userNm = userNm; }
    public void setUserNo(String userNo) { this.userNo = userNo; }
    public void setUserPass(String userPass) { this.userPass = userPass; }
    public void setUseYn(String useYn) { this.useYn = useYn; }
    public void setLockYn(String lockYn) { this.lockYn = lockYn; }
    public void setTryCnt(Integer tryCnt) { this.tryCnt = tryCnt; }
    public void setPassInitYn(String passInitYn) { this.passInitYn = passInitYn; }
    public void setPassSetDd(LocalDate passSetDd) { this.passSetDd = passSetDd; }
    public void setDeptCd(String deptCd) { this.deptCd = deptCd; }
    public void setValidStrDd(LocalDate validStrDd) { this.validStrDd = validStrDd; }
    public void setValidEndDd(LocalDate validEndDd) { this.validEndDd = validEndDd; }

    /** 계정 활성 여부 (USE_YN = 'Y') */
    public boolean isActive() { return "Y".equals(useYn); }

    /** 계정 잠금 여부 (LOCK_YN = 'Y') */
    public boolean isLocked() { return "Y".equals(lockYn); }

    /** 기존 API 호환 — userEmpNo → userNo */
    public String getUserEmpNo() { return userNo; }
}
