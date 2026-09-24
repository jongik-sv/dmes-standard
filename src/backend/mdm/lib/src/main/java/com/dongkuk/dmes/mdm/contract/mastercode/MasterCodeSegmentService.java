package com.dongkuk.dmes.mdm.contract.mastercode;

import com.dongkuk.dmes.mdm.contract.category.CategoryDefinition;
import com.dongkuk.dmes.mdm.contract.version.VersionRef;
import java.math.BigDecimal;
import java.util.List;
import java.util.Set;

/**
 * 선분 조작 서비스 — 원천 04 「구조」 행 조작·행 되돌리기(04:40-65), 「코드 삭제」 연쇄(04:489-500), 「이전 버전으로 복원」
 * (04:307-322). 구현은 TSK-06-02(createBaseCategory·fillFrom)·06-03(코드 행·revert·viewAt)·06-04(카테고리·소속)가 한다.
 *
 * <p>모든 조작은 DRAFT V 에서만 한다(아니면 {@code MdmErrorCode.NOT_DRAFT}). 호출자는 같은 트랜잭션에서 먼저
 * {@code VersionWriteGuard.beginDraftWrite} 를 부른다 — 이 서비스는 ROW_VERSION 을 받지도 올리지도 않는다(이중 증가 방지,
 * D8). DRAFT 삭제 때의 선분 복구는 {@code VersionDraftDeletionSpi}(MASTER_CODE)가 맡으며 여기서 다시 선언하지 않는다.
 * 새 행의 to_ver 는 항상 {@link MasterCodeConventions#OPEN_TO_VER} 다(04:64). 한 버전 안에 같은 키의 행은 하나(04:47),
 * 닫기는 이전 버전의 행에만 한다(04:61). V 에서 만든 행을 지우면 닫지 않고 지운다(04:59).
 */
public interface MasterCodeSegmentService {

    /** 버전 V 의 모습(04:33). */
    MasterCodeVersionView viewAt(VersionRef version);

    /**
     * 1.000 DRAFT 를 만들 때 BASE(REGEX, {@code CategoryConventions.BASE_DEF_EXPR},
     * {@code CategoryOwner.MASTER_CODE.baseDefTarget()})를 from_ver = V 로 만든다(04:95).
     */
    void createBaseCategory(VersionRef firstDraft);

    void addItem(VersionRef draft, String code, MasterCodeItemValues values);

    void changeItem(VersionRef draft, String code, MasterCodeItemValues values);

    /** 코드 삭제. 그 코드의 열린 TABLE CATE_ITEM 행도 같은 V 로 닫는다(04:489-496). 함께 닫은 cate_id 목록을 돌려준다. */
    List<String> removeItem(VersionRef draft, String code);

    /** BASE 는 {@code MdmErrorCode.RESERVED_CATEGORY}. */
    void addCategory(VersionRef draft, CategoryDefinition definition);

    /** BASE 는 {@code MdmErrorCode.RESERVED_CATEGORY}. */
    void changeCategory(VersionRef draft, CategoryDefinition definition);

    /** TABLE 이면 그 CATE_ITEM 행을 모두 같은 V 로 닫는다(04:504). BASE 는 {@code MdmErrorCode.RESERVED_CATEGORY}. */
    void closeCategory(VersionRef draft, String cateId);

    void addCategoryMembers(VersionRef draft, String cateId, Set<String> codes);

    void removeCategoryMembers(VersionRef draft, String cateId, Set<String> codes);

    /** V 의 변경 하나를 취소한다(04:50-57). ITEM 삭제를 되돌리면 함께 닫은 CATE_ITEM 도 9999 로 연다(04:498-500). */
    void revert(VersionRef draft, MasterCodeSegmentKey key);

    /** 복원 — sourceVer 와 V 직전 모습을 키마다 비교해 차이만 만든다(04:307-322). restored_from 기록은 호출자(06-02) 몫. */
    void fillFrom(VersionRef draft, BigDecimal sourceVer);
}
