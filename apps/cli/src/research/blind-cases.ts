export type BlindCheck =
  | { kind: "value"; selector: string; expected: string }
  | { kind: "checked"; selector: string }
  | { kind: "text"; selector: string; expected: string }
  | { kind: "visible"; selector: string }
  | { kind: "hidden"; selector: string }
  | { kind: "path"; expected: string }
  | { kind: "hash"; expected: string };

export interface BlindStep {
  id: string;
  goal: string;
  action: "click" | "type" | "select";
  target: string;
  value?: string;
  check: BlindCheck;
}

export interface BlindFlow {
  id: string;
  site: string;
  family: string;
  url: string;
  localFile?: "dispatch.html" | "ledger.html";
  settle?: "networkidle";
  blockThirdParty?: boolean;
  blockScripts?: boolean;
  steps: readonly BlindStep[];
}

export const type = (
  id: string,
  goal: string,
  target: string,
  value: string,
): BlindStep => ({
  id,
  goal,
  action: "type",
  target,
  value,
  check: { kind: "value", selector: target, expected: value },
});
export const select = (
  id: string,
  goal: string,
  target: string,
  value: string,
): BlindStep => ({
  id,
  goal,
  action: "select",
  target,
  value,
  check: { kind: "value", selector: target, expected: value },
});
export const click = (
  id: string,
  goal: string,
  target: string,
  check: BlindCheck,
): BlindStep => ({ id, goal, action: "click", target, check });

export const localBlindFlows: BlindFlow[] = [
  {
    id: "dispatch-seville",
    site: "dispatch",
    family: "dispatch-board",
    url: "http://dispatch.blind.jolty.test/",
    localFile: "dispatch.html",
    steps: [
      type(
        "destination",
        "Enter Seville as the destination",
        "#destination",
        "Seville",
      ),
      click("find", "Find the route to Seville", "#find-route", {
        kind: "visible",
        selector: "#route-results button",
      }),
      click("choose", "Select the route to Seville", "#route-results button", {
        kind: "text",
        selector: "#dispatch-status",
        expected: "Selected route to Seville",
      }),
      click("drivers", "Open the Drivers section", "#drivers-tab", {
        kind: "visible",
        selector: "#drivers-panel",
      }),
      select("driver", "Choose Mara as driver", "#driver", "Mara"),
      click("assign", "Assign Mara to the selected route", "#assign", {
        kind: "text",
        selector: "#dispatch-status",
        expected: "Mara assigned to selected route",
      }),
      click(
        "return-routes",
        "Return to routes for the next assignment",
        "#routes-tab",
        {
          kind: "visible",
          selector: "#routes-panel",
        },
      ),
      type(
        "next-destination",
        "Enter Porto as the next destination",
        "#destination",
        "Porto",
      ),
      click("find-next", "Find the route to Porto", "#find-route", {
        kind: "visible",
        selector: "#route-results button",
      }),
      click(
        "choose-next",
        "Select the route to Porto",
        "#route-results button",
        {
          kind: "text",
          selector: "#dispatch-status",
          expected: "Selected route to Porto",
        },
      ),
      click(
        "next-drivers",
        "Open Drivers for the Porto route",
        "#drivers-tab",
        {
          kind: "visible",
          selector: "#drivers-panel",
        },
      ),
      select("next-driver", "Choose Ivo for the Porto route", "#driver", "Ivo"),
      click("next-assign", "Assign Ivo to the Porto route", "#assign", {
        kind: "text",
        selector: "#dispatch-status",
        expected: "Ivo assigned to selected route",
      }),
    ],
  },
  {
    id: "dispatch-bilbao",
    site: "dispatch",
    family: "dispatch-board",
    url: "http://dispatch.blind.jolty.test/",
    localFile: "dispatch.html",
    steps: [
      click("drivers-first", "Open the Drivers section", "#drivers-tab", {
        kind: "visible",
        selector: "#drivers-panel",
      }),
      click("routes", "Return to Routes", "#routes-tab", {
        kind: "visible",
        selector: "#routes-panel",
      }),
      type(
        "destination",
        "Enter Bilbao as the destination",
        "#destination",
        "Bilbao",
      ),
      click("find", "Find the route to Bilbao", "#find-route", {
        kind: "visible",
        selector: "#route-results button",
      }),
      click("choose", "Select the route to Bilbao", "#route-results button", {
        kind: "text",
        selector: "#dispatch-status",
        expected: "Selected route to Bilbao",
      }),
      click(
        "drivers",
        "Open Drivers to assign the selected route",
        "#drivers-tab",
        {
          kind: "visible",
          selector: "#drivers-panel",
        },
      ),
      select("driver", "Choose Ivo as driver", "#driver", "Ivo"),
      click("assign", "Assign Ivo to the selected route", "#assign", {
        kind: "text",
        selector: "#dispatch-status",
        expected: "Ivo assigned to selected route",
      }),
    ],
  },
  {
    id: "ledger-operations",
    site: "ledger",
    family: "ledger-table-dialog",
    url: "http://ledger.blind.jolty.test/",
    localFile: "ledger.html",
    steps: [
      click("review", "Review entry A17", '[data-entry="A17"] button', {
        kind: "visible",
        selector: "#review-dialog",
      }),
      select(
        "category",
        "Categorize A17 as Operations",
        "#category",
        "operations",
      ),
      type(
        "note",
        "Write the review note for A17",
        "#review-note",
        "Receipt checked",
      ),
      click("approve", "Approve entry A17", "#approve", {
        kind: "text",
        selector: "#ledger-status",
        expected: "Approved A17 as operations: Receipt checked",
      }),
      click(
        "review-next",
        "Review entry B28 after approving A17",
        '[data-entry="B28"] button',
        {
          kind: "visible",
          selector: "#review-dialog",
        },
      ),
      select(
        "next-category",
        "Categorize B28 as Travel",
        "#category",
        "travel",
      ),
      type(
        "next-note",
        "Write the review note for B28",
        "#review-note",
        "Ticket checked",
      ),
      click("next-approve", "Approve B28 after A17", "#approve", {
        kind: "text",
        selector: "#ledger-status",
        expected: "Approved B28 as travel: Ticket checked",
      }),
    ],
  },
  {
    id: "ledger-travel",
    site: "ledger",
    family: "ledger-table-dialog",
    url: "http://ledger.blind.jolty.test/",
    localFile: "ledger.html",
    steps: [
      click("review", "Review entry B28", '[data-entry="B28"] button', {
        kind: "visible",
        selector: "#review-dialog",
      }),
      click("close", "Close the review without approval", "#close-review", {
        kind: "hidden",
        selector: "#review-dialog",
      }),
      click(
        "reopen",
        "Reopen entry B28 for review",
        '[data-entry="B28"] button',
        {
          kind: "visible",
          selector: "#review-dialog",
        },
      ),
      select("category", "Categorize B28 as Travel", "#category", "travel"),
      type(
        "note",
        "Write the travel review note",
        "#review-note",
        "Itinerary checked",
      ),
      click("approve", "Approve entry B28", "#approve", {
        kind: "text",
        selector: "#ledger-status",
        expected: "Approved B28 as travel: Itinerary checked",
      }),
    ],
  },
];
