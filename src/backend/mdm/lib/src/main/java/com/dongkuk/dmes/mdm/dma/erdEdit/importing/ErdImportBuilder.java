package com.dongkuk.dmes.mdm.dma.erdEdit.importing;

import com.dongkuk.dmes.mdm.dma.erdEdit.dbmeta.ErdDbMeta;
import com.dongkuk.dmes.mdm.dma.erdEdit.dto.ErdDiagramCommand;
import com.dongkuk.dmes.mdm.dma.erdEdit.dto.ErdImportResult;
import com.dongkuk.dmes.mdm.dma.erdEdit.engine.ErdAuditColumns;
import com.dongkuk.dmes.mdm.dma.erdEdit.engine.ErdChange;
import com.dongkuk.dmes.mdm.dma.erdEdit.engine.ErdCommand;
import com.dongkuk.dmes.mdm.dma.erdEdit.engine.ErdIds;
import com.dongkuk.dmes.mdm.dma.erdEdit.engine.ErdWarning;
import com.dongkuk.dmes.mdm.dma.erdEdit.infer.InferredRelation;
import com.dongkuk.dmes.mdm.dma.erdEdit.model.ErdColumn;
import com.dongkuk.dmes.mdm.dma.erdEdit.model.ErdEvidence;
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
    /** 노드 높이 어림(머리 30 + 컬럼 한 줄 20)과 행 사이 간격 — 격자 행 높이를 가장 큰 표에 맞춘다(UX 1차 U24). */
    static final int NODE_HEAD = 30;
    static final int NODE_ROW = 20;
    static final int GRID_GAP_Y = 60;
    private static final Set<String> CHAR_TYPES = Set.of("VARCHAR2", "NVARCHAR2", "CHAR", "NCHAR", "VARCHAR", "RAW");

    public record ColumnType(String dataType, Integer length, Integer scale) {}

    public record Built(ErdCommand.Restore restore, List<JsonNode> diagramCommands, ErdImportResult.Summary summary,
                        List<ErdWarning> skipped) {}

    /** APPLY_DIFF 의 TABLE_ADDED 용 표 하나. columnIds 는 컬럼 이름 → 컬럼 id(DB 순서). skipped 는 뺀 키의 경고. */
    public record TablePart(String tableId, Map<String, String> columnIds, List<ErdChange> elements, List<ErdWarning> skipped) {}

    /** 관계 하나의 식별 여부와 기수(가져오기 규칙). 첫 가져오기와 APPLY_DIFF 가 같이 쓴다. */
    public record Shape(boolean identifying, String parentCardinality, String childCardinality) {}

    private final Function<Character, String> ids;
    private final ErdDictionary dict;
    /** 표 이름 → 표 id(이름순). */
    private final Map<String, String> tableIds = new LinkedHashMap<>();
    /** 표 이름 → 컬럼 이름 → 컬럼 id. */
    private final Map<String, Map<String, String>> columnIds = new HashMap<>();
    /** 표 이름 → 어림 노드 높이(감사 컬럼을 뺀 컬럼 수 기준 — 화면 기본이 감사 컬럼 숨김). */
    private final Map<String, Integer> heights = new HashMap<>();
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
        b.relations(meta, inferred);
        String diagramId = ids.apply('d');
        List<ErdChange> elements = new ArrayList<>(b.tables);
        elements.addAll(b.columns);
        elements.addAll(b.keys);
        elements.addAll(b.relations);
        List<ErdDiagramCommand.Node> nodes = new ArrayList<>();
        // 행마다 그 행 가장 큰 표의 높이 + 간격만큼 내려 놓는다(고정 간격이면 컬럼 많은 표가 다음 행과 겹친다).
        List<String> names = new ArrayList<>(b.tableIds.keySet());
        int y = 0;
        for (int row = 0; row * GRID_COLS < names.size(); row++) {
            int tallest = 0;
            for (int i = row * GRID_COLS; i < Math.min(names.size(), (row + 1) * GRID_COLS); i++) {
                String name = names.get(i);
                tallest = Math.max(tallest, b.heights.get(name));
                nodes.add(new ErdDiagramCommand.Node(b.tableIds.get(name), (i % GRID_COLS) * GRID_DX, y));
            }
            y += tallest + GRID_GAP_Y;
        }
        List<JsonNode> diagramCommands = List.of(
                diagramJson(new ErdDiagramCommand.AddDiagram(diagramId, AREA, DIAGRAM, 0)),
                diagramJson(new ErdDiagramCommand.PlaceTables(diagramId, nodes)));
        var summary = new ErdImportResult.Summary(b.tables.size(), b.columns.size(), b.keys.size(),
                new LinkedHashMap<>(b.relationCounts), diagramId);
        return new Built(new ErdCommand.Restore(sinceRev, elements), diagramCommands, summary, List.copyOf(b.skipped));
    }

    /**
     * 표 하나와 그 컬럼·PK·UK·IX 요소를 첫 가져오기와 같은 규칙으로 만든다(README "다시 가져오기 반영" TABLE_ADDED).
     * 다이어그램·관계·이름 규칙 추정은 하지 않는다. 요소 순서는 build 와 같다(표 → 컬럼 → 키).
     */
    public static TablePart oneTable(ErdDbMeta meta, String tableName, ErdDictionary dict, Function<Character, String> ids) {
        ErdDbMeta.Table t = meta.tables().stream().filter(x -> x.name().equals(tableName)).findFirst()
                .orElseThrow(() -> new IllegalArgumentException("DB 메타에 없는 표입니다: " + tableName));
        ErdImportBuilder b = new ErdImportBuilder(ids, dict);
        b.table(t);
        b.keys(new ErdDbMeta(meta.owner(), List.of(t),
                meta.constraints().stream().filter(k -> k.table().equals(tableName)).toList(),
                meta.indexes().stream().filter(ix -> ix.table().equals(tableName)).toList()));
        List<ErdChange> elements = new ArrayList<>(b.tables);
        elements.addAll(b.columns);
        elements.addAll(b.keys);
        return new TablePart(b.tableIds.get(tableName), new LinkedHashMap<>(b.columnIds.get(tableName)), elements,
                List.copyOf(b.skipped));
    }

    /** DB 컬럼 → 모델 컬럼(논리명·도메인은 사전, 타입은 typeOf). */
    public static ErdColumn columnOf(String tableId, ErdDbMeta.Column c, ErdDictionary dict) {
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

    /**
     * 관계 하나의 식별·기수(단계 1 Task 4 규칙). 자식 표에 PK 가 있고 자식 컬럼이 모두 PK 안이면 식별. 부모 쪽은 자식 컬럼이 모두
     * NOT NULL 이면 ONE, 아니면 ZERO_OR_ONE. 자식 쪽은 자식 컬럼 집합이 자식 표의 PK·UK·유일 인덱스와 같으면 ZERO_OR_ONE(1:1).
     */
    public static Shape shape(ErdDbMeta meta, String childTable, List<String> childColumns) {
        List<String> pk = meta.constraints().stream().filter(k -> "P".equals(k.type()) && k.table().equals(childTable))
                .findFirst().map(ErdDbMeta.Constraint::columns).orElse(List.of());
        boolean identifying = !pk.isEmpty() && pk.containsAll(childColumns);
        Map<String, ErdDbMeta.Column> cols = new HashMap<>();
        meta.tables().stream().filter(t -> t.name().equals(childTable)).findFirst()
                .ifPresent(t -> t.columns().forEach(c -> cols.put(c.name(), c)));
        boolean allNotNull = childColumns.stream().allMatch(c -> cols.containsKey(c) && !cols.get(c).nullable());
        Set<String> want = new HashSet<>(childColumns);
        boolean unique = meta.constraints().stream().anyMatch(k -> ("P".equals(k.type()) || "U".equals(k.type()))
                        && k.table().equals(childTable) && new HashSet<>(k.columns()).equals(want))
                || meta.indexes().stream().anyMatch(ix -> ix.unique() && ix.table().equals(childTable)
                        && new HashSet<>(ix.columns()).equals(want));
        return new Shape(identifying, allNotNull ? "ONE" : "ZERO_OR_ONE", unique ? "ZERO_OR_ONE" : "ZERO_OR_MORE");
    }

    /** DB FK 하나의 관계 요소(state DB, dbFk, 근거 DB_FK + 제약 이름). APPLY_DIFF 의 FK_ADDED·새 표의 FK 가 쓴다. */
    public static ErdRelation dbRelation(ErdDbMeta meta, ErdDbMeta.Constraint fk, String childId, String parentId,
                                         List<List<String>> pairIds) {
        ErdRelation e = new ErdRelation();
        e.child = childId;
        e.parent = parentId;
        pairIds.forEach(p -> e.pairs.add(List.of(p.get(0), p.get(1))));
        Shape s = shape(meta, fk.table(), fk.columns());
        e.identifying = s.identifying();
        e.cardinality.parent = s.parentCardinality();
        e.cardinality.child = s.childCardinality();
        e.state = "DB";
        e.dbFk = true;
        e.evidence = new ArrayList<>(List.of(new ErdEvidence("DB_FK", fk.name())));
        return e;
    }

    private void table(ErdDbMeta.Table t) {
        String tid = ids.apply('t');
        tableIds.put(t.name(), tid);
        ErdTable et = new ErdTable();
        et.phys = t.name();
        et.logical = tableLogical(t);
        et.comment = t.comment();
        Map<String, String> cids = new LinkedHashMap<>();
        for (ErdDbMeta.Column c : t.columns().stream().sorted(Comparator.comparingInt(ErdDbMeta.Column::position)).toList()) {
            String cid = ids.apply('c');
            cids.put(c.name(), cid);
            et.columnOrder.add(cid);
            columns.add(upsert("column", cid, columnOf(tid, c, dict)));
        }
        columnIds.put(t.name(), cids);
        long shown = t.columns().stream().filter(c -> !ErdAuditColumns.isAudit(c.name())).count();
        heights.put(t.name(), NODE_HEAD + NODE_ROW * (int) shown);
        tables.add(upsert("table", tid, et));
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

    private void relations(ErdDbMeta meta, List<InferredRelation> inferred) {
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
            Shape s = shape(meta, r.childTable(), r.childColumns());
            e.identifying = s.identifying();
            e.cardinality.parent = s.parentCardinality();
            e.cardinality.child = s.childCardinality();
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
