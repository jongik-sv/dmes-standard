package com.dongkuk.dmes.mdm.dma.erdEdit;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.dongkuk.dmes.mdm.common.testdb.AbstractMdmSharedDbTest;
import com.dongkuk.dmes.mdm.dma.erdEdit.dbmeta.ErdDbMeta;
import com.dongkuk.dmes.mdm.dma.erdEdit.dbmeta.ErdDbMeta.Column;
import com.dongkuk.dmes.mdm.dma.erdEdit.dbmeta.ErdDbMeta.Constraint;
import com.dongkuk.dmes.mdm.dma.erdEdit.dbmeta.ErdDbMeta.Index;
import com.dongkuk.dmes.mdm.dma.erdEdit.dbmeta.ErdDbMeta.Table;
import com.dongkuk.dmes.mdm.dma.erdEdit.dbmeta.ErdDbMetaReader;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.List;
import java.util.Set;
import java.util.function.Function;
import java.util.stream.Collectors;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;

/** ERD 메타 조회 — 시험 PDB 의 MDMAPUSER(V1 기준선)와, 시험이 MCM_SOURCE 에 만든 같은 이름의 표로 OWNER 묶음을 본다. */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.MOCK)
@ActiveProfiles("local")
class ErdDbMetaReaderTest extends AbstractMdmSharedDbTest {

    /** 시험 PDB 에 사용자만 있고 표는 없는 스키마(scripts/oracle/pdb.mjs SCHEMA_USERS, CREATE TABLE 권한 있음). */
    static final String OTHER = "MCM_SOURCE";
    static final List<String> OTHER_TABLES = List.of("TB_MDM_COLUMN_SYSTEM", "TB_MDM_SYSTEM"); // 지우는 순서(자식 먼저)

    @Autowired ErdDbMetaReader reader;
    @Value("${spring.datasource.url}") String url;
    @Value("${spring.datasource.password}") String password;

    static Table table(ErdDbMeta m, String name) {
        List<Table> found = m.tables().stream().filter(t -> t.name().equals(name)).toList();
        assertThat(found).as("표 " + name + " 는 한 번만 나와야 한다").hasSize(1);
        return found.get(0);
    }

    static Column column(Table t, String name) {
        return t.columns().stream().filter(c -> c.name().equals(name)).findFirst()
                .orElseThrow(() -> new AssertionError(t.name() + "." + name + " 가 없다"));
    }

    static Constraint constraint(ErdDbMeta m, String name) {
        List<Constraint> found = m.constraints().stream().filter(c -> c.name().equals(name)).toList();
        assertThat(found).as("제약 " + name + " 는 한 번만 나와야 한다").hasSize(1);
        return found.get(0);
    }

    static Index index(ErdDbMeta m, String name) {
        List<Index> found = m.indexes().stream().filter(i -> i.name().equals(name)).toList();
        assertThat(found).as("인덱스 " + name + " 는 한 번만 나와야 한다").hasSize(1);
        return found.get(0);
    }

    static <T> void assertUniqueNames(List<T> list, Function<T, String> name, String what) {
        Set<String> dup = list.stream().collect(Collectors.groupingBy(name, Collectors.counting()))
                .entrySet().stream().filter(e -> e.getValue() > 1).map(e -> e.getKey()).collect(Collectors.toSet());
        assertThat(dup).as(what + " 이름이 겹친다(조인이 다른 스키마 행을 끌어왔다)").isEmpty();
    }

    @Test
    void readsV1TablesColumnsKeysAndIndexes() {
        ErdDbMeta all = reader.read(" mdmapuser ");
        assertThat(all.owner()).isEqualTo("MDMAPUSER");
        assertThat(all.tables()).extracting(Table::name)
                .noneMatch(n -> n.startsWith("BIN$") || n.equalsIgnoreCase("FLYWAY_SCHEMA_HISTORY"));
        assertThat(all.constraints()).extracting(Constraint::table)
                .noneMatch(n -> n.equalsIgnoreCase("FLYWAY_SCHEMA_HISTORY"));

        Set<String> v1 = ErdV1Meta.tables();
        ErdDbMeta m = ErdV1Meta.restrict(all, v1);
        assertThat(m.tables()).extracting(Table::name).containsExactlyInAnyOrderElementsOf(v1); // V1 표가 모두 있다
        assertThat(m.constraints().stream().filter(c -> c.type().equals("R")).count()).isEqualTo(ErdV1Meta.foreignKeyCount());

        Constraint composite = constraint(m, "FK_TB_MDM_CODE_CATE_ITEM_VER");
        assertThat(composite.table()).isEqualTo("TB_MDM_CODE_CATE_ITEM");
        assertThat(composite.type()).isEqualTo("R");
        assertThat(composite.columns()).containsExactly("MARU_CODE_ID", "FROM_VER");
        assertThat(composite.refTable()).isEqualTo("TB_MDM_CODE_VER");
        assertThat(composite.refColumns()).containsExactly("MARU_CODE_ID", "VER");

        Constraint toUnique = constraint(m, "FK_TB_MDM_LAYOUT_ITEM_COLUMN"); // 부모가 UNIQUE(UX_TB_MDM_COLUMN_PHYS_NAME)
        assertThat(toUnique.columns()).containsExactly("COLUMN_PHYS");
        assertThat(toUnique.refTable()).isEqualTo("TB_MDM_COLUMN");
        assertThat(toUnique.refColumns()).containsExactly("PHYS_NAME");

        Constraint self = constraint(m, "FK_TB_MDM_DOMAIN_DOMAIN");
        assertThat(self.table()).isEqualTo("TB_MDM_DOMAIN");
        assertThat(self.refTable()).isEqualTo("TB_MDM_DOMAIN");
        assertThat(self.columns()).containsExactly("PARENT_DOMAIN_ID");
        assertThat(self.refColumns()).containsExactly("DOMAIN_ID");

        Constraint pk = constraint(m, "PK_TB_MDM_COLUMN_SYSTEM");
        assertThat(pk.type()).isEqualTo("P");
        assertThat(pk.columns()).containsExactly("COLUMN_ID", "SYSTEM_CODE", "PHYS_NAME");
        assertThat(pk.refTable()).isNull();
        assertThat(pk.refColumns()).isEmpty();
        Constraint uk = constraint(m, "UX_TB_MDM_COLUMN_PHYS_NAME");
        assertThat(uk.type()).isEqualTo("U");
        assertThat(uk.columns()).containsExactly("PHYS_NAME");

        Table code = table(m, "TB_MDM_CODE");
        assertThat(code.columns().get(0).name()).isEqualTo("MARU_CODE_ID");
        assertThat(code.columns().get(0).position()).isEqualTo(1);
        Column status = column(code, "STATUS");          // VARCHAR2(20 CHAR) DEFAULT 'CREATED' NOT NULL
        assertThat(status.dataType()).isEqualTo("VARCHAR2");
        assertThat(status.length()).isEqualTo(20);
        assertThat(status.nullable()).isFalse();
        assertThat(status.defaultValue()).isEqualTo("'CREATED'");
        Column name = column(code, "MARU_CODE_NAME");    // VARCHAR2(4000 BYTE)
        assertThat(name.length()).isEqualTo(4000);
        Column cAt = column(code, "C_AT");               // TIMESTAMP(6)
        assertThat(cAt.dataType()).isEqualTo("TIMESTAMP(6)");
        assertThat(cAt.length()).isNull();
        assertThat(cAt.scale()).isEqualTo(6);
        assertThat(cAt.nullable()).isTrue();

        Column domainId = column(table(m, "TB_MDM_DOMAIN"), "DOMAIN_ID"); // NUMBER(19) IDENTITY
        assertThat(domainId.dataType()).isEqualTo("NUMBER");
        assertThat(domainId.precision()).isEqualTo(19);
        assertThat(domainId.scale()).isEqualTo(0);
        assertThat(domainId.length()).isNull();
        assertThat(domainId.defaultValue()).isNull();

        Table dict = table(m, "TB_MDM_COLUMN");          // V5 주석
        assertThat(dict.comment()).isEqualTo("컬럼 사전");
        assertThat(column(dict, "COLUMN_ID").comment()).isEqualTo("컬럼 아이디");

        Index ix = index(m, "IX_TB_MDM_COLUMN_SYSTEM_SYS_PHYS");
        assertThat(ix.table()).isEqualTo("TB_MDM_COLUMN_SYSTEM");
        assertThat(ix.unique()).isFalse();
        assertThat(ix.columns()).containsExactly("SYSTEM_CODE", "PHYS_NAME");
        assertThat(m.indexes()).extracting(Index::name)
                .doesNotContain("PK_TB_MDM_COLUMN", "UX_TB_MDM_COLUMN_PHYS_NAME") // 키를 받치는 인덱스
                .doesNotContain("IX_TB_MDM_COLUMN_UP_PHYS");                      // V2 함수 기반 인덱스
    }

    /** Review Focus 2. 다른 스키마에 이름이 같은 표·제약·인덱스·주석이 있어도 섞이지 않는다. */
    @Test
    void readerJoinsEveryDictionaryViewOnOwner() throws Exception {
        try (Connection con = DriverManager.getConnection(url, OTHER, password); Statement st = con.createStatement()) {
            dropOtherTables(st);
            try {
                // MDM 과 이름이 같지만 컬럼·키 구성이 다른 표 두 개. 제약·인덱스 이름도 MDM 것과 같게 만든다.
                st.execute("""
                        CREATE TABLE TB_MDM_SYSTEM (
                            OTHER_CODE   VARCHAR2(7 CHAR) NOT NULL,
                            SYSTEM_CODE  NUMBER(5),
                            CONSTRAINT PK_TB_MDM_SYSTEM PRIMARY KEY (OTHER_CODE))""");
                st.execute("""
                        CREATE TABLE TB_MDM_COLUMN_SYSTEM (
                            X_NOTE      VARCHAR2(9 CHAR) NOT NULL,
                            SYSTEM_REF  VARCHAR2(7 CHAR),
                            CONSTRAINT PK_TB_MDM_COLUMN_SYSTEM PRIMARY KEY (X_NOTE),
                            CONSTRAINT FK_TB_MDM_COLUMN_SYSTEM_SYSTEM FOREIGN KEY (SYSTEM_REF) REFERENCES TB_MDM_SYSTEM (OTHER_CODE))""");
                st.execute("CREATE INDEX IX_TB_MDM_COLUMN_SYSTEM_SYS_PHYS ON TB_MDM_COLUMN_SYSTEM (SYSTEM_REF, X_NOTE)");
                st.execute("COMMENT ON TABLE TB_MDM_SYSTEM IS '다른 스키마 표'");
                st.execute("COMMENT ON COLUMN TB_MDM_SYSTEM.SYSTEM_CODE IS '다른 스키마 컬럼'");

                ErdDbMeta mdm = reader.read("MDMAPUSER");
                assertUniqueNames(mdm.tables(), Table::name, "표");
                assertUniqueNames(mdm.constraints(), Constraint::name, "제약");
                assertUniqueNames(mdm.indexes(), Index::name, "인덱스");
                Table sys = table(mdm, "TB_MDM_SYSTEM");
                assertThat(sys.comment()).isEqualTo("시스템");
                assertThat(sys.columns()).extracting(Column::name).doesNotContain("OTHER_CODE");
                assertUniqueNames(sys.columns(), Column::name, "TB_MDM_SYSTEM 컬럼");
                Column code = column(sys, "SYSTEM_CODE");
                assertThat(code.dataType()).isEqualTo("VARCHAR2");
                assertThat(code.length()).isEqualTo(20);
                assertThat(code.comment()).isEqualTo("시스템 코드");
                assertThat(constraint(mdm, "PK_TB_MDM_SYSTEM").columns()).containsExactly("SYSTEM_CODE");
                assertThat(constraint(mdm, "PK_TB_MDM_COLUMN_SYSTEM").columns()).containsExactly("COLUMN_ID", "SYSTEM_CODE", "PHYS_NAME");
                Constraint fk = constraint(mdm, "FK_TB_MDM_COLUMN_SYSTEM_SYSTEM");
                assertThat(fk.columns()).containsExactly("SYSTEM_CODE");
                assertThat(fk.refTable()).isEqualTo("TB_MDM_SYSTEM");
                assertThat(fk.refColumns()).containsExactly("SYSTEM_CODE");
                assertThat(index(mdm, "IX_TB_MDM_COLUMN_SYSTEM_SYS_PHYS").columns()).containsExactly("SYSTEM_CODE", "PHYS_NAME");

                ErdDbMeta other = reader.read(OTHER);
                assertThat(other.owner()).isEqualTo(OTHER);
                assertThat(other.tables()).extracting(Table::name).filteredOn(n -> n.startsWith("TB_MDM_"))
                        .containsExactly("TB_MDM_COLUMN_SYSTEM", "TB_MDM_SYSTEM");
                Table oSys = table(other, "TB_MDM_SYSTEM");
                assertThat(oSys.comment()).isEqualTo("다른 스키마 표");
                assertThat(oSys.columns()).extracting(Column::name).containsExactly("OTHER_CODE", "SYSTEM_CODE");
                Column oCode = column(oSys, "SYSTEM_CODE");
                assertThat(oCode.dataType()).isEqualTo("NUMBER");
                assertThat(oCode.precision()).isEqualTo(5);
                assertThat(oCode.comment()).isEqualTo("다른 스키마 컬럼");
                assertThat(other.constraints()).filteredOn(c -> c.table().startsWith("TB_MDM_")).extracting(Constraint::name)
                        .containsExactlyInAnyOrder("PK_TB_MDM_SYSTEM", "PK_TB_MDM_COLUMN_SYSTEM", "FK_TB_MDM_COLUMN_SYSTEM_SYSTEM");
                assertThat(constraint(other, "PK_TB_MDM_SYSTEM").columns()).containsExactly("OTHER_CODE");
                Constraint oFk = constraint(other, "FK_TB_MDM_COLUMN_SYSTEM_SYSTEM");
                assertThat(oFk.columns()).containsExactly("SYSTEM_REF");
                assertThat(oFk.refTable()).isEqualTo("TB_MDM_SYSTEM");
                assertThat(oFk.refColumns()).containsExactly("OTHER_CODE");
                assertThat(index(other, "IX_TB_MDM_COLUMN_SYSTEM_SYS_PHYS").columns()).containsExactly("SYSTEM_REF", "X_NOTE");
            } finally {
                dropOtherTables(st);
            }
        }
    }

    @Test
    void ownerIsValidatedAndUnknownOwnerIsEmpty() {
        ErdDbMeta none = reader.read("NO_SUCH_OWNER_ERD");
        assertThat(none.tables()).isEmpty();
        assertThat(none.constraints()).isEmpty();
        assertThat(none.indexes()).isEmpty();
        assertThatThrownBy(() -> reader.read("MDMAPUSER' OR '1'='1")).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> reader.read(" ")).isInstanceOf(IllegalArgumentException.class);
    }

    /** 휴지통에 남기지 않는다(PURGE). 없으면 넘어간다(ORA-00942). */
    private static void dropOtherTables(Statement st) throws SQLException {
        for (String t : OTHER_TABLES) {
            try {
                st.execute("DROP TABLE " + t + " CASCADE CONSTRAINTS PURGE");
            } catch (SQLException e) {
                if (e.getErrorCode() != 942) throw e;
            }
        }
    }
}
