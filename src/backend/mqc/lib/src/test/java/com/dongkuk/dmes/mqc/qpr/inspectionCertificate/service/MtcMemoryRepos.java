package com.dongkuk.dmes.mqc.qpr.inspectionCertificate.service;

import com.dongkuk.dmes.mqc.qpr.inspectionCertificate.domain.MtcCert;
import com.dongkuk.dmes.mqc.qpr.inspectionCertificate.domain.MtcDoc;
import com.dongkuk.dmes.mqc.qpr.inspectionCertificate.domain.MtcHistory;
import com.dongkuk.dmes.mqc.qpr.inspectionCertificate.domain.MtcIssue;
import java.lang.reflect.Field;
import java.lang.reflect.Proxy;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.function.Function;

/** 시험용 메모리 저장소 — 검사증명서 서비스가 부르는 저장소 메서드만 이름으로 흉내 낸다. */
final class MtcMemoryRepos {

    private MtcMemoryRepos() {
    }

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
                case "existsById" -> { return rows.containsKey(a0); }
                case "deleteById" -> { rows.remove(a0); return null; }
                case "count" -> { return (long) rows.size(); }
                case "deleteAllInBatch" -> { rows.clear(); return null; }
                case "findAllByOrderBySortSeqAsc" -> {
                    all.sort(Comparator.comparing(o -> ((MtcDoc) o).getSortSeq()));
                    return all;
                }
                case "maxSortSeq" -> { return all.stream().mapToInt(o -> ((MtcDoc) o).getSortSeq()).max().orElse(0); }
                case "existsByMtcNo" -> { return all.stream().anyMatch(o -> Objects.equals(((MtcCert) o).getMtcNo(), a0)); }
                case "findByCertIdStartingWith" -> {
                    return all.stream().filter(o -> ((MtcCert) o).getCertId().startsWith((String) a0)).toList();
                }
                case "findAllByOrderByIssueNoDesc" -> {
                    all.sort(Comparator.comparing(o -> -((MtcIssue) o).getIssueNo()));
                    return all;
                }
                case "maxIssueNo" -> { return all.stream().mapToInt(o -> ((MtcIssue) o).getIssueNo()).max().orElse(0); }
                case "findByVrfyCd" -> { return all.stream().filter(o -> Objects.equals(((MtcIssue) o).getVrfyCd(), a0)).findFirst(); }
                case "findFirstByMtcNo" -> { return all.stream().filter(o -> Objects.equals(((MtcIssue) o).getMtcNo(), a0)).findFirst(); }
                case "findTop200ByOrderByActAtDescHistNoDesc" -> {
                    all.sort(Comparator.comparing((Object o) -> ((MtcHistory) o).getActAt())
                            .thenComparing(o -> ((MtcHistory) o).getHistNo()).reversed());
                    return all.stream().limit(200).toList();
                }
                case "findByActCdAndVrfyCdOrderByActAtDesc" -> {
                    return all.stream().filter(o -> ((MtcHistory) o).getActCd().equals(a0) && Objects.equals(((MtcHistory) o).getVrfyCd(), args[1]))
                            .sorted(Comparator.comparing((Object o) -> ((MtcHistory) o).getActAt()).reversed()).toList();
                }
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
