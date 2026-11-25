package com.dongkuk.dmes.mqc.qpr.qualityCertificate.service;

import com.dongkuk.dmes.mqc.qpr.qualityCertificate.domain.WtyHistory;
import com.dongkuk.dmes.mqc.qpr.qualityCertificate.domain.WtyVersion;
import java.lang.reflect.Field;
import java.lang.reflect.Proxy;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.function.Function;

/** 시험용 메모리 저장소 — 품질보증서 서비스가 부르는 저장소 메서드만 이름으로 흉내 낸다. */
final class WtyMemoryRepos {

    private WtyMemoryRepos() {
    }

    private static final Comparator<Object> HIST_DESC = Comparator.comparing((Object o) -> ((WtyHistory) o).getActAt())
            .thenComparing(o -> ((WtyHistory) o).getHistNo()).reversed();

    @SuppressWarnings("unchecked")
    static <R> R of(Class<R> type, Function<Object, Object> idOf) {
        Map<Object, Object> rows = new LinkedHashMap<>();
        long[] seq = {0};
        return (R) Proxy.newProxyInstance(type.getClassLoader(), new Class<?>[] {type}, (proxy, m, args) -> {
            Object a0 = args == null || args.length == 0 ? null : args[0];
            List<Object> all = new ArrayList<>(rows.values());
            switch (m.getName()) {
                case "save" -> {
                    Object id = idOf.apply(a0);
                    if (id == null) {
                        id = ++seq[0];
                        setField(a0, "histNo", id);
                    }
                    rows.put(id, a0);
                    return a0;
                }
                case "findById" -> { return Optional.ofNullable(rows.get(a0)); }
                case "count" -> { return (long) rows.size(); }
                case "findAll" -> { return all; }
                case "deleteAllInBatch" -> { rows.clear(); return null; }
                case "findByDocIdOrderByDocVerDesc" -> {
                    return all.stream().filter(o -> ((WtyVersion) o).getDocId().equals(a0))
                            .sorted(Comparator.comparing((Object o) -> ((WtyVersion) o).getDocVer()).reversed()).toList();
                }
                case "findTop100ByOrderByActAtDescHistNoDesc" -> { return all.stream().sorted(HIST_DESC).limit(100).toList(); }
                case "findFirstByOrderByActAtDescHistNoDesc" -> { return all.stream().sorted(HIST_DESC).findFirst(); }
                case "toString" -> { return type.getSimpleName() + rows.keySet(); }
                case "hashCode" -> { return System.identityHashCode(proxy); }
                case "equals" -> { return proxy == a0; }
                default -> throw new UnsupportedOperationException(m.getName());
            }
        });
    }

    private static void setField(Object target, String name, Object value) {
        try {
            Field f = target.getClass().getDeclaredField(name);
            f.setAccessible(true);
            f.set(target, value);
        } catch (ReflectiveOperationException e) {
            throw new IllegalStateException(e);
        }
    }
}
