package com.dongkuk.dmes.mdm.dma.erdEdit.dto;

import com.dongkuk.dmes.mdm.dma.erdEdit.engine.ErdChange;
import com.fasterxml.jackson.annotation.JsonSubTypes;
import com.fasterxml.jackson.annotation.JsonTypeInfo;
import java.util.List;
import java.util.Map;

/** 다이어그램 명령(버전 밖, 스펙 D6). JSON op 이름은 소문자 낙타형. 모델 명령은 {@code ErdCommand} 다. */
@JsonTypeInfo(use = JsonTypeInfo.Id.NAME, property = "op")
@JsonSubTypes({
        @JsonSubTypes.Type(value = ErdDiagramCommand.AddDiagram.class, name = "addDiagram"),
        @JsonSubTypes.Type(value = ErdDiagramCommand.UpdateDiagram.class, name = "updateDiagram"),
        @JsonSubTypes.Type(value = ErdDiagramCommand.DeleteDiagram.class, name = "deleteDiagram"),
        @JsonSubTypes.Type(value = ErdDiagramCommand.PlaceTables.class, name = "placeTables"),
        @JsonSubTypes.Type(value = ErdDiagramCommand.MoveNodes.class, name = "moveNodes"),
        @JsonSubTypes.Type(value = ErdDiagramCommand.SetFold.class, name = "setFold"),
        @JsonSubTypes.Type(value = ErdDiagramCommand.RemoveFromDiagram.class, name = "removeFromDiagram"),
        @JsonSubTypes.Type(value = ErdDiagramCommand.RestoreDiagram.class, name = "restoreDiagram")
})
public sealed interface ErdDiagramCommand {

    record Node(String table, int x, int y) {}
    record AddDiagram(String id, String areaName, String diagramName, Integer sortSeq) implements ErdDiagramCommand {}
    record UpdateDiagram(String id, Map<String, Object> set) implements ErdDiagramCommand {}
    record DeleteDiagram(String id) implements ErdDiagramCommand {}
    record PlaceTables(String diagram, List<Node> nodes) implements ErdDiagramCommand {}
    record MoveNodes(String diagram, List<Node> nodes) implements ErdDiagramCommand {}
    record SetFold(String diagram, List<String> tables, String foldMode) implements ErdDiagramCommand {}
    record RemoveFromDiagram(String diagram, List<String> tables) implements ErdDiagramCommand {}
    /** 되돌리기 전용(직접 보낼 수 없다). elements 는 ErdChange(kind diagram|diagramNode). */
    record RestoreDiagram(List<ErdChange> elements) implements ErdDiagramCommand {}

    static boolean isDiagramOp(String op) {
        return switch (op) {
            case "addDiagram", "updateDiagram", "deleteDiagram", "placeTables", "moveNodes", "setFold",
                 "removeFromDiagram", "restoreDiagram" -> true;
            default -> false;
        };
    }
}
