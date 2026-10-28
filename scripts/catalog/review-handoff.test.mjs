import test from "node:test";
import assert from "node:assert/strict";
import { handoffCatalogReview } from "./review-handoff.mjs";

const POLICY_MESSAGE = "GitHub Actions is not permitted to create or approve pull requests";
const PR_URL = "https://github.com/example/medicure/pull/7";
const REPORT_START = "<!-- medicure-catalog-report:start -->";
const REPORT_END = "<!-- medicure-catalog-report:end -->";
const managed = (report) => `${REPORT_START}\n${report}\n${REPORT_END}`;

function fixture({ existing = [], listError, updateError, createError } = {}) {
  const events = [];
  let summary = "";
  const core = {
    summary: {
      addRaw(markdown) {
        summary += markdown;
        return this;
      },
      async write() {
        events.push({ type: "summary", content: summary });
        summary = "";
      },
    },
    warning(message) {
      events.push({ type: "warning", message });
    },
  };
  const github = {
    rest: {
      pulls: {
        async list(parameters) {
          events.push({ type: "list", parameters });
          if (listError) throw listError;
          return { data: existing };
        },
        async update(parameters) {
          events.push({ type: "update", parameters });
          if (updateError) throw updateError;
          return { data: { html_url: PR_URL } };
        },
        async create(parameters) {
          events.push({ type: "create", parameters });
          if (createError) throw createError;
          return { data: { html_url: PR_URL } };
        },
      },
    },
  };
  const input = {
    github,
    core,
    owner: "example",
    repo: "medicure",
    branch: "catalog/weekly-sync",
    base: "main",
    sha: "abc123",
    body: "# Generated catalog report\nReview these source changes.",
  };
  return { input, events };
}

test("creates a draft PR after writing durable review links", async () => {
  const { input, events } = fixture();
  assert.deepEqual(await handoffCatalogReview(input), { status: "created", url: PR_URL });
  assert.deepEqual(events.map((event) => event.type), ["summary", "list", "create", "summary"]);
  const initial = events[0].content;
  assert.match(initial, /tree\/catalog%2Fweekly-sync/);
  assert.match(initial, /compare\/main\.\.\.catalog%2Fweekly-sync\?expand=1/);
  assert.match(initial, /blob\/abc123\/assets\/data\/catalog-update-report\.md/);
  assert.match(initial, /awaiting human review and merge/);
  assert.deepEqual(events[1].parameters, {
    owner: "example", repo: "medicure", head: "example:catalog/weekly-sync", base: "main", state: "open",
  });
  assert.deepEqual(events[2].parameters, {
    owner: "example", repo: "medicure", head: "catalog/weekly-sync", base: "main",
    title: "Review weekly Indian medicine catalog update", body: managed(input.body), draft: true,
  });
  assert.match(events[3].content, /Draft review pull request created/);
});

for (const draft of [true, false]) {
  test(`updates an existing ${draft ? "draft" : "ready"} PR without changing its review state`, async () => {
    const { input, events } = fixture({ existing: [{ number: 7, draft }] });
    assert.deepEqual(await handoffCatalogReview(input), { status: "updated", url: PR_URL });
    assert.deepEqual(events.map((event) => event.type), ["summary", "list", "update", "summary"]);
    assert.deepEqual(events[2].parameters, {
      owner: "example", repo: "medicure", pull_number: 7,
      title: "Review weekly Indian medicine catalog update", body: managed(input.body),
    });
  });
}

test("replaces only the managed report while retaining owner review notes exactly", async () => {
  const prefix = "## Owner review blockers\nDo not merge: R1 ingredients require review.\n\n";
  const suffix = "\n\nOld URL replacements also require human review.  \n";
  const { input, events } = fixture({ existing: [{ number: 7, body: `${prefix}${managed("Old generated report")}${suffix}` }] });
  await handoffCatalogReview(input);
  const updated = events.find((event) => event.type === "update").parameters.body;
  assert.equal(updated, prefix + managed(input.body) + suffix);
  assert.doesNotMatch(updated, /Old generated report/);
});

test("appends a managed report to a legacy body without deleting any existing text", async () => {
  const legacy = "## Owner notes\nHold for source review.\n\n# Old catalog report\nCoverage: 200.  \n";
  const { input, events } = fixture({ existing: [{ number: 7, body: legacy }] });
  await handoffCatalogReview(input);
  assert.equal(events.find((event) => event.type === "update").parameters.body, `${legacy}\n\n${managed(input.body)}`);
});

const malformedBodies = [
  ["missing end marker", `${REPORT_START}\nOld report`],
  ["missing start marker", `Old report\n${REPORT_END}`],
  ["reversed markers", `${REPORT_END}\nOld report\n${REPORT_START}`],
  ["duplicate start", `${REPORT_START}\n${managed("Old report")}`],
  ["duplicate end", `${managed("Old report")}\n${REPORT_END}`],
  ["duplicate sections", `${managed("Old report")}\n${managed("Other report")}`],
  ["malformed delimiter", `<!-- medicure-catalog-report:start\nOld report\n${REPORT_END}`],
];
for (const [name, body] of malformedBodies) {
  test(`rejects ${name} without changing the PR or creating a duplicate`, async () => {
    const { input, events } = fixture({ existing: [{ number: 7, body }] });
    await assert.rejects(handoffCatalogReview(input), { code: "INVALID_CATALOG_REPORT_MARKERS" });
    assert.deepEqual(events.map((event) => event.type), ["summary", "list", "summary"]);
    assert.match(events.at(-1).content, /markers are malformed or duplicated/);
    assert.match(events.at(-1).content, /no pull request text was changed/);
  });
}

for (const message of [POLICY_MESSAGE, `${POLICY_MESSAGE}.`]) {
  test(`provides a visible manual handoff for the exact Actions policy response: ${message}`, async () => {
    const error = Object.assign(new Error("Octokit wrapper text"), { status: 403, response: { data: { message } } });
    const { input, events } = fixture({ createError: error });
    assert.deepEqual(await handoffCatalogReview(input), { status: "manual-required" });
    assert.deepEqual(events.map((event) => event.type), ["summary", "list", "create", "warning", "summary"]);
    assert.match(events[3].message, /Manual catalog review handoff required/);
    assert.match(events[4].content, /Manual pull request required/);
    assert.match(events[4].content, /create a draft pull request/);
    assert.match(events[4].content, /Publication remains awaiting human review and merge/);
    assert.doesNotMatch(events[4].content, /pull request created/);
  });
}

test("recognizes an exact policy message without response data", async () => {
  const error = Object.assign(new Error(POLICY_MESSAGE), { response: { status: 403 } });
  const { input } = fixture({ createError: error });
  assert.deepEqual(await handoffCatalogReview(input), { status: "manual-required" });
});

const unexpectedErrors = [
  ["generic 403", Object.assign(new Error("Resource not accessible by integration"), { status: 403 })],
  ["401", Object.assign(new Error(POLICY_MESSAGE), { status: 401 })],
  ["422", Object.assign(new Error("Validation Failed"), { status: 422 })],
  ["network failure", new Error("fetch failed")],
  ["policy message with extra text", Object.assign(new Error(`${POLICY_MESSAGE}: another problem`), { status: 403 })],
  ["different response message", Object.assign(new Error(POLICY_MESSAGE), { status: 403, response: { data: { message: "Resource not accessible by integration" } } })],
];

for (const [name, error] of unexpectedErrors) {
  test(`propagates ${name} instead of claiming a manual policy fallback`, async () => {
    const { input, events } = fixture({ createError: error });
    await assert.rejects(handoffCatalogReview(input), (actual) => actual === error);
    assert.deepEqual(events.map((event) => event.type), ["summary", "list", "create", "summary"]);
    assert.match(events.at(-1).content, /Review handoff failed/);
    assert.match(events.at(-1).content, /create the review pull request/);
    assert.doesNotMatch(events.at(-1).content, /Manual pull request required/);
  });
}

for (const operation of ["list", "update"]) {
  test(`${operation} errors remain failures and never attempt duplicate creation`, async () => {
    const error = Object.assign(new Error(POLICY_MESSAGE), { status: 403 });
    const options = operation === "list" ? { listError: error } : { existing: [{ number: 7 }], updateError: error };
    const { input, events } = fixture(options);
    await assert.rejects(handoffCatalogReview(input), (actual) => actual === error);
    assert.deepEqual(events.map((event) => event.type), operation === "list"
      ? ["summary", "list", "summary"] : ["summary", "list", "update", "summary"]);
    assert.match(events.at(-1).content, /Review handoff failed/);
    assert.doesNotMatch(events.at(-1).content, /Manual pull request required/);
  });
}

test("uses the supplied GitHub server for all durable links", async () => {
  const { input, events } = fixture();
  await handoffCatalogReview({ ...input, serverUrl: "https://github.example.test/" });
  assert.match(events[0].content, /https:\/\/github\.example\.test\/example\/medicure\/tree\//);
  assert.doesNotMatch(events[0].content, /https:\/\/github\.com\//);
});
