package com.dongkuk.dmes.mqc.qpr.tagManagement.repository;

import com.dongkuk.dmes.mqc.qpr.tagManagement.domain.CoilTag;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface CoilTagRepository extends JpaRepository<CoilTag, String> {

    List<CoilTag> findAllByOrderByTagNoDesc();

    List<CoilTag> findByCoilNoOrderByIssueAtDesc(String coilNo);
}
