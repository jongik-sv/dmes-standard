package com.dongkuk.dmes.mcm.code.service;

import com.dongkuk.dmes.mcm.code.dto.SecCodeGroupSearchRequest;
import com.dongkuk.dmes.mcm.code.entity.SecCodeGroup;
import com.dongkuk.dmes.mcm.code.repository.SecCodeCategoryRepository;
import com.dongkuk.dmes.mcm.code.repository.SecCodeGroupRepository;
import com.dongkuk.dmes.mcm.code.repository.SecCodeItemRepository;
import com.dongkuk.dmes.mcm.common.exception.BusinessException;
import com.dongkuk.dmes.mcm.common.exception.ErrorCode;
import com.dongkuk.dmes.mcm.common.exception.ErrorDetail;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

@Service("secCodeGroupService")
public class SecCodeGroupService {

    private final SecCodeGroupRepository secCodeGroupRepository;
    private final SecCodeItemRepository secCodeItemRepository;
    @Autowired(required = false)
    private SecCodeCategoryRepository secCodeCategoryRepository;

    public SecCodeGroupService(SecCodeGroupRepository secCodeGroupRepository,
                               SecCodeItemRepository secCodeItemRepository) {
        this.secCodeGroupRepository = secCodeGroupRepository;
        this.secCodeItemRepository = secCodeItemRepository;
    }

    public List<SecCodeGroup> searchGroups(SecCodeGroupSearchRequest request) {
        if (request.getGroupNm() != null && !request.getGroupNm().isBlank()) {
            return secCodeGroupRepository.findByGroupNmContaining(request.getGroupNm());
        } else if (request.getUseYn() != null && !request.getUseYn().isBlank()) {
            return secCodeGroupRepository.findByUseYn(request.getUseYn());
        } else {
            return secCodeGroupRepository.findAll();
        }
    }

    @SuppressWarnings("unchecked")
    public int saveGroups(List<Map<String, Object>> master) {
        if (master == null) return 0;

        List<ErrorDetail> errors = new ArrayList<>();
        int count = 0;

        for (int i = 0; i < master.size(); i++) {
            Map<String, Object> row = master.get(i);
            String rowKey = (String) row.get("rowKey");
            String rowStatus = (String) row.get("rowStatus");
            String groupCd = (String) row.get("groupCd");

            if ("C".equals(rowStatus) || "U".equals(rowStatus)) {
                if (groupCd == null || groupCd.isBlank()) {
                    errors.add(ErrorDetail.ofGrid("master", rowKey, i, "groupCd", "E001", "그룹코드는 필수입니다."));
                    continue;
                }
                SecCodeGroup entity = secCodeGroupRepository.findById(groupCd).orElse(new SecCodeGroup());
                entity.setGroupCd(groupCd);
                entity.setGroupNm((String) row.get("groupNm"));
                entity.setGroupDesc((String) row.get("groupDesc"));
                entity.setUseYn((String) row.get("useYn"));
                secCodeGroupRepository.save(entity);
                count++;
            } else if ("D".equals(rowStatus)) {
                if (groupCd == null) continue;
                // 상세 정보(item) 가 존재하면 삭제 차단 — 사용자가 먼저 비워야 함
                int itemCount = secCodeItemRepository.findByGroupCdOrderBySortOrdAsc(groupCd).size();
                if (itemCount > 0) {
                    errors.add(ErrorDetail.ofGrid("master", rowKey, i, "groupCd", "E002",
                            String.format("그룹 [%s] 에 등록된 상세 정보가 %d건 있어 삭제할 수 없습니다. 상세 정보를 먼저 삭제하세요.",
                                    groupCd, itemCount)));
                    continue;
                }
                // 카테고리는 메타데이터 — 그룹 삭제 시 자동 정리 (사용자 데이터 손실 없음)
                if (secCodeCategoryRepository != null) {
                    secCodeCategoryRepository.deleteByGroupCd(groupCd);
                }
                secCodeGroupRepository.deleteById(groupCd);
                count++;
            }
        }

        if (!errors.isEmpty()) {
            throw new BusinessException(ErrorCode.REQUIRED_VALUE, "입력값을 확인해주세요.", errors);
        }
        return count;
    }
}
