package com.dongkuk.dmes.mdm.dma.domainMng;

import com.dongkuk.dmes.mdm.common.dictionary.DomainTreeReader;
import com.dongkuk.dmes.mdm.common.dictionary.DomainTreeSnapshot;
import com.dongkuk.dmes.mdm.contract.dictionary.MdmDomainReference;
import com.dongkuk.dmes.mdm.contract.dictionary.MdmDomainReferenceSpi;
import com.dongkuk.dmes.mdm.repository.MdmDomainRepository;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.TreeSet;
import kr.dongkuk.maru.mdm.engine.spi.CodeLookup;
import kr.dongkuk.maru.mdm.engine.spi.CodeLookup.CodeCateItemRow;
import kr.dongkuk.maru.mdm.engine.spi.CodeLookup.CodeCateRow;
import kr.dongkuk.maru.mdm.engine.spi.CodeLookup.CodeHeader;
import kr.dongkuk.maru.mdm.engine.spi.CodeLookup.CodeItemRow;
import kr.dongkuk.maru.mdm.engine.spi.CodeLookup.CodeRows;
import kr.dongkuk.maru.mdm.engine.spi.CodeLookup.CodeVersionRow;
import kr.dongkuk.maru.mdm.engine.spi.FunctionProvider;
import kr.dongkuk.maru.mdm.engine.spi.FunctionProvider.BusinessFunction;
import kr.dongkuk.maru.mdm.engine.spi.FunctionProvider.Param;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;

/**
 * TSK-04-03 design.md §2 — 테스트 전용 빈 묶음. 모두 {@code @TestConfiguration} 이라 컴포넌트 스캔에 잡히지 않고
 * {@code @Import} 한 테스트에만 들어간다(다른 mdm 컨텍스트로 새지 않는다).
 */
public final class DomainMngTestConfig {

    private DomainMngTestConfig() {}

    /** 비즈니스 함수 {@code THK_OK(v)} — 늘 true. 표준 칸에 쓰면 R02. */
    @TestConfiguration(proxyBeanMethods = false)
    public static class Functions {
        @Bean
        FunctionProvider domainTestFunctions() {
            return () -> List.of(new BusinessFunction("THK_OK", List.of(new Param("v", true)), false, args -> Boolean.TRUE));
        }
    }

    /**
     * 메모리 마루 코드 원장 — {@code PROC_CD}: RELEASED 1.000(적용 중), DRAFT 2.000. 카테고리 BASE·COATING 은 1.000 부터,
     * DRAFT_ONLY 는 DRAFT 2.000 에만 있다(R10). 항목 C1·C2, COATING 소속은 C1 뿐.
     */
    @TestConfiguration(proxyBeanMethods = false)
    public static class Codes {
        @Bean
        CodeLookup domainTestCodes() {
            return MEMORY_CODES;
        }
    }

    public static final CodeLookup MEMORY_CODES = id -> !"PROC_CD".equals(id) ? Optional.empty() : Optional.of(procCd());

    private static CodeRows procCd() {
        BigDecimal v1 = new BigDecimal("1.000");
        BigDecimal v2 = new BigDecimal("2.000");
        BigDecimal open = new BigDecimal("9999.000");
        List<String> lvl = Arrays.asList(new String[5]);
        List<String> attrs = Arrays.asList(new String[10]);
        return new CodeRows(new CodeHeader("PROC_CD", "INUSE"),
                List.of(new CodeVersionRow(v1, "RELEASED", LocalDateTime.of(2020, 1, 1, 0, 0), LocalDateTime.of(9999, 12, 31, 0, 0)),
                        new CodeVersionRow(v2, "DRAFT", null, null)),
                List.of(new CodeItemRow("C1", v1, open, "냉연", null, 1, lvl, attrs),
                        new CodeItemRow("C2", v1, open, "도금", null, 2, lvl, attrs)),
                List.of(new CodeCateRow("BASE", v1, open, "REGEX", ".*", "CODE"),
                        new CodeCateRow("COATING", v1, open, "TABLE", null, null),
                        new CodeCateRow("DRAFT_ONLY", v2, open, "REGEX", ".*", "CODE")),
                List.of(new CodeCateItemRow("COATING", "C1", v1, open)));
    }

    /** 03·06 이 구현할 SPI 의 스텁 두 개 — 받은 인자를 기록한다(수용 기준 6 대조군). */
    @TestConfiguration(proxyBeanMethods = false)
    public static class ReferenceSpis {
        @Bean
        RecordingSpi layoutItemSpi() {
            return new RecordingSpi("LAYOUT_ITEM", "LAYOUT-7:ITEM-1");
        }

        @Bean
        RecordingSpi ruleVarSpi() {
            return new RecordingSpi("RULE_VAR", "RULE-3:VAR-2");
        }
    }

    public static final class RecordingSpi implements MdmDomainReferenceSpi {
        private final String refKind;
        private final String refKey;
        public final List<Set<Long>> domainIdCalls = Collections.synchronizedList(new ArrayList<>());
        public final List<Set<String>> physNameCalls = Collections.synchronizedList(new ArrayList<>());

        RecordingSpi(String refKind, String refKey) {
            this.refKind = refKind;
            this.refKey = refKey;
        }

        @Override
        public List<MdmDomainReference> referencesTo(Set<Long> domainIds, Set<String> columnPhysNames) {
            domainIdCalls.add(new TreeSet<>(domainIds));
            physNameCalls.add(new TreeSet<>(columnPhysNames));
            return List.of(new MdmDomainReference(refKind, refKey));
        }
    }

    /**
     * 롤백 증명용 감싸개(design §4.3 B3) — 위임받은 {@link DomainTreeReader}(EntityManager 경로)로 읽고, 읽을 때마다 스냅샷을
     * 기록한다. 저장 중 두 번째 load 가 방금 쓴 규칙을 보았는지를 테스트가 확인한다.
     */
    @TestConfiguration(proxyBeanMethods = false)
    public static class RecordingReader {
        @Bean
        @Primary
        RecordingDomainTreeReader recordingDomainTreeReader(MdmDomainRepository repository) {
            return new RecordingDomainTreeReader(repository);
        }
    }

    public static class RecordingDomainTreeReader extends DomainTreeReader {
        public final List<DomainTreeSnapshot> loads = Collections.synchronizedList(new ArrayList<>());

        public RecordingDomainTreeReader(MdmDomainRepository repository) {
            super(repository);
        }

        @Override
        public DomainTreeSnapshot load() {
            DomainTreeSnapshot s = super.load();
            loads.add(s);
            return s;
        }
    }
}
