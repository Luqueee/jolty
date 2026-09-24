import { type BlindFlow, click, select, type } from "./blind-cases.ts";

export const publicBlindFlows: BlindFlow[] = [
  {
    id: "testmu-message-sum",
    site: "testmuai",
    family: "test-widget",
    url: "https://www.testmuai.com/selenium-playground/simple-form-demo/",
    settle: "networkidle",
    steps: [
      type(
        "message",
        "Enter the message for the single input demo",
        "input#user-message",
        "Jolty route check",
      ),
      click(
        "show",
        "Click Get Checked Value to show the entered message",
        "button#showInput",
        { kind: "text", selector: "#message", expected: "Jolty route check" },
      ),
      type("first", "Enter seven as the first sum operand", "input#sum1", "7"),
      type("second", "Enter five as the second sum operand", "input#sum2", "5"),
      click(
        "sum",
        "Calculate the sum of seven and five",
        "button:has-text('Get Sum')",
        { kind: "text", selector: "#addmessage", expected: "12" },
      ),
    ],
  },
  {
    id: "testmu-dropdown",
    site: "testmuai",
    family: "test-widget",
    url: "https://www.testmuai.com/selenium-playground/select-dropdown-demo/",
    settle: "networkidle",
    steps: [
      select(
        "monday",
        "Choose Monday from the day list",
        "#select-demo",
        "Monday",
      ),
      select(
        "friday",
        "Change the selected day to Friday",
        "#select-demo",
        "Friday",
      ),
      select(
        "tuesday",
        "Change the selected day to Tuesday",
        "#select-demo",
        "Tuesday",
      ),
      select(
        "saturday",
        "Change the selected day to Saturday",
        "#select-demo",
        "Saturday",
      ),
      select(
        "wednesday",
        "Change the selected day to Wednesday",
        "#select-demo",
        "Wednesday",
      ),
    ],
  },
  {
    id: "hyr-controls",
    site: "hyrtutorials",
    family: "tutorial-controls",
    url: "https://www.hyrtutorials.com/p/basic-controls.html",
    blockThirdParty: true,
    steps: [
      type(
        "first",
        "Enter the first name in the controls form",
        "#firstName",
        "Mara",
      ),
      type(
        "last",
        "Enter the last name in the controls form",
        "#lastName",
        "Vega",
      ),
      type("email", "Enter the contact email", "#email", "mara@example.test"),
      type(
        "password",
        "Enter the controls password",
        "#password",
        "sample-pass-13",
      ),
      click("clear", "Clear the controls form", "#clearbtn", {
        kind: "value",
        selector: "#firstName",
        expected: "",
      }),
    ],
  },
  {
    id: "hyr-dropdown",
    site: "hyrtutorials",
    family: "tutorial-controls",
    url: "https://www.hyrtutorials.com/p/html-dropdown-elements-practice.html",
    blockThirdParty: true,
    steps: [
      select("course", "Choose the Java course", "#course", "java"),
      select("ide", "Choose IntelliJ IDEA", "#ide", "ij"),
      select("python", "Change the course to Python", "#course", "python"),
      select("vscode", "Change the IDE to Visual Studio", "#ide", "vs"),
      select("js", "Change the course to Javascript", "#course", "js"),
    ],
  },
  {
    id: "automation-contact",
    site: "automationtesting",
    family: "practice-form",
    url: "https://www.automationtesting.co.uk/contactForm.html",
    steps: [
      type(
        "first",
        "Enter the contact first name",
        "input[name='first_name']",
        "Ivo",
      ),
      type(
        "last",
        "Enter the contact last name",
        "input[name='last_name']",
        "Reed",
      ),
      type(
        "email",
        "Enter the contact email",
        "input[name='email']",
        "ivo@example.test",
      ),
      type(
        "message",
        "Enter the contact message",
        "textarea[name='message']",
        "Reference flow check",
      ),
      click("reset", "Reset the contact form", "input[type='reset']", {
        kind: "value",
        selector: "input[name='first_name']",
        expected: "",
      }),
    ],
  },
  {
    id: "automation-dropdown-contact",
    site: "automationtesting",
    family: "practice-form",
    url: "https://www.automationtesting.co.uk/dropdown.html",
    steps: [
      select("audi", "Choose Audi in the vehicle list", "#cars", "audi"),
      select("bmw", "Change the vehicle to BMW", "#cars", "bmw"),
      select("ford", "Change the vehicle to Ford", "#cars", "ford"),
      select("honda", "Change the vehicle to Honda", "#cars", "honda"),
      select("jeep", "Change the vehicle to Jeep", "#cars", "jeep"),
    ],
  },
  ...[
    {
      id: "bottle",
      slug: "affirm-water-bottle",
      name: "Affirm Water Bottle",
      quantity: "2",
    },
    {
      id: "watch",
      slug: "aim-analog-watch",
      name: "Aim Analog Watch",
      quantity: "3",
    },
  ].map(
    ({ id, slug, name, quantity }): BlindFlow => ({
      id: `scrapingcourse-${id}`,
      site: "scrapingcourse",
      family: "woocommerce-storefront",
      url: `https://www.scrapingcourse.com/ecommerce/product/${slug}/`,
      blockThirdParty: true,
      blockScripts: true,
      steps: [
        click(
          "additional",
          `Open additional information for ${name}`,
          "a[href='#tab-additional_information']",
          { kind: "hash", expected: "#tab-additional_information" },
        ),
        click(
          "description",
          `Return to the description of ${name}`,
          "a[href='#tab-description']",
          { kind: "hash", expected: "#tab-description" },
        ),
        type(
          "quantity",
          `Set the ${name} quantity to ${quantity}`,
          "input[name='quantity']",
          quantity,
        ),
        ...(id === "bottle"
          ? [
              click(
                "add",
                `Add ${quantity} ${name} items to the cart`,
                "button[name='add-to-cart']",
                { kind: "visible", selector: ".woocommerce-message" },
              ),
            ]
          : []),
      ],
    }),
  ),
];
