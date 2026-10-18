# Disposable real release acceptance

This repository is restricted to the test prerelease `v0.0.0-rc.2026101801`, release ID 416342082. The package is inert and private; it is never published to npm. The immutable tag remains at 1231076c12485a02fae3c38b0b850a25274985d5.

The protected release-canary workflow separates three jobs. DoneState first durably authorises the exact subject. Only the publication job has repository write permission and sends its short-lived token solely to the isolated AgentProof approval service. The verification job has read-only repository permission and validates receipt, handoff, independently observed bytes and the signed OpsTruth decision before accepting the durable DoneState outcome.

Five distinct public trust roots and immutable service-source revisions are recorded in trust.json. Private signing keys remain with their separate services. Every service pins the exact merged canary workflow commit through GitHub OIDC. Workflow code and public trust must be independently reviewed before activation.

## Execution and recovery

Attempt 1 makes one valid execution request. It deliberately ignores the returned success for settlement and uses read-only reconciliation, while preserving received response evidence. A network failure is ambiguous, never permission to retry publication. The AgentProof Durable Object permanently fences the numeric repository/release target before the sole GitHub PATCH.

Rerunning the same workflow run uses DoneState status and AgentProof reconciliation only; it never issues a second valid execute request. It reuses the durable transaction identity, approval and receipt. An expired handoff may be renewed for the exact receipt within the existing freshness window. All prior handoffs and terminal decisions remain immutable. Past freshness limits, stop and preserve the unresolved record for reviewed recovery. Never start another run to reclaim the same release or delete its fence.

Each attempt has separately named, immutable Actions evidence artifacts. They include denial checks, original authority, publication intent and response, readback, signed receipt, handoff, independently signed OpsTruth report, offline verification, terminal record, hash-chain check and SHA-256 manifests. Failure evidence is uploaded with always(). An OpsTruth receipt alone never means DoneState VERIFIED.

## Disable and ownership

Owner: AyobamiH / AgentProof, OpsTruth and DoneState maintainers. To disable, set ENABLED=false independently on the four release-only Workers using the accepted source and preserved secret bindings. Do not alter existing patch Workers or the OpsTruth MCP. Disable never deletes durable claims, evidence, tags or releases, and re-enabling cannot reissue a consumed publication.

No deployment, signing secret, package publication, automatic retry or destructive cleanup is performed by PR validation. Main requires protected PR merging. The environment admits protected branches only.

Health preflight separately compares each reviewed service build revision and the permitted workflow revision. Handoff artifact names come from successful producing-job outputs, so GitHub Re-run failed jobs can consume artifacts from an earlier successful prerequisite attempt.


## Preserved first attempt and unexecuted recovery

[Run 39118530819](https://github.com/AyobamiH/agentproof-release-canary/actions/runs/39118530819)
failed in preparation because the release adapter omitted GitHub's required User-Agent.
The release remained a draft and there was no execute request. Its original authorisation
and artifacts remain intact. The reviewed replacement uses the same release, tag, assets,
transaction and all five signing keys. `trust.json` explicitly pins the predecessor.

The read-only authorizer validates the preserved original authority and five key pins.
CI run 39119425333 proved that GitHub refuses private-draft reads using contents-read.
Reservation therefore occurs in the existing contents-write publisher job, which sends its
credential only to AgentProof. Before execution, it presents the signed reservation to
DoneState's strictly predecessor-configured recovery, without forwarding any publisher credential.
DoneState retains the full prior authorisation, appends an audit event and requires execution
after recovery. No fence is reset, ambiguous execution retried, receipt rewritten or new draft created.
Only the separate publish job has contents-write. The receipt signer, OpsTruth and DoneState
never receive that credential. Any changed seed already reserved or attempted remains refused.

Recovery now uses a causal signature gate: DoneState commits the preserved-authority transition before signing a domain-separated grant with its existing handoff key. AgentProof requires that exact grant to activate the same permanent reserved fence before execution. The signed completion records its digest. Timestamp checks remain additional freshness bounds, never the sole ordering proof. Withheld, forged, stale or wrong-attempt grants cannot execute; disabling recovery configuration cannot clear the stored gate.


## Explicit pre-execution recovery boundary

A later GitHub workflow attempt can inspect an already authorised run and reconcile
an already attempted publication with GET-only calls. It cannot issue or activate
a first-attempt grant or start publication with that grant. If original recovery
never committed, its grant was not persisted, or the durable release remains
reserved without an execution attempt, the workflow retains readback evidence and
reports BLOCKED_REAUTHORISATION. It does not call this an ambiguous publication,
reset the fence, create another draft, or silently retry the PATCH. Completing an
interrupted pre-execution authorisation under a different producing attempt
requires a separately reviewed authority transition. This explicit limitation
preserves DoneState's same-attempt grant contract; rerun is not a general liveness
guarantee for every interrupted phase.


Preparation, DoneState recovery and AgentProof activation retry a lost response or transient
server failure at most twice within the original workflow attempt. Each retry is the same
idempotent operation and its evidence is saved. Publication is never retried.
If the runner dies before execution, a later attempt records BLOCKED_REAUTHORISATION with the incomplete-authority or
unattempted-reservation reason and stops. This is an explicit refusal boundary: the first-attempt grant
cannot authorise a later attempt to publish. Preserve the unused fence and all authority
history for fresh reviewed authorisation; do not reset the fence, create a new target or
infer permission from a rerun. Later attempts may only read back an already attempted effect,
with the original signed grant and producing attempt retained.

The three-call preparation limit includes all recovery/activation calls; there are no extra
duplicate probes after success. Source tests cover duplicate service requests. HTTP status
survives non-JSON error responses, so intermediary 5xx failures use the same bounded retry
policy. Malformed success and policy refusal responses stop without widening authority.

Parse/read errors are sanitised before failure artifacts are written. HTTP status
and the safe error class remain available for retry decisions; raw intermediary
response text is never copied into the propagated error message.
