package com.dongkuk.dmes.mdm.dma.erdEdit.importing;

import com.dongkuk.dmes.mdm.dma.erdEdit.dbmeta.ErdDbMeta;
import com.dongkuk.dmes.mdm.dma.erdEdit.dto.ErdDiagramCommand;
import com.dongkuk.dmes.mdm.dma.erdEdit.dto.ErdImportResult;
import com.dongkuk.dmes.mdm.dma.erdEdit.engine.ErdChange;
import com.dongkuk.dmes.mdm.dma.erdEdit.engine.ErdCommand;
import com.dongkuk.dmes.mdm.dma.erdEdit.engine.ErdIds;
import com.dongkuk.dmes.mdm.dma.erdEdit.engine.ErdWarning;
import com.dongkuk.dmes.mdm.dma.erdEdit.infer.InferredRelation;
import com.dongkuk.dmes.mdm.dma.erdEdit.model.ErdColumn;
import com.dongkuk.dmes.mdm.dma.erdEdit.model.ErdKey;
import com.dongkuk.dmes.mdm.dma.erdEdit.model.ErdModelCodec;
import com.dongkuk.dmes.mdm.dma.erdEdit.model.ErdRelation;
import com.dongkuk.dmes.mdm.dma.erdEdit.model.ErdTable;
import com.dongkuk.dmes.mdm.dma.erdEdit.standard.ErdDictionary;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.Function;

/**
 * 첫 가져오기 요소 만들기(README S2·S8·S9). 순수 함수 — DB·스프링을 모른다.
 *
 * <p>DB 메타와 추정 관계로 표·컬럼·키·관계 요소 JSON 을 만들어 엔진 restore 명령 하나에 담고, 다이어그램 "전체" 명령 2건을 만든다.
 * 엔진은 restore 묶음의 끊어진 참조를 CONFLICT("되돌릴 수 없습니다")로 거절한다. 그래서 참조가 풀리지 않는 키·관계는 여기서 빼고
 * {@link #SKIPPED} 경고로 알린다.
 */
public final class ErdImportBuilder {

    public static final String SKIPPED = "IMPORT_SKIPPED";
    public static final String AREA = "기본";
    public static final String DIAGRAM = "전체";
    static final int GRID_COLS = 8;
    static final int GRID_DX = 280;
    static final int GRID_DY = 220;
    private static final Set<String> CHAR_TYPES = Set.of("VARCHAR2", "NVARCHAR2", "CHAR", "NCHAR", "VARCHAR", "RAW");

    public record ColumnType(String dataType, Integer length, Integer scale) {}

    public record Built(ErdCommand.Restore restore, List<JsonNode> diagramCommands, ErdImportResult.Summary summary,
                        List<ErdWarning> skipped) {}

    private final Function<Character, String> ids;
    private final ErdDictionary dict;
    /** 표 이름 → 표 id(이름순). */
    private final Map<String, String> tableIds = new LinkedHashMap<>();
    /** 표 이름 → 컬럼 이름 → 컬럼 id. */
    private final Map<String, Map<String, String>> columnIds = new HashMap<>();
    /** 표 이름 → 컬럼 이름 → DB 컬럼. */
    private final Map<String, Map<String, ErdDbMeta.Column>> dbColumns = new HashMap<>();
    /** 표 이름 → PK 컬럼 이름. */
    private final Map<String, List<String>> pkOf = new HashMap<>();
    /** 표 이름 → 유일한 컬럼 집합들(PK·UK·유일 인덱스). 1:1 판정에 쓴다. */
    private final Map<String, List<Set<String>>> uniqueSetsOf = new HashMap<>();
    private final List<ErdChange> tables = new ArrayList<>();
    private final List<ErdChange> columns = new ArrayList<>();
    private final List<ErdChange> keys = new ArrayList<>();
    private final List<ErdChange> relations = new ArrayList<>();
    private final List<ErdWarning> skipped = new ArrayList<>();
    private final Map<String, Integer> relationCounts = new LinkedHashMap<>();

    private ErdImportBuilder(Function<Character, String> ids, ErdDictionary dict) {
        this.ids = ids;
        this.dict = dict;
        relationCounts.put("DB", 0);
        relationCounts.put("INFERRED", 0);
    }

    /** DB 타입 → 모델 타입. 가져오기와 다시 가져오기 차이(ErdDbDiff)가 같은 함수를 써야 가져온 직후 차이가 0 이다. */
    public static ColumnType typeOf(ErdDbMeta.Column c) {
        String t = c.dataType();
        if ("NUMBER".equals(t)) return new ColumnType(t, c.precision(), c.scale());
        if ("FLOAT".equals(t)) return new ColumnType(t, c.precision(), null);
        if (t != null && CHAR_TYPES.contains(t)) return new ColumnType(t, c.length(), null);
        return new ColumnType(t, null, null);
    }

    public static Built build(ErdDbMeta meta, List<InferredRelation> inferred, ErdDictionary dict, long sinceRev) {
        return build(meta, inferred, dict, sinceRev, ErdIds::newId);
    }

    /** @param ids 요소 id 공급(접두 문자 → id). 시험은 순번 id 를 넣는다. */
    public static Built build(ErdDbMeta meta, List<InferredRelation> inferred, ErdDictionary dict, long sinceRev,
                              Function<Character, String> ids) {
        ErdImportBuilder b = new ErdImportBuilder(ids, dict);
        meta.tables().stream().sorted(Comparator.comparing(ErdDbMeta.Table::name)).forEach(b::table);
        b.keys(meta);
        b.relations(inferred);
        String diagramId = ids.apply('d');
        List<ErdChange> elements = new ArrayList<>(b.tables);
        elements.addAll(b.columns);
        elements.addAll(b.keys);
        elements.addAll(b.relations);
        List<ErdDiagramCommand.Node> nodes = new ArrayList<>();
        int i = 0;
        for (String tid : b.tableIds.values()) {
            nodes.add(new ErdDiagramCommand.Node(tid, (i % GRID_COLS) * GRID_DX, (i / GRID_COLS) * GRID_DY));
            i++;
        }
        List<JsonNode> diagramCommands = List.of(
                diagramJson(new ErdDiagramCommand.AddDiagram(diagramId, AREA, DIAGRAM, 0)),
                diagramJson(new ErdDiagramCommand.PlaceTables(diagramId, nodes)));
        var summary = new ErdImportResult.Summary(b.tables.size(), b.columns.size(), b.keys.size(),
                new LinkedHashMap<>(b.relationCounts), diagramId);
        return new Built(new ErdCommand.Restore(sinceRev, elements), diagramCommands, summary, List.copyOf(b.skipped));
    }

    private void table(ErdDbMeta.Table t) {
        String tid = ids.apply('t');
        tableIds.put(t.name(), tid);
        ErdTable et = new ErdTable();
        et.phys = t.name();
        et.logical = tableLogical(t);
        et.comment = t.comment();
        Map<String, String> cids = new LinkedHashMap<>();
        Map<String, ErdDbMeta.Column> byName = new HashMap<>();
        for (ErdDbMeta.Column c : t.columns().stream().sorted(Comparator.comparingInt(ErdDbMeta.Column::position)).toList()) {
            String cid = ids.apply('c');
            cids.put(c.name(), cid);
            byName.put(c.name(), c);
            et.columnOrder.add(cid);
            columns.add(upsert("column", cid, column(tid, c)));
        }
        columnIds.put(t.name(), cids);
        dbColumns.put(t.name(), byName);
        tables.add(upsert("table", tid, et));
    }

    private ErdColumn column(String tableId, ErdDbMeta.Column c) {
        ErdColumn e = new ErdColumn();
        e.table = tableId;
        e.phys = c.name();
        ErdDictionary.ColumnEntry fill = dict.fill(c.name());
        e.logical = fill.logical();
        e.domainId = fill.domainId();
        ColumnType type = typeOf(c);
        e.dataType = type.dataType();
        e.length = type.length();
        e.scale = type.scale();
        e.notNull = !c.nullable();
        e.defaultValue = c.defaultValue() == null || c.defaultValue().isBlank() ? null : c.defaultValue().strip();
        e.comment = c.comment();
        return e;
    }

    /** 표 논리명: 주석 첫 줄, 주석이 비었으면 물리명. */
    static String tableLogical(ErdDbMeta.Table t) {
        if (t.comment() == null || t.comment().isBlank()) return t.name();
        return t.comment().strip().lines().findFirst().orElse(t.name()).strip();
    }

    private void keys(ErdDbMeta meta) {
        Set<String> constraintNames = new HashSet<>();
        Map<String, List<List<String>>> constraintColumns = new HashMap<>();
        for (ErdDbMeta.Constraint k : meta.constraints()) {
            if (!"P".equals(k.type()) && !"U".equals(k.type())) continue;
            constraintNames.add(k.name());
            constraintColumns.computeIfAbsent(k.table(), x -> new ArrayList<>()).add(k.columns());
            List<String> cids = resolve(k.table(), k.columns());
            if (cids == null) {
                skip("키 " + k.name() + " 의 표·컬럼을 찾지 못해 뺐습니다");
                continue;
            }
            addKey(k.table(), "P".equals(k.type()) ? "PK" : "UK", k.name(), cids);
            uniqueSetsOf.computeIfAbsent(k.table(), x -> new ArrayList<>()).add(new HashSet<>(k.columns()));
            if ("P".equals(k.type())) pkOf.put(k.table(), k.columns());
        }
        for (ErdDbMeta.Index ix : meta.indexes()) {
            // PK·UK 제약이 만든 인덱스: 이름이 같거나(사용자 이름) 컬럼 목록이 같다(SYS_C… 이름).
            if (constraintNames.contains(ix.name())
                    || constraintColumns.getOrDefault(ix.table(), List.of()).contains(ix.columns())) continue;
            List<String> cids = resolve(ix.table(), ix.columns());
            if (cids == null) {
                skip("인덱스 " + ix.name() + " 에 표 컬럼이 아닌 식(함수 기반 인덱스 등)이 있어 뺐습니다");
                continue;
            }
            addKey(ix.table(), ix.unique() ? "UK" : "IX", ix.name(), cids);
            if (ix.unique()) uniqueSetsOf.computeIfAbsent(ix.table(), x -> new ArrayList<>()).add(new HashSet<>(ix.columns()));
        }
    }

    private void addKey(String table, String kind, String name, List<String> cids) {
        ErdKey k = new ErdKey();
        k.table = tableIds.get(table);
        k.kind = kind;
        k.name = name;
        k.columns = new ArrayList<>(cids);
        keys.add(upsert("key", ids.apply('k'), k));
    }

    private void relations(List<InferredRelation> inferred) {
        Set<String> seen = new HashSet<>();
        for (InferredRelation r : inferred) {
            String sig = r.childTable() + r.childColumns() + ">" + r.parentTable() + r.parentColumns();
            List<String> child = resolve(r.childTable(), r.childColumns());
            List<String> parent = resolve(r.parentTable(), r.parentColumns());
            if (child == null || parent == null || child.size() != parent.size()) {
                skip("관계 " + sig + " 의 표·컬럼을 찾지 못해 뺐습니다");
                continue;
            }
            if (!seen.add(sig)) {
                skip("관계 " + sig + " 가 두 번 나와 하나만 넣었습니다");
                continue;
            }
            ErdRelation e = new ErdRelation();
            e.child = tableIds.get(r.childTable());
            e.parent = tableIds.get(r.parentTable());
            for (int i = 0; i < child.size(); i++) e.pairs.add(List.of(child.get(i), parent.get(i)));
            List<String> pk = pkOf.getOrDefault(r.childTable(), List.of());
            e.identifying = !pk.isEmpty() && pk.containsAll(r.childColumns());
            Map<String, ErdDbMeta.Column> cols = dbColumns.get(r.childTable());
            e.cardinality.parent = r.childColumns().stream().noneMatch(c -> cols.get(c).nullable()) ? "ONE" : "ZERO_OR_ONE";
            e.cardinality.child = uniqueSetsOf.getOrDefault(r.childTable(), List.of()).contains(new HashSet<>(r.childColumns()))
                    ? "ZERO_OR_ONE" : "ZERO_OR_MORE";
            e.state = r.state();
            e.dbFk = "DB".equals(r.state());
            e.evidence = new ArrayList<>(r.evidence() == null ? List.of() : r.evidence());
            e.candidateRank = r.candidateRank();
            relations.add(upsert("relation", ids.apply('r'), e));
            relationCounts.merge(r.state(), 1, Integer::sum);
        }
    }

    /** 표 이름·컬럼 이름 → 컬럼 id 목록. 표가 없거나, 목록이 비었거나, 컬럼 하나라도 없으면 null. */
    private List<String> resolve(String table, List<String> names) {
        Map<String, String> cids = table == null ? null : columnIds.get(table);
        if (cids == null || names == null || names.isEmpty()) return null;
        List<String> out = new ArrayList<>();
        for (String n : names) {
            String id = cids.get(n);
            if (id == null) return null;
            out.add(id);
        }
        return out;
    }

    private void skip(String message) {
        skipped.add(new ErdWarning(SKIPPED, null, message));
    }

    /** 모델 요소 객체를 restore 요소로. 요소 JSON 은 모델 클래스가 만든 그대로다(Ctx.put 이 FAIL_ON_UNKNOWN 으로 읽는다). */
    private static ErdChange upsert(String kind, String id, Object element) {
        return new ErdChange(kind, id, ErdChange.UPSERT, ErdModelCodec.MAPPER.valueToTree(element));
    }

    /** 상위 타입으로 써야 op 가 붙는다(구체 record 로 쓰면 @JsonTypeInfo 가 빠진다). */
    private static JsonNode diagramJson(ErdDiagramCommand cmd) {
        try {
            return ErdModelCodec.MAPPER.readTree(ErdModelCodec.MAPPER.writerFor(ErdDiagramCommand.class).writeValueAsString(cmd));
        } catch (JsonProcessingException e) {
            throw new IllegalStateException(e);
        }
    }
}
