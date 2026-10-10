package com.dongkuk.dmes.mdm.dma.erdEdit.infer;

import static org.assertj.core.api.Assertions.assertThat;

import com.dongkuk.dmes.mdm.dma.erdEdit.dbmeta.ErdDbMeta;
import com.dongkuk.dmes.mdm.dma.erdEdit.model.ErdEvidence;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import org.junit.jupiter.api.Test;

/** 관계 추정기 — 순서(DB FK → DOC → SQL_JOIN → NAME_RULE), 변형 x, 합치기, 허브 순위, 결정성. */
class ErdRelationInferrerTest {

    final ErdRelationInferrer inferrer = new ErdRelationInferrer();

    static List<String> l(String... s) {
        return List.of(s);
    }

    static ErdDbMeta.Table table(String name, String... cols) {
        List<ErdDbMeta.Column> list = new ArrayList<>();
        for (int i = 0; i < cols.length; i++) {
            list.add(new ErdDbMeta.Column(cols[i], i + 1, "VARCHAR2", 30, null, null, true, null, null));
        }
        return new ErdDbMeta.Table(name, null, list);
    }

    static ErdDbMeta.Constraint pk(String table, String... cols) {
        return new ErdDbMeta.Constraint("PK_" + table, table, "P", l(cols), null, List.of());
    }

    static ErdDbMeta.Constraint uk(String name, String table, String... cols) {
        return new ErdDbMeta.Constraint(name, table, "U", l(cols), null, List.of());
    }

    static ErdDbMeta.Constraint fk(String name, String table, List<String> cols, String ref, List<String> refCols) {
        return new ErdDbMeta.Constraint(name, table, "R", cols, ref, refCols);
    }

    static ErdDbMeta meta(List<ErdDbMeta.Table> tables, List<ErdDbMeta.Constraint> cons) {
        return new ErdDbMeta("S", tables, cons, List.of());
    }

    static ErdHints.Ref doc(String ct, List<String> cc, String pt, List<String> pc, String ref) {
        return new ErdHints.Ref("DOC", ct, cc, pt, pc, ref);
    }

    static ErdHints.Ref sql(String ct, List<String> cc, String pt, List<String> pc, String ref) {
        return new ErdHints.Ref("SQL_JOIN", ct, cc, pt, pc, ref);
    }

    static List<InferredRelation> between(List<InferredRelation> rs, String child, String parent) {
        return rs.stream().filter(r -> r.childTable().equals(child) && r.parentTable().equals(parent)).toList();
    }

    static InferredRelation one(List<InferredRelation> rs, String child, String parent) {
        List<InferredRelation> found = between(rs, child, parent);
        assertThat(found).as(child + " > " + parent).hasSize(1);
        return found.get(0);
    }

    /** Review Focus 1 의 추정기 몫. PK 없는 표·복합 PK·UNIQUE 부모·자기 참조 FK 가 모두 DB 관계로 들어온다. */
    @Test
    void importBuildsCompositeUniqueAndSelfReference() {
        var m = meta(
                List.of(table("TB_LAYOUT", "LAYOUT_ID", "VER"),
                        table("TB_HEADER", "H_SEQ", "LAYOUT_ID", "VER", "HEADER_LAYOUT_ID"),
                        table("TB_CONST", "CONST_ID", "LAYOUT_ID", "VER", "HEADER_LAYOUT_ID"),
                        table("TB_FOLDER", "FOLDER_ID", "PARENT_FOLDER_ID"),
                        table("TB_LOG", "LOG_TEXT", "FOLDER_ID")),                     // PK 없음
                List.of(pk("TB_LAYOUT", "LAYOUT_ID", "VER"),
                        pk("TB_HEADER", "H_SEQ"),
                        uk("UX_TB_HEADER_HDR", "TB_HEADER", "LAYOUT_ID", "VER", "HEADER_LAYOUT_ID"),
                        pk("TB_CONST", "CONST_ID"),
                        pk("TB_FOLDER", "FOLDER_ID"),
                        fk("FK_TB_HEADER_LAYOUT", "TB_HEADER", l("LAYOUT_ID", "VER"), "TB_LAYOUT", l("LAYOUT_ID", "VER")),
                        fk("FK_TB_CONST_HEADER", "TB_CONST", l("LAYOUT_ID", "VER", "HEADER_LAYOUT_ID"),
                                "TB_HEADER", l("LAYOUT_ID", "VER", "HEADER_LAYOUT_ID")),
                        fk("FK_TB_FOLDER_PARENT", "TB_FOLDER", l("PARENT_FOLDER_ID"), "TB_FOLDER", l("FOLDER_ID"))));
        var rs = inferrer.infer(m, ErdHints.EMPTY);

        var composite = one(rs, "TB_HEADER", "TB_LAYOUT");
        assertThat(composite.state()).isEqualTo("DB");
        assertThat(composite.childColumns()).containsExactly("LAYOUT_ID", "VER");
        assertThat(composite.parentColumns()).containsExactly("LAYOUT_ID", "VER");
        // DB FK 와 짝이 같은 이름 규칙 후보는 근거만 붙는다.
        assertThat(composite.evidence()).containsExactly(new ErdEvidence("DB_FK", "FK_TB_HEADER_LAYOUT"),
                new ErdEvidence("NAME_RULE", "복합 PK 이름 일치"));
        // UNIQUE 부모: TB_CONST 는 TB_LAYOUT 의 PK(LAYOUT_ID, VER)도 다 가지지만 그 후보는 TB_CONST > TB_LAYOUT 로 따로 남는다.
        var toUnique = one(rs, "TB_CONST", "TB_HEADER");
        assertThat(toUnique.state()).isEqualTo("DB");
        assertThat(toUnique.childColumns()).containsExactly("LAYOUT_ID", "VER", "HEADER_LAYOUT_ID");
        assertThat(toUnique.evidence()).containsExactly(new ErdEvidence("DB_FK", "FK_TB_CONST_HEADER"));
        var self = one(rs, "TB_FOLDER", "TB_FOLDER");
        assertThat(self.state()).isEqualTo("DB");
        assertThat(self.childColumns()).containsExactly("PARENT_FOLDER_ID");
        assertThat(self.parentColumns()).containsExactly("FOLDER_ID");
        // PK 없는 표는 자식이 될 수 있지만 부모는 되지 않는다.
        var fromLog = one(rs, "TB_LOG", "TB_FOLDER");
        assertThat(fromLog.state()).isEqualTo("INFERRED");
        assertThat(rs).noneMatch(r -> r.parentTable().equals("TB_LOG"));
        assertThat(rs).filteredOn(r -> r.state().equals("DB")).allMatch(r -> r.candidateRank() == null);
    }

    @Test
    void nameRuleFollowsVariantX() {
        var m = meta(
                List.of(table("TB_USER", "USER_ID", "USER_NM"),
                        table("TB_USER_PWD", "USER_ID", "PWD"),
                        table("TB_SEQ_ONLY", "ID", "USER_ID"),
                        table("TB_AUDITED", "VER", "NOTE"),
                        table("TB_UK", "UK_CODE"),
                        table("TB_REF", "REF_ID", "UK_CODE", "ID", "NOTE"),
                        table("TB_CV", "CODE_ID", "VER"),
                        table("TB_X", "X_ID", "CODE_ID", "VER"),
                        table("TB_Y", "Y_ID", "CODE_ID")),
                List.of(pk("TB_USER", "USER_ID"), pk("TB_USER_PWD", "USER_ID"), pk("TB_SEQ_ONLY", "ID"),
                        pk("TB_AUDITED", "VER"), uk("UX_TB_UK", "TB_UK", "UK_CODE"), pk("TB_REF", "REF_ID"),
                        pk("TB_CV", "CODE_ID", "VER"), pk("TB_X", "X_ID"), pk("TB_Y", "Y_ID")));
        var rs = inferrer.infer(m, ErdHints.EMPTY);

        assertThat(rs).allMatch(r -> r.state().equals("INFERRED"));
        assertThat(rs).allMatch(r -> r.evidence().size() == 1 && r.evidence().get(0).kind().equals("NAME_RULE"));
        assertThat(rs).noneMatch(r -> r.childTable().equals(r.parentTable()));                // 자기 자신 제외
        assertThat(one(rs, "TB_USER_PWD", "TB_USER").evidence()).containsExactly(new ErdEvidence("NAME_RULE", "PK 이름 일치"));
        assertThat(between(rs, "TB_USER", "TB_USER_PWD")).hasSize(1);                         // 1:1 은 두 방향
        assertThat(rs).noneMatch(r -> r.parentTable().equals("TB_SEQ_ONLY"));                 // PK 가 ID
        assertThat(rs).noneMatch(r -> r.parentTable().equals("TB_AUDITED"));                  // PK 가 감사 칼럼
        assertThat(rs).noneMatch(r -> r.parentTable().equals("TB_UK"));                       // UK 는 부모가 아니다
        var full = one(rs, "TB_X", "TB_CV");                                                  // 복합 PK 전체, VER 도 뺀 적 없다
        assertThat(full.childColumns()).containsExactly("CODE_ID", "VER");
        assertThat(full.parentColumns()).containsExactly("CODE_ID", "VER");
        assertThat(full.evidence()).containsExactly(new ErdEvidence("NAME_RULE", "복합 PK 이름 일치"));
        assertThat(between(rs, "TB_Y", "TB_CV")).isEmpty();                                   // 일부만 있으면 없다
        assertThat(one(rs, "TB_SEQ_ONLY", "TB_USER").candidateRank()).isNotNull();            // USER_ID 는 부모 후보 2개
    }

    @Test
    void hintsMergeInOrderAndSqlJoinTurnsTowardKey() {
        var m = meta(
                List.of(table("TB_MCM_SEC_OBJ", "OBJECT_ID", "OBJ_NM"),
                        table("TB_MCM_SEC_MENU", "MENU_ID", "OBJECT_ID"),
                        table("TB_MCM_SEC_MENU_FLD", "FLD_ID", "PARENT_FLD_ID")),
                List.of(pk("TB_MCM_SEC_OBJ", "OBJECT_ID"), pk("TB_MCM_SEC_MENU", "MENU_ID"), pk("TB_MCM_SEC_MENU_FLD", "FLD_ID")));
        var hints = new ErdHints(List.of(
                // SQL 조인은 방향이 없다. 키(PK) 쪽을 부모로 돌린다.
                sql("TB_MCM_SEC_OBJ", l("OBJECT_ID"), "TB_MCM_SEC_MENU", l("OBJECT_ID"), "src/backend/mcm/MenuQuery.java:10"),
                doc("TB_MCM_SEC_MENU", l("OBJECT_ID"), "TB_MCM_SEC_OBJ", l("OBJECT_ID"), "docs/mcm/erd/csa-menu.dbml:494"),
                doc("TB_MCM_SEC_MENU_FLD", l("PARENT_FLD_ID"), "TB_MCM_SEC_MENU_FLD", l("FLD_ID"), "docs/mcm/erd/csa-menu.dbml:492")));
        var rs = inferrer.infer(m, hints);

        var menuObj = one(rs, "TB_MCM_SEC_MENU", "TB_MCM_SEC_OBJ");
        assertThat(menuObj.state()).isEqualTo("INFERRED");
        assertThat(menuObj.evidence()).containsExactly(
                new ErdEvidence("DOC", "docs/mcm/erd/csa-menu.dbml:494"),
                new ErdEvidence("SQL_JOIN", "src/backend/mcm/MenuQuery.java:10"),
                new ErdEvidence("NAME_RULE", "PK 이름 일치"));
        assertThat(between(rs, "TB_MCM_SEC_OBJ", "TB_MCM_SEC_MENU")).isEmpty();
        var self = one(rs, "TB_MCM_SEC_MENU_FLD", "TB_MCM_SEC_MENU_FLD");                     // 문서의 자기 참조
        assertThat(self.childColumns()).containsExactly("PARENT_FLD_ID");
        assertThat(self.evidence()).containsExactly(new ErdEvidence("DOC", "docs/mcm/erd/csa-menu.dbml:492"));
    }

    @Test
    void staleHintsAreIgnored() {
        var m = meta(List.of(table("TB_A", "A_ID"), table("TB_B", "B_ID", "A_ID")),
                List.of(pk("TB_A", "A_ID"), pk("TB_B", "B_ID")));
        var stale = new ErdHints(List.of(
                doc("TB_GONE", l("A_ID"), "TB_A", l("A_ID"), "d:1"),                 // 없는 표
                doc("TB_B", l("NO_COL"), "TB_A", l("A_ID"), "d:2"),                  // 없는 컬럼
                doc("TB_B", l("A_ID", "B_ID"), "TB_A", l("A_ID"), "d:3"),            // 짝 수가 다름
                sql("TB_B", l("A_ID"), "TB_B", l("A_ID"), "s:1")));                  // 같은 표 같은 컬럼
        assertThat(inferrer.infer(m, stale)).isEqualTo(inferrer.infer(m, ErdHints.EMPTY));
    }

    static ErdDbMeta hubMeta(ErdDbMeta.Constraint... extra) {
        List<ErdDbMeta.Constraint> cons = new ArrayList<>(List.of(
                pk("TB_MCM_SEC_USER", "USER_ID"), pk("TB_SEC_USER", "USER_ID"), pk("TB_MCM_SEC_USER_PWD", "USER_ID"),
                pk("TB_MCM_SEC_USER_WIDGET", "WIDGET_ID"), pk("TB_MCM_DEPT", "DEPT_CD")));
        cons.addAll(List.of(extra));
        return meta(List.of(table("TB_MCM_SEC_USER", "USER_ID", "USER_NM"),
                        table("TB_SEC_USER", "USER_ID"),
                        table("TB_MCM_SEC_USER_PWD", "USER_ID", "PWD"),
                        table("TB_MCM_SEC_USER_WIDGET", "WIDGET_ID", "USER_ID", "DEPT_CD"),
                        table("TB_MCM_DEPT", "DEPT_CD", "DEPT_NM")),
                cons);
    }

    @Test
    void hubColumnRanksNearestParentFirst() {
        var rs = inferrer.infer(hubMeta(), ErdHints.EMPTY);
        assertThat(one(rs, "TB_MCM_SEC_USER_WIDGET", "TB_MCM_SEC_USER").candidateRank()).isEqualTo(1);
        assertThat(one(rs, "TB_MCM_SEC_USER_WIDGET", "TB_MCM_SEC_USER_PWD").candidateRank()).isEqualTo(2);
        assertThat(one(rs, "TB_MCM_SEC_USER_WIDGET", "TB_SEC_USER").candidateRank()).isEqualTo(3);
        assertThat(one(rs, "TB_MCM_SEC_USER_WIDGET", "TB_MCM_DEPT").candidateRank()).isNull();  // 후보 하나
        // 출력 순서: 같은 자식 컬럼 묶음 안에서는 순위 순.
        assertThat(rs.stream().filter(r -> r.childTable().equals("TB_MCM_SEC_USER_WIDGET") && r.childColumns().equals(l("USER_ID")))
                .map(InferredRelation::parentTable).toList())
                .containsExactly("TB_MCM_SEC_USER", "TB_MCM_SEC_USER_PWD", "TB_SEC_USER");
    }

    @Test
    void docEvidenceOutranksNameAndDbRelationKeepsNull() {
        var withDoc = inferrer.infer(hubMeta(), new ErdHints(List.of(
                doc("TB_MCM_SEC_USER_WIDGET", l("USER_ID"), "TB_SEC_USER", l("USER_ID"), "docs/x.dbml:1"))));
        assertThat(one(withDoc, "TB_MCM_SEC_USER_WIDGET", "TB_SEC_USER").candidateRank()).isEqualTo(1);
        assertThat(one(withDoc, "TB_MCM_SEC_USER_WIDGET", "TB_MCM_SEC_USER").candidateRank()).isEqualTo(2);
        assertThat(one(withDoc, "TB_MCM_SEC_USER_WIDGET", "TB_MCM_SEC_USER_PWD").candidateRank()).isEqualTo(3);

        var withDb = inferrer.infer(hubMeta(fk("FK_WIDGET_USER", "TB_MCM_SEC_USER_WIDGET", l("USER_ID"), "TB_SEC_USER", l("USER_ID"))),
                ErdHints.EMPTY);
        var db = one(withDb, "TB_MCM_SEC_USER_WIDGET", "TB_SEC_USER");
        assertThat(db.state()).isEqualTo("DB");
        assertThat(db.candidateRank()).isNull();
        assertThat(one(withDb, "TB_MCM_SEC_USER_WIDGET", "TB_MCM_SEC_USER").candidateRank()).isEqualTo(2);
        assertThat(one(withDb, "TB_MCM_SEC_USER_WIDGET", "TB_MCM_SEC_USER_PWD").candidateRank()).isEqualTo(3);
    }

    @Test
    void resultIsDeterministic() {
        ErdDbMeta m = hubMeta();
        var hints = new ErdHints(List.of(
                doc("TB_MCM_SEC_USER_WIDGET", l("DEPT_CD"), "TB_MCM_DEPT", l("DEPT_CD"), "docs/b.dbml:2"),
                sql("TB_MCM_SEC_USER_PWD", l("USER_ID"), "TB_MCM_SEC_USER", l("USER_ID"), "src/a.java:1")));
        List<ErdDbMeta.Table> tables = new ArrayList<>(m.tables());
        List<ErdDbMeta.Constraint> cons = new ArrayList<>(m.constraints());
        List<ErdHints.Ref> refs = new ArrayList<>(hints.refs());
        Collections.reverse(tables);
        Collections.reverse(cons);
        Collections.reverse(refs);
        assertThat(inferrer.infer(new ErdDbMeta("S", tables, cons, List.of()), new ErdHints(refs)))
                .isEqualTo(inferrer.infer(m, hints));
    }
}
