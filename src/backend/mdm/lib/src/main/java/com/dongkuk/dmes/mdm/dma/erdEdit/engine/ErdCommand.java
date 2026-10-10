package com.dongkuk.dmes.mdm.dma.erdEdit.engine;

import com.fasterxml.jackson.annotation.JsonSubTypes;
import com.fasterxml.jackson.annotation.JsonTypeInfo;
import java.util.List;
import java.util.Map;

/**
 * 모델 명령(스펙 4.1). JSON 은 {@code {"op":"updateColumn", ...}}. id 가 null 인 add 명령은 엔진이 id 를 만든다.
 * 다이어그램 명령은 버전 밖이라 엔진이 아니라 ErdDiagramStore 가 처리한다(Task 9).
 */
@JsonTypeInfo(use = JsonTypeInfo.Id.NAME, property = "op")
@JsonSubTypes({
        @JsonSubTypes.Type(value = ErdCommand.AddTable.class, name = "addTable"),
        @JsonSubTypes.Type(value = ErdCommand.UpdateTable.class, name = "updateTable"),
        @JsonSubTypes.Type(value = ErdCommand.DeleteTable.class, name = "deleteTable"),
        @JsonSubTypes.Type(value = ErdCommand.AddColumn.class, name = "addColumn"),
        @JsonSubTypes.Type(value = ErdCommand.UpdateColumn.class, name = "updateColumn"),
        @JsonSubTypes.Type(value = ErdCommand.MoveColumn.class, name = "moveColumn"),
        @JsonSubTypes.Type(value = ErdCommand.DeleteColumn.class, name = "deleteColumn"),
        @JsonSubTypes.Type(value = ErdCommand.ApplyDomain.class, name = "applyDomain"),
        @JsonSubTypes.Type(value = ErdCommand.SetPrimaryKey.class, name = "setPrimaryKey"),
        @JsonSubTypes.Type(value = ErdCommand.AddKey.class, name = "addKey"),
        @JsonSubTypes.Type(value = ErdCommand.UpdateKey.class, name = "updateKey"),
        @JsonSubTypes.Type(value = ErdCommand.DeleteKey.class, name = "deleteKey"),
        @JsonSubTypes.Type(value = ErdCommand.AddRelation.class, name = "addRelation"),
        @JsonSubTypes.Type(value = ErdCommand.UpdateRelation.class, name = "updateRelation"),
        @JsonSubTypes.Type(value = ErdCommand.ConfirmRelation.class, name = "confirmRelation"),
        @JsonSubTypes.Type(value = ErdCommand.RejectRelation.class, name = "rejectRelation"),
        @JsonSubTypes.Type(value = ErdCommand.DeleteRelation.class, name = "deleteRelation"),
        @JsonSubTypes.Type(value = ErdCommand.Restore.class, name = "restore")
})
public sealed interface ErdCommand {

    record AddTable(String id, String phys, String logical, String comment) implements ErdCommand {}
    record UpdateTable(String id, Map<String, Object> set) implements ErdCommand {}
    record DeleteTable(String id) implements ErdCommand {}

    record AddColumn(String id, String table, String phys, String logical, Long domainId, String dataType,
                     Integer length, Integer scale, Boolean notNull, String defaultValue, String comment,
                     Integer position) implements ErdCommand {}
    record UpdateColumn(String id, Map<String, Object> set) implements ErdCommand {}
    record MoveColumn(String id, int position) implements ErdCommand {}
    record DeleteColumn(String id) implements ErdCommand {}
    record ApplyDomain(String id, Long domainId) implements ErdCommand {}

    record SetPrimaryKey(String table, List<String> columns, String name) implements ErdCommand {}
    record AddKey(String id, String table, String kind, String name, List<String> columns) implements ErdCommand {}
    record UpdateKey(String id, Map<String, Object> set) implements ErdCommand {}
    record DeleteKey(String id) implements ErdCommand {}

    /** Task 5. onNameClash: ASK(기본) | REUSE | RENAME. */
    record AddRelation(String id, String child, String parent, ErdParentRefArg parentRef, boolean identifying,
                       List<List<String>> pairs, String onNameClash, Boolean dbFk) implements ErdCommand {}
    record ErdParentRefArg(String model, String table, List<String> columns) {}
    record UpdateRelation(String id, Map<String, Object> set) implements ErdCommand {}
    record ConfirmRelation(String id) implements ErdCommand {}
    record RejectRelation(String id) implements ErdCommand {}
    record DeleteRelation(String id) implements ErdCommand {}

    /** 되돌리기 전용. elements 의 상태로 되돌린다. sinceRev 뒤에 다른 세션이 고친 요소가 있으면 CONFLICT. */
    record Restore(long sinceRev, List<ErdChange> elements) implements ErdCommand {}
}
