package com.dongkuk.dmes.mcm.security;

import java.time.LocalDate;

/**
 * 신규 사용자 생성 시 mcm-core 내부에서 임시 사용하는 {@link UserAccount} POJO.
 *
 * <p>{@link UserAccount} 인터페이스에는 PK(setUserId) setter 가 없으므로 (보안상 PK 변경 차단),
 * 신규 케이스에는 본 클래스로 모든 필드를 채워 {@link UserAccountRepository#save} 에 전달한다.
 * 사이트 어댑터가 본 인스턴스를 받아 자기 영속 엔티티로 변환 책임.
 */
public class TransientUserAccount implements UserAccount {

    private String userId;
    private String userNm;
    private String userEmpNo;
    private String userPass;
    private String useYn;
    private String lockYn;
    private Integer tryCnt;
    private String passInitYn;
    private LocalDate passSetDd;
    private String deptCd;

    public void setUserId(String userId) { this.userId = userId; }

    @Override public String getUserId() { return userId; }
    @Override public String getUserNm() { return userNm; }
    @Override public void setUserNm(String userNm) { this.userNm = userNm; }
    @Override public String getUserEmpNo() { return userEmpNo; }
    @Override public void setUserEmpNo(String userEmpNo) { this.userEmpNo = userEmpNo; }
    @Override public String getUserPass() { return userPass; }
    @Override public void setUserPass(String hashedPassword) { this.userPass = hashedPassword; }
    @Override public String getUseYn() { return useYn; }
    @Override public void setUseYn(String useYn) { this.useYn = useYn; }
    @Override public String getLockYn() { return lockYn; }
    @Override public void setLockYn(String lockYn) { this.lockYn = lockYn; }
    @Override public Integer getTryCnt() { return tryCnt; }
    @Override public void setTryCnt(Integer tryCnt) { this.tryCnt = tryCnt; }
    @Override public String getPassInitYn() { return passInitYn; }
    @Override public void setPassInitYn(String passInitYn) { this.passInitYn = passInitYn; }
    @Override public LocalDate getPassSetDd() { return passSetDd; }
    @Override public void setPassSetDd(LocalDate passSetDd) { this.passSetDd = passSetDd; }
    @Override public String getDeptCd() { return deptCd; }
    @Override public void setDeptCd(String deptCd) { this.deptCd = deptCd; }
}
