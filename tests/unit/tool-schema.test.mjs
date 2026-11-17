import assert from "node:assert/strict";
import test from "node:test";
import GetMyCoursesTool from "../../dist/mcp/tools/get-my-courses.js";

test("course tool exposes its input schema through the framework", () => {
  const tool = new GetMyCoursesTool();
  const classification = tool.inputSchema.properties.classification;

  assert.ok(classification, "classification must appear in the tool input schema");
  assert.equal(classification.type, "string");
  assert.deepEqual(classification.enum, ["all", "inprogress", "future", "past"]);
});

test("framework applies defaults and rejects invalid input before executing the tool", async () => {
  const tool = new GetMyCoursesTool();
  const calls = [];
  tool.execute = async (input) => {
    calls.push(input);
    return [];
  };

  const valid = await tool.toolCall({
    params: { name: tool.name, arguments: {} },
  });
  assert.notEqual(valid.isError, true);
  assert.deepEqual(calls, [{ classification: "all" }]);

  const invalid = await tool.toolCall({
    params: { name: tool.name, arguments: { classification: "unknown" } },
  });
  assert.equal(invalid.isError, true);
  assert.equal(calls.length, 1, "invalid input must not reach execute");
});
