CREATE TABLE Employee
(
    id        integer      NOT NULL,
    firstName varchar(255) not null,
    lastName  varchar(255) not null,
    primary key (id)
);
insert into Employee(id, firstName, lastName) values(0, 'jj','kim');
insert into Employee(id, firstName, lastName) values(1, 'yy','yun');
insert into Employee(id, firstName, lastName) values(2, 'aa','park');