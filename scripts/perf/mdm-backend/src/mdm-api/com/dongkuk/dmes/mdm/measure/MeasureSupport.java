package com.dongkuk.dmes.mdm.measure;

import java.lang.management.ManagementFactory;
import java.util.Arrays;
import java.util.Locale;
import java.util.StringJoiner;
import org.junit.jupiter.api.Assumptions;

/**
 * MDM 백엔드 성능 측정 하네스 공용(scripts/perf/mdm-backend — run-measure.sh 가 측정할 때만 측정 워크트리에 복사하고 지운다).
 *
 * <p>출력은 한 줄 형식 {@code MEASURE <P번호> <시나리오> <지표>=<값> ...} 이다. 값의 공백은 {@code _} 로 바꾼다(스크립트가 공백으로 나눈다).
 * 환경변수 {@code MDM_MEASURE} 가 없으면 측정 시험은 건너뛴다. {@code MDM_MEASURE_DRY} 가 있으면 규모·반복을 줄여 컴파일·실행·출력 수집만 본다.
 */
public final class MeasureSupport {

    private MeasureSupport() {
    }

    public static void assumeEnabled() {
        Assumptions.assumeTrue(System.getenv("MDM_MEASURE") != null, "MDM_MEASURE 가 없으면 측정하지 않는다");
    }

    public static boolean dry() {
        return System.getenv("MDM_MEASURE_DRY") != null;
    }

    public static int warmup(int normal) {
        return dry() ? 0 : normal;
    }

    public static int reps(int normal) {
        return dry() ? 1 : normal;
    }

    /** {@code MEASURE p scenario k1=v1 k2=v2 ...} 한 줄. kv 는 이름·값 짝. */
    public static void emit(String p, String scenario, Object... kv) {
        StringBuilder sb = new StringBuilder("MEASURE ").append(p).append(' ').append(scenario);
        for (int i = 0; i + 1 < kv.length; i += 2) {
            sb.append(' ').append(kv[i]).append('=').append(fmt(kv[i + 1]));
        }
        System.out.println(sb);
    }

    /** 두 kv 배열을 이어 붙인다. */
    public static Object[] concat(Object[] a, Object... b) {
        Object[] out = Arrays.copyOf(a, a.length + b.length);
        System.arraycopy(b, 0, out, a.length, b.length);
        return out;
    }

    private static String fmt(Object v) {
        if (v instanceof Double d) {
            return String.format(Locale.ROOT, "%.2f", d);
        }
        return String.valueOf(v).replace(' ', '_');
    }

    public static double load() {
        return ManagementFactory.getOperatingSystemMXBean().getSystemLoadAverage();
    }

    public static void env(String p) {
        emit(p, "env", "java", System.getProperty("java.version"), "cpus", Runtime.getRuntime().availableProcessors(),
                "dry", dry(), "load1", load());
    }

    /** 반복 시간(ns)의 중앙값·최소·최대(ms)와 원값(ms, 쉼표 구분). */
    public static Object[] timingKv(long[] nanos) {
        long[] sorted = nanos.clone();
        Arrays.sort(sorted);
        StringJoiner runs = new StringJoiner(",");
        for (long v : nanos) {
            runs.add(String.format(Locale.ROOT, "%.1f", v / 1e6));
        }
        return new Object[] {"ms_median", sorted[sorted.length / 2] / 1e6, "ms_min", sorted[0] / 1e6, "ms_max",
                sorted[sorted.length - 1] / 1e6, "reps", nanos.length, "runs_ms", runs.toString()};
    }
}
