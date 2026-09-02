package com.dongkuk.oasis.transaction;

import jakarta.persistence.Entity;
import jakarta.persistence.Id;

/**
 * @author Jeongjin Kim
 * @since 2021-05-26
 */
@Entity
public class EmployeeWithAge {
    @Id
    private Integer id;
    private String firstName;
    private String lastName;
    private Integer age;

    public EmployeeWithAge(Integer id, String firstName, String lastName) {
        this.id = id;
        this.firstName = firstName;
        this.lastName = lastName;
    }

    public EmployeeWithAge(Integer id, Integer age) {
        this.id = id;
        this.age = age;
    }

    public EmployeeWithAge() {
    }

    public Integer getAge() {
        return age;
    }

    public void setAge(Integer age) {
        this.age = age;
    }

    public Integer getId() {
        return id;
    }

    public void setId(Integer id) {
        this.id = id;
    }

    public String getFirstName() {
        return firstName;
    }

    public void setFirstName(String firstName) {
        this.firstName = firstName;
    }

    public String getLastName() {
        return lastName;
    }

    public void setLastName(String lastName) {
        this.lastName = lastName;
    }
}
