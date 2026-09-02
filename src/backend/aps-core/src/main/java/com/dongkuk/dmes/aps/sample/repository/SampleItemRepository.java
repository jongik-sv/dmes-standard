package com.dongkuk.dmes.aps.sample.repository;

import com.dongkuk.dmes.aps.sample.domain.SampleItem;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface SampleItemRepository extends JpaRepository<SampleItem, Long> {

    Optional<SampleItem> findByCode(String code);
}
