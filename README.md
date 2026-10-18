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
