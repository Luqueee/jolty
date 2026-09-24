import type { ResearchSplit } from "./cases/research-cases.ts";

export const splitByOrigin = new Map<string, ResearchSplit>([
  ["https://testpages.eviltester.com", "train"],
  ["https://qa-automation-practice.netlify.app", "train"],
  ["https://practice.expandtesting.com", "validation"],
  ["https://the-internet.herokuapp.com", "test"],
  ["https://todomvc.com", "test"],
  ["https://www.saucedemo.com", "test"],
  ["https://www.selenium.dev", "test"],
  ["https://qapracticehub.com", "train"],
  ["https://practice-automation.com", "validation"],
  ["https://www.qa-practice.com", "test"],
  ["https://playground.go-bigger.de", "test"],
  ["https://www.testtrack.org", "test"],
  ["https://webdriveruniversity.com", "test"],
  ["https://lastest.cloud", "test"],
  ["https://qaplayground.com", "test"],
  ["https://testing.qaautomationlabs.com", "test"],
  ["https://practicetestautomation.com", "test"],
  ["https://demoqa.com", "test"],
  ["https://www.automation-bible.com", "test"],
  ["https://www.stepcampus.in", "test"],
  ["https://www.sreenidhirajakrishnan.com", "test"],
  ["https://demo.automationtesting.in", "train"],
  ["https://www.letskodeit.com", "train"],
  ["https://testautomationpractice.blogspot.com", "train"],
  ["https://letcode.in", "train"],
  ["https://www.qapractice.com", "validation"],
  ["https://apptesting.pl", "validation"],
  ["https://www.velocity-qa-platform.com", "test"],
  ["https://www.learnaqa.info", "test"],
  ["https://playwrightlab.github.io", "train"],
  ["https://www.xqa.io", "train"],
  ["https://gauravkhurana.com", "validation"],
  ["https://process-practice.dev", "test"],
  ["https://snippylab.com", "test"],
]);

export const reservedTestOrigins = new Set(
  [...splitByOrigin]
    .filter(([, split]) => split === "test")
    .map(([origin]) => origin),
);
