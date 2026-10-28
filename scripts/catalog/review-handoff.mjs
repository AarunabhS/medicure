const REVIEW_TITLE = "Review weekly Indian medicine catalog update";
const CREATE_POLICY_MESSAGE = "GitHub Actions is not permitted to create or approve pull requests";
const REPORT_START = "<!-- medicure-catalog-report:start -->";
const REPORT_END = "<!-- medicure-catalog-report:end -->";

/** Publish review links before attempting the GitHub PR handoff. Never merges. */
export async function handoffCatalogReview({
  github,
  core,
  owner,
  repo,
  branch,
  base,
  sha,
  body,
  serverUrl = "https://github.com",
}) {
  const repositoryUrl = `${serverUrl.replace(/\/$/, "")}/${owner}/${repo}`;
  const branchUrl = `${repositoryUrl}/tree/${encodeURIComponent(branch)}`;
  const compareUrl = `${repositoryUrl}/compare/${encodeURIComponent(base)}...${encodeURIComponent(branch)}?expand=1`;
  const reportUrl = `${repositoryUrl}/blob/${encodeURIComponent(sha)}/assets/data/catalog-update-report.md`;
  await core.summary.addRaw(`## Catalog review handoff

Catalog changes are preserved on the [review branch](${branchUrl}) at commit \`${sha}\`.

- [Compare the catalog update with ${base}](${compareUrl})
- [Read the report for this exact commit](${reportUrl})

Publication is awaiting human review and merge. This workflow does not merge or publish the catalog.

`).write();

  let operation = "list review pull requests";
  try {
    const { data: pullRequests } = await github.rest.pulls.list({
      owner,
      repo,
      head: `${owner}:${branch}`,
      base,
      state: "open",
    });
    const existing = pullRequests[0];
    if (existing) {
      operation = "prepare the existing review pull request body";
      const updatedBody = replaceManagedReport(existing.body, body);
      operation = "update the review pull request";
      const { data: pullRequest } = await github.rest.pulls.update({
        owner,
        repo,
        pull_number: existing.number,
        title: REVIEW_TITLE,
        body: updatedBody,
      });
      await core.summary.addRaw(`Review pull request updated: [${REVIEW_TITLE}](${pullRequest.html_url}). Human review and merge are still required.\n\n`).write();
      return { status: "updated", url: pullRequest.html_url };
    }

    operation = "prepare the new review pull request body";
    const newBody = replaceManagedReport("", body);
    operation = "create the review pull request";
    let pullRequest;
    try {
      ({ data: pullRequest } = await github.rest.pulls.create({
        owner,
        repo,
        head: branch,
        base,
        title: REVIEW_TITLE,
        body: newBody,
        draft: true,
      }));
    } catch (error) {
      if (!isActionsCreatePolicyError(error)) throw error;
      const warning = "Manual catalog review handoff required: GitHub Actions is not permitted to create pull requests. The review branch and report are preserved; create a draft pull request from the comparison link in the job summary.";
      core.warning(warning);
      await core.summary.addRaw(`### Manual pull request required

Repository policy prevents GitHub Actions from creating the review pull request. The branch and exact-commit report above remain available.

[Open the comparison and create a draft pull request](${compareUrl}), using the catalog update report as its description. Review the changes before merging. Publication remains awaiting human review and merge.

`).write();
      return { status: "manual-required" };
    }

    await core.summary.addRaw(`Draft review pull request created: [${REVIEW_TITLE}](${pullRequest.html_url}). Human review and merge are still required.\n\n`).write();
    return { status: "created", url: pullRequest.html_url };
  } catch (error) {
    const markerDetail = error.code === "INVALID_CATALOG_REPORT_MARKERS"
      ? " The catalog report markers are malformed or duplicated. Repair the pull request body manually before retrying; no pull request text was changed."
      : "";
    await core.summary.addRaw(`### Review handoff failed

Could not ${operation}.${markerDetail} This is an unexpected failure; inspect the failed step before retrying. The review branch and exact-commit report above are preserved. Publication remains awaiting human review and merge.

`).write();
    throw error;
  }
}

function replaceManagedReport(existingBody, report) {
  const previous = existingBody ?? "";
  const markerPattern = /<!--\s*medicure-catalog-report/g;
  const markers = [...previous.matchAll(markerPattern)];
  const invalidMarkers = () => Object.assign(
    new Error("Malformed or duplicate Medicure catalog report markers; manual repair is required before updating the pull request body."),
    { code: "INVALID_CATALOG_REPORT_MARKERS" },
  );
  if (markerPattern.test(report)) throw invalidMarkers();
  const section = `${REPORT_START}\n${report.trimEnd()}\n${REPORT_END}`;
  if (!markers.length) return previous ? `${previous}\n\n${section}` : section;

  const starts = previous.split(REPORT_START).length - 1;
  const ends = previous.split(REPORT_END).length - 1;
  const start = previous.indexOf(REPORT_START);
  const end = previous.indexOf(REPORT_END);
  if (markers.length !== 2 || starts !== 1 || ends !== 1 || start > end) throw invalidMarkers();
  return previous.slice(0, start) + section + previous.slice(end + REPORT_END.length);
}

function isActionsCreatePolicyError(error) {
  const status = error.status ?? error.response?.status;
  const message = error.response?.data?.message ?? error.message;
  return status === 403 && (message === CREATE_POLICY_MESSAGE || message === `${CREATE_POLICY_MESSAGE}.`);
}
