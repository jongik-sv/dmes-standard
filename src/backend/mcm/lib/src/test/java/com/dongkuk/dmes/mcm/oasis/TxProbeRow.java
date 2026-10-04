package com.dongkuk.dmes.mcm.oasis;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

/**
 * {@link OasisCommitFailureSqliteTest} 전용 엔티티. CODE 에 유일 제약을 걸어 같은 코드를 두 번 넣으면 flush 에서 실패한다.
 */
@Entity
@Table(name = "TB_TEST_TX_PROBE")
public class TxProbeRow {

    @Id
    @Column(name = "ID", length = 20)
    private String id;

    @Column(name = "CODE", length = 40, nullable = false, unique = true)
    private String code;

    protected TxProbeRow() {
    }

    public TxProbeRow(String id, String code) {
        this.id = id;
        this.code = code;
    }

    public String getId() {
        return id;
    }

    public String getCode() {
        return code;
    }
}
