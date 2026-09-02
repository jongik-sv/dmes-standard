package com.dongkuk.dmes.mcm.adapter;

import com.dongkuk.dmes.cactus.security.auth.SecUser;
import com.dongkuk.dmes.cactus.security.auth.SecUserRepository;
import com.dongkuk.dmes.mcm.security.UserAccount;
import com.dongkuk.dmes.mcm.security.UserAccountRepository;
import org.springframework.context.annotation.Primary;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

/**
 * cactus.SecUserRepository → mcm-core.UserAccountRepository 어댑터.
 *
 * <p>find/findAll 결과를 {@link SecUserAccountAdapter} 로 감싸 반환하고, save 시에는
 * 어댑터를 unwrap 해 내부 SecUser 를 cactus repository 로 위임한다.
 *
 * <p>save 인자가 어댑터가 아닌 경우 (예: 다른 사이트가 다른 UserAccount 구현을 직접 만든 경우)
 * 는 본 어댑터에서 처리하지 않는다 — 본 런처 컨텍스트에서는 SecUserAccountAdapter 만 들어옴.
 */
@Repository
@Primary
public class SecUserAccountRepositoryAdapter implements UserAccountRepository {

    private final SecUserRepository delegate;

    public SecUserAccountRepositoryAdapter(SecUserRepository delegate) {
        this.delegate = delegate;
    }

    @Override
    public Optional<UserAccount> findById(String userId) {
        return delegate.findById(userId).map(SecUserAccountAdapter::new);
    }

    @Override
    public boolean existsById(String userId) {
        return delegate.existsById(userId);
    }

    @Override
    public UserAccount save(UserAccount account) {
        SecUser secUser = unwrapOrConvert(account);
        SecUser saved = delegate.save(secUser);
        return new SecUserAccountAdapter(saved);
    }

    @Override
    public void deleteById(String userId) {
        delegate.deleteById(userId);
    }

    @Override
    public List<UserAccount> findAll() {
        return delegate.findAll().stream()
                .map(u -> (UserAccount) new SecUserAccountAdapter(u))
                .toList();
    }

    /**
     * 신규 UserAccount(어댑터로 감싸지지 않은 경우) 가 들어왔을 때 SecUser 로 복사.
     * 본 런처 흐름에서는 항상 SecUserAccountAdapter 가 들어오므로 fast path 가 정상 경로.
     */
    private SecUser unwrapOrConvert(UserAccount account) {
        if (account instanceof SecUserAccountAdapter adapter) {
            return adapter.unwrap();
        }
        SecUser secUser = new SecUser();
        secUser.setUserId(account.getUserId());
        secUser.setUserNm(account.getUserNm());
        secUser.setUserNo(account.getUserEmpNo());
        secUser.setUserPass(account.getUserPass());
        secUser.setUseYn(account.getUseYn());
        secUser.setLockYn(account.getLockYn());
        secUser.setTryCnt(account.getTryCnt());
        secUser.setPassInitYn(account.getPassInitYn());
        secUser.setPassSetDd(account.getPassSetDd());
        secUser.setDeptCd(account.getDeptCd());
        return secUser;
    }
}
