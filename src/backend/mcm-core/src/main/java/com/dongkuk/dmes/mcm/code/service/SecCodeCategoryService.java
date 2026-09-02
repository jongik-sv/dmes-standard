package com.dongkuk.dmes.mcm.code.service;

import com.dongkuk.dmes.mcm.code.dto.SecCodeCategorySearchRequest;
import com.dongkuk.dmes.mcm.code.entity.SecCodeCategory;
import com.dongkuk.dmes.mcm.code.entity.SecCodeCategoryId;
import com.dongkuk.dmes.mcm.code.entity.SecCodeGroup;
import com.dongkuk.dmes.mcm.code.repository.SecCodeCategoryRepository;
import com.dongkuk.dmes.mcm.code.repository.SecCodeGroupRepository;
import com.dongkuk.dmes.mcm.common.exception.BusinessException;
import com.dongkuk.dmes.mcm.common.exception.ErrorCode;
import com.dongkuk.dmes.mcm.common.exception.ErrorDetail;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 마스터 코드 카테고리 (TB_SEC_CODE_CATEGORY) CRUD 서비스.
 *
 * <p>{@link SecCodeGroup} 의 하위 카테고리 메타데이터. 항목(item) 의 EXTRA_VAL1 에 categoryCd 가
 * 들어가 카테고리를 가리킨다.
 */
@Service("secCodeCategoryService")
public class SecCodeCategoryService {

    private final SecCodeCategoryRepository categoryRepository;
    private final SecCodeGroupRepository groupRepository;

    public SecCodeCategoryService(SecCodeCategoryRepository categoryRepository,
                                   SecCodeGroupRepository groupRepository) {
        this.categoryRepository = categoryRepository;
        this.groupRepository = groupRepository;
    }

    /** 그룹별 카테고리 조회 (단일 그룹). */
    public List<Map<String, Object>> searchByGroup(String groupCd) {
        if (groupCd == null || groupCd.isBlank()) return List.of();
        List<SecCodeCategory> cats = categoryRepository.findByGroupCd(groupCd);
        return cats.stream().map(this::toRow).toList();
    }

    /** 전체/필터 검색 (그룹 join). */
    public List<Map<String, Object>> search(SecCodeCategorySearchRequest req) {
        String groupCdF = nz(req.getGroupCd()).toUpperCase();
        String catCdF = nz(req.getCategoryCd()).toUpperCase();
        String catNmF = nz(req.getCategoryNm()).toUpperCase();

        List<SecCodeCategory> cats = !groupCdF.isEmpty()
                ? categoryRepository.findByGroupCd(req.getGroupCd())
                : categoryRepository.findAllOrdered();

        Map<String, String> groupNms = new HashMap<>();
        for (SecCodeGroup g : groupRepository.findAll()) {
            if (g.getGroupCd() != null) groupNms.put(g.getGroupCd(), nz(g.getGroupNm()));
        }

        List<Map<String, Object>> out = new ArrayList<>();
        for (SecCodeCategory c : cats) {
            String gc = c.getId().getGroupCd();
            String cc = c.getId().getCategoryCd();
            if (!catCdF.isEmpty() && !nz(cc).toUpperCase().contains(catCdF)) continue;
            if (!catNmF.isEmpty() && !nz(c.getCategoryNm()).toUpperCase().contains(catNmF)) continue;

            Map<String, Object> row = toRow(c);
            row.put("groupNm", groupNms.getOrDefault(gc, ""));
            out.add(row);
        }
        return out;
    }

    private Map<String, Object> toRow(SecCodeCategory c) {
        Map<String, Object> row = new LinkedHashMap<>();
        row.put("groupCd", c.getId().getGroupCd());
        row.put("categoryCd", c.getId().getCategoryCd());
        row.put("categoryNm", c.getCategoryNm());
        row.put("sortOrd", c.getSortOrd());
        row.put("useYn", c.getUseYn());
        return row;
    }

    @SuppressWarnings("unchecked")
    public int saveCategories(List<Map<String, Object>> master) {
        if (master == null) return 0;

        List<ErrorDetail> errors = new ArrayList<>();
        int count = 0;

        for (int i = 0; i < master.size(); i++) {
            Map<String, Object> row = master.get(i);
            String rowKey = (String) row.get("rowKey");
            String rowStatus = (String) row.get("rowStatus");
            String groupCd = (String) row.get("groupCd");
            String categoryCd = (String) row.get("categoryCd");

            if (groupCd == null || groupCd.isBlank()) {
                errors.add(ErrorDetail.ofGrid("master", rowKey, i, "groupCd", "E001", "마스터 코드는 필수입니다."));
                continue;
            }
            if (categoryCd == null || categoryCd.isBlank()) {
                errors.add(ErrorDetail.ofGrid("master", rowKey, i, "categoryCd", "E001", "카테고리 코드는 필수입니다."));
                continue;
            }
            SecCodeCategoryId id = new SecCodeCategoryId(groupCd, categoryCd);

            if ("C".equals(rowStatus) || "U".equals(rowStatus)) {
                SecCodeCategory entity = categoryRepository.findById(id).orElse(new SecCodeCategory());
                entity.setId(id);
                entity.setCategoryNm((String) row.get("categoryNm"));
                entity.setSortOrd(toInt(row.get("sortOrd")));
                entity.setUseYn((String) row.get("useYn"));
                categoryRepository.save(entity);
                count++;
            } else if ("D".equals(rowStatus)) {
                categoryRepository.deleteById(id);
                count++;
            }
        }

        if (!errors.isEmpty()) {
            throw new BusinessException(ErrorCode.REQUIRED_VALUE, "입력값을 확인해주세요.", errors);
        }
        return count;
    }

    private static String nz(String s) { return s == null ? "" : s.trim(); }

    private Integer toInt(Object raw) {
        if (raw == null) return null;
        if (raw instanceof Number n) return n.intValue();
        String s = raw.toString().trim();
        if (s.isEmpty()) return null;
        try { return Integer.parseInt(s); } catch (NumberFormatException e) { return null; }
    }
}
