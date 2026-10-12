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
        @JsonSubTypes.Type(value = ErdDiagramCommand.SetRoute.class, name = "setRoute"),
        @JsonSubTypes.Type(value = ErdDiagramCommand.ClearRoutes.class, name = "clearRoutes"),
        @JsonSubTypes.Type(value = ErdDiagramCommand.CopyDiagram.class, name = "copyDiagram"),
        @JsonSubTypes.Type(value = ErdDiagramCommand.RestoreDiagram.class, name = "restoreDiagram"),
        @JsonSubTypes.Type(value = ErdDiagramCommand.ResizeNodes.class, name = "resizeNodes"),
        @JsonSubTypes.Type(value = ErdDiagramCommand.SetRouteSides.class, name = "setRouteSides")
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
    /** 관계선 꺾임점 한 개(캔버스 절대 좌표, ERD 2차 §7.1). */
    record Point(int x, int y) {}
    /** 그 다이어그램에서 그 관계의 꺾임점을 통째로 바꾼다(없으면 만든다). points 1~50개. */
    record SetRoute(String diagram, String relation, List<Point> points) implements ErdDiagramCommand {}
    /** 그 다이어그램에서 관계들의 꺾임점을 지운다. 빈 목록과 꺾임점이 없는 관계는 건너뛴다(거절하지 않는다). null 목록·null 항목은 거절. */
    record ClearRoutes(String diagram, List<String> relations) implements ErdDiagramCommand {}
    /**
     * 다이어그램 복사(ERD 2차 §7.2). from 의 노드(위치·접기)와 꺾임점을 새 다이어그램 id 로 복사한다. 묶음 하나 = rev 하나이고 역명령은
     * 새 다이어그램 지우기다(addDiagram 과 같다). id 를 빼면 새 d- id, areaName 을 빼면 원본 업무영역, diagramName 을 빼면 「원본 이름 복사」.
     * sortSeq 는 원본 값이다.
     */
    record CopyDiagram(String from, String id, String areaName, String diagramName) implements ErdDiagramCommand {}
    /**
     * 되돌리기 전용(직접 보낼 수 없다). elements 는 ErdChange(kind diagram|diagramNode|diagramRoute).
     * diagramRoute 되살리기는 관계가 모델에 있는지 보지 않는다 — 관계가 그 사이에 지워졌으면 그리지 않는 행으로 남는다(§7.1 허용).
     * 꺾임점의 다이어그램이 그 사이에 지워졌으면 그 꺾임점만 건너뛴다.
     */
    record RestoreDiagram(List<ErdChange> elements) implements ErdDiagramCommand {}

    /** 표 상자 크기 한 개(README §7.4). w·h 가 null 이면 그 방향은 자동 크기다. */
    record NodeSize(String table, Integer w, Integer h) {}
    /** 그 다이어그램에서 표들의 크기를 바꾼다(위치·접기는 그대로). w 160~1600, h 52~4000. */
    record ResizeNodes(String diagram, List<NodeSize> nodes) implements ErdDiagramCommand {}

    /**
     * 그 다이어그램에서 그 관계선 두 끝점의 변을 함께 덮어쓴다(README §7.5). childSide·parentSide = "L"|"R"|null(null = 자동 변).
     * 꺾임점은 건드리지 않는다. 자기 참조 관계는 거절.
     */
    record SetRouteSides(String diagram, String relation, String childSide, String parentSide) implements ErdDiagramCommand {}

    static boolean isDiagramOp(String op) {
        return switch (op) {
            case "addDiagram", "updateDiagram", "deleteDiagram", "placeTables", "moveNodes", "setFold",
                 "removeFromDiagram", "setRoute", "clearRoutes", "copyDiagram", "restoreDiagram", "resizeNodes",
                 "setRouteSides" -> true;
            default -> false;
        };
    }
}
