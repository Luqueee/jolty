import { fieldCase, type ResearchCase, selectCase } from "./research-cases.ts";

const origin = "https://www.syntaxprojects.com";
const firstForm = `${origin}/basic-first-form-demo.php`;
const inputForm = `${origin}/input-form-demo.php`;

function field(
  id: string,
  path: string,
  target: string,
  goal: string,
  value: string,
): ResearchCase {
  return {
    ...fieldCase({
      id: `syntax-${id}`,
      site: "syntax",
      split: "validation",
      url: `${origin}/${path}`,
      target,
      goal,
      role: "textbox",
      name: "",
      value,
    }),
    postcondition: async (page) =>
      (await page.locator(target).inputValue()) === value,
    failureModes:
      id.includes("search") || id.includes("filter")
        ? ["search_field_button_conflict"]
        : ["duplicate_nearby_labels"],
  };
}

function verifiedSelect(entry: ResearchCase, value: string): ResearchCase {
  return {
    ...entry,
    postcondition: async (page) =>
      (await page.locator(entry.target).inputValue()) === value,
    failureModes: ["duplicate_nearby_labels"],
  };
}

export const freshValidationCasesV9: ResearchCase[] = [
  field(
    "message",
    "basic-first-form-demo.php",
    "input#user-message",
    "Enter a message in the single-input demo",
    "Jolty message",
  ),
  field(
    "sum-first",
    "basic-first-form-demo.php",
    "#sum1",
    "Enter the first number in the sum demo",
    "12",
  ),
  field(
    "sum-second",
    "basic-first-form-demo.php",
    "#sum2",
    "Enter the second number in the sum demo",
    "8",
  ),
  {
    id: "syntax-show-message",
    site: "syntax",
    split: "validation",
    url: firstForm,
    target: "button:has-text('Show Message')",
    goal: "Show the entered message",
    action: "click",
    prepare: async (page) => {
      await page.locator("input#user-message").fill("Jolty message");
    },
    step: () => ({
      goal: "Show the entered message",
      checks: [{ kind: "text_visible", text: "Jolty message" }],
    }),
    postcondition: (page) =>
      page
        .locator("#display")
        .innerText()
        .then((value) => value.includes("Jolty message")),
    failureModes: ["post_transition_control"],
  },
  {
    id: "syntax-get-total",
    site: "syntax",
    split: "validation",
    url: firstForm,
    target: "button:has-text('Get Total')",
    goal: "Calculate the total of the two entered values",
    action: "click",
    prepare: async (page) => {
      await page.locator("#sum1").fill("12");
      await page.locator("#sum2").fill("8");
    },
    step: () => ({
      goal: "Calculate the total of the two entered values",
      checks: [{ kind: "text_visible", text: "20" }],
    }),
    postcondition: (page) =>
      page
        .locator("#displayvalue")
        .innerText()
        .then((value) => value.includes("20")),
    failureModes: ["post_transition_control"],
  },
  ...(
    [
      [
        "first-name",
        'input[name="first_name"]',
        "Enter the first name in the contact form",
        "Jolty",
      ],
      [
        "last-name",
        'input[name="last_name"]',
        "Enter the last name in the contact form",
        "Tester",
      ],
      [
        "email",
        'input[name="email"]',
        "Enter the email address in the contact form",
        "jolty@example.test",
      ],
      [
        "phone",
        'input[name="phone"]',
        "Enter the phone number in the contact form",
        "1234567890",
      ],
      [
        "address",
        'input[name="address"]',
        "Enter the street address in the contact form",
        "Test Street",
      ],
      [
        "city",
        'input[name="city"]',
        "Enter the city in the contact form",
        "Madrid",
      ],
      [
        "zip",
        'input[name="zip"]',
        "Enter the ZIP code in the contact form",
        "28001",
      ],
      [
        "website",
        'input[name="website"]',
        "Enter the website in the contact form",
        "https://example.test",
      ],
      [
        "comment",
        'textarea[name="comment"]',
        "Describe the project in the contact form",
        "Browser testing",
      ],
    ] as const
  ).map(([id, target, goal, value]) =>
    field(id, "input-form-demo.php", target, goal, value),
  ),
  verifiedSelect(
    selectCase({
      id: "syntax-state",
      site: "syntax",
      split: "validation",
      url: inputForm,
      target: 'select[name="state"]',
      goal: "Select California as the state in the contact form",
      name: "State",
      value: "California",
    }),
    "California",
  ),
  verifiedSelect(
    selectCase({
      id: "syntax-day",
      site: "syntax",
      split: "validation",
      url: `${origin}/basic-select-dropdown-demo.php`,
      target: "#select-demo",
      goal: "Select Tuesday in the day dropdown",
      name: "Select a day",
      value: "Tuesday",
    }),
    "Tuesday",
  ),
  verifiedSelect(
    selectCase({
      id: "syntax-country",
      site: "syntax",
      split: "validation",
      url: `${origin}/jquery-dropdown-search-demo.php`,
      target: "#country",
      goal: "Select India in the country dropdown",
      name: "Country",
      value: "India",
    }),
    "India",
  ),
  field(
    "task-filter",
    "table-search-filter-demo.php",
    "#task-table-filter",
    "Enter a task-table filter for the assignee",
    "John",
  ),
  field(
    "table-search",
    "table-sort-search-demo.php",
    'input[type="search"]',
    "Search the sortable table for a person",
    "John",
  ),
  field(
    "attendee-search",
    "data-list-filter-demo.php",
    "#input-search",
    "Search the attendee list",
    "John",
  ),
  {
    id: "syntax-open-column-filters",
    site: "syntax",
    split: "validation",
    url: `${origin}/table-search-filter-demo.php`,
    target: 'button:has-text("Filter")',
    goal: "Click Filter to activate column filters",
    action: "click",
    failureModes: ["search_field_button_conflict", "post_transition_control"],
    prepare: (page) => page.locator("#task-table-filter").fill("John"),
    step: () => ({
      goal: "Click Filter to activate column filters",
      checks: [{ kind: "no_console_errors" }],
    }),
    postcondition: (page) =>
      page.locator('input[placeholder="Username"]').isEnabled(),
  },
  ...(
    [
      ["username", "Username", "Filter the user table by username", "markino"],
      [
        "first-name",
        "First Name",
        "Filter the user table by first name",
        "Daniel",
      ],
      [
        "last-name",
        "Last Name",
        "Filter the user table by last name",
        "Samuels",
      ],
    ] as const
  ).map(
    ([id, placeholder, goal, value]): ResearchCase => ({
      ...field(
        `column-${id}`,
        "table-search-filter-demo.php",
        `input[placeholder="${placeholder}"]`,
        goal,
        value,
      ),
      failureModes: ["search_field_button_conflict", "post_transition_control"],
      prepare: (page) => page.getByRole("button", { name: "Filter" }).click(),
    }),
  ),
];
