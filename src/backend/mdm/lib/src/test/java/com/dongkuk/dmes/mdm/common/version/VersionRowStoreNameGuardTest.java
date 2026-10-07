package com.dongkuk.dmes.mdm.common.version;

import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verifyNoInteractions;

import com.dongkuk.dmes.mdm.common.support.MdmTemporalBinder;
import com.dongkuk.dmes.mdm.contract.common.AuditStamp;
import com.dongkuk.dmes.mdm.contract.version.VersionRef;
import com.dongkuk.dmes.mdm.contract.version.VersionTarget;
import jakarta.persistence.EntityManager;
import java.math.BigDecimal;
import java.time.Instant;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

/**
 * TSK-01-03 design.md §3.1 L10 — 테이블·칼럼 이름은 명세에서만 오고, {@code ^[A-Z][A-Z0-9_]*$} 가 아니면 SQL 을
 * 만들기 전에 거부한다(불변 규칙 I17). EntityManager 는 한 번도 쓰이지 않아야 한다.
 */
class VersionRowStoreNameGuardTest {

    private static final VersionRef REF = new VersionRef(VersionTarget.MASTER_CODE, "PROC_CD", new BigDecimal("1.000"));
    private static final AuditStamp STAMP = new AuditStamp("kim", null, null, Instant.EPOCH);

    @ParameterizedTest
    @ValueSource(strings = {"tb_mdm_code_ver", "TB MDM", "TB_MDM;DROP", "1TB", ""})
    void 나쁜_테이블_이름은_SQL_전에_거부한다(String badName) {
        EntityManager em = mock(EntityManager.class);
        VersionRowStore store = store(em, new VersionTableSpec(badName, "MARU_CODE_ID", "VER", "TB_MDM_CODE", "MARU_CODE_ID", null, null));

        assertThrows(IllegalArgumentException.class, () -> store.find(REF));
        assertThrows(IllegalArgumentException.class, () -> store.casBumpRowVersion(REF, 0, STAMP));
        verifyNoInteractions(em);
    }

    @Test
    void 나쁜_칼럼_이름도_거부한다() {
        EntityManager em = mock(EntityManager.class);
        assertThrows(IllegalArgumentException.class, () -> store(em,
                new VersionTableSpec("TB_MDM_CODE_VER", "MARU_CODE_ID; --", "VER", "TB_MDM_CODE", "MARU_CODE_ID", null, null)).find(REF));
        assertThrows(IllegalArgumentException.class, () -> store(em,
                new VersionTableSpec("TB_MDM_CODE_VER", "MARU_CODE_ID", "ver", "TB_MDM_CODE", "MARU_CODE_ID", null, null)).find(REF));
        assertThrows(IllegalArgumentException.class, () -> store(em,
                new VersionTableSpec("TB_MDM_CODE_VER", "MARU_CODE_ID", "VER", "TB_MDM_CODE", "MARU_CODE_ID", "AUD VER", null))
                .markParentInUse(VersionTarget.MASTER_CODE, "PROC_CD", STAMP));
        assertThrows(IllegalArgumentException.class, () -> store(em,
                new VersionTableSpec("TB_MDM_CODE_VER", "MARU_CODE_ID", "VER", "TB_MDM_CODE", "MARU_CODE_ID", null, "VER;"))
                .markParentInUse(VersionTarget.MASTER_CODE, "PROC_CD", STAMP));
        assertThrows(IllegalArgumentException.class, () -> store(em,
                new VersionTableSpec("TB_MDM_CODE_VER", "MARU_CODE_ID", "VER", "tb_mdm_code", "MARU_CODE_ID", null, null))
                .markParentInUse(VersionTarget.MASTER_CODE, "PROC_CD", STAMP));
        verifyNoInteractions(em);
    }

    private static VersionRowStore store(EntityManager em, VersionTableSpec spec) {
        return new VersionRowStore(em, target -> spec, new MdmTemporalBinder());
    }
}
