package com.dongkuk.dmes.mcm.oasis;

import org.springframework.jdbc.core.JdbcTemplate;

/**
 * {@link OasisCommitFailureSqliteTest} 의 BPMN({@code oasis-commit-failure/*.bpmn}) 이 빈 이름 {@code txProbeTask} 로 부르는 작업.
 *
 * <p>업무 Service 처럼 {@code @Transactional} 없이 리포지토리 프록시를 부른다 — 트랜잭션 경계는 OASIS 가 잡는다.
 */
public class TxProbeTask {

    private final TxProbeRowRepository repository;
    private final JdbcTemplate aux;

    /** 마지막으로 잡고 넘어간 예외 — 리포지토리 안에서 실제로 예외가 났는지 시험이 확인한다. */
    private volatile RuntimeException swallowed;

    public TxProbeTask(TxProbeRowRepository repository, JdbcTemplate aux) {
        this.repository = repository;
        this.aux = aux;
    }

    /** 정상 저장 — 커밋 경로 대조군. */
    public void saveOk() {
        repository.save(new TxProbeRow("OK1", "CODE_OK1"));
    }

    /**
     * 한 행을 저장한 뒤, 같은 CODE 로 {@code saveAndFlush} 를 불러 리포지토리 안에서 유일 제약 예외를 낸다.
     * 업무 코드가 흔히 하듯 그 예외를 잡고 계속 진행한다 — 리포지토리 프록시가 이미 트랜잭션을 rollback-only 로 표시했다.
     */
    public void swallowRepositoryFailure() {
        repository.save(new TxProbeRow("A1", "CODE_DUP"));
        try {
            repository.saveAndFlush(new TxProbeRow("A2", "CODE_DUP"));
        } catch (RuntimeException e) {
            swallowed = e;
        }
    }

    /**
     * 보조 DB 에 한 행을 쓰고, 같은 CODE 두 행을 flush 없이 저장한다. 작업은 정상 종료하고,
     * 커밋 시점 flush 에서 유일 제약 예외(DataAccessException)가 난다.
     */
    public void failAtCommitFlush() {
        aux.update("INSERT INTO TB_TEST_TX_AUX (ID) VALUES ('AUX1')");
        repository.save(new TxProbeRow("C1", "CODE_FLUSH"));
        repository.save(new TxProbeRow("C2", "CODE_FLUSH"));
    }

    /** 보조 DB 에만 한 행을 쓴다 — 시작 실패 시험(실행되지 않아야 함)과 그 뒤 다음 요청 대조군. */
    public void saveAux() {
        aux.update("INSERT INTO TB_TEST_TX_AUX (ID) VALUES ('AUX_OK')");
    }

    RuntimeException swallowed() {
        return swallowed;
    }

    void reset() {
        swallowed = null;
    }
}
