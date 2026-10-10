package com.dongkuk.dmes.mdm.dma.erdEdit.infer;

import com.dongkuk.dmes.mdm.dma.erdEdit.dbmeta.ErdDbMeta;
import com.dongkuk.dmes.mdm.dma.erdEdit.model.ErdEvidence;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Collections;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;
import org.springframework.stereotype.Component;

/**
 * 관계 추정기(스펙 2.1-4, 단계 1 S7). 메타와 근거만 보는 순수 계산이다. DB·파일을 읽지 않고 상태도 없다.
 *
 * <p>순서는 DB FK → 문서(DOC) → SQL 조인(SQL_JOIN) → 칼럼명 규칙(NAME_RULE)이다. 같은 (자식 표, 부모 표, 컬럼 짝 집합)은 관계 하나로
 * 합치고 근거를 단계 순으로 붙인다. 칼럼명 규칙은 연구 변형 x 와 같다(docs/erd-tool/research-2026-10-09/J-relation-inference.md 2절,
 * MDM 표 짝 정밀도 0.57·재현율 0.78). 바꾸면 ErdInferRegressionTest 가 막는다.
 */
@Component
public class ErdRelationInferrer {

    /** 감사 칼럼(cactus CactusAuditEntity 9개 + ROW_VERSION). 단일 PK 규칙에서만 뺀다(변형 x). */
    static final Set<String> AUDIT = Set.of("C_USR_ID", "C_SVC_ID", "C_PGM_ID", "C_AT",
            "U_USR_ID", "U_SVC_ID", "U_PGM_ID", "U_AT", "VER", "ROW_VERSION");
    static final String RULE_SINGLE = "PK 이름 일치";
    static final String RULE_COMPOSITE = "복합 PK 이름 일치";

    /** 허브 후보 순서: 문서·SQL 근거 → 앞 토막이 많이 같은 부모 → 토막이 적은 부모 → 부모 이름 → 부모 컬럼. */
    private static final Comparator<Rel> NEAREST = Comparator
            .comparing((Rel r) -> !r.hasHintEvidence())
            .thenComparingInt(r -> -commonLeadingTokens(r.child, r.parent))
            .thenComparingInt(r -> r.parent.split("_").length)
            .thenComparing(r -> r.parent)
            .thenComparing(r -> String.join(",", r.parentCols));

    private static final Comparator<Rel> OUTPUT = Comparator
            .comparing((Rel r) -> r.child)
            .thenComparing(r -> String.join(",", r.childCols))
            .thenComparingInt(r -> r.rank == null ? 0 : r.rank)
            .thenComparing(r -> r.parent)
            .thenComparing(r -> String.join(",", r.parentCols));

    public List<InferredRelation> infer(ErdDbMeta meta, ErdHints hints) {
        Map<String, Set<String>> cols = new HashMap<>();
        for (ErdDbMeta.Table t : meta.tables()) {
            Set<String> s = new HashSet<>();
            t.columns().forEach(c -> s.add(c.name()));
            cols.put(t.name(), s);
        }
        Map<String, List<String>> pk = new TreeMap<>();
        Set<String> keys = new HashSet<>(); // PK·UK 컬럼 집합(SQL 조인 방향 정하기)
        for (ErdDbMeta.Constraint c : meta.constraints()) {
            if (!cols.containsKey(c.table())) continue;
            if ("P".equals(c.type())) pk.put(c.table(), c.columns());
            if ("P".equals(c.type()) || "U".equals(c.type())) keys.add(keyId(c.table(), c.columns()));
        }
        Acc acc = new Acc();

        // 1. DB FK
        meta.constraints().stream()
                .filter(c -> "R".equals(c.type()) && cols.containsKey(c.table()) && cols.containsKey(c.refTable()))
                .sorted(Comparator.comparing(ErdDbMeta.Constraint::table).thenComparing(ErdDbMeta.Constraint::name))
                .forEach(c -> acc.add(c.table(), c.columns(), c.refTable(), c.refColumns(), "DB",
                        new ErdEvidence("DB_FK", c.name())));

        // 2·3. 문서 → SQL 조인
        for (String kind : List.of("DOC", "SQL_JOIN")) {
            hints.refs().stream().filter(r -> kind.equals(r.kind()))
                    .sorted(Comparator.comparing(ErdHints.Ref::ref)
                            .thenComparing(r -> r.childTable() + r.childColumns() + ">" + r.parentTable() + r.parentColumns()))
                    .forEach(r -> addHint(acc, cols, keys, r));
        }

        // 4. 칼럼명 규칙(변형 x)
        Set<String> linked = acc.tablePairs();
        List<String> children = new ArrayList<>(cols.keySet());
        Collections.sort(children);
        for (Map.Entry<String, List<String>> e : pk.entrySet()) {
            String parent = e.getKey();
            List<String> k = e.getValue();
            for (String child : children) {
                if (child.equals(parent)) continue;
                Set<String> cs = cols.get(child);
                String rule;
                if (k.size() == 1) {
                    String col = k.get(0);
                    if (!cs.contains(col) || AUDIT.contains(col) || "ID".equals(col)) continue;
                    rule = RULE_SINGLE;
                } else {
                    if (!cs.containsAll(k)) continue;
                    rule = RULE_COMPOSITE;
                }
                // 앞 단계가 같은 표 짝을 다른 짝으로 이었으면 버린다. 짝까지 같으면 근거만 붙는다.
                if (acc.has(child, k, parent, k) || !linked.contains(child + ">" + parent)) {
                    acc.add(child, k, parent, k, "INFERRED", new ErdEvidence("NAME_RULE", rule));
                }
            }
        }
        return rank(acc.rels.values());
    }

    private static void addHint(Acc acc, Map<String, Set<String>> cols, Set<String> keys, ErdHints.Ref r) {
        String ct = r.childTable();
        String pt = r.parentTable();
        List<String> cc = r.childColumns();
        List<String> pc = r.parentColumns();
        if (cc.isEmpty() || cc.size() != pc.size() || !has(cols, ct, cc) || !has(cols, pt, pc)) return; // 낡은 근거
        if (ct.equals(pt) && cc.equals(pc)) return; // 같은 컬럼끼리 — 관계가 아니다
        if ("SQL_JOIN".equals(r.kind()) && !keys.contains(keyId(pt, pc)) && keys.contains(keyId(ct, cc))) {
            String t = ct;
            ct = pt;
            pt = t;
            List<String> c = cc;
            cc = pc;
            pc = c;
        }
        acc.add(ct, cc, pt, pc, "INFERRED", new ErdEvidence(r.kind(), r.ref()));
    }

    /** 허브 순위. 묶음 = (자식 표, 정렬한 자식 컬럼). DB 관계는 null, INFERRED 는 DB 가 있으면 2 부터 없으면 1 부터. */
    private static List<InferredRelation> rank(Collection<Rel> rels) {
        Map<String, List<Rel>> groups = new LinkedHashMap<>();
        for (Rel r : rels) {
            List<String> sorted = new ArrayList<>(r.childCols);
            Collections.sort(sorted);
            groups.computeIfAbsent(r.child + "|" + String.join(",", sorted), g -> new ArrayList<>()).add(r);
        }
        for (List<Rel> g : groups.values()) {
            if (g.size() < 2) continue;
            boolean hasDb = g.stream().anyMatch(r -> "DB".equals(r.state));
            int n = hasDb ? 2 : 1;
            for (Rel r : g.stream().filter(x -> !"DB".equals(x.state)).sorted(NEAREST).toList()) r.rank = n++;
        }
        List<Rel> out = new ArrayList<>(rels);
        out.sort(OUTPUT);
        return out.stream()
                .map(r -> new InferredRelation(r.child, r.childCols, r.parent, r.parentCols, r.state, r.evidence, r.rank))
                .toList();
    }

    static int commonLeadingTokens(String a, String b) {
        String[] x = a.split("_");
        String[] y = b.split("_");
        int n = 0;
        while (n < x.length && n < y.length && x[n].equals(y[n])) n++;
        return n;
    }

    private static boolean has(Map<String, Set<String>> cols, String table, List<String> columns) {
        Set<String> s = cols.get(table);
        return s != null && s.containsAll(columns);
    }

    private static String keyId(String table, List<String> columns) {
        List<String> sorted = new ArrayList<>(columns);
        Collections.sort(sorted);
        return table + "|" + String.join(",", sorted);
    }

    /** 관계를 합치기 열쇠로 모은다. 넣은 순서를 지킨다. */
    private static final class Acc {
        final Map<String, Rel> rels = new LinkedHashMap<>();

        boolean has(String ct, List<String> cc, String pt, List<String> pc) {
            return rels.containsKey(id(ct, cc, pt, pc));
        }

        void add(String ct, List<String> cc, String pt, List<String> pc, String state, ErdEvidence ev) {
            Rel r = rels.computeIfAbsent(id(ct, cc, pt, pc), k -> new Rel(ct, cc, pt, pc, state));
            if (!r.evidence.contains(ev)) r.evidence.add(ev);
        }

        Set<String> tablePairs() {
            Set<String> out = new HashSet<>();
            rels.values().forEach(r -> out.add(r.child + ">" + r.parent));
            return out;
        }

        static String id(String ct, List<String> cc, String pt, List<String> pc) {
            List<String> pairs = new ArrayList<>();
            for (int i = 0; i < cc.size(); i++) pairs.add(cc.get(i) + "=" + pc.get(i));
            Collections.sort(pairs);
            return ct + ">" + pt + ":" + String.join(",", pairs);
        }
    }

    private static final class Rel {
        final String child;
        final List<String> childCols;
        final String parent;
        final List<String> parentCols;
        final String state;
        final List<ErdEvidence> evidence = new ArrayList<>();
        Integer rank;

        Rel(String child, List<String> childCols, String parent, List<String> parentCols, String state) {
            this.child = child;
            this.childCols = List.copyOf(childCols);
            this.parent = parent;
            this.parentCols = List.copyOf(parentCols);
            this.state = state;
        }

        boolean hasHintEvidence() {
            return evidence.stream().anyMatch(e -> "DOC".equals(e.kind()) || "SQL_JOIN".equals(e.kind()));
        }
    }
}
