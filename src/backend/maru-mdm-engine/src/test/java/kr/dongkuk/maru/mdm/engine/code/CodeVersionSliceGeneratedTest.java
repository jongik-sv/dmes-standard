package kr.dongkuk.maru.mdm.engine.code;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import kr.dongkuk.maru.mdm.engine.spi.CodeLookup.CodeRows;
import kr.dongkuk.maru.mdm.engine.testsupport.CodeEquivalence;
import kr.dongkuk.maru.mdm.engine.testsupport.CodeHistoryGenerator;
import org.junit.jupiter.api.Test;

/**
 * D-154 — 생성 데이터의 판정 동치(스펙 §6.2 「엔진 데이터」, 부록 A.1). 크기는 A(10버전·코드 100개·5%)와 줄인 B′(60버전·코드 200개·2%) — C(10만 행)는
 * 단위 시험 시간 때문에 돌리지 않는다(측정 때 1,200건 동치를 이미 확인).
 */
class CodeVersionSliceGeneratedTest {

    @Test
    void 시나리오_A_모든_경계_시각_모든_코드() {
        CodeRows full = CodeHistoryGenerator.generate("GEN_A", 10, 100, 0.05, 20261003L);
        assertEquals(10 + 1, full.versions().size());
        int checks = CodeEquivalence.assertEquivalent(full, CodeEquivalence.boundaryTimes(full), CodeEquivalence.cates(full),
                CodeEquivalence.codes(full), new int[] {1, 2, 10});
        assertTrue(checks >= 2 * 30 * 6 * 100, "비교 수 " + checks);
    }

    @Test
    void 시나리오_B_줄임_여섯_버전마다_경계와_다섯_번째_코드마다() {
        CodeRows full = CodeHistoryGenerator.generate("GEN_B", 60, 200, 0.02, 7L);
        List<LocalDateTime> all = CodeEquivalence.boundaryTimes(full);
        List<LocalDateTime> times = new ArrayList<>();
        for (int i = 0; i < all.size(); i += 6) {
            times.add(all.get(i));
        }
        times.add(all.get(all.size() - 1));
        List<String> codes = new ArrayList<>();
        for (int c = 0; c < 200; c += 5) {
            codes.add(CodeHistoryGenerator.code(c));
        }
        codes.add("NO_SUCH_CODE");
        codes.add(null);
        int checks = CodeEquivalence.assertEquivalent(full, times, CodeEquivalence.cates(full), codes, new int[] {1, 2});
        assertTrue(checks >= 2 * 30 * 6 * 42, "비교 수 " + checks);
    }

    @Test
    void 생성기는_같은_seed_면_같은_데이터다() {
        assertEquals(CodeHistoryGenerator.generate("G", 10, 50, 0.1, 1L), CodeHistoryGenerator.generate("G", 10, 50, 0.1, 1L));
    }
}
