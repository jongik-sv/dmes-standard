package com.dongkuk.dmes.mcm.domain.code.controller;

import com.dongkuk.dmes.cactus.common.ApiResponse;
import com.dongkuk.dmes.cactus.web.inbound.MasterCodeChangedEvent;
import com.dongkuk.dmes.mcm.code.dto.SecCodeCategorySearchRequest;
import com.dongkuk.dmes.mcm.code.dto.SecCodeGroupSearchRequest;
import com.dongkuk.dmes.mcm.code.dto.SecCodeItemSearchRequest;
import com.dongkuk.dmes.mcm.code.entity.SecCodeGroup;
import com.dongkuk.dmes.mcm.code.service.SecCodeCategoryService;
import com.dongkuk.dmes.mcm.code.service.SecCodeGroupService;
import com.dongkuk.dmes.mcm.code.service.SecCodeItemService;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;

/**
 * 마스터 코드 관리 REST 컨트롤러.
 *
 * <p>책임:
 * <ul>
 *   <li><b>관리 (CRUD)</b>: m-mcm 화면에서 그룹/항목 등록·수정·삭제 - 본 컨트롤러 담당</li>
 *   <li><b>LoV 조회</b>: 다른 모듈(mpn/mqc/mpp) 또는 mcm 자신의 화면에서 콤보 채우기 -
 *       cactus-core 의 {@code LovController} 가 <code>/lov/master/{code}/{group}</code> 으로 담당</li>
 * </ul>
 *
 * <p>본 컨트롤러는 mcm-core 의 기존 {@link SecCodeGroupService} / {@link SecCodeItemService} 를
 * 그대로 활용한다 (grid 일괄 저장 패턴 - {@code rowStatus} = C/U/D).
 *
 * <p>BFF 경로: {@code POST /api/mcm/master-codes/...} → 본 컨트롤러 {@code /api/master-codes/...}
 */
@RestController
@RequestMapping("/api/mcm/master-codes")
public class MasterCodeController {

    private final SecCodeGroupService groupService;
    private final SecCodeItemService itemService;
    private final SecCodeCategoryService categoryService;
    private final ApplicationEventPublisher events;

    public MasterCodeController(SecCodeGroupService groupService,
                                SecCodeItemService itemService,
                                SecCodeCategoryService categoryService,
                                ApplicationEventPublisher events) {
        this.groupService = groupService;
        this.itemService = itemService;
        this.categoryService = categoryService;
        this.events = events;
    }

    // ────────────────────────── 그룹 (TB_SEC_CODE_GROUP) ──────────────────────────

    /**
     * 그룹 검색.
     *
     * <p>예: {@code GET /api/master-codes/groups?groupNm=공장} -
     * groupNm 부분일치, 또는 useYn 필터. 둘 다 비면 전체.
     */
    @GetMapping("/groups")
    public ApiResponse<List<SecCodeGroup>> searchGroups(@ModelAttribute SecCodeGroupSearchRequest request) {
        List<SecCodeGroup> rows = groupService.searchGroups(request);
        return ApiResponse.ok(rows, String.format("%d rows selected.", rows.size()));
    }

    /**
     * 그룹 일괄 저장 (등록/수정/삭제).
     *
     * <p>Body 예:
     * <pre>
     * {
     *   "master": [
     *     {"rowKey":"r1", "rowStatus":"C", "groupCd":"PLANT_LIST", "groupNm":"공장 목록", "useYn":"Y"},
     *     {"rowKey":"r2", "rowStatus":"U", "groupCd":"INSP_CLASS", "groupNm":"검사분류 (수정)"},
     *     {"rowKey":"r3", "rowStatus":"D", "groupCd":"OBSOLETE_GROUP"}
     *   ]
     * }
     * </pre>
     */
    @PostMapping("/groups")
    public ApiResponse<Map<String, Object>> saveGroups(@RequestBody Map<String, Object> body) {
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> master = (List<Map<String, Object>>) body.get("master");
        int count = groupService.saveGroups(master);
        if (count > 0) {
            events.publishEvent(MasterCodeChangedEvent.all());
        }
        return ApiResponse.ok(Map.of("affected", count), String.format("%d rows affected.", count));
    }

    // ────────────────────────── 항목 (TB_SEC_CODE_ITEM) ──────────────────────────

    /**
     * 항목 검색.
     *
     * <p>예: {@code GET /api/master-codes/items?groupCd=PLANT_LIST&useYn=Y} -
     * 그룹 내 활성 항목만. {@code groupCd} 필수.
     */
    @GetMapping("/items")
    public ApiResponse<List<Map<String, Object>>> searchItems(@ModelAttribute SecCodeItemSearchRequest request) {
        List<Map<String, Object>> rows = itemService.searchItems(request);
        return ApiResponse.ok(rows, String.format("%d rows selected.", rows.size()));
    }

    /**
     * 항목 일괄 저장 (등록/수정/삭제).
     *
     * <p>Body 예:
     * <pre>
     * {
     *   "master": [
     *     {"rowKey":"r1", "rowStatus":"C", "groupCd":"PLANT_LIST", "itemCd":"PLANT1",
     *      "itemNm":"부산공장", "sortOrd":10, "useYn":"Y", "extraVal1":"BUSAN"},
     *     {"rowKey":"r2", "rowStatus":"D", "groupCd":"PLANT_LIST", "itemCd":"DELETED"}
     *   ]
     * }
     * </pre>
     */
    @PostMapping("/items")
    public ApiResponse<Map<String, Object>> saveItems(@RequestBody Map<String, Object> body) {
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> master = (List<Map<String, Object>>) body.get("master");
        int count = itemService.saveItems(master);
        if (count > 0) {
            events.publishEvent(MasterCodeChangedEvent.all());
        }
        return ApiResponse.ok(Map.of("affected", count), String.format("%d rows affected.", count));
    }

    // ────────────────────────── 편의: 그룹별 항목 조회 (관리 화면용) ──────────────────────────

    /**
     * 특정 그룹의 모든 항목 (관리 화면용 그리드 데이터).
     *
     * <p>LoV 형식이 아닌 grid 형식 (extraVal1, extraVal2, useYn 포함). LoV 조회는
     * <code>/api/{module}/lov/master/{groupCd}</code> 를 사용 - cactus LovController.
     */
    @GetMapping("/groups/{groupCd}/items")
    public ApiResponse<List<Map<String, Object>>> itemsByGroup(@PathVariable("groupCd") String groupCd,
                                                                @RequestParam(value = "useYn", required = false) String useYn) {
        SecCodeItemSearchRequest req = new SecCodeItemSearchRequest();
        req.setGroupCd(groupCd);
        req.setUseYn(useYn);
        List<Map<String, Object>> rows = itemService.searchItems(req);
        return ApiResponse.ok(rows, String.format("%d rows selected.", rows.size()));
    }

    // ────────────────────────── 카테고리 (TB_SEC_CODE_CATEGORY) ──────────────────────────

    /**
     * 그룹별 카테고리 목록 — master-codes 화면의 항목 입력 시 카테고리 LoV 용.
     */
    @GetMapping("/groups/{groupCd}/categories")
    public ApiResponse<List<Map<String, Object>>> categoriesByGroup(@PathVariable("groupCd") String groupCd) {
        List<Map<String, Object>> rows = categoryService.searchByGroup(groupCd);
        return ApiResponse.ok(rows, String.format("%d rows selected.", rows.size()));
    }

    /**
     * 카테고리 전체/필터 검색 — code-category 관리 화면용.
     */
    @GetMapping("/categories")
    public ApiResponse<List<Map<String, Object>>> searchCategories(@ModelAttribute SecCodeCategorySearchRequest request) {
        List<Map<String, Object>> rows = categoryService.search(request);
        return ApiResponse.ok(rows, String.format("%d rows selected.", rows.size()));
    }

    /**
     * 카테고리 일괄 저장 (C/U/D).
     */
    @PostMapping("/categories")
    public ApiResponse<Map<String, Object>> saveCategories(@RequestBody Map<String, Object> body) {
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> master = (List<Map<String, Object>>) body.get("master");
        int count = categoryService.saveCategories(master);
        if (count > 0) {
            events.publishEvent(MasterCodeChangedEvent.all());
        }
        return ApiResponse.ok(Map.of("affected", count), String.format("%d rows affected.", count));
    }
}
