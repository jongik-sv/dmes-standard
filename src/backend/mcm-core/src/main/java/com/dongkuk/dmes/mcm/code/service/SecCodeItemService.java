package com.dongkuk.dmes.mcm.code.service;

import com.dongkuk.dmes.mcm.code.dto.SecCodeItemSearchRequest;
import com.dongkuk.dmes.mcm.code.entity.SecCodeItem;
import com.dongkuk.dmes.mcm.code.entity.SecCodeItemId;
import com.dongkuk.dmes.mcm.code.repository.SecCodeItemRepository;
import com.dongkuk.dmes.mcm.common.exception.BusinessException;
import com.dongkuk.dmes.mcm.common.exception.ErrorCode;
import com.dongkuk.dmes.mcm.common.exception.ErrorDetail;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Service("secCodeItemService")
public class SecCodeItemService {

    private final SecCodeItemRepository secCodeItemRepository;

    public SecCodeItemService(SecCodeItemRepository secCodeItemRepository) {
        this.secCodeItemRepository = secCodeItemRepository;
    }

    public List<Map<String, Object>> searchItems(SecCodeItemSearchRequest request) {
        if (request.getGroupCd() == null || request.getGroupCd().isBlank()) {
            return List.of();
        }
        List<SecCodeItem> items = "Y".equals(request.getUseYn())
                ? secCodeItemRepository.findActiveByGroupCd(request.getGroupCd())
                : secCodeItemRepository.findByGroupCdOrderBySortOrdAsc(request.getGroupCd());

        List<Map<String, Object>> result = new ArrayList<>(items.size());
        for (SecCodeItem item : items) {
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("groupCd",  item.getId().getGroupCd());
            row.put("itemCd",   item.getId().getItemCd());
            row.put("itemNm",   item.getItemNm());
            row.put("itemDesc", item.getItemDesc());
            row.put("sortOrd",  item.getSortOrd());
            row.put("extraVal1", item.getExtraVal1());
            row.put("extraVal2", item.getExtraVal2());
            row.put("useYn",    item.getUseYn());
            result.add(row);
        }
        return result;
    }

    /** LoV 용 — group_cd 의 활성 항목만 (itemCd, itemNm) 짝으로 반환. */
    public List<Map<String, Object>> getCodesByGroup(SecCodeItemSearchRequest request) {
        if (request.getGroupCd() == null || request.getGroupCd().isBlank()) {
            return List.of();
        }
        List<SecCodeItem> items = secCodeItemRepository.findActiveByGroupCd(request.getGroupCd());
        List<Map<String, Object>> result = new ArrayList<>(items.size());
        for (SecCodeItem item : items) {
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("code",  item.getId().getItemCd());
            row.put("name",  item.getItemNm());
            row.put("desc",  item.getItemDesc());
            row.put("extra1", item.getExtraVal1());
            row.put("extra2", item.getExtraVal2());
            result.add(row);
        }
        return result;
    }

    @SuppressWarnings("unchecked")
    public int saveItems(List<Map<String, Object>> master) {
        if (master == null) return 0;

        List<ErrorDetail> errors = new ArrayList<>();
        int count = 0;

        for (int i = 0; i < master.size(); i++) {
            Map<String, Object> row = master.get(i);
            String rowKey = (String) row.get("rowKey");
            String rowStatus = (String) row.get("rowStatus");
            String groupCd = (String) row.get("groupCd");
            String itemCd = (String) row.get("itemCd");

            if (groupCd == null || groupCd.isBlank()) {
                errors.add(ErrorDetail.ofGrid("master", rowKey, i, "groupCd", "E001", "그룹코드는 필수입니다."));
                continue;
            }
            if (itemCd == null || itemCd.isBlank()) {
                errors.add(ErrorDetail.ofGrid("master", rowKey, i, "itemCd", "E001", "항목코드는 필수입니다."));
                continue;
            }
            SecCodeItemId id = new SecCodeItemId(groupCd, itemCd);

            if ("C".equals(rowStatus) || "U".equals(rowStatus)) {
                SecCodeItem entity = secCodeItemRepository.findById(id).orElse(new SecCodeItem());
                entity.setId(id);
                entity.setItemNm((String) row.get("itemNm"));
                entity.setItemDesc((String) row.get("itemDesc"));
                entity.setSortOrd(row.get("sortOrd") instanceof Number n ? n.intValue() : 0);
                entity.setExtraVal1((String) row.get("extraVal1"));
                entity.setExtraVal2((String) row.get("extraVal2"));
                entity.setUseYn((String) row.get("useYn"));
                secCodeItemRepository.save(entity);
                count++;
            } else if ("D".equals(rowStatus)) {
                secCodeItemRepository.deleteById(id);
                count++;
            }
        }

        if (!errors.isEmpty()) {
            throw new BusinessException(ErrorCode.REQUIRED_VALUE, "입력값을 확인해주세요.", errors);
        }
        return count;
    }
}
