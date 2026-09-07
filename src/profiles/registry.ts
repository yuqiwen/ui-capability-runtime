import { ApplicationProfileRegistry } from "../artifact/application-profiles.js";
import { createNorthstarProfile } from "./northstar.js";

export const applicationProfileRegistry = new ApplicationProfileRegistry([
  {
    id: "northstar-ops",
    matches: (_entryPoint, observation) =>
      /Northstar Credit Union Operations/i.test(observation.title)
      && observation.visibleText.includes("Member Services"),
    create: createNorthstarProfile,
  },
]);
