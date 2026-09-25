package com.dongkuk.dmes.mdm;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;

import com.dongkuk.dmes.mdm.common.testdb.AbstractMdmSharedDbTest;
import com.dongkuk.dmes.mdm.contract.data.MdmTemporalSegmentRules;
import com.dongkuk.dmes.mdm.entity.MdmData;
import com.dongkuk.dmes.mdm.entity.MdmDataCate;
import com.dongkuk.dmes.mdm.entity.MdmDataCateId;
import com.dongkuk.dmes.mdm.entity.MdmDataCateItem;
import com.dongkuk.dmes.mdm.entity.MdmDataCateItemId;
import com.dongkuk.dmes.mdm.entity.MdmDataItem;
import com.dongkuk.dmes.mdm.entity.MdmDataItemId;
import com.dongkuk.dmes.mdm.entity.MdmDataRecv;
import com.dongkuk.dmes.mdm.entity.MdmDataRecvItem;
import com.dongkuk.dmes.mdm.entity.MdmDataRecvItemId;
import com.dongkuk.dmes.mdm.entity.MdmDataSystem;
import com.dongkuk.dmes.mdm.entity.MdmDataSystemId;
import com.dongkuk.dmes.mdm.repository.MdmDataCateItemRepository;
import com.dongkuk.dmes.mdm.repository.MdmDataCateRepository;
import com.dongkuk.dmes.mdm.repository.MdmDataItemRepository;
import com.dongkuk.dmes.mdm.repository.MdmDataRepository;
import jakarta.persistence.EntityManager;
import java.time.LocalDateTime;
import java.util.Optional;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.annotation.Transactional;

/**
 * TSK-07-01 design.md §3.2 — {@code ddl-auto: none} 이라 부팅이 매핑 오류를 잡지 못하므로, 7개 엔티티
 * 각각 최소 1건 저장→조회 왕복을 수행한다. 리포지토리가 없는 {@code MdmDataSystem}·{@code MdmDataRecv}·
 * {@code MdmDataRecvItem}(F4, D-019)은 {@code EntityManager}로 직접 저장·조회한다.
 *
 * <p>F7·F8 단정(§5 불변 규칙 8) — {@code MdmSqliteTemporalContributor}(dev 머지 뒤 TSK-08-01·06-01 과 한 벌로 합친 컨트리뷰터)가 SQLite 프로파일에
 * 등록돼 있다는 전제로 {@code typeof()}로 저장 형식을 단정한다(관찰이 아니라 단정). {@code VALID_FROM}은
 * {@code MdmDataItem}의 PK 구성 요소({@code @Id})이고 {@code VALID_TO}는 아니다 — JPA 스펙상 컨버터가
 * Id 속성에는 자동 적용되지 않을 수 있어 둘 다 따로 단정한다.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.MOCK)
@ActiveProfiles("local")
@Transactional
class MdmMasterDataEntityJpaRoundtripTest extends AbstractMdmSharedDbTest {

    @Autowired
    MdmDataRepository dataRepository;
    @Autowired
    MdmDataItemRepository dataItemRepository;
    @Autowired
    MdmDataCateRepository dataCateRepository;
    @Autowired
    MdmDataCateItemRepository dataCateItemRepository;
    @Autowired
    EntityManager entityManager;

    private MdmData saveParentData(String maruDataId) {
        MdmData data = new MdmData(maruDataId, "왕복용 마스터데이터", "INUSE", "MDM", "^[0-9A-Z]{1,20}$");
        data.setLvlCnt(0);
        data.setLastChgSeq(0L);
        data.setChgSeq(0L);
        return dataRepository.save(data);
    }

    @Test
    void MdmData_는_지정_PK_로_저장_조회_왕복한다() {
        saveParentData("RT-DATA-1");
        entityManager.flush();
        entityManager.clear();

        MdmData reloaded = dataRepository.findById("RT-DATA-1").orElseThrow();
        assertEquals("왕복용 마스터데이터", reloaded.getMaruDataName());
        assertEquals("INUSE", reloaded.getStatus());
        assertEquals("MDM", reloaded.getSourceKind());
        assertNotNull(reloaded.getCreatedAt(), "CactusAuditListener 가 C_AT 을 항상 채워야 한다");
        assertEquals(0L, reloaded.getVersion(), "VER 초깃값은 0");
    }

    @Test
    void MdmDataItem_은_IdClass_복합_PK_로_저장_조회_왕복한다() {
        saveParentData("RT-DATA-2");
        entityManager.flush();

        LocalDateTime validFrom = LocalDateTime.of(2026, 9, 24, 10, 0, 0);
        MdmDataItem item = new MdmDataItem("RT-DATA-2", "ITEM-1", validFrom, "왕복항목");
        item.setValidTo(MdmTemporalSegmentRules.OPEN_END);
        item.setRowVersion(0);
        item.setChgSeq(0L);
        dataItemRepository.save(item);
        entityManager.flush();
        entityManager.clear();

        MdmDataItemId id = new MdmDataItemId("RT-DATA-2", "ITEM-1", validFrom);
        Optional<MdmDataItem> reloaded = dataItemRepository.findById(id);
        assertEquals("왕복항목", reloaded.orElseThrow().getName());
        assertEquals(MdmTemporalSegmentRules.OPEN_END, reloaded.get().getValidTo(),
                "VALID_TO 기본값은 OPEN_END(F6, §3.2-4) — 방언 텍스트 리터럴 값과 계약 상수가 같아야 한다");
    }

    /**
     * F7·F8 단정(가장 중요, §5 불변 규칙 8) — {@code VALID_FROM}(Id 필드)·{@code VALID_TO}(비 Id 필드)
     * 둘 다 SQLite 저장 typeof 가 {@code 'text'}이고 값이 naming-dialect-rules §3 #16 형식(공백 구분자,
     * 소수초 없음)과 정확히 같은지 단정한다. 변이: {@code application-local.yml}의 {@code
     * metadata_builder_contributor} 등록을 빼면 이 테스트가 빨개진다(컨버터 미등록의 직접 증거).
     */
    @Test
    void VALID_FROM_과_VALID_TO_가_SQLite_에_naming_dialect_rules_형식_TEXT_로_저장된다() {
        saveParentData("RT-DATA-3");
        entityManager.flush();

        LocalDateTime validFrom = LocalDateTime.of(2026, 9, 24, 10, 0, 0);
        MdmDataItem item = new MdmDataItem("RT-DATA-3", "ITEM-1", validFrom, "typeof 확인용");
        item.setValidTo(MdmTemporalSegmentRules.OPEN_END);
        item.setRowVersion(0);
        item.setChgSeq(0L);
        dataItemRepository.save(item);
        entityManager.flush();

        Object[] row = (Object[]) entityManager.createNativeQuery(
                        "SELECT typeof(VALID_FROM), VALID_FROM, typeof(VALID_TO), VALID_TO "
                                + "FROM TB_MDM_DATA_ITEM WHERE MARU_DATA_ID = 'RT-DATA-3' AND CODE = 'ITEM-1'")
                .getSingleResult();

        assertEquals("text", String.valueOf(row[0]), "VALID_FROM(Id 필드) typeof(): " + row[1]);
        assertEquals("2026-09-24 10:00:00", String.valueOf(row[1]), "VALID_FROM 저장 형식");
        assertEquals("text", String.valueOf(row[2]), "VALID_TO typeof(): " + row[3]);
        assertEquals("9999-12-31 00:00:00", String.valueOf(row[3]), "VALID_TO 저장 형식");
    }

    /**
     * §3.2-4(F6, §5 불변 규칙 3) — DDL {@code VALID_TO} 기본값으로 INSERT 된 행을 JPA 로 읽으면 {@code
     * MdmTemporalSegmentRules.OPEN_END}(`contract.data`)와 {@code .equals()}로 같아야 한다.
     *
     * <p>네이티브 INSERT 로 {@code VALID_TO} 를 생략해야 DB DEFAULT 가 실제로 적용된다 — 위 왕복
     * 테스트들처럼 {@code setValidTo(OPEN_END)} 를 JPA 로 명시하면 Hibernate 가 매핑 칼럼을 전부
     * 명시해서 INSERT 하므로 DB DEFAULT 를 거치지 않는다(advisor 재검토로 발견, Build 이탈). 같은
     * 트랜잭션 안에서 {@code em.clear()} 뒤 {@code findById()} 로 읽어야 컨버터의 읽기 경로(DDL 기본값
     * 텍스트 리터럴 파싱)까지 실제로 거친다.
     */
    @Test
    void VALID_TO_DDL_기본값으로_INSERT_된_행을_JPA_로_읽으면_OPEN_END_와_같다() {
        saveParentData("RT-DATA-3B");
        entityManager.flush();

        entityManager.createNativeQuery(
                        "INSERT INTO TB_MDM_DATA_ITEM (MARU_DATA_ID, CODE, VALID_FROM, NAME) "
                                + "VALUES ('RT-DATA-3B', 'ITEM-1', '2026-09-24 10:00:00', 'DDL기본값확인')")
                .executeUpdate();
        entityManager.clear();

        MdmDataItem reloaded = dataItemRepository.findById(
                new MdmDataItemId("RT-DATA-3B", "ITEM-1", LocalDateTime.of(2026, 9, 24, 10, 0, 0))).orElseThrow();
        assertEquals(MdmTemporalSegmentRules.OPEN_END, reloaded.getValidTo(),
                "DDL DEFAULT 로 채워진 VALID_TO 를 JPA 로 읽은 값이 OPEN_END 와 같아야 한다(컨버터 읽기 경로 포함)");
    }

    @Test
    void MdmDataCate_는_IdClass_복합_PK_로_저장_조회_왕복한다() {
        saveParentData("RT-DATA-4");
        entityManager.flush();

        LocalDateTime validFrom = LocalDateTime.of(2026, 9, 24, 10, 0, 0);
        MdmDataCate cate = new MdmDataCate("RT-DATA-4", "CATE-1", validFrom, "TABLE");
        cate.setValidTo(MdmTemporalSegmentRules.OPEN_END);
        cate.setChgSeq(0L);
        dataCateRepository.save(cate);
        entityManager.flush();
        entityManager.clear();

        MdmDataCateId id = new MdmDataCateId("RT-DATA-4", "CATE-1", validFrom);
        MdmDataCate reloaded = dataCateRepository.findById(id).orElseThrow();
        assertEquals("TABLE", reloaded.getDefKind());
        assertEquals(MdmTemporalSegmentRules.OPEN_END, reloaded.getValidTo());
    }

    @Test
    void MdmDataCateItem_은_IdClass_복합_PK_로_저장_조회_왕복하고_CATE_ID_CODE_에_FK_가_없다() {
        saveParentData("RT-DATA-5");
        entityManager.flush();

        LocalDateTime validFrom = LocalDateTime.of(2026, 9, 24, 10, 0, 0);
        // F13 직접 증거 — CATE_ID·CODE 가 TB_MDM_DATA_CATE·TB_MDM_DATA_ITEM 어디에도 없는 값이어도 저장돼야 한다.
        MdmDataCateItem cateItem = new MdmDataCateItem("RT-DATA-5", "NOPE-CATE", "NOPE-CODE", validFrom);
        cateItem.setValidTo(MdmTemporalSegmentRules.OPEN_END);
        cateItem.setChgSeq(0L);
        dataCateItemRepository.save(cateItem);
        entityManager.flush();
        entityManager.clear();

        MdmDataCateItemId id = new MdmDataCateItemId("RT-DATA-5", "NOPE-CATE", "NOPE-CODE", validFrom);
        MdmDataCateItem reloaded = dataCateItemRepository.findById(id).orElseThrow();
        assertEquals(MdmTemporalSegmentRules.OPEN_END, reloaded.getValidTo());
    }

    /**
     * F4·D2 — 리포지토리가 없는 보류 테이블은 {@code EntityManager}로 직접 저장·조회한다(D-019 원칙,
     * 배포·수신 로직은 이 Task 밖).
     */
    @Test
    void MdmDataSystem_은_EntityManager_로_직접_저장_조회_왕복한다() {
        saveParentData("RT-DATA-6");
        entityManager.persist(new com.dongkuk.dmes.mdm.entity.MdmDataSystem("RT-DATA-6", "MDM"));
        entityManager.flush();
        entityManager.clear();

        MdmDataSystem reloaded = entityManager.find(MdmDataSystem.class, new MdmDataSystemId("RT-DATA-6", "MDM"));
        assertNotNull(reloaded);
        assertEquals("RT-DATA-6", reloaded.getMaruDataId());
    }

    @Test
    void MdmDataRecv_는_IDENTITY_채번_으로_EntityManager_로_직접_저장_조회_왕복한다() {
        LocalDateTime receivedAt = LocalDateTime.of(2026, 9, 24, 10, 0, 0);
        MdmDataRecv recv = new MdmDataRecv("MDM", receivedAt, "{\"raw\":true}");
        entityManager.persist(recv);
        entityManager.flush();
        entityManager.clear();

        assertNotNull(recv.getRecvId(), "RECV_ID 는 IDENTITY 채번(ID_AI)");
        MdmDataRecv reloaded = entityManager.find(MdmDataRecv.class, recv.getRecvId());
        assertEquals("MDM", reloaded.getSourceSystem());
        assertEquals(receivedAt, reloaded.getReceivedAt());
    }

    @Test
    void MdmDataRecvItem_은_IdClass_복합_PK_로_EntityManager_로_직접_저장_조회_왕복한다() {
        LocalDateTime receivedAt = LocalDateTime.of(2026, 9, 24, 10, 0, 0);
        MdmDataRecv recv = new MdmDataRecv("MDM", receivedAt, "{\"raw\":true}");
        entityManager.persist(recv);
        entityManager.flush();

        MdmDataRecvItem item = new MdmDataRecvItem(recv.getRecvId(), 1);
        item.setCode("ITEM-1");
        item.setAction("INSERT");
        entityManager.persist(item);
        entityManager.flush();
        entityManager.clear();

        MdmDataRecvItem reloaded = entityManager.find(MdmDataRecvItem.class,
                new MdmDataRecvItemId(recv.getRecvId(), 1));
        assertEquals("ITEM-1", reloaded.getCode());
        assertEquals("INSERT", reloaded.getAction());
    }

    /**
     * F9 실측(§3.3, TSK-05-01 {@code layoutVersion} 절차와 같은 모양) — {@code ROW_VERSION}은 더티
     * 업데이트가 있어도 자동 증가하지 않고({@code @Version} 이 아니다), 감사 {@code VER}은 UPDATE 마다
     * 증가한다(둘이 독립임을 증명). 변이: {@code rowVersion}을 {@code @Version}으로 바꾸면 이 절차의
     * 두 번째 save 이후 {@code rowVersion}이 예상과 다르게(1로) 바뀌어 이 테스트가 빨개진다.
     */
    @Test
    void ROW_VERSION_은_Version_이_아니라_더티_업데이트에도_자동_증가하지_않는다() {
        saveParentData("RT-DATA-7");
        entityManager.flush();

        LocalDateTime validFrom = LocalDateTime.of(2026, 9, 24, 10, 0, 0);
        MdmDataItem item = new MdmDataItem("RT-DATA-7", "ITEM-1", validFrom, "최초이름");
        item.setValidTo(MdmTemporalSegmentRules.OPEN_END);
        item.setRowVersion(0);
        item.setChgSeq(0L);
        dataItemRepository.save(item);
        entityManager.flush();
        entityManager.clear();

        MdmDataItemId id = new MdmDataItemId("RT-DATA-7", "ITEM-1", validFrom);
        MdmDataItem reloaded = dataItemRepository.findById(id).orElseThrow();
        long verAfterInsert = reloaded.getVersion();
        reloaded.setName("바뀐이름"); // 감사 대상 아닌 업무 필드 변경 → UPDATE 유발
        entityManager.flush();
        entityManager.clear();

        MdmDataItem reloadedAgain = dataItemRepository.findById(id).orElseThrow();
        assertEquals(0, reloadedAgain.getRowVersion(), "ROW_VERSION 은 앱이 명시적으로 올리기 전까지 그대로다(@Version 아님, F9)");
        assertEquals(verAfterInsert + 1, reloadedAgain.getVersion(), "감사 VER 은 UPDATE 마다 증가한다(CactusAuditListener) — ROW_VERSION 과 독립");
    }
}
