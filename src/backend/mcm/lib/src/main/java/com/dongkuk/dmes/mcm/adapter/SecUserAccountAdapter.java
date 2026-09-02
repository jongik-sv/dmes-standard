package com.dongkuk.dmes.mcm.adapter;

import com.dongkuk.dmes.cactus.security.auth.SecUser;
import com.dongkuk.dmes.mcm.security.UserAccount;

import java.time.Instant;
import java.time.LocalDate;

/**
 * cactus.SecUser → mcm-core.UserAccount 어댑터.
 *
 * <p>mcm-core 가 cactus 를 직접 import 하지 않게 하기 위한 사이트 측 변환기.
 * SecUserService(mcm-core) 가 UserAccount 인터페이스만 보고 동작하면, 본 어댑터가
 * 내부적으로 cactus.SecUser 와 모든 필드 위임을 수행한다.
 *
 * <p>모든 setter 는 내부 SecUser 의 필드를 직접 수정하므로, repository.save 시 같은
 * SecUser 인스턴스를 재사용하면 변경 추적이 자연스럽다.
 */
public class SecUserAccountAdapter implements UserAccount {

    private final SecUser delegate;

    public SecUserAccountAdapter(SecUser delegate) {
        this.delegate = delegate;
    }

    /** 어댑터가 감싸고 있는 cactus.SecUser 원본 — repository 측에서 save 시 사용. */
    public SecUser unwrap() {
        return delegate;
    }

    @Override public String getUserId() { return delegate.getUserId(); }

    @Override public String getUserNm() { return delegate.getUserNm(); }
    @Override public void setUserNm(String userNm) { delegate.setUserNm(userNm); }

    @Override public String getUserEmpNo() { return delegate.getUserEmpNo(); }
    @Override public void setUserEmpNo(String userEmpNo) { delegate.setUserNo(userEmpNo); }

    @Override public String getUserPass() { return delegate.getUserPass(); }
    @Override public void setUserPass(String hashedPassword) { delegate.setUserPass(hashedPassword); }

    @Override public String getUseYn() { return delegate.getUseYn(); }
    @Override public void setUseYn(String useYn) { delegate.setUseYn(useYn); }

    @Override public String getLockYn() { return delegate.getLockYn(); }
    @Override public void setLockYn(String lockYn) { delegate.setLockYn(lockYn); }

    @Override public Integer getTryCnt() { return delegate.getTryCnt(); }
    @Override public void setTryCnt(Integer tryCnt) { delegate.setTryCnt(tryCnt); }

    @Override public String getPassInitYn() { return delegate.getPassInitYn(); }
    @Override public void setPassInitYn(String passInitYn) { delegate.setPassInitYn(passInitYn); }

    @Override public LocalDate getPassSetDd() { return delegate.getPassSetDd(); }
    @Override public void setPassSetDd(LocalDate passSetDd) { delegate.setPassSetDd(passSetDd); }

    @Override public String getDeptCd() { return delegate.getDeptCd(); }
    @Override public void setDeptCd(String deptCd) { delegate.setDeptCd(deptCd); }

    // ── Audit timestamps — cactus.CactusAuditEntity 위임 ──
    @Override public String getCreatedBy() { return delegate.getCreatedBy(); }
    @Override public Instant getCreatedAt() { return delegate.getCreatedAt(); }
    @Override public String getUpdatedBy() { return delegate.getUpdatedBy(); }
    @Override public Instant getUpdatedAt() { return delegate.getUpdatedAt(); }
}
