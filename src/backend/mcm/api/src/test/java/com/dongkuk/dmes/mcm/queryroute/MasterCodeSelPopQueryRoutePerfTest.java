package com.dongkuk.dmes.mcm.queryroute;

import com.dongkuk.dmes.mcm.cma.masterCodeSelPop.service.MasterCodeSelPopService;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Locale;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assumptions.assumeTrue;

/**
 * 조회 라우터 시범 측정(설계 §10 3) — 같은 조회를 OASIS 경로와 조회 라우터 경로로 번갈아 부르며 MockMvc 요청 하나의 왕복 시간을 잰다.
 * 행 수 두 단계(100·10,000), 워밍업 각 경로 5회 제외 뒤 각 20회, 중앙값·p90(ms).
 *
 * <p>평소 시험에서는 돌지 않는다 — {@code -DqueryRoute.perf=true} 또는 환경 변수 {@code QUERY_ROUTE_PERF=1} 일 때만 돈다(시간이 들고 결과가 PC 부하에 흔들린다).
 * 결과는 표준 출력의 {@code PERF} 줄로 남는다. 한계: 공유 Oracle 시험 PDB·MockMvc(HTTP 없음)·로깅 인터셉터 없음이라 운영 DB·WAS 와
 * 절대값이 다르다. OASIS 경로는 transactional=true 라 JPA 트랜잭션(txBiz)을 열고 닫고, 라우터는 트랜잭션 없이 자동 커밋으로 돈다.
 */
class MasterCodeSelPopQueryRoutePerfTest {

    private static final int WARMUP = 5;
    private static final int RUNS = 20;

    @Test
    void 경로별_왕복_시간() throws Exception {
        assumeTrue(Boolean.getBoolean("queryRoute.perf") || "1".equals(System.getenv("QUERY_ROUTE_PERF")),
                "-DqueryRoute.perf=true 또는 QUERY_ROUTE_PERF=1 일 때만 측정한다");
        for (int size : new int[]{100, 10_000}) {
            measure(size);
        }
    }

    private void measure(int size) throws Exception {
        try (QueryRouteHarness h = new QueryRouteHarness("query-route-perf-" + size,
                MasterCodeSelPopQueryRouteParityTest.MAPPER,
                ctx -> ctx.registerBean("masterCodeSelPopService", MasterCodeSelPopService.class))) {
            List<Object[]> rows = new ArrayList<>(size + 10);
            for (int i = 0; i < size; i++) {
                rows.add(new Object[]{"PERF", String.format("V%06d", i), "의미 " + i, "C" + (i % 10), "분류" + (i % 10)});
            }
            for (int i = 0; i < 10; i++) {
                rows.add(new Object[]{"OTHER", String.format("W%06d", i), "다른 코드", "C0", "분류0"});
            }
            h.insertCodeRows(rows);

            Map<String, Object> params = Map.of("pCodeId", "PERF");
            assertThat(h.oasis("masterCodeSelPop", "search", "items", params)).hasSize(size);
            assertThat(h.query("masterCodeSelPop.search", params)).hasSize(size);

            long[] oasis = new long[RUNS];
            long[] query = new long[RUNS];
            for (int i = 0; i < WARMUP + RUNS; i++) {
                // 번갈아 부른다 — 한 경로를 몰아 재면 캐시·JIT 상태가 한쪽으로 기운다. 짝수 회차는 OASIS 먼저, 홀수는 라우터 먼저.
                long o;
                long q;
                if (i % 2 == 0) {
                    o = time(() -> h.oasis("masterCodeSelPop", "search", "items", params));
                    q = time(() -> h.query("masterCodeSelPop.search", params));
                } else {
                    q = time(() -> h.query("masterCodeSelPop.search", params));
                    o = time(() -> h.oasis("masterCodeSelPop", "search", "items", params));
                }
                if (i >= WARMUP) {
                    oasis[i - WARMUP] = o;
                    query[i - WARMUP] = q;
                }
            }
            System.out.println(String.format(Locale.ROOT,
                    "PERF rows=%d runs=%d warmup=%d | oasis median=%.2fms p90=%.2fms | query median=%.2fms p90=%.2fms",
                    size, RUNS, WARMUP, ms(percentile(oasis, 50)), ms(percentile(oasis, 90)),
                    ms(percentile(query, 50)), ms(percentile(query, 90))));
        }
    }

    private interface Call {
        Object run() throws Exception;
    }

    private static long time(Call call) throws Exception {
        long start = System.nanoTime();
        call.run();
        return System.nanoTime() - start;
    }

    /** 최근접 순위 백분위 — 20개에서 p50 은 10번째, p90 은 18번째 값. */
    private static long percentile(long[] values, int p) {
        long[] sorted = Arrays.copyOf(values, values.length);
        Arrays.sort(sorted);
        int rank = (int) Math.ceil(p / 100.0 * sorted.length);
        return sorted[Math.max(0, rank - 1)];
    }

    private static double ms(long nanos) {
        return nanos / 1_000_000.0;
    }
}
