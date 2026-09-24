package com.dongkuk.dmes.mdm.entity;

import java.io.Serializable;
import java.util.Objects;

/**
 * {@link MdmDataRecvItem} 복합 PK({@code RECV_ID, SEQ}) — {@code @IdClass} 대상. 필드명은
 * {@link MdmDataRecvItem} 의 {@code @Id} 필드명과 정확히 같아야 한다(JPA 계약).
 */
public class MdmDataRecvItemId implements Serializable {

    private Long recvId;
    private Integer seq;

    public MdmDataRecvItemId() {
        // JPA 기본 생성자
    }

    public MdmDataRecvItemId(Long recvId, Integer seq) {
        this.recvId = recvId;
        this.seq = seq;
    }

    public Long getRecvId() { return recvId; }
    public Integer getSeq() { return seq; }

    @Override
    public boolean equals(Object o) {
        if (this == o) {
            return true;
        }
        if (!(o instanceof MdmDataRecvItemId other)) {
            return false;
        }
        return Objects.equals(recvId, other.recvId) && Objects.equals(seq, other.seq);
    }

    @Override
    public int hashCode() {
        return Objects.hash(recvId, seq);
    }
}
