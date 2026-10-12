package com.dongkuk.dmes.mdm.dma.erdEdit.service;

import com.dongkuk.dmes.mdm.dma.erdEdit.dto.ErdDiagramCommand;
import com.dongkuk.dmes.mdm.dma.erdEdit.dto.ErdDiagramCommand.AddDiagram;
import com.dongkuk.dmes.mdm.dma.erdEdit.dto.ErdDiagramCommand.ClearRoutes;
import com.dongkuk.dmes.mdm.dma.erdEdit.dto.ErdDiagramCommand.CopyDiagram;
import com.dongkuk.dmes.mdm.dma.erdEdit.dto.ErdDiagramCommand.DeleteDiagram;
import com.dongkuk.dmes.mdm.dma.erdEdit.dto.ErdDiagramCommand.MoveNodes;
import com.dongkuk.dmes.mdm.dma.erdEdit.dto.ErdDiagramCommand.Node;
import com.dongkuk.dmes.mdm.dma.erdEdit.dto.ErdDiagramCommand.NodeSize;
import com.dongkuk.dmes.mdm.dma.erdEdit.dto.ErdDiagramCommand.PlaceTables;
import com.dongkuk.dmes.mdm.dma.erdEdit.dto.ErdDiagramCommand.Point;
import com.dongkuk.dmes.mdm.dma.erdEdit.dto.ErdDiagramCommand.RemoveFromDiagram;
import com.dongkuk.dmes.mdm.dma.erdEdit.dto.ErdDiagramCommand.ResizeNodes;
import com.dongkuk.dmes.mdm.dma.erdEdit.dto.ErdDiagramCommand.RestoreDiagram;
import com.dongkuk.dmes.mdm.dma.erdEdit.dto.ErdDiagramCommand.SetFold;
import com.dongkuk.dmes.mdm.dma.erdEdit.dto.ErdDiagramCommand.SetRoute;
import com.dongkuk.dmes.mdm.dma.erdEdit.dto.ErdDiagramCommand.UpdateDiagram;
import com.dongkuk.dmes.mdm.dma.erdEdit.engine.ErdChange;
import com.dongkuk.dmes.mdm.dma.erdEdit.engine.ErdIds;
import com.dongkuk.dmes.mdm.dma.erdEdit.engine.ErdRejection;
import com.dongkuk.dmes.mdm.dma.erdEdit.model.ErdModel;
import com.dongkuk.dmes.mdm.dma.erdEdit.model.ErdModelCodec;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import jakarta.persistence.EntityManager;
import jakarta.persistence.Query;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Comparator;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.springframework.stereotype.Component;

/**
 * 다이어그램(버전 밖) 명령. 결과는 델타·역명령으로 돌려준다. 거절은 {@link ErdDiagramReject} 로 던지며, 호출자가 트랜잭션을 버린다.
 * 다이어그램은 모델에 속한다 — 다른 모델의 다이어그램 id 는 "없는 다이어그램" 으로 본다. 호출자의 트랜잭션에 합류한다.
 */
@Component
public class ErdDiagramStore {

    private static final int NAME_MAX = 200;
    /** 관계선 하나의 꺾임점 상한(ERD 2차 §7.1). */
    static final int MAX_POINTS = 50;
    /** 꺾임점 묶음 조회·삭제의 IN 목록 크기(Oracle IN 목록 상한 1000). */
    static final int IN_CHUNK = 1000;
    /** 표 상자 크기 범위(README §7.4). 높이 하한 = 머리 30 + 한 줄 20 + 테두리 2. */
    static final int SIZE_W_MIN = 160, SIZE_W_MAX = 1600, SIZE_H_MIN = 52, SIZE_H_MAX = 4000;

    public record Result(List<ErdChange> changes, ErdDiagramCommand inverse) {}

    public static final class ErdDiagramReject extends RuntimeException {
        public final ErdRejection rejection;

        ErdDiagramReject(ErdRejection r) {
            super(r.message(), null, false, false);
            this.rejection = r;
        }
    }

    private final EntityManager em;

    public ErdDiagramStore(EntityManager em) {
        this.em = em;
    }

    /**
     * @param model       지금 모델(표 존재 확인용 — 같은 묶음의 모델 명령이 반영된 값)
     * @param rawIndexes  cmds 각각이 클라이언트 묶음에서 가지는 자리(거절의 commandIndex 에 쓴다)
     * @param expectedAfter 되돌리기일 때만: 되돌릴 rev 가 남긴 변경 후 값("kind|id" → 행 JSON, 지운 행은 null 값). RestoreDiagram 의 요소마다
     *                    지금 행이 이 값과 같아야 한다 — 그 뒤에 다른 변경이 있으면 CONFLICT(D18). 클라이언트 명령이면 null.
     * @param droppedRelations 같은 묶음의 모델 명령(엔진)이 지운 관계 id. 이 모델의 모든 다이어그램에서 그 관계의 꺾임점을 지운다(ERD 2차 §7.1).
     *                    명령을 다 처리한 뒤에 지운다 — 먼저 지우면 같은 묶음 RestoreDiagram 의 충돌 판정이 지워진 행을 보고 거짓 CONFLICT 를 낸다.
     *                    지운 행은 같은 before 에 들어가 역명령 RestoreDiagram 하나로 되돌아온다.
     */
    public Result apply(String modelId, ErdModel model, List<ErdDiagramCommand> cmds, List<Integer> rawIndexes, String userId,
                        Map<String, JsonNode> expectedAfter, Collection<String> droppedRelations) {
        // 고치기 전 행. 없던 행은 null 로 남겨 역명령이 "지우기" 가 되게 한다(computeIfAbsent 는 null 을 저장하지 않으므로 쓰지 않는다).
        LinkedHashMap<String, JsonNode> before = new LinkedHashMap<>();
        for (int i = 0; i < cmds.size(); i++) {
            int index = rawIndexes.get(i);
            switch (cmds.get(i)) {
                case AddDiagram a -> {
                    String id = a.id() == null ? ErdIds.newId('d') : a.id();
                    if (!ErdIds.isElementId(id)) throw reject(index, "다이어그램 id 형식이 맞지 않습니다: " + id, id);
                    requireName(a.areaName(), "areaName", id, index);
                    requireName(a.diagramName(), "diagramName", id, index);
                    if (diagramExists(id)) throw reject(index, "이미 있는 다이어그램 id 입니다: " + id, id);
                    remember(before, modelId, "diagram", id);
                    insertDiagram(id, modelId, a.areaName(), a.diagramName(), a.sortSeq() == null ? 0 : a.sortSeq(), userId);
                }
                case CopyDiagram cp -> copyDiagram(before, modelId, cp, userId, index);
                case PlaceTables p -> {
                    requireDiagram(modelId, p.diagram(), index);
                    requireList(p.nodes(), "nodes", p.diagram(), index);
                    for (Node n : p.nodes()) {
                        requireNode(n, p.diagram(), index);
                        if (!model.tables.containsKey(n.table())) throw reject(index, "모델에 없는 표입니다: " + n.table(), n.table());
                        remember(before, modelId, "diagramNode", p.diagram() + ":" + n.table());
                        mergeNode(p.diagram(), n, userId);
                    }
                }
                case MoveNodes mv -> {
                    requireDiagram(modelId, mv.diagram(), index);
                    requireList(mv.nodes(), "nodes", mv.diagram(), index);
                    for (Node n : mv.nodes()) {
                        requireNode(n, mv.diagram(), index);
                        remember(before, modelId, "diagramNode", mv.diagram() + ":" + n.table());
                        int updated = em.createNativeQuery("UPDATE TB_MDM_ERD_DIAGRAM_NODE SET POS_X = ?, POS_Y = ?, U_USR_ID = ?, U_AT = SYSTIMESTAMP WHERE DIAGRAM_ID = ? AND TABLE_UUID = ?")
                                .setParameter(1, n.x()).setParameter(2, n.y()).setParameter(3, userId)
                                .setParameter(4, mv.diagram()).setParameter(5, n.table()).executeUpdate();
                        if (updated == 0) throw reject(index, "다이어그램에 없는 표입니다: " + n.table(), n.table());
                    }
                }
                case ResizeNodes rs -> {
                    requireDiagram(modelId, rs.diagram(), index);
                    requireList(rs.nodes(), "nodes", rs.diagram(), index);
                    for (NodeSize n : rs.nodes()) {
                        if (n.table() == null || n.table().isBlank()) throw reject(index, "nodes 의 table 이 비었습니다", rs.diagram());
                        requireSize(n.w(), SIZE_W_MIN, SIZE_W_MAX, "w", n.table(), index);
                        requireSize(n.h(), SIZE_H_MIN, SIZE_H_MAX, "h", n.table(), index);
                        remember(before, modelId, "diagramNode", rs.diagram() + ":" + n.table());
                        if (updateSize(rs.diagram(), n.table(), n.w(), n.h(), userId) == 0) {
                            throw reject(index, "다이어그램에 없는 표입니다: " + n.table(), n.table());
                        }
                    }
                }
                case SetFold f -> {
                    requireDiagram(modelId, f.diagram(), index);
                    if (f.foldMode() == null || !Set.of("NONE", "KEYS", "NAME").contains(f.foldMode())) {
                        throw reject(index, "foldMode 는 NONE·KEYS·NAME 입니다", f.diagram());
                    }
                    requireList(f.tables(), "tables", f.diagram(), index);
                    for (String t : f.tables()) {
                        remember(before, modelId, "diagramNode", f.diagram() + ":" + t);
                        int updated = em.createNativeQuery("UPDATE TB_MDM_ERD_DIAGRAM_NODE SET FOLD_MODE = ?, U_USR_ID = ?, U_AT = SYSTIMESTAMP WHERE DIAGRAM_ID = ? AND TABLE_UUID = ?")
                                .setParameter(1, f.foldMode()).setParameter(2, userId).setParameter(3, f.diagram()).setParameter(4, t).executeUpdate();
                        if (updated == 0) throw reject(index, "다이어그램에 없는 표입니다: " + t, t);
                    }
                }
                case RemoveFromDiagram r -> {
                    requireDiagram(modelId, r.diagram(), index);
                    requireList(r.tables(), "tables", r.diagram(), index);
                    for (String t : r.tables()) {
                        remember(before, modelId, "diagramNode", r.diagram() + ":" + t);
                        int deleted = em.createNativeQuery("DELETE FROM TB_MDM_ERD_DIAGRAM_NODE WHERE DIAGRAM_ID = ? AND TABLE_UUID = ?")
                                .setParameter(1, r.diagram()).setParameter(2, t).executeUpdate();
                        if (deleted == 0) throw reject(index, "다이어그램에 없는 표입니다: " + t, t);
                    }
                    // 그 다이어그램에서 뺀 표에 걸린 관계의 꺾임점도 뺀다(§7.1). 다른 다이어그램의 꺾임점은 그대로다. 조회·삭제는 한 번에 한다.
                    Set<String> removed = new HashSet<>(r.tables());
                    List<String> attached = new ArrayList<>();
                    for (var e : model.relations.entrySet()) {
                        if (removed.contains(e.getValue().child) || removed.contains(e.getValue().parent)) attached.add(e.getKey());
                    }
                    dropRoutes(before, modelId, r.diagram(), attached);
                }
                case SetRoute s -> {
                    requireDiagram(modelId, s.diagram(), index);
                    if (s.relation() == null || s.relation().isBlank()) throw reject(index, "relation 이 비었습니다", s.diagram());
                    if (!model.relations.containsKey(s.relation())) throw reject(index, "모델에 없는 관계입니다: " + s.relation(), s.relation());
                    requireList(s.points(), "points", s.relation(), index);
                    if (s.points().size() > MAX_POINTS) throw reject(index, "points 는 " + MAX_POINTS + "개 이하여야 합니다", s.relation());
                    remember(before, modelId, "diagramRoute", s.diagram() + ":" + s.relation());
                    mergeRoute(s.diagram(), s.relation(), pointsJson(s.points()), userId);
                }
                case ClearRoutes cr -> {
                    requireDiagram(modelId, cr.diagram(), index);
                    // [자동 배치]는 옮긴 표에 걸린 관계를 모두 보낸다 — 빈 목록(걸린 관계가 없다)과 꺾임점이 없는 관계는 거절하지 않고 건너뛴다
                    // (조정 결정 10-12). null 목록·null 항목은 모양이 틀린 것이라 거절한다.
                    if (cr.relations() == null) throw reject(index, "relations 가 없습니다", cr.diagram());
                    if (cr.relations().stream().anyMatch(x -> x == null)) throw reject(index, "relations 에 빈 항목이 있습니다", cr.diagram());
                    dropRoutes(before, modelId, cr.diagram(), cr.relations());
                }
                case UpdateDiagram u -> {
                    requireDiagram(modelId, u.id(), index);
                    if (u.set() == null || u.set().isEmpty()) throw reject(index, "set 이 비었습니다", u.id());
                    remember(before, modelId, "diagram", u.id());
                    for (var e : u.set().entrySet()) {
                        String col = switch (e.getKey()) {
                            case "areaName" -> "AREA_NAME";
                            case "diagramName" -> "DIAGRAM_NAME";
                            case "sortSeq" -> "SORT_SEQ";
                            default -> throw reject(index, "고칠 수 없는 속성입니다: " + e.getKey(), u.id());
                        };
                        Object v = e.getValue();
                        if (col.equals("SORT_SEQ")) {
                            if (!(v instanceof Integer)) throw reject(index, "sortSeq 는 정수여야 합니다", u.id());
                        } else {
                            requireName(v instanceof String s ? s : null, e.getKey(), u.id(), index);
                        }
                        em.createNativeQuery("UPDATE TB_MDM_ERD_DIAGRAM SET " + col + " = ?, U_USR_ID = ?, U_AT = SYSTIMESTAMP WHERE DIAGRAM_ID = ?")
                                .setParameter(1, v).setParameter(2, userId).setParameter(3, u.id()).executeUpdate();
                    }
                }
                case DeleteDiagram d -> {
                    requireDiagram(modelId, d.id(), index);
                    for (String nodeKey : nodeKeys(d.id())) remember(before, modelId, "diagramNode", nodeKey);
                    dropRoutes(before, modelId, d.id(), null);  // 꺾임점을 기억하고 지운다(FK — 다이어그램보다 먼저)
                    remember(before, modelId, "diagram", d.id());
                    em.createNativeQuery("DELETE FROM TB_MDM_ERD_DIAGRAM_NODE WHERE DIAGRAM_ID = ?").setParameter(1, d.id()).executeUpdate();
                    em.createNativeQuery("DELETE FROM TB_MDM_ERD_DIAGRAM WHERE DIAGRAM_ID = ?").setParameter(1, d.id()).executeUpdate();
                }
                case RestoreDiagram rd -> {
                    if (rd.elements() == null) throw reject(index, "elements 가 없습니다", null);
                    for (ErdChange e : rd.elements()) {
                        if (e == null || e.kind() == null || e.id() == null || e.op() == null
                                || !Set.of("diagram", "diagramNode", "diagramRoute").contains(e.kind())) {
                            throw reject(index, "restoreDiagram 요소의 kind·id·op 가 맞지 않습니다", null);
                        }
                    }
                    // 충돌 판정은 쓰기 전에 요소 전부를 먼저 본다.
                    if (expectedAfter != null) {
                        for (ErdChange e : rd.elements()) requireUnchangedSince(modelId, e, expectedAfter, index);
                    }
                    // FK 순서: 다이어그램 되살리기 → 노드·꺾임점 → 다이어그램 지우기
                    List<ErdChange> ordered = new ArrayList<>(rd.elements());
                    ordered.sort(Comparator.comparingInt(e -> e.kind().equals("diagram")
                            ? (ErdChange.DELETE.equals(e.op()) ? 2 : 0) : 1));
                    for (ErdChange e : ordered) {
                        remember(before, modelId, e.kind(), e.id());
                        restoreRow(modelId, e, userId, index);
                    }
                }
            }
        }
        // 엔진이 지운 관계의 꺾임점(이 모델의 모든 다이어그램). 명령 처리 뒤라 같은 묶음에서 이미 기억한 행은 다시 기억하지 않는다.
        // 마지막 단계라 여기서 지운 키는 묶음 끝에도 없다 — 아래에서 다시 읽지 않는다.
        Set<String> gone = droppedRelations == null || droppedRelations.isEmpty()
                ? Set.of() : new HashSet<>(dropRoutes(before, modelId, null, droppedRelations));
        List<ErdChange> changes = new ArrayList<>(), restore = new ArrayList<>();
        before.forEach((key, prev) -> {
            String kind = key.substring(0, key.indexOf('|')), id = key.substring(key.indexOf('|') + 1);
            JsonNode after = gone.contains(key) ? null : row(modelId, kind, id);
            // 없던 행이 끝에도 없다(같은 묶음에서 만들고 지움, 이미 지워진 다이어그램의 꺾임점 되살리기를 건너뜀) — 델타·역명령에 넣지 않는다.
            if (prev == null && after == null) return;
            changes.add(new ErdChange(kind, id, after == null ? ErdChange.DELETE : ErdChange.UPSERT, after));
            restore.add(new ErdChange(kind, id, prev == null ? ErdChange.DELETE : ErdChange.UPSERT, prev));
        });
        return new Result(changes, new RestoreDiagram(restore));
    }

    /**
     * 다이어그램 복사(ERD 2차 §7.2). 원본 노드(위치·접기·크기)와 꺾임점을 새 id 로 한 번씩(INSERT … SELECT) 복사한다. 새 id 는 어느 모델에도
     * 없으므로(PK 전역) 고치기 전 행은 모두 null 이다 — 노드·꺾임점 키는 읽지 않고 null 로 기억한다. 그래서 델타는 upsert, 역명령은
     * 복사본 지우기(diagram·노드·꺾임점 delete)이고, 되돌리기의 FK 순서는 RestoreDiagram 이 맞춘다. 원본에 남은 "지금 버전에 없는 표·관계"의
     * 행도 그대로 복사한다(그리지 않는 행, §7.1).
     */
    @SuppressWarnings("unchecked")
    private void copyDiagram(Map<String, JsonNode> before, String modelId, CopyDiagram cp, String userId, int index) {
        requireDiagram(modelId, cp.from(), index);
        String id = cp.id() == null ? ErdIds.newId('d') : cp.id();
        if (!ErdIds.isElementId(id)) throw reject(index, "다이어그램 id 형식이 맞지 않습니다: " + id, id);
        JsonNode src = row(modelId, "diagram", cp.from());
        String area = cp.areaName() == null ? src.path("areaName").asText() : cp.areaName();
        String name = cp.diagramName() == null ? copyName(src.path("diagramName").asText()) : cp.diagramName();
        requireName(area, "areaName", id, index);
        requireName(name, "diagramName", id, index);
        if (diagramExists(id)) throw reject(index, "이미 있는 다이어그램 id 입니다: " + id, id);
        remember(before, modelId, "diagram", id);
        insertDiagram(id, modelId, area, name, src.path("sortSeq").asInt(), userId);
        List<Object> tables = em.createNativeQuery("SELECT TABLE_UUID FROM TB_MDM_ERD_DIAGRAM_NODE WHERE DIAGRAM_ID = ?")
                .setParameter(1, cp.from()).getResultList();
        List<Object> relations = em.createNativeQuery("SELECT REL_UUID FROM TB_MDM_ERD_DIAGRAM_ROUTE WHERE DIAGRAM_ID = ?")
                .setParameter(1, cp.from()).getResultList();
        for (Object t : tables) {
            if (!before.containsKey("diagramNode|" + id + ":" + t)) before.put("diagramNode|" + id + ":" + t, null);
        }
        for (Object rel : relations) {
            if (!before.containsKey("diagramRoute|" + id + ":" + rel)) before.put("diagramRoute|" + id + ":" + rel, null);
        }
        if (!tables.isEmpty()) {
            em.createNativeQuery("""
                    INSERT INTO TB_MDM_ERD_DIAGRAM_NODE (DIAGRAM_ID, TABLE_UUID, POS_X, POS_Y, FOLD_MODE, SIZE_W, SIZE_H,
                      C_USR_ID, C_AT, C_SVC_ID, C_PGM_ID, U_USR_ID, U_AT, U_SVC_ID, U_PGM_ID, VER)
                    SELECT ?, TABLE_UUID, POS_X, POS_Y, FOLD_MODE, SIZE_W, SIZE_H, ?, SYSTIMESTAMP, 'erdEdit', 'erdEdit', ?, SYSTIMESTAMP, 'erdEdit', 'erdEdit', 0
                      FROM TB_MDM_ERD_DIAGRAM_NODE
                     WHERE DIAGRAM_ID = ?""")
                    .setParameter(1, id).setParameter(2, userId).setParameter(3, userId).setParameter(4, cp.from()).executeUpdate();
        }
        if (!relations.isEmpty()) {
            em.createNativeQuery("""
                    INSERT INTO TB_MDM_ERD_DIAGRAM_ROUTE (DIAGRAM_ID, REL_UUID, POINTS_JSON,
                      C_USR_ID, C_AT, C_SVC_ID, C_PGM_ID, U_USR_ID, U_AT, U_SVC_ID, U_PGM_ID, VER)
                    SELECT ?, REL_UUID, POINTS_JSON, ?, SYSTIMESTAMP, 'erdEdit', 'erdEdit', ?, SYSTIMESTAMP, 'erdEdit', 'erdEdit', 0
                      FROM TB_MDM_ERD_DIAGRAM_ROUTE
                     WHERE DIAGRAM_ID = ?""")
                    .setParameter(1, id).setParameter(2, userId).setParameter(3, userId).setParameter(4, cp.from()).executeUpdate();
        }
    }

    /** 기본 복사 이름 「<원본> 복사」. 원본이 길면 잘라 {@value #NAME_MAX}자 안에 맞춘다(이름을 주지 않은 요청이 거절되지 않게). */
    static String copyName(String source) {
        String suffix = " 복사";
        int keep = NAME_MAX - suffix.length();
        String base = source.length() > keep ? source.substring(0, keep) : source;
        return base + suffix;
    }

    private void remember(Map<String, JsonNode> before, String modelId, String kind, String id) {
        String key = kind + "|" + id;
        if (!before.containsKey(key)) before.put(key, row(modelId, kind, id));
    }

    /**
     * 행 JSON. diagram: {id, areaName, diagramName, sortSeq}, diagramNode: {diagram, table, x, y, foldMode} + 크기가 있으면 w·h
     * (NULL 이면 키를 넣지 않는다 — V8 전 되돌리기 기록의 값과 같게 비교되도록, README §7.4),
     * diagramRoute: {diagram, relation, points:[{x, y}, …]}. 없으면 null.
     */
    @SuppressWarnings("unchecked")
    JsonNode row(String modelId, String kind, String id) {
        ObjectNode o = ErdModelCodec.MAPPER.createObjectNode();
        if (kind.equals("diagram")) {
            List<Object[]> rows = em.createNativeQuery(
                            "SELECT AREA_NAME, DIAGRAM_NAME, SORT_SEQ FROM TB_MDM_ERD_DIAGRAM WHERE DIAGRAM_ID = ? AND ERD_MODEL_ID = ?")
                    .setParameter(1, id).setParameter(2, modelId).getResultList();
            if (rows.isEmpty()) return null;
            Object[] r = rows.get(0);
            return o.put("id", id).put("areaName", (String) r[0]).put("diagramName", (String) r[1])
                    .put("sortSeq", ((Number) r[2]).intValue());
        }
        String[] k = id.split(":", 2);
        if (k.length < 2) return null;
        if (kind.equals("diagramRoute")) {
            List<Object> points = em.createNativeQuery(
                            "SELECT POINTS_JSON FROM TB_MDM_ERD_DIAGRAM_ROUTE WHERE DIAGRAM_ID = ? AND REL_UUID = ? "
                                    + "AND DIAGRAM_ID IN (SELECT DIAGRAM_ID FROM TB_MDM_ERD_DIAGRAM WHERE ERD_MODEL_ID = ?)")
                    .setParameter(1, k[0]).setParameter(2, k[1]).setParameter(3, modelId).getResultList();
            if (points.isEmpty()) return null;
            return routeRow(k[0], k[1], ErdCommandLogStore.clob(points.get(0)));
        }
        List<Object[]> rows = em.createNativeQuery(
                        "SELECT POS_X, POS_Y, FOLD_MODE, SIZE_W, SIZE_H FROM TB_MDM_ERD_DIAGRAM_NODE WHERE DIAGRAM_ID = ? AND TABLE_UUID = ? "
                                + "AND DIAGRAM_ID IN (SELECT DIAGRAM_ID FROM TB_MDM_ERD_DIAGRAM WHERE ERD_MODEL_ID = ?)")
                .setParameter(1, k[0]).setParameter(2, k[1]).setParameter(3, modelId).getResultList();
        if (rows.isEmpty()) return null;
        Object[] r = rows.get(0);
        o.put("diagram", k[0]).put("table", k[1]).put("x", ((Number) r[0]).intValue())
                .put("y", ((Number) r[1]).intValue()).put("foldMode", (String) r[2]);
        if (r[3] != null) o.put("w", ((Number) r[3]).intValue());
        if (r[4] != null) o.put("h", ((Number) r[4]).intValue());
        return o;
    }

    /**
     * 되돌리기 충돌 판정(D18). 되돌릴 rev 가 남긴 값과 지금 행이 다르면 그 뒤에 다른 변경이 있었다는 뜻이다. 쓰기 전에 하므로 충돌이면
     * 아무것도 바뀌지 않고, 호출자가 트랜잭션을 버린다. 되돌리는 요소 하나가 되돌릴 rev 이후 다른 변경과 겹치면 묶음 전체를 거절한다.
     */
    private void requireUnchangedSince(String modelId, ErdChange e, Map<String, JsonNode> expectedAfter, int index) {
        JsonNode want = expectedAfter.get(e.kind() + "|" + e.id());
        if (want != null && want.isNull()) want = null;
        JsonNode now = row(modelId, e.kind(), e.id());
        if (java.util.Objects.equals(want, now)) return;
        throw new ErdDiagramReject(new ErdRejection(ErdRejection.CONFLICT, index,
                "되돌리려는 뒤에 이 다이어그램 요소가 바뀌었습니다", "getChangesSince 로 확인한 뒤 직접 고치세요", e.id(), null, null, null,
                now, null));
    }

    /** 이 모델의 다이어그램이어야 한다. 다른 모델 것이나 없는 id 는 거절. */
    private void requireDiagram(String modelId, String id, int index) {
        if (id == null) throw reject(index, "다이어그램 id 가 없습니다", null);
        if (!diagramInModel(modelId, id)) throw reject(index, "없는 다이어그램입니다: " + id, id);
    }

    private boolean diagramInModel(String modelId, String id) {
        return !em.createNativeQuery("SELECT 1 FROM TB_MDM_ERD_DIAGRAM WHERE DIAGRAM_ID = ? AND ERD_MODEL_ID = ?")
                .setParameter(1, id).setParameter(2, modelId).getResultList().isEmpty();
    }

    /** 어느 모델이든 이 id 의 다이어그램이 있는가(PK 는 전역이다). */
    private boolean diagramExists(String id) {
        return !em.createNativeQuery("SELECT 1 FROM TB_MDM_ERD_DIAGRAM WHERE DIAGRAM_ID = ?").setParameter(1, id).getResultList().isEmpty();
    }

    @SuppressWarnings("unchecked")
    private List<String> nodeKeys(String diagramId) {
        List<Object> tables = em.createNativeQuery("SELECT TABLE_UUID FROM TB_MDM_ERD_DIAGRAM_NODE WHERE DIAGRAM_ID = ?")
                .setParameter(1, diagramId).getResultList();
        return tables.stream().map(t -> diagramId + ":" + t).toList();
    }

    /**
     * 꺾임점을 지운다. diagram 이 null 이면 이 모델의 모든 다이어그램, relations 가 null 이면 그 다이어그램의 모든 관계다.
     * 지우기 전 행을 before 에 넣고(이미 기억한 키는 그대로 둔다) 지운 행의 before 키를 돌려준다. 꺾임점이 없는 관계는 건너뛴다 — 없던 행을
     * 델타·역명령에 넣지 않는다. 관계 {@value #IN_CHUNK}개마다 조회 1번·삭제 1번이다(표 하나에 관계가 많아도 왕복이 늘지 않는다).
     * 다른 모델이 같은 관계 id 를 써도 이 모델의 다이어그램만 본다.
     */
    @SuppressWarnings("unchecked")
    private List<String> dropRoutes(Map<String, JsonNode> before, String modelId, String diagram, Collection<String> relations) {
        List<List<String>> chunks = new ArrayList<>();
        if (relations == null) {
            chunks.add(null);
        } else {
            List<String> rels = List.copyOf(new LinkedHashSet<>(relations));
            for (int i = 0; i < rels.size(); i += IN_CHUNK) chunks.add(rels.subList(i, Math.min(rels.size(), i + IN_CHUNK)));
        }
        List<String> keys = new ArrayList<>();
        for (List<String> chunk : chunks) {
            String where = " WHERE R.DIAGRAM_ID IN (SELECT DIAGRAM_ID FROM TB_MDM_ERD_DIAGRAM WHERE ERD_MODEL_ID = :m)"
                    + (diagram == null ? "" : " AND R.DIAGRAM_ID = :d") + (chunk == null ? "" : " AND R.REL_UUID IN (:rels)");
            Query q = bindRoutes(em.createNativeQuery("SELECT R.DIAGRAM_ID, R.REL_UUID, R.POINTS_JSON FROM TB_MDM_ERD_DIAGRAM_ROUTE R"
                    + where + " ORDER BY R.DIAGRAM_ID, R.REL_UUID"), modelId, diagram, chunk);
            List<Object[]> rows = q.getResultList();
            if (rows.isEmpty()) continue;
            for (Object[] r : rows) {
                String d = (String) r[0], rel = (String) r[1], key = "diagramRoute|" + d + ":" + rel;
                if (!before.containsKey(key)) before.put(key, routeRow(d, rel, ErdCommandLogStore.clob(r[2])));
                keys.add(key);
            }
            bindRoutes(em.createNativeQuery("DELETE FROM TB_MDM_ERD_DIAGRAM_ROUTE R" + where), modelId, diagram, chunk).executeUpdate();
        }
        return keys;
    }

    private static Query bindRoutes(Query q, String modelId, String diagram, List<String> relations) {
        q.setParameter("m", modelId);
        if (diagram != null) q.setParameter("d", diagram);
        if (relations != null) q.setParameter("rels", relations);
        return q;
    }

    /** diagramRoute 행 JSON {diagram, relation, points}. row() 와 dropRoutes 가 같은 모양을 쓴다(되돌리기 충돌 판정이 JsonNode 로 비교한다). */
    private static JsonNode routeRow(String diagram, String relation, String pointsJson) {
        ObjectNode o = ErdModelCodec.MAPPER.createObjectNode().put("diagram", diagram).put("relation", relation);
        return o.set("points", readPoints(pointsJson));
    }

    /** 꺾임점 JSON — [{"x":정수,"y":정수},…]. 같은 값이면 같은 글이 되어 되돌리기 충돌 판정(JsonNode 비교)이 흔들리지 않는다. */
    private static String pointsJson(List<Point> points) {
        return ErdCommandLogStore.write(points);
    }

    private static JsonNode readPoints(String json) {
        try {
            return ErdModelCodec.MAPPER.readTree(json);
        } catch (com.fasterxml.jackson.core.JsonProcessingException e) {
            throw new IllegalStateException(e);
        }
    }

    private void mergeRoute(String diagram, String relation, String pointsJson, String userId) {
        em.createNativeQuery("""
                MERGE INTO TB_MDM_ERD_DIAGRAM_ROUTE t
                USING (SELECT ? DIAGRAM_ID, ? REL_UUID FROM DUAL) s
                   ON (t.DIAGRAM_ID = s.DIAGRAM_ID AND t.REL_UUID = s.REL_UUID)
                 WHEN MATCHED THEN UPDATE SET t.POINTS_JSON = ?, t.U_USR_ID = ?, t.U_AT = SYSTIMESTAMP
                 WHEN NOT MATCHED THEN INSERT (DIAGRAM_ID, REL_UUID, POINTS_JSON,
                      C_USR_ID, C_AT, C_SVC_ID, C_PGM_ID, U_USR_ID, U_AT, U_SVC_ID, U_PGM_ID, VER)
                      VALUES (s.DIAGRAM_ID, s.REL_UUID, ?, ?, SYSTIMESTAMP, 'erdEdit', 'erdEdit', ?, SYSTIMESTAMP, 'erdEdit', 'erdEdit', 0)""")
                .setParameter(1, diagram).setParameter(2, relation).setParameter(3, pointsJson).setParameter(4, userId)
                .setParameter(5, pointsJson).setParameter(6, userId).setParameter(7, userId).executeUpdate();
    }

    private void insertDiagram(String id, String modelId, String area, String name, int sortSeq, String userId) {
        em.createNativeQuery("""
                INSERT INTO TB_MDM_ERD_DIAGRAM (DIAGRAM_ID, ERD_MODEL_ID, AREA_NAME, DIAGRAM_NAME, SORT_SEQ,
                  C_USR_ID, C_AT, C_SVC_ID, C_PGM_ID, U_USR_ID, U_AT, U_SVC_ID, U_PGM_ID, VER)
                VALUES (?, ?, ?, ?, ?, ?, SYSTIMESTAMP, 'erdEdit', 'erdEdit', ?, SYSTIMESTAMP, 'erdEdit', 'erdEdit', 0)""")
                .setParameter(1, id).setParameter(2, modelId).setParameter(3, area).setParameter(4, name)
                .setParameter(5, sortSeq).setParameter(6, userId).setParameter(7, userId).executeUpdate();
    }

    /** 되돌리기: op 가 delete 면 지우고, 아니면 value 의 값으로 되살린다(없으면 만든다). */
    private void restoreRow(String modelId, ErdChange e, String userId, int index) {
        boolean delete = ErdChange.DELETE.equals(e.op());
        JsonNode v = e.value();
        if (!delete && (v == null || !v.isObject())) throw reject(index, "restoreDiagram 값은 객체여야 합니다: " + e.id(), e.id());
        if (e.kind().equals("diagram")) {
            if (delete) {
                if (!diagramInModel(modelId, e.id())) {
                    if (diagramExists(e.id())) throw reject(index, "다른 모델의 다이어그램입니다: " + e.id(), e.id());
                    return;  // 이미 없다
                }
                em.createNativeQuery("DELETE FROM TB_MDM_ERD_DIAGRAM_NODE WHERE DIAGRAM_ID = ?").setParameter(1, e.id()).executeUpdate();
                em.createNativeQuery("DELETE FROM TB_MDM_ERD_DIAGRAM_ROUTE WHERE DIAGRAM_ID = ?").setParameter(1, e.id()).executeUpdate();
                em.createNativeQuery("DELETE FROM TB_MDM_ERD_DIAGRAM WHERE DIAGRAM_ID = ? AND ERD_MODEL_ID = ?")
                        .setParameter(1, e.id()).setParameter(2, modelId).executeUpdate();
                return;
            }
            int updated = em.createNativeQuery("UPDATE TB_MDM_ERD_DIAGRAM SET AREA_NAME = ?, DIAGRAM_NAME = ?, SORT_SEQ = ?, "
                            + "U_USR_ID = ?, U_AT = SYSTIMESTAMP WHERE DIAGRAM_ID = ? AND ERD_MODEL_ID = ?")
                    .setParameter(1, v.path("areaName").asText()).setParameter(2, v.path("diagramName").asText())
                    .setParameter(3, v.path("sortSeq").asInt()).setParameter(4, userId).setParameter(5, e.id())
                    .setParameter(6, modelId).executeUpdate();
            if (updated == 0) {
                if (diagramExists(e.id())) throw reject(index, "다른 모델의 다이어그램 id 입니다: " + e.id(), e.id());
                insertDiagram(e.id(), modelId, v.path("areaName").asText(), v.path("diagramName").asText(), v.path("sortSeq").asInt(), userId);
            }
            return;
        }
        boolean route = e.kind().equals("diagramRoute");
        String[] k = e.id().split(":", 2);
        if (k.length < 2) throw reject(index, e.kind() + " id 는 " + (route ? "다이어그램:관계" : "다이어그램:표") + " 형식입니다: " + e.id(), e.id());
        if (delete) {
            if (!diagramInModel(modelId, k[0])) {
                if (diagramExists(k[0])) throw reject(index, "다른 모델의 다이어그램입니다: " + k[0], e.id());
                return;  // 다이어그램이 이미 없으면 노드·꺾임점도 없다
            }
            em.createNativeQuery(route
                            ? "DELETE FROM TB_MDM_ERD_DIAGRAM_ROUTE WHERE DIAGRAM_ID = ? AND REL_UUID = ?"
                            : "DELETE FROM TB_MDM_ERD_DIAGRAM_NODE WHERE DIAGRAM_ID = ? AND TABLE_UUID = ?")
                    .setParameter(1, k[0]).setParameter(2, k[1]).executeUpdate();
            return;
        }
        if (route && !diagramInModel(modelId, k[0])) {
            // 관계·표 삭제를 되돌리는데 그 사이에 꺾임점의 다이어그램이 지워졌다 — 꺾임점만 건너뛰고 관계 되살리기는 막지 않는다(b1 검토 major).
            // 다이어그램이 다른 모델 것이면 거절한다(기록 변조·id 재사용).
            if (diagramExists(k[0])) throw reject(index, "다른 모델의 다이어그램입니다: " + k[0], e.id());
            return;
        }
        // 다이어그램이 그 사이에 지워졌으면 노드를 되살릴 수 없다(FK).
        requireDiagram(modelId, k[0], index);
        if (route) {
            JsonNode pts = v.get("points");
            if (pts == null || !pts.isArray() || pts.isEmpty()) throw reject(index, "restoreDiagram 꺾임점 값에 points 가 없습니다: " + e.id(), e.id());
            mergeRoute(k[0], k[1], pts.toString(), userId);
            return;
        }
        mergeNode(k[0], new Node(k[1], v.path("x").asInt(), v.path("y").asInt()), userId);
        em.createNativeQuery("UPDATE TB_MDM_ERD_DIAGRAM_NODE SET FOLD_MODE = ? WHERE DIAGRAM_ID = ? AND TABLE_UUID = ?")
                .setParameter(1, v.path("foldMode").asText("NONE")).setParameter(2, k[0]).setParameter(3, k[1]).executeUpdate();
        // 크기 키가 없으면(자동 크기·V8 전 기록) NULL 로 되살린다.
        updateSize(k[0], k[1], v.hasNonNull("w") ? v.get("w").asInt() : null, v.hasNonNull("h") ? v.get("h").asInt() : null, userId);
    }

    /** 크기를 쓴다(null = 자동, 0 을 NULL 로 바꿔 넣는다 — 범위 하한이 0 보다 커서 겹치지 않는다). 고친 행 수를 돌려준다. */
    private int updateSize(String diagram, String table, Integer w, Integer h, String userId) {
        return em.createNativeQuery("UPDATE TB_MDM_ERD_DIAGRAM_NODE SET SIZE_W = NULLIF(?, 0), SIZE_H = NULLIF(?, 0), U_USR_ID = ?, "
                        + "U_AT = SYSTIMESTAMP WHERE DIAGRAM_ID = ? AND TABLE_UUID = ?")
                .setParameter(1, w == null ? 0 : w).setParameter(2, h == null ? 0 : h).setParameter(3, userId)
                .setParameter(4, diagram).setParameter(5, table).executeUpdate();
    }

    private void mergeNode(String diagram, Node n, String userId) {
        em.createNativeQuery("""
                MERGE INTO TB_MDM_ERD_DIAGRAM_NODE t
                USING (SELECT ? DIAGRAM_ID, ? TABLE_UUID FROM DUAL) s
                   ON (t.DIAGRAM_ID = s.DIAGRAM_ID AND t.TABLE_UUID = s.TABLE_UUID)
                 WHEN MATCHED THEN UPDATE SET t.POS_X = ?, t.POS_Y = ?, t.U_USR_ID = ?, t.U_AT = SYSTIMESTAMP
                 WHEN NOT MATCHED THEN INSERT (DIAGRAM_ID, TABLE_UUID, POS_X, POS_Y, FOLD_MODE,
                      C_USR_ID, C_AT, C_SVC_ID, C_PGM_ID, U_USR_ID, U_AT, U_SVC_ID, U_PGM_ID, VER)
                      VALUES (s.DIAGRAM_ID, s.TABLE_UUID, ?, ?, 'NONE', ?, SYSTIMESTAMP, 'erdEdit', 'erdEdit', ?, SYSTIMESTAMP, 'erdEdit', 'erdEdit', 0)""")
                .setParameter(1, diagram).setParameter(2, n.table()).setParameter(3, n.x()).setParameter(4, n.y())
                .setParameter(5, userId).setParameter(6, n.x()).setParameter(7, n.y()).setParameter(8, userId)
                .setParameter(9, userId).executeUpdate();
    }

    private static void requireName(String v, String field, String elementId, int index) {
        if (v == null || v.isBlank()) throw reject(index, field + " 가 비었습니다", elementId);
        if (v.length() > NAME_MAX) throw reject(index, field + " 는 " + NAME_MAX + "자 이하여야 합니다", elementId);
    }

    private static void requireList(List<?> v, String field, String elementId, int index) {
        if (v == null || v.isEmpty()) throw reject(index, field + " 가 비었습니다", elementId);
        if (v.stream().anyMatch(x -> x == null)) throw reject(index, field + " 에 빈 항목이 있습니다", elementId);
    }

    private static void requireSize(Integer v, int min, int max, String field, String elementId, int index) {
        if (v != null && (v < min || v > max)) throw reject(index, field + " 는 " + min + "~" + max + " 사이여야 합니다(null = 자동)", elementId);
    }

    private static void requireNode(Node n, String elementId, int index) {
        if (n.table() == null || n.table().isBlank()) throw reject(index, "nodes 의 table 이 비었습니다", elementId);
    }

    private static ErdDiagramReject reject(int index, String message, String elementId) {
        return new ErdDiagramReject(new ErdRejection(ErdRejection.INVALID, index, message,
                "getModelText 로 다이어그램을 확인하세요", elementId, null, null, null, null, null));
    }
}
