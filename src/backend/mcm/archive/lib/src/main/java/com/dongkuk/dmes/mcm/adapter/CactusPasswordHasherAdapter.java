package com.dongkuk.dmes.mcm.adapter;

import com.dongkuk.dmes.cactus.security.auth.PasswordEncoder;
import com.dongkuk.dmes.mcm.security.PasswordHasher;
import org.springframework.context.annotation.Primary;
import org.springframework.stereotype.Component;

/**
 * cactus.PasswordEncoder → mcm-core.PasswordHasher 어댑터.
 * mcm-core SecUserService 가 cactus 를 직접 import 하지 않게 하는 변환기.
 */
@Component
@Primary
public class CactusPasswordHasherAdapter implements PasswordHasher {

    private final PasswordEncoder delegate;

    public CactusPasswordHasherAdapter(PasswordEncoder delegate) {
        this.delegate = delegate;
    }

    @Override
    public String encode(String rawPassword) {
        return delegate.encode(rawPassword);
    }

    @Override
    public boolean matches(String rawPassword, String hashedPassword) {
        return delegate.matches(rawPassword, hashedPassword);
    }
}
