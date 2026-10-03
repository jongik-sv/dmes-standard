package com.dongkuk.dmes.mcm.oasis;

import org.springframework.data.jpa.repository.JpaRepository;

/**
 * {@link OasisCommitFailureSqliteTest} 전용 Spring Data 리포지토리. 메서드마다 {@code @Transactional}(REQUIRED) 프록시라
 * OASIS 가 시작한 트랜잭션에 합류하고, 안에서 예외가 나면 그 트랜잭션을 rollback-only 로 표시한다.
 */
public interface TxProbeRowRepository extends JpaRepository<TxProbeRow, String> {
}
