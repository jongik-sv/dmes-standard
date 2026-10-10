package com.dongkuk.dmes.mdm.dma.erdEdit.service;

import com.dongkuk.dmes.mdm.dma.erdEdit.dto.ErdDiagramCommand;
import com.dongkuk.dmes.mdm.dma.erdEdit.dto.ErdDiagramCommand.AddDiagram;
import com.dongkuk.dmes.mdm.dma.erdEdit.dto.ErdDiagramCommand.DeleteDiagram;
import com.dongkuk.dmes.mdm.dma.erdEdit.dto.ErdDiagramCommand.MoveNodes;
import com.dongkuk.dmes.mdm.dma.erdEdit.dto.ErdDiagramCommand.Node;
import com.dongkuk.dmes.mdm.dma.erdEdit.dto.ErdDiagramCommand.PlaceTables;
import com.dongkuk.dmes.mdm.dma.erdEdit.dto.ErdDiagramCommand.RemoveFromDiagram;
import com.dongkuk.dmes.mdm.dma.erdEdit.dto.ErdDiagramCommand.RestoreDiagram;
import com.dongkuk.dmes.mdm.dma.erdEdit.dto.ErdDiagramCommand.SetFold;
import com.dongkuk.dmes.mdm.dma.erdEdit.dto.ErdDiagramCommand.UpdateDiagram;
import com.dongkuk.dmes.mdm.dma.erdEdit.engine.ErdChange;
import com.dongkuk.dmes.mdm.dma.erdEdit.engine.ErdIds;
import com.dongkuk.dmes.mdm.dma.erdEdit.engine.ErdRejection;
import com.dongkuk.dmes.mdm.dma.erdEdit.model.ErdModel;
import com.dongkuk.dmes.mdm.dma.erdEdit.model.ErdModelCodec;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import jakarta.persistence.EntityManager;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
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
     */
    public Result apply(String modelId, ErdModel model, List<ErdDiagramCommand> cmds, List<Integer> rawIndexes, String userId,
                        Map<String, JsonNode> expectedAfter) {
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
                    remember(before, modelId, "diagram", d.id());
                    em.createNativeQuery("DELETE FROM TB_MDM_ERD_DIAGRAM_NODE WHERE DIAGRAM_ID = ?").setParameter(1, d.id()).executeUpdate();
                    em.createNativeQuery("DELETE FROM TB_MDM_ERD_DIAGRAM WHERE DIAGRAM_ID = ?").setParameter(1, d.id()).executeUpdate();
                }
                case RestoreDiagram rd -> {
                    if (rd.elements() == null) throw reject(index, "elements 가 없습니다", null);
                    for (ErdChange e : rd.elements()) {
                        if (e == null || e.kind() == null || e.id() == null || e.op() == null
                                || !Set.of("diagram", "diagramNode").contains(e.kind())) {
                            throw reject(index, "restoreDiagram 요소의 kind·id·op 가 맞지 않습니다", null);
                        }
                    }
                    // 충돌 판정은 쓰기 전에 요소 전부를 먼저 본다.
                    if (expectedAfter != null) {
                        for (ErdChange e : rd.elements()) requireUnchangedSince(modelId, e, expectedAfter, index);
                    }
                    // FK 순서: 다이어그램 되살리기 → 노드 → 다이어그램 지우기
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
        List<ErdChange> changes = new ArrayList<>(), restore = new ArrayList<>();
        before.forEach((key, prev) -> {
            String kind = key.substring(0, key.indexOf('|')), id = key.substring(key.indexOf('|') + 1);
            JsonNode after = row(modelId, kind, id);
            changes.add(new ErdChange(kind, id, after == null ? ErdChange.DELETE : ErdChange.UPSERT, after));
            restore.add(new ErdChange(kind, id, prev == null ? ErdChange.DELETE : ErdChange.UPSERT, prev));
        });
        return new Result(changes, new RestoreDiagram(restore));
    }

    private void remember(Map<String, JsonNode> before, String modelId, String kind, String id) {
        String key = kind + "|" + id;
        if (!before.containsKey(key)) before.put(key, row(modelId, kind, id));
    }

    /** 행 JSON. diagram: {id, areaName, diagramName, sortSeq}, diagramNode: {diagram, table, x, y, foldMode}. 없으면 null. */
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
        List<Object[]> rows = em.createNativeQuery(
                        "SELECT POS_X, POS_Y, FOLD_MODE FROM TB_MDM_ERD_DIAGRAM_NODE WHERE DIAGRAM_ID = ? AND TABLE_UUID = ? "
                                + "AND DIAGRAM_ID IN (SELECT DIAGRAM_ID FROM TB_MDM_ERD_DIAGRAM WHERE ERD_MODEL_ID = ?)")
                .setParameter(1, k[0]).setParameter(2, k[1]).setParameter(3, modelId).getResultList();
        if (rows.isEmpty()) return null;
        Object[] r = rows.get(0);
        return o.put("diagram", k[0]).put("table", k[1]).put("x", ((Number) r[0]).intValue())
                .put("y", ((Number) r[1]).intValue()).put("foldMode", (String) r[2]);
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
        String[] k = e.id().split(":", 2);
        if (k.length < 2) throw reject(index, "diagramNode id 는 다이어그램:표 형식입니다: " + e.id(), e.id());
        if (delete) {
            if (!diagramInModel(modelId, k[0])) {
                if (diagramExists(k[0])) throw reject(index, "다른 모델의 다이어그램입니다: " + k[0], e.id());
                return;  // 다이어그램이 이미 없으면 노드도 없다
            }
            em.createNativeQuery("DELETE FROM TB_MDM_ERD_DIAGRAM_NODE WHERE DIAGRAM_ID = ? AND TABLE_UUID = ?")
                    .setParameter(1, k[0]).setParameter(2, k[1]).executeUpdate();
            return;
        }
        // 다이어그램이 그 사이에 지워졌으면 노드를 되살릴 수 없다(FK).
        requireDiagram(modelId, k[0], index);
        mergeNode(k[0], new Node(k[1], v.path("x").asInt(), v.path("y").asInt()), userId);
        em.createNativeQuery("UPDATE TB_MDM_ERD_DIAGRAM_NODE SET FOLD_MODE = ? WHERE DIAGRAM_ID = ? AND TABLE_UUID = ?")
                .setParameter(1, v.path("foldMode").asText("NONE")).setParameter(2, k[0]).setParameter(3, k[1]).executeUpdate();
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

    private static void requireNode(Node n, String elementId, int index) {
        if (n.table() == null || n.table().isBlank()) throw reject(index, "nodes 의 table 이 비었습니다", elementId);
    }

    private static ErdDiagramReject reject(int index, String message, String elementId) {
        return new ErdDiagramReject(new ErdRejection(ErdRejection.INVALID, index, message,
                "getModelText 로 다이어그램을 확인하세요", elementId, null, null, null, null, null));
    }
}
