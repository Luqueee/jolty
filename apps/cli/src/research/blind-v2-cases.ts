import { click, select, type } from "./blind-cases.ts";

export const blindV2Cases = [
  {
    id: "harbor-stock",
    family: "catalog",
    url: "http://harbor-stock.blind-v2.jolty.test/",
    file: "catalog-table.html",
    steps: [
      select(
        "section",
        "Choose Hardware in the stock section",
        "#section",
        "Hardware",
      ),
      click("apply", "Apply the Hardware section filter", "#filter", {
        kind: "text" as const,
        selector: "#result",
        expected: "Showing Hardware",
      }),
    ],
  },
  {
    id: "orchard-catalog",
    family: "catalog",
    url: "http://orchard-catalog.blind-v2.jolty.test/",
    file: "catalog-cards.html",
    steps: [
      select(
        "department",
        "Choose Fruit in the catalog",
        "#department",
        "Fruit",
      ),
      click("show", "Show the Fruit department", "#show", {
        kind: "text" as const,
        selector: "#summary",
        expected: "Department: Fruit",
      }),
    ],
  },
  {
    id: "canal-visits",
    family: "booking",
    url: "http://canal-visits.blind-v2.jolty.test/",
    file: "booking-wizard.html",
    steps: [
      type("visitor", "Enter Noor as the visitor", "#visitor", "Noor"),
      click("continue", "Continue to visit time", "#next", {
        kind: "visible" as const,
        selector: "#schedule",
      }),
      select("time", "Choose the 14:00 visit", "#time", "14:00"),
      click("reserve", "Reserve the visit for Noor at 14:00", "#book", {
        kind: "text" as const,
        selector: "#receipt",
        expected: "Visit reserved at 14:00 for Noor",
      }),
    ],
  },
  {
    id: "studio-sessions",
    family: "booking",
    url: "http://studio-sessions.blind-v2.jolty.test/",
    file: "booking-grid.html",
    steps: [
      click("slot", "Choose the evening studio session", "#evening", {
        kind: "text" as const,
        selector: "#chosen",
        expected: "Evening",
      }),
      type(
        "participant",
        "Enter Ellis as participant",
        "#participant",
        "Ellis",
      ),
      click("confirm", "Confirm Ellis for the evening session", "#confirm", {
        kind: "text" as const,
        selector: "#confirmation",
        expected: "Evening session for Ellis",
      }),
    ],
  },
  {
    id: "north-support",
    family: "support",
    url: "http://north-support.blind-v2.jolty.test/",
    file: "support-list.html",
    steps: [
      type("search", "Search for the Printer ticket", "#search", "Printer"),
      click("find", "Find the Printer ticket", "#find", {
        kind: "visible" as const,
        selector: "#resolve",
      }),
      click("resolve", "Resolve the Printer ticket", "#resolve", {
        kind: "text" as const,
        selector: "#outcome",
        expected: "Printer resolved",
      }),
    ],
  },
  {
    id: "west-service",
    family: "support",
    url: "http://west-service.blind-v2.jolty.test/",
    file: "support-board.html",
    steps: [
      click("open", "Open the Router ticket details", "#open", {
        kind: "visible" as const,
        selector: "#details",
      }),
      type(
        "note",
        "Enter Inspected as the resolution note",
        "#note",
        "Inspected",
      ),
      click("close", "Close the Router ticket", "#close", {
        kind: "text" as const,
        selector: "#completed",
        expected: "Router closed: Inspected",
      }),
    ],
  },
] as const;
