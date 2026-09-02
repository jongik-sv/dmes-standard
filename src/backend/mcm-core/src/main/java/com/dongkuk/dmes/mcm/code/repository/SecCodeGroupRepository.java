package com.dongkuk.dmes.mcm.code.repository;

import com.dongkuk.dmes.mcm.code.entity.SecCodeGroup;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;

public interface SecCodeGroupRepository extends JpaRepository<SecCodeGroup, String> {
    List<SecCodeGroup> findByUseYn(String useYn);
    List<SecCodeGroup> findByGroupNmContaining(String groupNm);
}
