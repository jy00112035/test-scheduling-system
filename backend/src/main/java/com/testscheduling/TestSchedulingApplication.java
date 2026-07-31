package com.testscheduling;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableAsync;

@SpringBootApplication
@EnableAsync
public class TestSchedulingApplication {

    public static void main(String[] args) {
        SpringApplication.run(TestSchedulingApplication.class, args);
    }
}
