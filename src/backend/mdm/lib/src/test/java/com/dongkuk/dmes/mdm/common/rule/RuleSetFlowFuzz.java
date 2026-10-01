package com.dongkuk.dmes.mdm.common.rule;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;

import com.dongkuk.dmes.mdm.common.rule.RuleSetAnalyzer.SetIo;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.io.InputStream;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Random;
import java.util.Set;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.FlowDefinition;
import org.junit.jupiter.api.Test;

/**
 * 흐름도 2단계 Task 2 — 세트 검사 Java·TS 차분 퍼즈. 시드 하나로 무작위 흐름 세트를 만들어 코퍼스와 같은 형식({@code name, flow, condIo?, ids,
 * rules, expect{io, deps, checks}})의 {@code rule-set-fuzz.json} 으로 쓴다. {@code expect} 는 <b>Java 분석기 결과</b>다 — 손으로 도출한 기대가
 * 아니라 두 언어 구현이 같은 값을 내는지 보는 차분 입력이다. 코퍼스 러너 두 개({@link RuleSetCorpusTest}·m-mdm {@code rule-set-corpus.test.ts})가
 * 이 파일도 읽는다. Task 3(룰 확정 검사 대조)도 입력으로 쓴다.
 *
 * <ul>
 *   <li>난수는 {@code java.util.Random(seed)} 하나만 쓴다(재현).</li>
 *   <li>룰 풀 8개({@code FZ_R1}~{@code FZ_R8}, 사례마다 새로 만든다): DICT 조건 0~2개({@code FZ_D1}~{@code FZ_D3}), 다른 풀 룰 결과 조건 0~2개(출처
 *       NONE), 결과 1~2개({@code FZ_S1}~{@code FZ_S6}). 무작위로 고른 셋이 각각 없는 룰·DEPRECATED·RELEASED 없음이다(없음·RELEASED 없음은
 *       {@code RuleIoReader} 처럼 조건·결과가 비어 있다).</li>
 *   <li>흐름: 깊이 3 이하 블록 트리(순차·IF 2~3갈래·병렬 2~3갈래, 같은 룰 반복 허용)를 노드·선으로 펼친다. 갈래 순서 값은 섞고 IF 의
 *       "그 외" 자리도 무작위다. IF 의 20% 는 옛 형식(짝 MERGE), 나머지는 새 형식(implicit-join spec §14.3) — 갈래 끝 선은 보류했다가 다음에 놓이는
 *       노드(없으면 END)가 한꺼번에 받고, 빈 갈래는 한 IF 에 하나까지(B2), "그 외" 아닌 갈래의 15% 는 끝내는 갈래(몸 끝에서 END)다.
 *       병렬은 늘 합류를 만든다. 사례의 10% 는 구조를 깨뜨린다(선 하나 지우기 / 선의 to 바꾸기 / IF 에 "그 외" 선 하나 더 — 짝 합류나 모이는 자리로).</li>
 *   <li>condIo: IF 의 "그 외"가 아닌 선마다 {@code FZ_D*}·{@code FZ_S*} 변수 1~2개(이름 순), ok=true. 5% 는 ok=false·{@code "파싱 실패"}.</li>
 * </ul>
 *
 * <p>파일 다시 쓰기: {@code (cd src/backend/mdm && ../gradlew :lib:test --tests '*RuleSetFlowFuzz*' -Dfuzz.write=true --console=plain)}.
 * {@link #main} 은 {@code [seed] [count] [출력 경로]} 로 다른 시드를 돌려 볼 때 쓴다.
 */
class RuleSetFlowFuzz {

    static final long SEED = 20260930L;
    static final int COUNT = 200;
    /** 클래스패스 위치. 쓰기 모드는 lib 모듈 기준 {@link #SOURCE} 에 쓴다. */
    static final String RESOURCE = "/com/dongkuk/dmes/mdm/common/rule/rule-set-fuzz.json";
    static final Path SOURCE = Path.of("src/test/resources/com/dongkuk/dmes/mdm/common/rule/rule-set-fuzz.json");

    private static final ObjectMapper JSON = new ObjectMapper();
    private static final int POOL = 8;
    private static final List<String> DICT_NAMES = List.of("FZ_D1", "FZ_D2", "FZ_D3");
    private static final List<String> RESULT_NAMES = List.of("FZ_S1", "FZ_S2", "FZ_S3", "FZ_S4", "FZ_S5", "FZ_S6");
    private static final int MAX_DEPTH = 3;

    public static void main(String[] args) throws IOException {
        long seed = args.length > 0 ? Long.parseLong(args[0]) : SEED;
        int count = args.length > 1 ? Integer.parseInt(args[1]) : COUNT;
        String json = generate(seed, count);
        if (args.length > 2) {
            Files.writeString(Path.of(args[2]), json, StandardCharsets.UTF_8);
        } else {
            System.out.print(json);
        }
    }

    @Test
    void 퍼즈_파일은_시드_20260930_로_다시_만들면_같다() throws IOException {
        String json = generate(SEED, COUNT);
        if (Boolean.getBoolean("fuzz.write")) {
            Files.writeString(SOURCE, json, StandardCharsets.UTF_8);
            assertEquals(json, Files.readString(SOURCE, StandardCharsets.UTF_8));
            return;
        }
        try (InputStream in = RuleSetFlowFuzz.class.getResourceAsStream(RESOURCE)) {
            assertNotNull(in, "퍼즈 파일이 없다: " + RESOURCE + " — -Dfuzz.write=true 로 만든다");
            assertEquals(json, new String(in.readAllBytes(), StandardCharsets.UTF_8), "퍼즈 파일이 시드 " + SEED + " 생성 결과와 다르다");
        }
    }

    /** 사례 {@code count} 개 — 한 줄에 사례 하나. */
    static String generate(long seed, int count) {
        Random rnd = new Random(seed);
        List<String> lines = new ArrayList<>();
        for (int i = 1; i <= count; i++) {
            lines.add(write(caseOf(rnd, String.format("fuzz_%03d", i))));
        }
        return "{\n  \"version\": 1,\n  \"description\": " + write("흐름도 2단계 Task 2 — 세트 검사 Java·TS 차분 퍼즈. RuleSetFlowFuzz 가 시드 " + seed
                + " 로 만든다(손으로 고치지 않는다). expect 는 Java RuleSetAnalyzer 결과다.") + ",\n  \"seed\": " + seed + ",\n  \"cases\": [\n    "
                + String.join(",\n    ", lines) + "\n  ]\n}\n";
    }

    // ------------------------------------------------------------------ 사례 하나

    private static Map<String, Object> caseOf(Random rnd, String name) {
        Map<String, Map<String, Object>> pool = pool(rnd);
        List<String> poolIds = List.copyOf(pool.keySet());
        Emit emit = new Emit(rnd, poolIds);
        List<Pending> tail = emit.seq(blocks(rnd, 0, 1 + rnd.nextInt(4), poolIds), List.of(new Pending("start", Map.of(), List.of())));
        emit.land(tail, "end");
        emit.nodes.add(0, node("start", "START"));
        emit.nodes.add(node("end", "END"));
        if (rnd.nextInt(10) == 0) {
            emit.breakStructure();
        }
        Map<String, Object> flow = new LinkedHashMap<>();
        flow.put("version", 1);
        flow.put("nodes", emit.nodes);
        flow.put("edges", emit.edges);

        Map<String, Object> condIo = condIo(rnd, emit);
        Set<String> used = new LinkedHashSet<>();
        for (Map<String, Object> n : emit.nodes) {
            if ("RULE".equals(n.get("kind"))) {
                used.add((String) n.get("ruleId"));
            }
        }
        Map<String, Object> rules = new LinkedHashMap<>();
        used.forEach(id -> rules.put(id, pool.get(id)));

        Map<String, Object> c = new LinkedHashMap<>();
        c.put("name", name);
        c.put("flow", flow);
        if (!condIo.isEmpty()) {
            c.put("condIo", condIo);
        }
        FlowDefinition def = RuleSetFlowJson.parse(write(flow));
        c.put("ids", RuleSetFlowJson.ruleIds(def));
        c.put("rules", rules);
        c.put("expect", expect(def, rules, condIo));
        return c;
    }

    /** 코퍼스 러너와 같은 읽기 규칙({@link RuleSetCorpusTest#rule}·{@link RuleSetCorpusTest#condIo})으로 읽어 Java 분석기를 돌린다. */
    private static Map<String, Object> expect(FlowDefinition def, Map<String, Object> rules, Map<String, Object> condIo) {
        Map<String, RuleIo> io = new LinkedHashMap<>();
        rules.forEach((id, r) -> io.put(id, RuleSetCorpusTest.rule(id, JSON.valueToTree(r))));
        JsonNode cio = JSON.valueToTree(condIo);

        SetIo setIo = RuleSetAnalyzer.io(def, io);
        List<Map<String, Object>> inputs = new ArrayList<>();
        setIo.inputs().forEach(i -> inputs.add(map("name", i.name(), "source", i.source(), "users", i.users())));
        List<Map<String, Object>> results = new ArrayList<>();
        setIo.results().forEach(r -> results.add(map("name", r.name(), "by", r.by(), "readers", r.readers())));
        List<Map<String, Object>> checks = new ArrayList<>();
        for (RuleSetCheck k : RuleSetAnalyzer.checks(def, io, RuleSetCorpusTest.condIo(cio))) {
            checks.add(map("code", k.code(), "severity", k.severity(), "ruleId", k.ruleId(), "otherRuleId", k.otherRuleId(), "varName", k.varName(),
                    "message", k.message(), "nodeId", k.nodeId(), "edgeId", k.edgeId()));
        }
        return map("io", map("inputs", inputs, "results", results), "deps", RuleSetAnalyzer.deps(def, io), "checks", checks);
    }

    // ------------------------------------------------------------------ 룰 풀

    private static Map<String, Map<String, Object>> pool(Random rnd) {
        List<List<String>> results = new ArrayList<>();
        for (int i = 0; i < POOL; i++) {
            results.add(pick(rnd, RESULT_NAMES, 1 + rnd.nextInt(2)));
        }
        List<Integer> idx = new ArrayList<>();
        for (int i = 0; i < POOL; i++) {
            idx.add(i);
        }
        Collections.shuffle(idx, rnd);
        int missing = idx.get(0);
        int deprecated = idx.get(1);
        int unreleased = idx.get(2);
        Map<String, Map<String, Object>> out = new LinkedHashMap<>();
        for (int i = 0; i < POOL; i++) {
            List<Map<String, Object>> conds = new ArrayList<>();
            pick(rnd, DICT_NAMES, rnd.nextInt(3)).forEach(n -> conds.add(map("name", n, "source", RuleIo.DICT)));
            List<String> others = new ArrayList<>();
            for (int j = 0; j < POOL; j++) {
                for (String x : results.get(j)) {
                    if (j != i && !results.get(i).contains(x) && !others.contains(x)) {
                        others.add(x);
                    }
                }
            }
            Collections.sort(others);
            pick(rnd, others, Math.min(others.size(), rnd.nextInt(3))).forEach(n -> conds.add(map("name", n, "source", RuleIo.NONE)));
            Collections.shuffle(conds, rnd);
            List<Map<String, Object>> res = new ArrayList<>();
            results.get(i).forEach(n -> res.add(map("name", n)));

            Map<String, Object> r = new LinkedHashMap<>();
            if (i == missing) {
                r.put("exists", false);
                r.put("status", null);
                r.put("releasedVer", null);
                r.put("conds", List.of());
                r.put("results", List.of());
            } else if (i == unreleased) {
                r.put("exists", true);
                r.put("status", "CREATED");
                r.put("releasedVer", null);
                r.put("conds", List.of());
                r.put("results", List.of());
            } else {
                r.put("exists", true);
                r.put("status", i == deprecated ? "DEPRECATED" : "INUSE");
                r.put("releasedVer", 1);
                r.put("conds", conds);
                r.put("results", res);
            }
            out.put("FZ_R" + (i + 1), r);
        }
        return out;
    }

    /** from 에서 n 개를 겹치지 않게 고른다(뽑은 순서). */
    private static List<String> pick(Random rnd, List<String> from, int n) {
        List<String> copy = new ArrayList<>(from);
        Collections.shuffle(copy, rnd);
        return new ArrayList<>(copy.subList(0, Math.min(n, copy.size())));
    }

    // ------------------------------------------------------------------ 블록 트리 → 노드·선

    private sealed interface Gen permits GenRule, GenSplit {
    }

    private record GenRule(String ruleId) implements Gen {
    }

    private record GenSplit(boolean ifSplit, List<List<Gen>> branches) implements Gen {
    }

    private static List<Gen> blocks(Random rnd, int depth, int length, List<String> poolIds) {
        List<Gen> out = new ArrayList<>();
        for (int i = 0; i < length; i++) {
            if (depth < MAX_DEPTH && rnd.nextInt(4) == 0) {
                int k = 2 + rnd.nextInt(2);
                List<List<Gen>> branches = new ArrayList<>();
                for (int b = 0; b < k; b++) {
                    branches.add(blocks(rnd, depth + 1, rnd.nextInt(3), poolIds));
                }
                out.add(new GenSplit(rnd.nextBoolean(), branches));
            } else {
                out.add(new GenRule(poolIds.get(rnd.nextInt(poolIds.size()))));
            }
        }
        return out;
    }

    /** 다음 선의 출발 노드와 그 선에 붙일 칸(갈래 선의 order·cond·otherwise), 이 선을 갈래 끝 선으로 내보낸 새 형식 IF 들(안쪽부터). */
    private record Pending(String from, Map<String, Object> extra, List<String> ifs) {

        Pending withIf(String ifId) {
            List<String> out = new ArrayList<>(ifs);
            out.add(ifId);
            return new Pending(from, extra, List.copyOf(out));
        }
    }

    private static final class Emit {

        final Random rnd;
        final List<String> poolIds;
        final List<Map<String, Object>> nodes = new ArrayList<>();
        final List<Map<String, Object>> edges = new ArrayList<>();
        /** IF ID → 옛 형식이면 짝 합류, 새 형식이면 갈래 끝 선을 받은 노드(모이는 자리) — 구조 깨뜨리기 셋째 방법이 쓴다. */
        final Map<String, String> ifTarget = new LinkedHashMap<>();
        int rules;
        int ifs;
        int pars;
        int merges;
        int edgeSeq;

        Emit(Random rnd, List<String> poolIds) {
            this.rnd = rnd;
            this.poolIds = poolIds;
        }

        List<Pending> seq(List<Gen> items, List<Pending> p) {
            for (Gen g : items) {
                p = place(g, p);
            }
            return p;
        }

        /** 보류 선을 모두 to 로 잇고, 그 선을 내보낸 새 형식 IF 의 모이는 자리로 to 를 적는다(처음 한 번). */
        void land(List<Pending> ps, String to) {
            for (Pending p : ps) {
                edge(p, to);
                for (String ifId : p.ifs()) {
                    ifTarget.putIfAbsent(ifId, to);
                }
            }
        }

        List<Pending> place(Gen g, List<Pending> p) {
            if (g instanceof GenRule r) {
                String id = "r" + (++rules);
                Map<String, Object> n = node(id, "RULE");
                n.put("ruleId", r.ruleId());
                nodes.add(n);
                land(p, id);
                return List.of(new Pending(id, Map.of(), List.of()));
            }
            GenSplit s = (GenSplit) g;
            boolean legacy = s.ifSplit() && rnd.nextInt(5) == 0;
            boolean fresh = s.ifSplit() && !legacy;
            String id = s.ifSplit() ? "if" + (++ifs) : "p" + (++pars);
            String mergeId = fresh ? null : "m" + (++merges);
            nodes.add(node(id, s.ifSplit() ? "IF" : "PARALLEL"));
            land(p, id);
            int k = s.branches().size();
            int otherwise = s.ifSplit() ? rnd.nextInt(k) : -1;
            List<Integer> orders = new ArrayList<>();
            for (int o = 1; o <= (s.ifSplit() ? k - 1 : k); o++) {
                orders.add(o);
            }
            Collections.shuffle(orders, rnd);
            boolean[] ending = new boolean[k];
            boolean emptyCont = false;
            if (fresh) {
                for (int b = 0; b < k; b++) {
                    ending[b] = b != otherwise && rnd.nextInt(100) < 15; // "그 외" 는 끝내지 않는다 — 이어지는 갈래가 늘 남는다
                    if (!ending[b] && s.branches().get(b).isEmpty()) {
                        emptyCont = true;
                    }
                }
            }
            int next = 0;
            boolean emptyUsed = false;
            boolean endDirect = false;
            List<Pending> tails = new ArrayList<>();
            for (int b = 0; b < k; b++) {
                Map<String, Object> extra = new LinkedHashMap<>();
                if (b == otherwise) {
                    extra.put("otherwise", true);
                } else {
                    extra.put("order", orders.get(next++));
                    if (s.ifSplit()) {
                        extra.put("cond", "");                         // condIo 를 정할 때 채운다
                    }
                }
                List<Gen> body = new ArrayList<>(s.branches().get(b));
                if (fresh && body.isEmpty()) {
                    // 같은 도착으로 가는 IF 선은 하나(f4·B2): 빈 이어지는 갈래는 하나까지, END 로 바로 가는 끝내는 갈래도 하나까지이고
                    // 빈 이어지는 갈래가 있으면 두지 않는다(IF 가 루트 끝이면 둘 다 END 로 간다). 걸리면 룰 하나를 넣는다.
                    boolean taken = ending[b] ? emptyCont || endDirect : emptyUsed;
                    if (taken) {
                        body.add(new GenRule(poolIds.get(rnd.nextInt(poolIds.size()))));
                    } else if (ending[b]) {
                        endDirect = true;
                    } else {
                        emptyUsed = true;
                    }
                }
                List<Pending> end = seq(body, List.of(new Pending(id, extra, List.of())));
                if (!fresh) {
                    land(end, mergeId);
                } else if (ending[b]) {
                    land(end, "end");
                } else {
                    end.forEach(q -> tails.add(q.withIf(id)));
                }
            }
            if (fresh) {
                return tails;
            }
            Map<String, Object> m = node(mergeId, "MERGE");
            m.put("splitId", id);
            nodes.add(m);
            if (legacy) {
                ifTarget.put(id, mergeId);
            }
            return List.of(new Pending(mergeId, Map.of(), List.of()));
        }

        void edge(Pending p, String to) {
            Map<String, Object> e = new LinkedHashMap<>();
            e.put("id", "e" + (++edgeSeq));
            e.put("from", p.from());
            e.put("to", to);
            e.putAll(p.extra());
            edges.add(e);
        }

        /** 선 하나 지우기 / 선의 to 를 다른 노드로 / IF 에 "그 외" 선 하나 더 — 짝 합류나 모이는 자리로(IF 가 없으면 지우기). */
        void breakStructure() {
            int mode = rnd.nextInt(3);
            if (mode == 2 && !ifTarget.isEmpty()) {
                List<String> ifIds = List.copyOf(ifTarget.keySet());
                String ifId = ifIds.get(rnd.nextInt(ifIds.size()));
                edge(new Pending(ifId, Map.of("otherwise", true), List.of()), ifTarget.get(ifId));
            } else if (mode == 1) {
                Map<String, Object> e = edges.get(rnd.nextInt(edges.size()));
                List<String> others = new ArrayList<>();
                nodes.forEach(n -> {
                    if (!n.get("id").equals(e.get("to"))) {
                        others.add((String) n.get("id"));
                    }
                });
                e.put("to", others.get(rnd.nextInt(others.size())));
            } else {
                edges.remove(rnd.nextInt(edges.size()));
            }
        }
    }

    /** IF 의 "그 외"가 아닌 선마다 조건식과 condIo — 변수 1~2개(이름 순), 5% 는 파싱 실패. */
    private static Map<String, Object> condIo(Random rnd, Emit emit) {
        Set<String> ifs = new LinkedHashSet<>();
        emit.nodes.forEach(n -> {
            if ("IF".equals(n.get("kind"))) {
                ifs.add((String) n.get("id"));
            }
        });
        List<String> names = new ArrayList<>(DICT_NAMES);
        names.addAll(RESULT_NAMES);
        Map<String, Object> out = new LinkedHashMap<>();
        for (Map<String, Object> e : emit.edges) {
            if (!ifs.contains((String) e.get("from")) || Boolean.TRUE.equals(e.get("otherwise"))) {
                continue;
            }
            List<String> vars = pick(rnd, names, 1 + rnd.nextInt(2));
            Collections.sort(vars);
            String cond = String.join(" && ", vars.stream().map(v -> v + " > 0").toList());
            if (rnd.nextInt(20) == 0) {
                e.put("cond", cond + " &&");
                out.put((String) e.get("id"), map("ok", false, "message", "파싱 실패", "vars", List.of()));
            } else {
                e.put("cond", cond);
                List<Map<String, Object>> vs = new ArrayList<>();
                vars.forEach(v -> vs.add(map("name", v, "source", v.startsWith("FZ_D") ? RuleIo.DICT : RuleIo.NONE)));
                out.put((String) e.get("id"), map("ok", true, "message", null, "vars", vs));
            }
        }
        return out;
    }

    private static Map<String, Object> node(String id, String kind) {
        Map<String, Object> n = new LinkedHashMap<>();
        n.put("id", id);
        n.put("kind", kind);
        return n;
    }

    private static Map<String, Object> map(Object... kv) {
        Map<String, Object> m = new LinkedHashMap<>();
        for (int i = 0; i < kv.length; i += 2) {
            m.put((String) kv[i], kv[i + 1]);
        }
        return m;
    }

    private static String write(Object o) {
        try {
            return JSON.writeValueAsString(o);
        } catch (JsonProcessingException e) {
            throw new UncheckedIOException(e);
        }
    }
}
