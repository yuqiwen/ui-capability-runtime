import type { Capability } from "../contracts/capability.js";
import type { JsonPrimitive } from "../contracts/common.js";

export function validateInputs(capability: Capability, supplied: Record<string, JsonPrimitive>): string[] {
  const errors: string[] = [];
  const declarations = new Map(capability.contract.inputs.map((input) => [input.name, input]));
  for (const name of Object.keys(supplied)) if (!declarations.has(name)) errors.push(`unexpected input ${name}`);
  for (const input of capability.contract.inputs) {
    const value = supplied[input.name];
    if (value === undefined || value === null) {
      if (input.required) errors.push(`missing required input ${input.name}`);
      continue;
    }
    const schema = input.schema;
    if (schema.type === "string") {
      if (typeof value !== "string") errors.push(`${input.name} must be a string`);
      else {
        if (schema.minLength !== undefined && value.length < schema.minLength) errors.push(`${input.name} is shorter than ${schema.minLength}`);
        if (schema.pattern && !new RegExp(schema.pattern).test(value)) errors.push(`${input.name} does not match its declared pattern`);
      }
    } else if (schema.type === "number" || schema.type === "money") {
      if (typeof value !== "number" || !Number.isFinite(value)) errors.push(`${input.name} must be a finite number`);
      else {
        if (schema.minimum !== undefined && value < schema.minimum) errors.push(`${input.name} is below its minimum`);
        if ("maximum" in schema && schema.maximum !== undefined && value > schema.maximum) errors.push(`${input.name} is above its maximum`);
      }
    } else if (schema.type === "enum") {
      if (typeof value !== "string" || !schema.values.includes(value)) errors.push(`${input.name} is not one of ${schema.values.join(", ")}`);
    } else if (schema.type === "boolean" && typeof value !== "boolean") errors.push(`${input.name} must be a boolean`);
  }
  return errors;
}

