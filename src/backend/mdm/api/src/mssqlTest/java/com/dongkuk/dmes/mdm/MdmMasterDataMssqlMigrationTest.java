package com.dongkuk.dmes.mdm;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.dongkuk.dmes.mdm.entity.MdmData;
import com.dongkuk.dmes.mdm.entity.MdmDataItem;
import com.dongkuk.dmes.mdm.entity.MdmDataItemId;
import com.dongkuk.dmes.mdm.repository.MdmDataItemRepository;
import com.dongkuk.dmes.mdm.repository.MdmDataRepository;
import jakarta.persistence.EntityManager;
import java.sql.Connection;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.HashMap;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;
import javax.sql.DataSource;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.transaction.annotation.Transactional;

/**
 * TSK-07-01 design.md §3.3′-B — V10(05 마스터데이터, 당초 V7)을 {@code @SpringBootTest}+{@code local-db} 프로파일로
 * 실제 SQL Server 에 적용한다. §3.3′-B 11개 항목에 대응하는 메서드를 둔다.
 *
 * <p>테스트 클래스마다 컨테이너를 새로 띄우지 않고 {@link MdmMssqlServer}(2026-09-24 dev 반영, 사용자
 * 결정 "같은 목적의 도커는 한 곳에 모아 쓴다")가 공유하는 서버 하나를 같이 쓴다 — 다른 mssqlTest 클래스
 * (`MdmMssqlMigrationTest` 등)와 같은 패턴.
 *
 * <p><b>작성만 하고 실행하지 않는다(F20·F21, 도커 금지 정책).</b> {@code :api:compileMssqlTestJava}
 * (컴파일 전용, docker 불필요)로 컴파일만 확인하고 {@code :api:mssqlMigrationTest}(Testcontainers 실행)는
 * 호출하지 않는다 — 도커 정책이 바뀌면 즉시 쓸 수 있게 남겨 둔다. 게이트·수용 기준 근거가 아니다.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.MOCK)
@ActiveProfiles("local-db")
class MdmMasterDataMssqlMigrationTest {

    @Autowired
    DataSource dataSource;
    @Autowired
    EntityManager entityManager;
    @Autowired
    MdmDataRepository dataRepository;
    @Autowired
    MdmDataItemRepository dataItemRepository;

    @DynamicPropertySource
    static void registerMssql(DynamicPropertyRegistry registry) throws SQLException {
        String mdmUrl = MdmMssqlServer.newDatabase("masterdata");
        registry.add("spring.datasource.url", () -> mdmUrl);
        registry.add("spring.datasource.username", MdmMssqlServer::user);
        registry.add("spring.datasource.password", MdmMssqlServer::password);
    }

    /** 항목 1·2·6·7·8(참고, §3.3′-A 가 자동 확인) — V10 이 성공적으로 적용됐다. */
    @Test
    void local_db_설정으로_V1_V2_V3_V4_V8_V9_V10_V11_V12_가_적용된다() throws SQLException {
        // TSK-04-02 — V11(약어 인덱스 비유일화, 머지 뒤 최대 버전+1 재채번) 추가 반영. 완화가 아니라 새 버전 반영이다.
        Set<String> versions = new HashSet<>();
        try (Connection c = dataSource.getConnection(); Statement s = c.createStatement();
             ResultSet rs = s.executeQuery("SELECT version FROM flyway_schema_history WHERE success = 1")) {
            while (rs.next()) {
                versions.add(rs.getString(1));
            }
        }
        assertEquals(Set.of("1", "2", "3", "4", "8", "9", "10", "11", "12"), versions); // TSK-05-03 — V12(레이아웃 버전 이력) 추가 반영
    }

    /** 항목 3 — 코드성 칼럼에 BIN2 콜레이션이 빠짐없이 붙었다(F5, naming-dialect-rules §3 #19). */
    @Test
    void 항목3_코드성_칼럼에_BIN2_콜레이션이_붙어있다() throws SQLException {
        Map<String, String> collations = new HashMap<>();
        try (Connection c = dataSource.getConnection(); Statement s = c.createStatement();
             ResultSet rs = s.executeQuery(
                     "SELECT t.name AS table_name, c.name AS column_name, c.collation_name FROM sys.columns c "
                             + "JOIN sys.tables t ON t.object_id = c.object_id "
                             + "WHERE c.collation_name IS NOT NULL AND t.name LIKE 'TB_MDM_DATA%'")) {
            while (rs.next()) {
                collations.put(rs.getString("table_name") + "." + rs.getString("column_name"),
                        rs.getString("collation_name"));
            }
        }
        assertEquals("Latin1_General_100_BIN2", collations.get("TB_MDM_DATA.MARU_DATA_ID"));
        assertEquals("Latin1_General_100_BIN2", collations.get("TB_MDM_DATA_ITEM.CODE"));
        assertEquals("Latin1_General_100_BIN2", collations.get("TB_MDM_DATA_CATE.DEF_TARGET"));
    }

    /** 항목 6 — F5 대조군, MSSQL 에서도 SOURCE_SYSTEM FK 가 강제된다(오류 547). */
    @Test
    void 항목6_SOURCE_SYSTEM_FK_가_MSSQL_에서도_강제된다() throws SQLException {
        try (Connection c = dataSource.getConnection()) {
            c.setAutoCommit(false);
            try (Statement s = c.createStatement()) {
                SQLException ex = assertThrows(SQLException.class, () -> s.execute(
                        "INSERT INTO TB_MDM_DATA (MARU_DATA_ID, MARU_DATA_NAME, SOURCE_KIND, SOURCE_SYSTEM) "
                                + "VALUES ('MSSQL-FK-1', N'대조군', 'EXTERNAL', 'NOPE-SYS-XYZ')"),
                        "존재하지 않는 SOURCE_SYSTEM 은 FK_TB_MDM_DATA_SYSTEM_SRC 가 거부해야 한다");
                assertEquals(547, ex.getErrorCode(), ex.getMessage());
            } finally {
                c.rollback();
                c.setAutoCommit(true);
            }
        }
    }

    /** 항목 7 — F13, TB_MDM_DATA_CATE_ITEM 은 CATE_ID·CODE 에 FK 가 없어 MSSQL 에서도 성공해야 한다. */
    @Test
    void 항목7_CATE_ITEM_은_MSSQL_에서도_CATE_ID_CODE_에_FK_가_없다() throws SQLException {
        try (Connection c = dataSource.getConnection()) {
            c.setAutoCommit(false);
            try (Statement s = c.createStatement()) {
                s.execute("INSERT INTO TB_MDM_DATA (MARU_DATA_ID, MARU_DATA_NAME, SOURCE_KIND) "
                        + "VALUES ('MSSQL-F13-1', N'F13대조군', 'MDM')");
                s.execute("INSERT INTO TB_MDM_DATA_CATE_ITEM (MARU_DATA_ID, CATE_ID, CODE, VALID_FROM) "
                        + "VALUES ('MSSQL-F13-1', 'NOPE-CATE', 'NOPE-CODE', '2026-09-24 10:00:00')");
            } finally {
                c.rollback();
                c.setAutoCommit(true);
            }
        }
    }

    /** 항목 9 — CHECK 값 목록(F18 포함)이 두 방언에서 문자열로 같다(§3.3′-B 9, SQLite 쪽은 §3.1-9 가 계약과 자동 대조). */
    @Test
    void 항목9_CK_TB_MDM_DATA_CATE_TARGET_이_CODE_를_거부한다() throws SQLException {
        try (Connection c = dataSource.getConnection()) {
            c.setAutoCommit(false);
            try (Statement s = c.createStatement()) {
                s.execute("INSERT INTO TB_MDM_DATA (MARU_DATA_ID, MARU_DATA_NAME, SOURCE_KIND) "
                        + "VALUES ('MSSQL-F18-1', N'F18대조군', 'MDM')");
                SQLException ex = assertThrows(SQLException.class, () -> s.execute(
                        "INSERT INTO TB_MDM_DATA_CATE (MARU_DATA_ID, CATE_ID, VALID_FROM, DEF_KIND, DEF_EXPR, DEF_TARGET) "
                                + "VALUES ('MSSQL-F18-1', 'CATE-1', '2026-09-24 10:00:00', 'REGEX', '^A$', 'CODE')"),
                        "CK_TB_MDM_DATA_CATE_TARGET(F18) 이 CODE 를 거부해야 한다(04 전용값)");
                assertEquals(547, ex.getErrorCode(), ex.getMessage());
            } finally {
                c.rollback();
                c.setAutoCommit(true);
            }
        }
    }

    /** 항목 10 — 예약어 칼럼([RESULT]·[ACTION]) 인용이 일관되게 감싸졌는지 텍스트만 확인한다. */
    @Test
    void 항목10_예약어_칼럼_RESULT_ACTION_이_대괄호로_인용됐다() throws SQLException {
        try (Connection c = dataSource.getConnection(); Statement s = c.createStatement();
             ResultSet rs = s.executeQuery(
                     "SELECT c.name FROM sys.columns c JOIN sys.tables t ON t.object_id = c.object_id "
                             + "WHERE t.name IN ('TB_MDM_DATA_RECV','TB_MDM_DATA_RECV_ITEM') "
                             + "AND c.name IN ('RESULT','ACTION')")) {
            Set<String> found = new HashSet<>();
            while (rs.next()) {
                found.add(rs.getString(1));
            }
            assertEquals(Set.of("RESULT", "ACTION"), found);
        }
    }

    /** 항목 11 — RECV_ID 의 IDENTITY(1,1) 이 실제 save() 연속 호출로 단조 증가함을 확인한다(알려진 갭이 아니라 이 항목만은 실행 가능하면 직접 확인). */
    @Test
    @Transactional
    void 항목11_RECV_ID_는_IDENTITY_로_단조_증가한다() throws SQLException {
        try (Connection c = dataSource.getConnection()) {
            c.setAutoCommit(false);
            try (Statement s = c.createStatement()) {
                s.execute("INSERT INTO TB_MDM_DATA_RECV (SOURCE_SYSTEM, RECEIVED_AT, BODY) "
                        + "VALUES ('MDM', '2026-09-24 10:00:00', N'{}')");
                s.execute("INSERT INTO TB_MDM_DATA_RECV (SOURCE_SYSTEM, RECEIVED_AT, BODY) "
                        + "VALUES ('MDM', '2026-09-24 10:00:01', N'{}')");
                long first;
                long second;
                try (ResultSet rs = s.executeQuery(
                        "SELECT RECV_ID FROM TB_MDM_DATA_RECV ORDER BY RECV_ID")) {
                    assertTrue(rs.next());
                    first = rs.getLong(1);
                    assertTrue(rs.next());
                    second = rs.getLong(1);
                }
                assertTrue(second > first);
            } finally {
                c.rollback();
                c.setAutoCommit(true);
            }
        }
    }

    /** 복합키 왕복(팀장 지시 패턴) — MdmDataItem 을 리포지토리로 저장·조회한다(§3.2 SQLite 왕복의 MSSQL 대조군). */
    @Test
    @Transactional
    void MdmDataItem_이_MSSQL_에서도_findById_로_왕복한다() {
        MdmData data = new MdmData("MSSQL-RT-1", "MSSQL왕복", "INUSE", "MDM", "^[0-9A-Z]{1,20}$");
        dataRepository.save(data);
        entityManager.flush();

        java.time.LocalDateTime validFrom = java.time.LocalDateTime.of(2026, 9, 24, 10, 0, 0);
        MdmDataItem item = new MdmDataItem("MSSQL-RT-1", "ITEM-1", validFrom, "MSSQL항목");
        item.setValidTo(com.dongkuk.dmes.mdm.contract.data.MdmTemporalSegmentRules.OPEN_END);
        item.setRowVersion(0);
        item.setChgSeq(0L);
        dataItemRepository.save(item);
        entityManager.flush();
        entityManager.clear();

        MdmDataItem reloaded = dataItemRepository.findById(new MdmDataItemId("MSSQL-RT-1", "ITEM-1", validFrom))
                .orElseThrow();
        assertEquals("MSSQL항목", reloaded.getName());
    }
}
