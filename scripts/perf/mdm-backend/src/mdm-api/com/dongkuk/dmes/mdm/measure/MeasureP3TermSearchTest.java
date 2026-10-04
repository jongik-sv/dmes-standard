package com.dongkuk.dmes.mdm.measure;

import static org.junit.jupiter.api.Assertions.assertTrue;

import com.dongkuk.dmes.mdm.common.testdb.AbstractMdmSharedDbTest;
import com.dongkuk.dmes.mdm.dma.termMng.dto.TermSearchRequest;
import com.dongkuk.dmes.mdm.dma.termMng.dto.TermSearchResult;
import com.dongkuk.dmes.mdm.dma.termMng.service.TermMngService;
import jakarta.persistence.EntityManager;
import jakarta.persistence.EntityManagerFactory;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import javax.sql.DataSource;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.PlatformTransactionManager;

/**
 * P3 — 용어 검색({@code TermMngService.search}) 1회당 읽는 용어 행 수(엔티티 로드)·SQL 문 수(결정적)와 응답 시간(보조).
 * perf-mdm-backend.md P3. 설정은 {@code TermMngSearchCharacterizationTest}(dev) 와 같다(@SpringBootTest MOCK·local, 가져오는 설정 없음).
 *
 * <p>데이터는 로컬 MDM DB 사본의 용어 전체(8,152행, EMBEDDING 포함)를 원래 ID 로 옮긴다({@link SourceDb}). JSON 파싱 횟수는 재지 않는다 — 기준에는
 * 파서 호출을 셀 자리({@code MdmJsonLists})가 없고 운영 코드를 고치지 않기로 했다.
 *
 * <p>시나리오(이름은 ASCII): {@code none}=조건 없음, {@code kw-koil}=키워드 '코일', {@code kw-coil}=키워드 'coil', {@code ctx-dogeum}=상황 '도금'만,
 * {@code sys-ERP}=시스템 'ERP'만, {@code combo}=키워드 'coil'+시스템 'MES'+상황 '공통'.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.MOCK)
@ActiveProfiles("local")
class MeasureP3TermSearchTest extends AbstractMdmSharedDbTest {

    private static final String P = "P3";

    @Autowired
    TermMngService service;
    @Autowired
    DataSource dataSource;
    @Autowired
    PlatformTransactionManager tm;
    @Autowired
    EntityManager em;
    @Autowired
    EntityManagerFactory emf;

    @Test
    void 용어_검색_읽는_행_수_문_수_응답_시간() {
        MeasureSupport.assumeEnabled();
        MeasureSupport.env(P);
        Map<String, Integer> counts = SourceDb.load(dataSource, false);
        MeasureSupport.emit(P, "data", "source", SourceDb.path().getFileName(), "terms", counts.get("TB_MDM_TERM"));
        StatProbe probe = new StatProbe(tm, em, emf);
        List<String> problems = new ArrayList<>();

        Object[][] scenarios = {
                {"none", null, null, null},
                {"kw-koil", "코일", null, null},
                {"kw-coil", "coil", null, null},
                {"ctx-dogeum", null, null, "도금"},
                {"sys-ERP", null, "ERP", null},
                {"combo", "coil", "MES", "공통"},
        };
        for (Object[] s : scenarios) {
            String name = (String) s[0];
            TermSearchRequest req = request((String) s[1], (String) s[2], (String) s[3]);
            StatProbe.Counts k = probe.inTx(() -> service.search(req));
            int rows = k.result() instanceof TermSearchResult r ? r.getList().size() : -1;
            if (k.error() != null) {
                problems.add(name + ": " + k.error());
            }
            MeasureSupport.emit(P, name, MeasureSupport.concat(new Object[] {"rows", rows}, k.kv()));
        }
        for (Object[] s : scenarios) {
            String name = (String) s[0];
            TermSearchRequest req = request((String) s[1], (String) s[2], (String) s[3]);
            long[] t = probe.timeInTx(() -> service.search(req), MeasureSupport.warmup(3), MeasureSupport.reps(9));
            MeasureSupport.emit(P, name + "-time", MeasureSupport.concat(MeasureSupport.timingKv(t), "load1", MeasureSupport.load()));
        }
        assertTrue(problems.isEmpty(), "검색 오류: " + problems);
    }

    private static TermSearchRequest request(String keyword, String systems, String context) {
        TermSearchRequest r = new TermSearchRequest();
        r.setKeyword(keyword);
        r.setSystems(systems);
        r.setContext(context);
        return r;
    }
}
