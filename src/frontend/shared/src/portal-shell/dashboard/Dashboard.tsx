"use client";

import { Container } from "@mantine/core";
import "./Dashboard.css";

export function Dashboard() {
  return (
    <Container
      fluid
      p={0}
      className="dashboard-content"
      style={{
        backgroundImage: "url(/images/bg_main_gray.png)",
        backgroundSize: "cover",
        backgroundPosition: "top center",
        backgroundRepeat: "no-repeat",
      }}
    />
  );
}
