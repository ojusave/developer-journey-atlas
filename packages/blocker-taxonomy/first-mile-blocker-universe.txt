# First-mile blocker universe

**Status:** Non-governing workshop research. This inventory supports diagnosis and exercise design. It does not replace the accepted session contract, the current stage direction, or evidence from actual developers.

**Consumers:** `../stage-outline.md` may use this research in the talk, `../attendee-app-v1.md` may encode a deterministic subset, and `../adaptive-scanner-side-quest.md` may use it to guide adaptive questioning. Those delivery artifacts do not own or rewrite this research catalog.

## What this inventory is for

The first mile is not signup, installation, a `200 OK`, or completion of a quickstart by default. It ends when a specific developer can independently produce and verify the earliest result that predicts continued use for their actual job.

Use this sentence:

> For **[developer and context]**, the first mile ends when they can independently **[perform a meaningful action]** with **[representative input or constraints]** and verify **[observable result]**.

No list can contain every future incident. This one is designed to be exhaustible in use: select a platform archetype, select a developer journey, define the first-mile endpoint, then scan every universal blocker family plus the archetype-specific deltas. A reason is a hypothesis until evidence connects it to a real failed attempt.

## Task tree

1. Classify the platform surface.
   1. Pick the dominant archetype.
   2. Add any secondary archetypes that the developer must cross.
   3. Name whether the surface is public, partner-only, enterprise-gated, open source, or internal.
2. Classify the developer journey.
   1. Evaluator: decide whether the platform can solve the job.
   2. Learner: build enough understanding to act safely.
   3. Adopter: make the core capability work once.
   4. Integrator: connect the capability to an existing system.
   5. Shipper: make it work in a production-like environment.
   6. Operator: observe, recover, and maintain it.
   7. Contributor: change the project or ecosystem and get the change accepted.
   8. Partner: publish an integration, extension, template, or marketplace offering.
3. Define the first-mile endpoint.
   1. Name the developer, job, representative input, authority boundary, visible result, and verification signal.
   2. Separate platform-visible completion from developer-meaningful success.
   3. Define failure and recovery, not only the happy path.
4. Identify the workshop attendee's operating position.
   1. What part of the path can they observe?
   2. What part can they change?
   3. Who owns the remaining part?
5. Map the access and evaluation path.
   1. Record whether discovery and documentation are public or account-gated.
   2. Record whether access is self-serve, invite-only, waitlisted, administrator-approved, sales-assisted, partner-only, or contract-gated.
   3. Record whether evaluation requires no payment method, payment-method verification, prepaid credit, a subscription, usage billing, or an enterprise commitment.
   4. Record whether the first meaningful result can be reached in a playground, sandbox, test mode, local emulator, sample project, or only a real environment.
   5. Separate a gate that is surprising or disproportionate from one that correctly manages fraud, cost, safety, compliance, or operational risk.
6. Test agent readiness when an agent is a plausible actor.
   1. Can the agent discover the canonical, current starting point?
   2. Can it understand the interface, inputs, constraints, side effects, and verification signal?
   3. Can it authenticate as a delegated user or machine identity without exceeding authority?
   4. Can it preview cost and consequences, request approval, execute, verify, recover, and hand control back to a human?
7. Enumerate reasons.
   1. Scan the universal blocker library.
   2. Add the selected platform archetype's blockers.
   3. Add company-, region-, language-, stack-, policy-, and incident-specific blockers.
   4. Keep multiple plausible causes until evidence rules them out.

## Platform archetypes, first miles, and likely workshop attendees

A company can expose several platform types. Classify the journey, not the company logo.

| ID | Platform archetype | A plausible primary first mile | Other first-mile variants | DevRel and adjacent attendees likely to recognize it |
|---|---|---|---|---|
| P01 | Application deployment platform: PaaS, serverless, container hosting, app cloud | A developer deploys representative code and independently verifies the expected behavior at a reachable endpoint | Worker processes a job; scheduled task runs; background service connects to a dependency; preview environment appears | Cloud advocate, developer advocate, solutions architect, docs engineer, DX product manager, sample-app engineer, developer support |
| P02 | Infrastructure primitive: compute, network, storage, CDN, DNS, secrets, messaging | A developer provisions a resource and a workload successfully consumes it through the intended security boundary | Upload and retrieve an object; publish and consume a message; route traffic; resolve a domain; read a secret | Infrastructure advocate, cloud architect, technical writer, solutions engineer, ecosystem engineer, security specialist |
| P03 | Database and data infrastructure: relational, NoSQL, cache, search, vector, warehouse, streaming | A developer connects from representative code, writes representative data, reads the expected result, and can inspect the operation | Run a migration; execute a query; ingest an event; search an indexed document; retrieve a vector match | Data advocate, database specialist, analytics engineer, docs engineer, solutions architect, community engineer |
| P04 | API-as-a-product: payments, communications, maps, identity, commerce, finance, logistics | A developer authenticates and completes one domain-meaningful request, then handles and verifies the result in their application | Receive a webhook; complete an OAuth flow; process a sandbox transaction; reconcile an asynchronous state | API advocate, SDK engineer, technical writer, solutions engineer, developer support, ecosystem or partner engineer |
| P05 | AI, model, and agent platform: inference API, model hosting, RAG, agent runtime, evaluation | A developer uses representative input to produce a usable model or agent result and can inspect enough evidence to judge it | Tool call completes; retrieval grounds an answer; trace appears; evaluator runs; fine-tuned or hosted model responds | AI developer advocate, applied AI engineer, ML community lead, solutions architect, prompt or eval specialist, docs engineer |
| P06 | Framework, library, language, runtime, or SDK | A developer installs the supported version, runs the starter locally, makes one meaningful change, and verifies changed behavior | Add the library to an existing app; call one core abstraction; build for a target runtime; upgrade from an older version | Framework advocate, maintainer advocate, SDK engineer, educator, technical writer, sample maintainer, community lead |
| P07 | Open-source project or protocol implementation | A developer runs the core capability against their own representative input and can diagnose the result | Build from source; configure a real integration; open a valid issue; make a contribution that passes checks | OSS program manager, maintainer advocate, community manager, contributor experience lead, technical writer, DevRel engineer |
| P08 | Developer tool: CLI, IDE, coding agent, debugger, package manager, local environment | A developer installs the tool, applies it to a real repository or task, inspects the result, and safely accepts or rejects it | Generate a project; complete a refactor; debug a defect; create a reproducible environment; approve an agent change | Tooling advocate, DevRel engineer, coding-agent advocate, developer educator, product specialist, community engineer |
| P09 | Source control, CI/CD, build, release, and automation platform | A commit or explicit trigger runs a pipeline that produces a verified artifact or deployment with understandable status | Test suite passes; preview appears; package publishes; release promotion completes; rollback succeeds | CI/CD advocate, DevOps advocate, release engineer, solutions architect, docs engineer, platform PM |
| P10 | Observability, testing, reliability, quality, or security platform | A developer instruments or scans a representative system and can find one known event, failure, test result, or risk in the product | Trace a request; detect a seeded vulnerability; reproduce a test failure; receive an alert; inspect a profile | Observability advocate, security advocate, SRE educator, testing community lead, solutions engineer, technical writer |
| P11 | Integration, automation, plugin, extension, and marketplace platform | A developer connects two real or realistic systems, triggers the flow, and verifies the expected state change on both sides | Publish an extension; install a plugin; receive an event; pass marketplace validation; complete partner review | Ecosystem advocate, partner engineer, integration engineer, marketplace PM, solutions architect, community manager |
| P12 | Mobile, desktop, operating-system, browser, hardware, edge, or IoT platform | A developer builds, signs or provisions as required, runs on a representative target, and verifies one platform capability | Read a sensor; send a notification; use a native API; flash a device; communicate with edge or cloud service | Platform evangelist, mobile advocate, hardware community lead, field engineer, developer educator, certification specialist |
| P13 | Web3, blockchain, wallet, or decentralized protocol | A developer connects an identity or wallet, submits a transaction or query, and verifies the finalized state on the intended network | Deploy a contract; mint or transfer an asset; index an event; sign a message; bridge or settle a test asset | Protocol advocate, ecosystem engineer, smart-contract educator, community manager, security advocate, grant program lead |
| P14 | Internal developer platform, enterprise platform engineering, or paved road | An internal developer creates or changes a service through the approved path and verifies deployment, ownership, and operational signals | Request infrastructure; register a service; get credentials; create a preview; meet policy checks | Internal DevRel, platform advocate, developer productivity engineer, platform PM, enablement lead, docs engineer, SRE |
| P15 | Low-code, no-code, workflow, and visual application platform | A builder creates a working flow or app with representative input, runs it, and can share or hand it off without hidden manual repair | Connect a data source; publish a form; automate an approval; invite a collaborator; export or embed the result | Builder advocate, automation educator, community lead, solutions consultant, template creator, developer marketing |
| P16 | SaaS product with a developer surface: API, webhook, app platform, admin SDK | A developer authenticates against a real or sandbox tenant and completes a read, write, or event round trip relevant to the SaaS job | Create an app; subscribe to a webhook; install into an organization; sync data; pass app review | Developer advocate, app ecosystem lead, API PM, partner engineer, technical writer, developer support |

## DevRel personas who could attend

### Formal DevRel roles

- Head, VP, or Director of Developer Relations.
- Head of Developer Experience.
- DevRel manager or team lead.
- Developer advocate.
- Senior or principal developer advocate.
- Developer evangelist or technology evangelist.
- Developer relations engineer.
- Developer experience engineer.
- Community engineer.
- Developer community manager.
- Open-source community manager.
- Open-source program manager with developer adoption responsibility.
- Maintainer relations lead.
- Contributor experience lead.
- Developer educator or curriculum engineer.
- Technical content engineer.
- Technical writer embedded in DevRel.
- Documentation engineer.
- Sample, demo, or reference-app engineer.
- SDK advocate or SDK relations engineer.
- API advocate.
- Cloud advocate.
- Data, AI, ML, security, mobile, DevOps, or observability advocate.
- Ecosystem developer advocate.
- Partner engineer or partner developer advocate.
- Developer programs manager.
- Developer events manager.
- DevRel operations or program manager.
- Developer marketing manager embedded with DevRel.
- Ambassador, champion, or MVP program manager.
- Academic, student, startup, or regional developer programs lead.
- Developer research or DevRel analytics lead.

### Adjacent roles that often perform DevRel work

- Developer platform product manager.
- API or SDK product manager.
- Developer onboarding or growth product manager.
- Product engineer responsible for examples or activation.
- SDK, CLI, or tooling engineer.
- Platform engineer or developer productivity engineer.
- Solutions architect.
- Solutions engineer or sales engineer serving technical evaluators.
- Customer engineer, field engineer, or field CTO.
- Developer support engineer.
- Technical account manager for developer products.
- Product education or enablement lead.
- Ecosystem, alliances, or marketplace manager.
- Integration engineer.
- Maintainer or core contributor.
- SRE, security engineer, or compliance specialist assigned to onboarding paths.
- UX researcher or content designer studying developer journeys.
- Developer-focused product designer.
- Developer marketing, product marketing, or growth lead.
- Founder or early engineer acting as the company's entire DevRel function.

## Universal blocker library

Every platform archetype inherits these blockers. The IDs make the inventory usable in a workshop or evidence log.

### U00. The first mile is defined incorrectly

- U00.01 The team defines signup as success.
- U00.02 The team defines installation as success.
- U00.03 The team defines a quickstart completion as success even when it does not predict continued use.
- U00.04 The team chooses a milestone because it is easy to instrument.
- U00.05 The milestone reflects the platform's internal architecture instead of the developer's job.
- U00.06 The milestone is the same for evaluators, adopters, integrators, operators, contributors, and partners.
- U00.07 The milestone ignores the developer's existing system.
- U00.08 The milestone uses toy input that hides the real adaptation work.
- U00.09 The milestone stops before the developer can verify the result.
- U00.10 The milestone requires production readiness when the developer only needs an evaluation result.
- U00.11 The milestone is too shallow to create confidence.
- U00.12 The milestone is so ambitious that it combines the first mile with the first marathon.
- U00.13 The platform's completion signal and the developer's success signal diverge.
- U00.14 The team studies a funnel stage without naming the developer, job, or context.
- U00.15 Different teams use different first-mile definitions and compare incompatible data.

### U01. No attempt begins

- U01.01 The developer has no urgent problem.
- U01.02 The problem is real but not important enough now.
- U01.03 Another project has higher priority.
- U01.04 The developer is curious but has no implementation mandate.
- U01.05 The developer cannot connect the platform to a current job.
- U01.06 The expected value is smaller than the expected effort.
- U01.07 The developer assumes an incumbent tool is good enough.
- U01.08 The developer expects a build-versus-buy decision later.
- U01.09 The developer fears creating a maintenance burden.
- U01.10 The developer fears personal blame if the experiment fails.
- U01.11 A manager, architect, procurement owner, or security owner has already discouraged the category.
- U01.12 The developer is attending content for education, not adoption.
- U01.13 The call to action arrives at the wrong moment.
- U01.14 The developer saves the resource and forgets it.
- U01.15 The developer lacks uninterrupted time to start.

### U02. Discovery and entry fail

- U02.01 The developer cannot find the official starting point.
- U02.02 Search results lead to obsolete docs, forks, blog posts, or cached pages.
- U02.03 Product, documentation, GitHub, console, and marketing pages offer competing starts.
- U02.04 The navigation is organized by internal product names.
- U02.05 The platform has no path for the developer's language, framework, or use case.
- U02.06 The quickstart is buried below conceptual material.
- U02.07 The conceptual overview is missing, so the quickstart has no context.
- U02.08 A QR code, short link, package name, repository, or CLI command is wrong.
- U02.09 Regional domains or corporate filters block the entry page.
- U02.10 The developer lands on an enterprise sales form instead of a trial path.
- U02.11 The developer cannot tell which edition, product, or repository is official.
- U02.12 The developer cannot tell whether to start in a dashboard, CLI, API, SDK, or template.
- U02.13 The developer follows a path intended for administrators or end users.
- U02.14 The platform requires an invitation that has not arrived.
- U02.15 Deep links lose the intended context after authentication.

### U03. Relevance, positioning, and trust fail

- U03.01 The value proposition is vague.
- U03.02 The examples do not resemble the developer's job.
- U03.03 The platform appears designed for a different company size, industry, or maturity level.
- U03.04 The platform's terminology does not match the developer's mental model.
- U03.05 Marketing claims are stronger than the available evidence.
- U03.06 The developer cannot distinguish the platform from alternatives.
- U03.07 The developer cannot see the tradeoff the platform is making.
- U03.08 The developer suspects lock-in.
- U03.09 The developer doubts project or vendor longevity.
- U03.10 The developer doubts maintenance quality.
- U03.11 The developer sees unresolved incidents, abandoned issues, or stale releases.
- U03.12 The developer cannot find pricing, limits, security, privacy, or support terms.
- U03.13 The developer sees a mismatch between documentation promises and product behavior.
- U03.14 Community responses appear dismissive, hostile, or sales-driven.
- U03.15 The platform requires trust before it provides inspectable evidence.

### U04. Account, identity, and authentication fail

- U04.01 Signup is mandatory before value can be evaluated.
- U04.02 Signup requires a work email the developer cannot or will not use.
- U04.03 Personal emails, aliases, or privacy relays are rejected.
- U04.04 Verification email is delayed, filtered, expired, or never delivered.
- U04.05 SSO is required but not configured.
- U04.06 SSO routes to the wrong identity provider or tenant.
- U04.07 Multi-factor authentication is unavailable or fails.
- U04.08 The developer cannot use the required phone number or authenticator.
- U04.09 OAuth consent is blocked by the organization.
- U04.10 OAuth requests excessive or unexplained scopes.
- U04.11 CAPTCHA is inaccessible, broken, or blocked.
- U04.12 The account already exists under another identity.
- U04.13 Account linking creates duplicate or orphaned accounts.
- U04.14 Session state is lost across docs, console, CLI, and support.
- U04.15 The CLI or SDK authentication flow cannot run in the developer's environment.
- U04.16 Tokens expire during the tutorial without a recovery path.
- U04.17 The developer cannot sign out or switch accounts safely.
- U04.18 The organization prohibits creation of external accounts.

### U05. Organization, workspace, and tenancy setup fail

- U05.01 The developer creates a personal workspace when the tutorial assumes an organization.
- U05.02 The developer joins the wrong organization, project, region, or tenant.
- U05.03 The developer lacks permission to create a project or resource.
- U05.04 Only an administrator can accept terms or activate the account.
- U05.05 The organization invitation expires or targets another email identity.
- U05.06 Role names do not explain their practical permissions.
- U05.07 Default roles are too restrictive for the quickstart.
- U05.08 Default roles are too broad for the organization's policy.
- U05.09 The tutorial assumes a single-user workspace.
- U05.10 Resource ownership is assigned to the wrong person or team.
- U05.11 Deleting a test workspace requires privileges the developer lacks.
- U05.12 Region, residency, or tenant selection is irreversible or unclear.
- U05.13 Existing organization policy disables the required feature.
- U05.14 Trial entitlements differ between personal and organization accounts.
- U05.15 The developer cannot see whether a resource is personal, shared, or production-affecting.

### U06. Commercial, procurement, and legal gates fail

- U06.01 A credit card is required before evaluation.
- U06.02 The developer cannot use a personal or corporate card.
- U06.03 A free tier is unavailable in the developer's country or use case.
- U06.04 Trial credits are too small, expire too quickly, or are hard to understand.
- U06.05 Pricing units are unfamiliar or impossible to estimate.
- U06.06 The cost of a realistic test is unknown.
- U06.07 The developer fears an unbounded bill.
- U06.08 Budget alerts, caps, or hard limits are missing.
- U06.09 Procurement must approve a vendor before any data is uploaded.
- U06.10 Legal terms prohibit the intended data, geography, or usage.
- U06.11 The developer cannot accept click-through terms for the company.
- U06.12 Open-source license obligations are unclear or unacceptable.
- U06.13 SDK or model licenses conflict with the product's distribution model.
- U06.14 A business associate agreement, DPA, security review, or vendor assessment is required.
- U06.15 Tax, currency, invoicing, or billing-entity constraints block activation.
- U06.16 The platform requires a sales conversation to obtain essential limits or access.
- U06.17 The developer cannot tell before starting whether meaningful use is self-serve, invite-only, sales-assisted, administrator-approved, partner-only, or contract-gated.
- U06.18 The platform requests payment information without explaining whether it is for identity verification, fraud prevention, a temporary hold, prepaid credit, a subscription, or usage billing.

### U07. Authority, permissions, and governance fail

- U07.01 The developer cannot install software on the workstation.
- U07.02 The developer cannot run containers, virtual machines, or local services.
- U07.03 The developer cannot create cloud resources.
- U07.04 The developer cannot create service accounts, keys, certificates, or OAuth apps.
- U07.05 The developer cannot connect a source-control organization.
- U07.06 A source-control administrator must approve the app.
- U07.07 The developer cannot change DNS, firewall, network, or identity settings.
- U07.08 The developer cannot use production-like data.
- U07.09 The developer cannot invite collaborators or create a shared project.
- U07.10 A policy engine rejects the configuration without an actionable explanation.
- U07.11 Separation-of-duties rules prevent one person from completing the tutorial.
- U07.12 Audit, retention, encryption, or ownership requirements are not met.
- U07.13 The developer does not know who can grant the missing permission.
- U07.14 Approval takes longer than the developer's evaluation window.
- U07.15 The platform does not distinguish safe sandbox actions from consequential production actions.

### U08. Documentation and information architecture fail

- U08.01 Documentation is incomplete.
- U08.02 Documentation is incorrect.
- U08.03 Documentation is stale.
- U08.04 Documentation mixes versions without warning.
- U08.05 Documentation assumes context the developer does not have.
- U08.06 Documentation explains syntax but not the decision being made.
- U08.07 Documentation describes features but not end-to-end jobs.
- U08.08 Required prerequisites appear after the step that needs them.
- U08.09 A critical caveat is hidden in a note, issue, changelog, or FAQ.
- U08.10 Code and prose disagree.
- U08.11 Screenshots no longer match the interface.
- U08.12 Copy buttons omit line breaks, prompts, placeholders, or required context.
- U08.13 Links are broken, redirected, access-controlled, or circular.
- U08.14 Search returns noisy, duplicated, or irrelevant results.
- U08.15 The API reference lacks conceptual guidance.
- U08.16 Conceptual guidance lacks runnable examples.
- U08.17 Error documentation is absent or not searchable by the actual message.
- U08.18 The developer cannot tell whether a step is required, optional, destructive, or production-affecting.
- U08.19 The happy path has no recovery instructions.
- U08.20 Localization is missing, poor, or inconsistent with product terminology.

### U09. Learning and cognitive load fail

- U09.01 The developer lacks a prerequisite concept.
- U09.02 The developer knows the domain but not the platform's vocabulary.
- U09.03 The developer must learn several new abstractions at once.
- U09.04 The tutorial introduces choices before giving selection criteria.
- U09.05 Similar concepts have indistinguishable names.
- U09.06 One concept has different names across product surfaces.
- U09.07 The platform exposes implementation detail before the core mental model.
- U09.08 The developer cannot predict the consequence of a configuration choice.
- U09.09 The developer cannot tell which values are examples and which must be replaced.
- U09.10 The developer copies commands without understanding their state changes.
- U09.11 The developer cannot map the toy example to an existing architecture.
- U09.12 The tutorial's pace assumes more expertise than the developer has.
- U09.13 The tutorial is so basic that an experienced developer abandons it.
- U09.14 The platform requires simultaneous knowledge of product, cloud, networking, security, and domain rules.
- U09.15 The developer cannot form a causal model of success or failure.

### U10. Prerequisite and local-environment setup fail

- U10.01 The operating system is unsupported.
- U10.02 The CPU architecture is unsupported.
- U10.03 The runtime version is unsupported.
- U10.04 The package manager is missing or incompatible.
- U10.05 Required compilers, headers, build tools, or system libraries are missing.
- U10.06 The required browser or browser feature is unavailable.
- U10.07 The shell differs from the documented shell.
- U10.08 Path, quoting, line-ending, locale, or encoding behavior differs.
- U10.09 The developer lacks disk, memory, CPU, GPU, or battery capacity.
- U10.10 The device clock is wrong and breaks certificates or signatures.
- U10.11 Corporate endpoint protection quarantines a binary or script.
- U10.12 Proxy, VPN, DNS, firewall, or TLS inspection changes behavior.
- U10.13 A required port is occupied or blocked.
- U10.14 The developer is offline or on an unreliable connection.
- U10.15 The environment already contains conflicting tools, variables, certificates, or credentials.
- U10.16 The tutorial assumes administrator or root privileges.
- U10.17 The developer cannot reproduce the tutorial's clean environment.
- U10.18 Remote development, containers, WSL, VDI, or codespaces create an undocumented boundary.

### U11. Installation, dependency, build, and versioning fail

- U11.01 The package or binary name is ambiguous.
- U11.02 The package registry is blocked or unavailable.
- U11.03 The package is missing for the target platform.
- U11.04 Checksums, signatures, provenance, or certificates fail.
- U11.05 A dependency is yanked, abandoned, compromised, or incompatible.
- U11.06 Transitive dependency resolution produces a conflict.
- U11.07 Lockfiles and documented versions disagree.
- U11.08 The latest version contains a regression.
- U11.09 The tutorial requires an older version without pinning it.
- U11.10 Global and project-local installations conflict.
- U11.11 Multiple copies of the runtime or CLI resolve unpredictably.
- U11.12 Native compilation fails.
- U11.13 The build exceeds resource or time limits.
- U11.14 A monorepo, workspace, proxy registry, or private mirror changes installation behavior.
- U11.15 The developer cannot remove or roll back the installation cleanly.
- U11.16 An upgrade or migration is required before the first useful action.

### U12. Configuration, credentials, secrets, and state fail

- U12.01 A required configuration value is undocumented.
- U12.02 A default is unsafe, surprising, or unsuitable for the tutorial.
- U12.03 A placeholder is mistaken for a literal value.
- U12.04 A literal example value is mistaken for a placeholder.
- U12.05 Environment-variable names differ across docs, SDKs, CLI, and runtime.
- U12.06 Configuration precedence is unclear.
- U12.07 The platform reads configuration from an unexpected directory or account.
- U12.08 A secret is created but cannot be retrieved again.
- U12.09 A key has the wrong scope, environment, region, tenant, or expiration.
- U12.10 Test and production credentials are confused.
- U12.11 Credentials are copied with whitespace, quotes, line breaks, or truncation.
- U12.12 Secret storage is unavailable or prohibited.
- U12.13 The developer accidentally commits a secret and must stop to rotate it.
- U12.14 State from a prior attempt contaminates the current attempt.
- U12.15 State is lost between browser, CLI, local process, and remote runtime.
- U12.16 The developer cannot tell which configuration is active.
- U12.17 Configuration changes are eventually consistent without a visible status.
- U12.18 Cleanup removes state needed for another step.

### U13. Network, region, and external-dependency fail

- U13.01 The platform endpoint is blocked by a firewall, proxy, VPN, ISP, or national policy.
- U13.02 DNS fails or resolves differently across environments.
- U13.03 TLS trust, certificate chains, SNI, or interception cause failures.
- U13.04 IPv4 and IPv6 behavior differs.
- U13.05 A callback, tunnel, webhook, or local port cannot receive inbound traffic.
- U13.06 Egress is restricted.
- U13.07 The chosen region is unavailable, distant, or incompatible with another resource.
- U13.08 Cross-region access is prohibited or too slow.
- U13.09 An external provider, registry, identity service, payment rail, or API is down.
- U13.10 The external dependency requires its own account, approval, or payment.
- U13.11 Rate limits, bot protection, WAF rules, or abuse controls block the attempt.
- U13.12 Timeouts are shorter than the operation requires.
- U13.13 Retries duplicate a non-idempotent action.
- U13.14 A webhook sender cannot verify the receiver.
- U13.15 Sandbox endpoints behave differently from production endpoints.
- U13.16 Network failure is reported as a generic authentication or application error.

### U14. Data, schema, and input fail

- U14.01 The tutorial's sample data is unavailable.
- U14.02 Sample data is too clean to reveal real constraints.
- U14.03 The developer cannot use representative data because of privacy or policy.
- U14.04 File type, encoding, delimiter, size, shape, or compression is unsupported.
- U14.05 Schema requirements are undocumented or inferred incorrectly.
- U14.06 Required fields are missing.
- U14.07 Field names, types, units, time zones, or null behavior differ.
- U14.08 Test fixtures are stale or inconsistent.
- U14.09 Seed operations partially succeed and leave ambiguous state.
- U14.10 Data import, indexing, training, or processing is asynchronous with no progress signal.
- U14.11 The input exceeds a hidden or poorly explained limit.
- U14.12 The input triggers moderation, validation, fraud, or abuse controls.
- U14.13 The developer cannot safely delete uploaded data.
- U14.14 The output is technically valid but not meaningful for the developer's input.
- U14.15 A data residency or retention rule blocks the intended flow.

### U15. Product, API, SDK, CLI, and interface design fail

- U15.01 The primary action is hard to find.
- U15.02 The interface presents too many choices before first value.
- U15.03 Defaults optimize for advanced or production users instead of evaluation.
- U15.04 Required and optional fields are indistinguishable.
- U15.05 Names do not match the docs or domain language.
- U15.06 The same task behaves differently in console, CLI, API, and SDK.
- U15.07 The API requires too many round trips for the first job.
- U15.08 The SDK hides critical behavior or exposes too much low-level detail.
- U15.09 The CLI is not scriptable, inspectable, or non-interactive when needed.
- U15.10 The UI cannot express the configuration shown in code.
- U15.11 The API cannot express the configuration shown in the UI.
- U15.12 Destructive and reversible actions look alike.
- U15.13 The developer cannot preview a change.
- U15.14 The developer cannot inspect generated configuration or requests.
- U15.15 Resource names, identifiers, and relationships are hard to copy or recognize.
- U15.16 Pagination, asynchronous operations, eventual consistency, or idempotency is hidden.
- U15.17 A feature is visible but not enabled for the account.
- U15.18 The first-run tour blocks rather than assists the real task.

### U16. Examples, templates, starters, and generated code fail

- U16.01 The example does not run.
- U16.02 The example uses an obsolete API, SDK, dependency, or product feature.
- U16.03 The example contains undeclared setup.
- U16.04 The example requires an unavailable asset, secret, service, or dataset.
- U16.05 The example is too minimal to show adaptation points.
- U16.06 The example is too complex to isolate the core capability.
- U16.07 The example's architecture conflicts with common production patterns.
- U16.08 The template includes insecure or expensive defaults.
- U16.09 Generated code is opaque or difficult to modify.
- U16.10 Generated code compiles but does not produce the promised behavior.
- U16.11 The sample repository has broken branches, submodules, large files, or missing releases.
- U16.12 The developer cannot tell which parts to copy and which parts to understand.
- U16.13 The example only works in the vendor's preferred language or framework.
- U16.14 The example requires replacing many coupled placeholders.
- U16.15 The example succeeds only because it uses privileged vendor-owned resources.
- U16.16 The example has no tests, expected output, or verification step.

### U17. Feedback, errors, diagnosis, and recovery fail

- U17.01 The action appears to do nothing.
- U17.02 Progress is invisible.
- U17.03 Success is declared before the outcome is actually available.
- U17.04 Failure is reported after a long delay.
- U17.05 The error is generic.
- U17.06 The error describes an internal implementation detail.
- U17.07 The error blames the wrong layer.
- U17.08 The same root cause produces different messages across surfaces.
- U17.09 The error message is not searchable.
- U17.10 The suggested fix is wrong, unsafe, or incomplete.
- U17.11 Logs are unavailable, delayed, truncated, noisy, or in another product area.
- U17.12 Correlation IDs, timestamps, request IDs, and resource IDs are missing.
- U17.13 The developer cannot distinguish platform failure from application failure.
- U17.14 The developer cannot reproduce the failure.
- U17.15 Retry behavior is unclear.
- U17.16 Partial success leaves resources that change the next attempt.
- U17.17 There is no reset, undo, rollback, or clean restart path.
- U17.18 Cleanup instructions are destructive beyond the tutorial scope.
- U17.19 Support asks the developer to repeat steps already completed.
- U17.20 Recovery requires privileged access or a sales/support intervention.

### U18. Reliability, performance, and capacity fail

- U18.01 The service is down.
- U18.02 The control plane is available but the data plane is not.
- U18.03 The dashboard is available but API or CLI operations fail.
- U18.04 Provisioning, build, deployment, indexing, or model loading takes longer than expected.
- U18.05 Cold starts or wake-up delays look like failure.
- U18.06 Capacity is unavailable in the chosen region or tier.
- U18.07 A queue is backed up.
- U18.08 The sandbox is less reliable than production.
- U18.09 Resource limits are lower than documented or expected.
- U18.10 A noisy neighbor or shared runner causes intermittent failure.
- U18.11 Eventual consistency produces contradictory states.
- U18.12 Rate limiting begins before the developer expects it.
- U18.13 The status page does not reflect the affected component.
- U18.14 The developer cannot tell whether waiting or changing something is correct.
- U18.15 The first successful run is not repeatable.

### U19. Security, privacy, compliance, and risk fail

- U19.01 The developer cannot determine what data leaves the environment.
- U19.02 The platform requests more data or permissions than the job requires.
- U19.03 Security documentation is missing, stale, vague, or gated.
- U19.04 Encryption, key management, audit, retention, deletion, or residency controls are unclear.
- U19.05 The platform cannot use the organization's identity, network, or secrets model.
- U19.06 The tutorial encourages unsafe secret handling.
- U19.07 The starter exposes a public endpoint or resource unexpectedly.
- U19.08 Dependency or container scanning finds unacceptable vulnerabilities.
- U19.09 The platform, SDK, model, extension, or binary lacks trusted provenance.
- U19.10 The organization prohibits the data category, model, region, or subprocessors.
- U19.11 The developer cannot verify data deletion.
- U19.12 The platform's abuse controls reject legitimate evaluation behavior.
- U19.13 Compliance claims do not map clearly to the developer's application responsibilities.
- U19.14 The developer cannot create a safe sandbox separated from production.
- U19.15 The first-mile path requires disabling a security control.

### U20. Cost, quota, limits, and entitlement fail

- U20.01 The required feature is not included in the current plan.
- U20.02 The docs do not identify the required plan.
- U20.03 The free tier excludes the realistic first-mile path.
- U20.04 Trial credits are not applied automatically.
- U20.05 Quotas start at zero or require an increase request.
- U20.06 The developer hits an account, project, region, concurrency, size, rate, or resource limit.
- U20.07 A hidden limit fails the attempt without naming the limit.
- U20.08 Usage meters update too slowly to guide decisions.
- U20.09 Cost estimates omit dependent resources, egress, storage, tokens, seats, or minimums.
- U20.10 Cleanup does not stop billing.
- U20.11 The developer fears testing because the blast radius is unknown.
- U20.12 Credits expire while an approval or support request is pending.
- U20.13 Enterprise entitlements require a contract update.
- U20.14 A marketplace, cloud, or reseller account has different entitlements.
- U20.15 The first-mile path is technically possible but economically irrational.

### U21. Team, ownership, and organizational coordination fail

- U21.01 No one owns the evaluation.
- U21.02 Several teams own dependent steps.
- U21.03 The developer can start but not complete the path alone.
- U21.04 The champion leaves, changes priority, or loses sponsorship.
- U21.05 The manager wants evidence the first mile cannot yet provide.
- U21.06 Architecture, platform, security, data, legal, and procurement owners disagree.
- U21.07 The platform solves one team's problem while creating another team's burden.
- U21.08 The developer cannot identify the internal owner of credentials, data, infrastructure, or DNS.
- U21.09 A shared sandbox is contaminated or occupied by another team.
- U21.10 Naming, tagging, ownership, or cost-allocation standards block resource creation.
- U21.11 The tutorial assumes authority that belongs to another function.
- U21.12 Handoffs lose context, logs, or state.
- U21.13 The team's support channel is unavailable across time zones.
- U21.14 The adopter must persuade others before any meaningful test.
- U21.15 Success would require a process change the organization is unwilling to make.

### U22. Transition from toy success to representative use fails

- U22.01 The hello world works but the developer cannot locate the adaptation seam.
- U22.02 The developer cannot substitute their own data, repository, account, domain, or workflow.
- U22.03 The real architecture requires multiple services while the example uses one.
- U22.04 The real environment requires private networking, SSO, policy, or compliance controls absent from the example.
- U22.05 The real workload exceeds sandbox limits.
- U22.06 The real job is asynchronous while the example is synchronous.
- U22.07 The real job requires retries, idempotency, ordering, consistency, or reconciliation.
- U22.08 The real job requires observability, testing, rollback, backup, or disaster recovery.
- U22.09 The real job requires collaboration, review, approval, or handoff.
- U22.10 The developer cannot estimate performance, reliability, cost, or operational burden.
- U22.11 The integration conflicts with existing architecture or conventions.
- U22.12 The platform requires a migration or data movement before value is visible.
- U22.13 The developer cannot run the same path in local, test, staging, and production environments.
- U22.14 The developer cannot explain the change to an approver or maintainer.
- U22.15 The first example proves capability but not fitness for the developer's job.

### U23. Accessibility, language, geography, and inclusion fail

- U23.01 Keyboard navigation is incomplete.
- U23.02 Focus is lost, hidden, or trapped.
- U23.03 Screen-reader names, roles, states, or ordering are missing.
- U23.04 Color, contrast, zoom, text size, or motion makes the path unusable.
- U23.05 CAPTCHA, diagrams, video, or audio lacks an accessible alternative.
- U23.06 The documentation assumes fluent English.
- U23.07 Translation changes technical meaning.
- U23.08 Dates, numbers, currency, addresses, names, phone numbers, or time zones use unsupported formats.
- U23.09 The platform, feature, payment method, phone verification, or region is unavailable in the developer's country.
- U23.10 The path assumes a powerful laptop, fast network, second screen, or modern phone.
- U23.11 The tutorial assumes visual copying, drag-and-drop, precise pointer use, or sustained attention.
- U23.12 Error and support paths are not localized.
- U23.13 Community participation feels unsafe or exclusionary.
- U23.14 Documentation examples encode cultural assumptions that obscure the job.
- U23.15 Time-zone and event timing prevent access to live help.

### U24. Support, community, and escalation fail

- U24.01 No support channel is visible.
- U24.02 The visible channel is for sales, not technical help.
- U24.03 Support requires a paid plan.
- U24.04 Community support requires another account or public disclosure.
- U24.05 The developer cannot share proprietary code or data needed to reproduce the issue.
- U24.06 The issue template requests unavailable information.
- U24.07 The support response is too slow for the evaluation window.
- U24.08 The support response assumes the developer is a beginner or an expert incorrectly.
- U24.09 The response links back to the same failed docs.
- U24.10 The community provides several contradictory fixes.
- U24.11 Maintainers cannot reproduce the environment.
- U24.12 The issue is closed as configuration, duplicate, unsupported, or stale without a usable next step.
- U24.13 The developer fears embarrassment or reputational cost from asking.
- U24.14 The developer does not know whether the problem belongs to the platform, integration, dependency, or their code.
- U24.15 Escalation requires an account ID, contract, or admin the developer cannot access.

### U25. Time, attention, motivation, and emotion fail

- U25.01 The path takes longer than the available session.
- U25.02 The developer is interrupted and cannot resume.
- U25.03 State expires between attempts.
- U25.04 The developer is fatigued by prior setup work.
- U25.05 Too many small uncertainties accumulate into abandonment.
- U25.06 The developer interprets friction as a signal of future platform quality.
- U25.07 The developer is afraid of breaking production or incurring cost.
- U25.08 The developer feels foolish for not understanding the path.
- U25.09 The developer has already spent political capital on the tool.
- U25.10 The developer overestimates the cost of switching paths because of sunk effort.
- U25.11 The developer silently substitutes a familiar tool.
- U25.12 The developer postpones the hard integration step after a demo succeeds.
- U25.13 Success is not celebrated, explained, or connected to the next action.
- U25.14 The next action is too large, ambiguous, or irreversible.
- U25.15 The developer cannot preserve or share progress.

### U26. AI and agent-mediated attempts fail

- U26.01 The coding agent chooses the wrong product, version, SDK, or tutorial.
- U26.02 The agent invents commands, APIs, configuration fields, limits, or features.
- U26.03 The agent follows stale training data instead of current docs.
- U26.04 The agent cannot access authenticated documentation or console state.
- U26.05 The agent lacks the organization, region, account, and permission context.
- U26.06 The agent exposes or mishandles secrets.
- U26.07 The agent performs a consequential action without a clear approval boundary.
- U26.08 The agent optimizes for a passing command instead of the developer's meaningful outcome.
- U26.09 The agent suppresses or works around a legitimate security or policy failure.
- U26.10 The agent changes multiple layers at once, obscuring the cause.
- U26.11 The agent leaves generated code, resources, or state the developer cannot explain.
- U26.12 The agent sees a false success signal and stops early.
- U26.13 The agent retries a non-idempotent action.
- U26.14 The agent cannot inspect UI-only status, email verification, MFA, or human approval.
- U26.15 The developer cannot review the volume or complexity of the agent's changes.
- U26.16 The platform blocks automation, browser control, headless login, or programmatic credentials.
- U26.17 Agent and human actions race or overwrite one another.
- U26.18 The developer cannot reproduce the agent's successful environment.
- U26.19 The agent cannot discover the canonical starting point or distinguish current documentation from stale, unofficial, or deprecated material.
- U26.20 Critical instructions are gated, client-rendered, or available only in images, video, or interactive UI that the agent cannot retrieve or interpret reliably.
- U26.21 A platform intended for programmatic use exposes no stable machine-readable interface or schema that the agent can inspect.
- U26.22 The machine-readable description, generated client, human documentation, and live platform behavior disagree.
- U26.23 Tool or operation names, descriptions, input schemas, constraints, errors, or side effects are too ambiguous for the agent to select and invoke safely.
- U26.24 Authentication supports an interactive human flow when the job requires an unattended machine identity, with no supported alternative.
- U26.25 Authentication supports a machine credential when the job requires explicit user delegation or consent, with no supported alternative.
- U26.26 Signup, CAPTCHA, MFA, terms acceptance, business verification, sales approval, or administrator consent cannot be handed to a human and then resumed by the agent.
- U26.27 The agent cannot discover authorization endpoints, required scopes, or a least-privilege path.
- U26.28 Bot controls, access policy, or terms make it unclear whether the intended automated use is permitted.
- U26.29 The agent cannot determine plan eligibility, remaining quota, price, credits, or the billable consequence before acting.
- U26.30 A consequential operation offers no supported preview, dry run, idempotency protection, confirmation boundary, receipt, or reversible recovery path for agent use.

### U27. Measurement and diagnosis produce a false story

- U27.01 Analytics miss developers who never load the instrumented surface.
- U27.02 Ad blockers, consent choices, network policy, or privacy tools suppress events.
- U27.03 One developer appears as several users across devices, accounts, CLI, and browser.
- U27.04 Several developers appear as one organization or shared account.
- U27.05 Bots, agents, demos, employees, and tests inflate completion.
- U27.06 A `200`, deploy status, generated key, or copied command is counted as meaningful success.
- U27.07 The platform records completion before the developer verifies the result.
- U27.08 The developer succeeds outside the expected path and appears to drop.
- U27.09 The developer fails after the tracked endpoint and appears successful.
- U27.10 Retry loops inflate step counts and apparent engagement.
- U27.11 Cohorts combine different intents, skills, regions, plans, and platform versions.
- U27.12 Survivorship bias hides people who could not start.
- U27.13 Support-assisted success is mixed with independent success.
- U27.14 Employee, partner, event, and customer traffic are mixed.
- U27.15 Correlation is treated as proof of the cause.
- U27.16 Room votes, survey answers, and stated preferences are treated as behavioral evidence.
- U27.17 The team fixes the most visible complaint instead of the load-bearing cause.
- U27.18 The metric creates pressure to shorten the milestone rather than improve the developer outcome.

## Interpretation: agents, access gates, billing, and playgrounds

### Agent discoverability is not one file

Agent readiness is an end-to-end capability, not a claim that a site has an `llms.txt` file. Test whether an agent can discover the authoritative entry point, obtain current textual instructions, inspect a machine-readable interface when the product is programmatic, authenticate with the right identity model, understand side effects and cost, obtain human approval when required, execute, verify the developer outcome, recover, and return evidence to the human.

- [OpenAPI 3.2.0](https://spec.openapis.org/oas/v3.2.0.html) provides a standard interface description that lets humans and computers discover and understand an HTTP API. It does not prove that an agent can complete the developer's job.
- [Model Context Protocol tools](https://modelcontextprotocol.io/specification/draft/server/tools) provide explicit tool discovery and schemas. [MCP authorization](https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization) defines metadata discovery and delegated authorization. Machine-to-machine work can require a different credential path from a human-delegated action.
- [AGENTS.md](https://agents.md/) is an open format for repository-specific coding-agent instructions. It applies to work inside a codebase, not general website ranking or every platform journey.
- [`llms.txt`](https://llmstxt.org/) is a proposal for LLM-friendly website content, not a universal agent-readiness requirement. Google states that its AI Search features require no special AI file or markup. Treat any special-file tactic as an experiment unless the intended agent or client documents support.

### Access and payment gates are not automatically defects

A gate is a blocker relative to a named developer and first-mile endpoint. That does not mean the gate is wrong. A sales-assisted path may be justified for a complex enterprise deployment. A payment method may manage fraud, identity, or real resource cost. An approval may correctly protect data or consequential actions.

Diagnose the failure more precisely:

- Is the access route visible before the developer invests effort?
- Is the reason for the gate explained?
- Is the requested commitment proportionate to the evaluation risk and cost?
- Can the developer predict charges and set a safe bound?
- Is a lower-risk evaluation path available when appropriate?
- Does the evaluation path teach the transition to production instead of hiding it?

Google Cloud, for example, documents that its free-trial payment method is used for identity verification and fraud reduction and that its authorization request is a temporary hold rather than an actual charge. The useful diagnostic is therefore not merely `credit card required`; it is whether the requirement, purpose, consequence, and safe boundary are clear and workable for the intended developer.

### A playground is a conditional intervention

Do not add `no playground` as a universal blocker. A playground can help when the developer needs to inspect a request and response, test a capability without risky setup, or learn an interface before integration. A sandbox, test mode, local emulator, sample project, or guided API client may serve the same job better.

A playground can worsen the first mile when it:

- produces a result that cannot be reproduced in code;
- uses vendor-owned credentials, data, or permissions unavailable to the developer;
- hides authentication, billing, quotas, errors, asynchronous behavior, or production constraints;
- returns canned success that does not resemble representative use;
- becomes a separate interface whose examples and behavior drift from the actual product;
- proves capability but not fitness for the developer's job.

[Stripe's testing environments](https://docs.stripe.com/testing-use-cases) illustrate both sides: sandboxes support testing without real money movement, but access roles, isolated state, feature differences, and the transition to live mode remain part of the developer journey.

## Platform-specific blocker deltas

For a selected platform, apply the entire universal library above, then add the relevant deltas below. Apply more than one platform section when the first mile crosses surfaces, such as an SDK that deploys to a cloud and sends data to an observability product.

### P01. Application deployment platform

- P01.01 The platform cannot identify the application's language, framework, runtime, or build system.
- P01.02 Automatic detection chooses the wrong runtime or version.
- P01.03 The repository root, service subdirectory, workspace, or monorepo package is misidentified.
- P01.04 The default build command is wrong.
- P01.05 The default start command is wrong.
- P01.06 The application listens on the wrong interface or port.
- P01.07 The platform injects a port that the application ignores.
- P01.08 The application builds locally but not in the platform's build environment.
- P01.09 The build requires private packages, submodules, Git LFS objects, or credentials that are unavailable.
- P01.10 A container image builds but has the wrong architecture, entrypoint, user, filesystem, or health check.
- P01.11 The service starts but exits because a required dependency or environment variable is absent.
- P01.12 The service is healthy internally but unreachable through routing, DNS, TLS, or firewall configuration.
- P01.13 The first request arrives before startup or migration completes.
- P01.14 The service sleeps, cold-starts, or scales to zero, so first access looks broken.
- P01.15 Logs show application output but hide build, routing, health-check, or control-plane failures.
- P01.16 A failed deploy leaves the prior version live, so the developer verifies the wrong code.
- P01.17 Preview, staging, and production environments use different variables, domains, or dependencies.
- P01.18 A database, cache, queue, persistent disk, worker, or scheduled job is required before the web service can work.
- P01.19 The platform provisions dependent resources in an order the application cannot tolerate.
- P01.20 A migration runs concurrently, twice, too late, or with insufficient privilege.
- P01.21 Ephemeral filesystem behavior destroys generated or uploaded state.
- P01.22 Build and runtime regions are confused with resource or user regions.
- P01.23 The deploy succeeds but the developer cannot find the public URL or distinguish it from an internal URL.
- P01.24 A custom domain or certificate is treated as necessary before the generated endpoint is verified.
- P01.25 Rollback, redeploy, restart, and rebuild have unclear or overlapping meanings.

### P02. Infrastructure primitive

- P02.01 The developer cannot choose among overlapping compute, storage, network, DNS, CDN, secret, or messaging products.
- P02.02 The console asks for capacity, topology, durability, or consistency choices before the developer has workload evidence.
- P02.03 A resource is provisioned in a network, subnet, project, account, or region the workload cannot reach.
- P02.04 Identity and access policy syntax is more complex than the core resource operation.
- P02.05 A resource policy and an identity policy disagree.
- P02.06 Public access is disabled when the tutorial assumes it, or enabled when policy forbids it.
- P02.07 DNS, routing, peering, NAT, gateway, firewall, security-group, or load-balancer dependencies are missing.
- P02.08 The resource has a control-plane identifier but no usable data-plane endpoint.
- P02.09 The SDK defaults to a different account or region than the console.
- P02.10 Eventual consistency delays policy, DNS, route, or resource visibility.
- P02.11 Capacity, instance type, accelerator, IP address, or zone is unavailable.
- P02.12 The primitive requires another primitive before it can be tested.
- P02.13 Encryption keys, certificates, or secrets must be provisioned first.
- P02.14 The developer can create the resource but cannot observe consumption or verify durability.
- P02.15 Cleanup has dependency order, retention, snapshot, or protection constraints.
- P02.16 The tutorial hides recurring cost, data transfer, reserved capacity, or minimum-use behavior.
- P02.17 The resource is correct but the client library uses incompatible protocol, addressing, or signature settings.
- P02.18 Local emulators differ materially from the managed service.
- P02.19 Infrastructure-as-code state disagrees with resources created in the console.
- P02.20 Organization policy, service control policy, admission control, or quota blocks the documented configuration.

### P03. Database and data infrastructure

- P03.01 The developer chooses the wrong database, storage model, index, consistency level, or deployment mode.
- P03.02 The connection string points to the wrong instance, database, branch, schema, replica, or region.
- P03.03 Network allowlists, private networking, TLS, certificates, or client verification block the connection.
- P03.04 The client driver, ORM, protocol, or wire version is incompatible.
- P03.05 Password encoding, certificate formatting, connection-string parsing, or secret injection corrupts credentials.
- P03.06 The database exists but the user lacks schema, table, query, index, or data privileges.
- P03.07 Schema creation, migration, or seed order is wrong.
- P03.08 The ORM generates unsupported SQL or data types.
- P03.09 Time zones, collations, encodings, nulls, numeric precision, or case sensitivity change results.
- P03.10 The developer writes to a primary but reads from a lagging replica.
- P03.11 Indexing, ingestion, compaction, replication, or vector embedding is asynchronous and invisible.
- P03.12 The query works on sample data but not representative volume, distribution, or cardinality.
- P03.13 The developer cannot see query plans, slow operations, failed records, or dead letters.
- P03.14 Connection limits, pooling, transaction behavior, or idle timeouts cause intermittent failure.
- P03.15 Serverless wake-up or cold storage restore delays the first query.
- P03.16 A branch, clone, snapshot, or test database inherits unexpected data or permissions.
- P03.17 Import tooling rejects size, format, encoding, delimiter, schema, or compression.
- P03.18 Search analyzers, tokenizers, ranking, vector dimensions, or distance metrics are misconfigured.
- P03.19 Streaming offsets, partitions, consumer groups, ordering, or delivery semantics are misunderstood.
- P03.20 The developer can write and read data but cannot verify backup, recovery, retention, or deletion requirements.

### P04. API-as-a-product

- P04.01 The developer cannot distinguish public, partner, admin, data, regional, sandbox, and production APIs.
- P04.02 The base URL, version, region, environment, or tenant is wrong.
- P04.03 The authentication scheme is unclear or mismatched to the use case.
- P04.04 API keys, OAuth clients, service accounts, signed requests, or delegated identities are created with the wrong scope.
- P04.05 The sample request succeeds only with vendor-owned data or privileged credentials.
- P04.06 Required headers, idempotency keys, signatures, timestamps, nonces, content types, or user agents are missing.
- P04.07 The request body validates syntactically but violates an undocumented business rule.
- P04.08 Sandbox data, phone numbers, cards, identities, addresses, maps, inventory, or counterparties are unavailable.
- P04.09 The sandbox returns canned behavior that does not teach production behavior.
- P04.10 The operation is asynchronous but the quickstart treats the initial response as completion.
- P04.11 Webhook delivery, verification, ordering, retry, replay, or signature validation is not completed.
- P04.12 The developer cannot receive webhooks in a local or protected environment.
- P04.13 Rate limits, fraud controls, moderation, consent, carrier rules, or partner rules block the first realistic request.
- P04.14 The SDK serializes fields, dates, numbers, or enums differently from the reference.
- P04.15 Pagination, expansion, partial responses, or eventual consistency hides the created object.
- P04.16 An irreversible real-world action is too risky for the first attempt.
- P04.17 Repeated attempts create duplicate charges, messages, orders, users, or records.
- P04.18 The API returns transport success while the domain operation later fails.
- P04.19 The developer cannot reconcile request, event, and final domain state.
- P04.20 Production access requires review, certification, business verification, or a contract after the sandbox demo.

### P05. AI, model, and agent platform

- P05.01 The developer cannot choose a model, modality, endpoint, deployment, context length, or price-quality tier.
- P05.02 Model access is gated by region, waitlist, plan, safety review, or account verification.
- P05.03 A model name, alias, snapshot, capability, parameter, or endpoint has changed.
- P05.04 The SDK and REST API expose different model or tool behavior.
- P05.05 The first request exceeds token, file, image, audio, batch, or context limits.
- P05.06 The developer cannot estimate or cap inference cost.
- P05.07 Cold starts, model loading, queueing, or accelerator capacity exceed timeouts.
- P05.08 The model returns plausible but unusable output, and the quickstart counts any output as success.
- P05.09 The developer lacks a representative test set or acceptance criterion.
- P05.10 Non-determinism makes a working example fail intermittently.
- P05.11 Temperature, seed, system instruction, tool schema, response format, or sampling defaults change behavior.
- P05.12 Safety, moderation, copyright, abuse, or policy filters reject the representative input or output.
- P05.13 Structured output is invalid, truncated, or inconsistent with the declared schema.
- P05.14 Streaming output is handled incorrectly.
- P05.15 Tool calling selects the wrong tool, emits invalid arguments, loops, or claims completion without effect.
- P05.16 The agent lacks credentials, permissions, browser state, filesystem context, or network access needed to act.
- P05.17 The agent acts beyond the developer's approval or authority boundary.
- P05.18 Retrieval ingests the wrong documents, fails to index, chunks poorly, or returns irrelevant context.
- P05.19 Embedding models, vector dimensions, similarity settings, or document versions do not match.
- P05.20 Tracing, evaluation, prompt versions, model versions, and tool results cannot be correlated.
- P05.21 A hosted playground result cannot be reproduced in code.
- P05.22 Fine-tuning or customization requires more data, labeling, time, or expertise than expected.
- P05.23 The developer cannot determine whether failure comes from model, prompt, retrieval, tool, orchestration, data, or application code.
- P05.24 Data-use, retention, residency, training, and privacy terms block representative inputs.
- P05.25 The first result is impressive but does not survive the developer's real latency, cost, quality, safety, or reliability constraints.

### P06. Framework, library, language, runtime, or SDK

- P06.01 The package name collides with another package or unofficial fork.
- P06.02 The framework, language, runtime, compiler, SDK, and example versions are incompatible.
- P06.03 Project scaffolding chooses the wrong package manager, module system, rendering mode, target, or template.
- P06.04 The starter compiles but hot reload, routing, assets, environment variables, or build output fails.
- P06.05 The library's peer dependencies conflict with the existing application.
- P06.06 The library assumes global state, a runtime capability, or a hosting environment the application does not have.
- P06.07 Tree shaking, bundling, transpilation, code generation, or native linking removes or breaks needed behavior.
- P06.08 Type definitions, generated clients, runtime behavior, and documentation disagree.
- P06.09 The core abstraction is easy in a new app but invasive in an existing app.
- P06.10 The example hides required lifecycle, cleanup, concurrency, error, or state-management behavior.
- P06.11 The developer cannot tell which API is stable, experimental, deprecated, internal, or generated.
- P06.12 The library works locally but fails in server-side rendering, edge, mobile, browser, worker, or embedded contexts.
- P06.13 The framework imposes a directory, routing, build, data, or deployment convention that conflicts with the repository.
- P06.14 The error originates in macros, code generation, reflection, decorators, build plugins, or generated files the developer cannot inspect.
- P06.15 An upgrade requires a codemod, migration guide, compatibility layer, or broad refactor.
- P06.16 The developer cannot produce a minimal reproduction without removing the condition that causes failure.
- P06.17 The package is maintained but an essential plugin, adapter, or integration is not.
- P06.18 The first example proves syntax but not interoperability with the developer's stack.

### P07. Open-source project or protocol implementation

- P07.01 The project has several repositories, distributions, forks, editions, or governance bodies.
- P07.02 The README is optimized for contributors, maintainers, or existing users instead of first adoption.
- P07.03 Installation depends on unreleased commits, nightly builds, system packages, or manual compilation.
- P07.04 The default branch, latest release, package registry, container image, and docs represent different states.
- P07.05 The project requires infrastructure or domain knowledge not stated as a prerequisite.
- P07.06 Configuration examples assume maintainer knowledge or a particular deployment environment.
- P07.07 The project lacks a small supported production shape between hello world and a complex reference architecture.
- P07.08 The developer cannot tell which integrations, plugins, or extensions are official or maintained.
- P07.09 An issue already exists but is stale, locked, fragmented, or missing a workaround.
- P07.10 Maintainer capacity is low and response expectations are unclear.
- P07.11 Governance, roadmap, support, security reporting, or release cadence is unclear.
- P07.12 The license, CLA, DCO, patent grant, trademark policy, or dependency licenses block adoption or contribution.
- P07.13 The code of conduct exists but community behavior undermines it.
- P07.14 The contributor setup is more complex than the user setup.
- P07.15 Local tests require hidden services, credentials, fixtures, hardware, or large datasets.
- P07.16 CI differs from documented local checks.
- P07.17 Contribution guidelines do not explain scope, design approval, review expectations, or maintainer priorities.
- P07.18 A technically correct contribution is rejected because it conflicts with unstated architecture or roadmap.
- P07.19 The project depends on one maintainer, sponsor, or vendor whose incentives are uncertain.
- P07.20 The developer can run the project but cannot operate, upgrade, secure, or migrate it confidently.

### P08. Developer tool, CLI, IDE, coding agent, or local environment

- P08.01 The installer modifies shell, PATH, editor, runtime, certificate, or package-manager state unexpectedly.
- P08.02 The executable installed is not the executable invoked.
- P08.03 The tool requires an interactive terminal, graphical session, extension host, or background daemon unavailable in the environment.
- P08.04 The tool cannot open the repository because of size, permissions, symlinks, worktrees, submodules, or unsupported version control.
- P08.05 Project detection chooses the wrong root, language, build system, workspace, or environment.
- P08.06 Indexing, analysis, or environment creation takes too long or never visibly completes.
- P08.07 The tool conflicts with existing formatters, linters, language servers, extensions, hooks, aliases, or agents.
- P08.08 The tool generates a large diff before demonstrating value.
- P08.09 The generated diff changes behavior outside the named task.
- P08.10 The developer cannot preview, explain, selectively accept, undo, or reproduce the tool's changes.
- P08.11 The tool requires repository, code, telemetry, or command access the developer cannot grant.
- P08.12 Local, remote, containerized, and cloud workspaces expose different filesystem or process boundaries.
- P08.13 A CLI command succeeds but applies to the wrong profile, project, cluster, account, or environment.
- P08.14 The IDE extension and CLI use different configuration or authentication.
- P08.15 A coding agent cannot run tests, access dependencies, see UI state, or obtain needed approvals.
- P08.16 The tool reports task completion based on generated text or exit status instead of observed behavior.
- P08.17 The developer distrusts telemetry, code upload, prompt retention, or remote execution.
- P08.18 Uninstalling the tool does not restore the prior environment.
- P08.19 The tool's first-run model download, index, container, or cache exceeds storage or network policy.
- P08.20 The developer's real repository is too sensitive, unusual, large, or old for the polished demo path.

### P09. Source control, CI/CD, build, release, and automation

- P09.01 The platform cannot access the repository, organization, branch, fork, submodule, or private dependency.
- P09.02 The source-control app is installed with the wrong repositories or permissions.
- P09.03 Fork security prevents secrets or privileged steps from running.
- P09.04 The pipeline file is in the wrong path, syntax, branch, or version.
- P09.05 Trigger rules, path filters, schedules, tags, approvals, or default branches prevent execution.
- P09.06 The runner image, architecture, operating system, shell, or toolchain differs from local development.
- P09.07 Caches restore incompatible or stale state.
- P09.08 Artifacts are not passed between jobs, stages, workflows, or environments.
- P09.09 Secrets, variables, environments, contexts, and protected settings have different scopes.
- P09.10 A required secret is unavailable to pull requests, forks, previews, or untrusted branches.
- P09.11 Build, test, deploy, and release status are distributed across several interfaces.
- P09.12 Logs are folded, truncated, redacted, delayed, or lost after cancellation.
- P09.13 Concurrency, queue, minute, storage, artifact, or retention limits block the first run.
- P09.14 A flaky test, shared environment, or nondeterministic dependency makes the platform look broken.
- P09.15 The pipeline deploys the wrong commit, artifact, tag, environment, or account.
- P09.16 The pipeline reports success before deployment health or user-visible behavior is verified.
- P09.17 Environment protection requires an approver who is unavailable.
- P09.18 The first successful pipeline cannot be safely rerun, promoted, or rolled back.
- P09.19 Generated starter pipelines embed vendor, language, or architecture assumptions.
- P09.20 Local reproduction requires a runner environment the developer cannot access.

### P10. Observability, testing, reliability, quality, or security

- P10.01 The developer does not know which service, process, repository, environment, or account to instrument or scan first.
- P10.02 The selected integration targets the wrong language, framework, runtime, agent, collector, or deployment model.
- P10.03 Instrumentation initializes too late, in the wrong process, or only on some execution paths.
- P10.04 Agents, collectors, sidecars, hooks, test adapters, or scanners cannot run with available privileges.
- P10.05 Network egress, certificates, proxies, sampling, or firewalls prevent telemetry or results from arriving.
- P10.06 Service, environment, release, user, trace, repository, or commit metadata is missing or inconsistent.
- P10.07 Data arrives in the wrong project, account, region, index, dashboard, or time range.
- P10.08 Time zones, clock skew, batching, buffering, or ingestion delay make the known event hard to find.
- P10.09 Sampling drops the one event used for verification.
- P10.10 Default dashboards, alerts, rules, or tests do not match the instrumented system.
- P10.11 The developer cannot distinguish no signal from no event, broken instrumentation, or a query mistake.
- P10.12 The seeded failure, vulnerability, test, or alert is optimized away or blocked by environment differences.
- P10.13 The platform produces too much noise before showing one useful signal.
- P10.14 Sensitive data is captured unexpectedly, forcing the developer to stop.
- P10.15 A security scanner flags dependencies or generated files without actionable reachability or ownership context.
- P10.16 Test discovery, fixtures, browsers, devices, services, or data are missing in the first environment.
- P10.17 The platform finds a real issue but remediation requires another team or paid feature.
- P10.18 The developer cannot connect the finding to source code, request, deploy, owner, or next action.
- P10.19 Observability overhead, test duration, scan duration, or false positives exceed tolerance.
- P10.20 The example verifies ingestion or scan completion, not whether the developer can diagnose or decide.

### P11. Integration, automation, plugin, extension, and marketplace

- P11.01 The developer cannot determine which side owns authentication, schema, retries, state, or support.
- P11.02 One system supports OAuth while the other requires API keys, service accounts, or administrator consent.
- P11.03 The developer can authenticate each system separately but cannot authorize the cross-system operation.
- P11.04 Trigger and action schemas use incompatible types, identifiers, units, time zones, or null semantics.
- P11.05 Field mapping is incomplete, lossy, ambiguous, or changes over time.
- P11.06 A test event differs from a real event.
- P11.07 The source system cannot replay the event needed for testing.
- P11.08 Polling, webhook, queue, and scheduled semantics are confused.
- P11.09 Duplicate, missing, reordered, delayed, or retried events create unexpected state.
- P11.10 The automation reports success after dispatch rather than after the destination state changes.
- P11.11 One system's sandbox cannot connect to the other's production or sandbox environment.
- P11.12 The developer cannot inspect the raw event, transformed payload, request, response, and final state together.
- P11.13 Extension manifests, permissions, signing, packaging, or review rules are unclear.
- P11.14 Local extension testing does not match installed behavior.
- P11.15 Marketplace validation rejects branding, privacy, security, support, billing, or documentation details after technical work succeeds.
- P11.16 Partner approval, certification, or listing requires a business relationship.
- P11.17 Platform policy forbids the intended trigger, data, automation, or monetization model.
- P11.18 Ownership is split between platform, integration vendor, app developer, and customer administrator.
- P11.19 Versioning on either side silently breaks the connector.
- P11.20 The first connected flow works only for the developer's account, not another tenant or collaborator.

### P12. Mobile, desktop, OS, browser, hardware, edge, or IoT

- P12.01 The developer lacks the required operating system, device, board, chip, sensor, cable, adapter, or simulator.
- P12.02 The host and target architectures, operating systems, SDKs, drivers, firmware, or toolchains are incompatible.
- P12.03 Device drivers, USB permissions, kernel extensions, certificates, or developer modes are missing.
- P12.04 The emulator or simulator does not reproduce the capability being tested.
- P12.05 Code signing, provisioning profiles, certificates, package identifiers, entitlements, or developer accounts are invalid.
- P12.06 App-store, browser-store, device-management, or enterprise-distribution policy blocks installation.
- P12.07 The target device is offline, asleep, paired to another host, locked, or on another network.
- P12.08 Serial, Bluetooth, NFC, USB, local-network, radio, or discovery permissions are denied or unexplained.
- P12.09 Hardware revision, firmware version, bootloader, or board definition differs from the tutorial.
- P12.10 Flashing, firmware update, or provisioning partially succeeds and leaves the device in an unknown state.
- P12.11 The developer lacks a recovery, reset, safe mode, or known-good image.
- P12.12 Native permissions, background execution, notifications, location, camera, microphone, or sensor access behave differently by OS version.
- P12.13 Browser security, extensions, content blockers, cross-origin policy, or storage restrictions break the path.
- P12.14 Desktop sandboxing, notarization, antivirus, or application permissions block execution.
- P12.15 The device can run the sample but cannot connect to the developer's local or cloud service.
- P12.16 Power, thermal, memory, storage, bandwidth, or intermittent-connectivity limits invalidate the example.
- P12.17 Debug logs are inaccessible on the target.
- P12.18 The first run requires physical access or administrator control the developer does not have.
- P12.19 The developer cannot reproduce behavior across representative devices, OS versions, browsers, or hardware revisions.
- P12.20 Certification or store review becomes a hidden part of the first meaningful shipment.

### P13. Web3, blockchain, wallet, or decentralized protocol

- P13.01 The developer chooses the wrong chain, network, rollup, testnet, RPC endpoint, fork, or protocol version.
- P13.02 The wallet is connected to a different network or account than the application.
- P13.03 Test tokens, gas, faucet access, or bridge liquidity are unavailable.
- P13.04 Faucets rate-limit, geo-block, require social identity, or send assets on the wrong network.
- P13.05 RPC providers disagree, lag, prune data, rate-limit, or require unsupported methods.
- P13.06 Chain IDs, addresses, decimals, units, ABIs, contract versions, or deployment addresses are wrong.
- P13.07 The contract deploys but constructor state, permissions, ownership, or upgrade configuration is wrong.
- P13.08 A transaction is submitted but not included, finalized, indexed, or visible in the expected explorer.
- P13.09 Nonces, replacement transactions, fees, gas estimation, reorgs, or mempool behavior confuse the result.
- P13.10 The wallet hides, rejects, or ambiguously describes the signature or transaction.
- P13.11 Browser wallet injection, mobile deep links, hardware wallets, and server-side signing require different flows.
- P13.12 The developer exposes or loses a seed phrase, private key, signer, or privileged contract role.
- P13.13 Testnet behavior, liquidity, timing, assets, or services differ materially from mainnet.
- P13.14 Indexers, subgraphs, explorers, or event consumers lag behind finalized state.
- P13.15 A cross-chain bridge or oracle adds another trust and failure boundary.
- P13.16 Smart-contract errors are opaque, irreversible, or expensive to retry.
- P13.17 Audits, formal verification, governance, multisig, or upgrade review are required before a meaningful real deployment.
- P13.18 The developer cannot explain custody, finality, fees, compliance, or user recovery to stakeholders.
- P13.19 Protocol documentation assumes economic, cryptographic, or distributed-systems knowledge.
- P13.20 The first transaction works, but the developer cannot safely handle failure, reorg, replay, compromise, or key rotation.

### P14. Internal developer platform or paved road

- P14.01 The platform is discoverable only through tribal knowledge.
- P14.02 The internal developer does not know whether the paved road applies to the service, language, risk class, or team.
- P14.03 The golden path reflects a greenfield service while the developer owns a legacy or unusual system.
- P14.04 The service catalog, repository template, infrastructure module, CI template, docs, and policy version are out of sync.
- P14.05 The developer lacks access to the portal, source-control organization, cloud account, cluster, registry, or secrets system.
- P14.06 Required ownership, cost center, data classification, support tier, or risk metadata is unknown.
- P14.07 Provisioning triggers several approval queues with no unified status.
- P14.08 The platform's abstraction leaks cloud, Kubernetes, networking, IAM, or organizational details unexpectedly.
- P14.09 The platform hides those details so completely that the developer cannot diagnose failure.
- P14.10 The template generates code or infrastructure the team does not understand or want to own.
- P14.11 The default service shape conflicts with architecture, language, security, or team conventions.
- P14.12 A central platform change breaks old templates or existing services.
- P14.13 Local development and the internal platform have incompatible assumptions.
- P14.14 The developer can scaffold a service but cannot obtain realistic dependencies or data.
- P14.15 Deployment succeeds but ownership, alerts, logs, runbooks, cost allocation, or on-call registration is missing.
- P14.16 Policy checks reject the service without naming a fix or owning team.
- P14.17 Exception paths exist but are undocumented, political, or slow.
- P14.18 Platform support is organized around team boundaries rather than the developer's end-to-end job.
- P14.19 Adoption is mandated, so funnel completion hides workarounds, resentment, and shadow infrastructure.
- P14.20 The platform team optimizes portal activity while developers still complete the real job through tickets and manual handoffs.

### P15. Low-code, no-code, workflow, or visual application platform

- P15.01 The developer or builder cannot tell when to use a template, visual step, expression, code block, connector, or custom component.
- P15.02 The template looks complete but contains hidden placeholder connections, data, or credentials.
- P15.03 Drag-and-drop order does not match execution order.
- P15.04 Data types are inferred incorrectly or coerced silently.
- P15.05 Formula, expression, or scripting syntax is unique to the platform and poorly surfaced.
- P15.06 A connector exposes friendly labels but hides the underlying API's required semantics.
- P15.07 Test mode uses sample data, cached data, or the builder's identity instead of real runtime conditions.
- P15.08 The builder cannot inspect raw input, intermediate state, branch decisions, retries, and output.
- P15.09 The workflow succeeds for one record but fails on collections, empty values, concurrency, or volume.
- P15.10 Publishing changes permissions, URLs, credentials, schedules, or runtime behavior.
- P15.11 The builder can run the app but cannot share it with the intended user or tenant.
- P15.12 Collaboration causes overwrites, version conflicts, or unclear ownership.
- P15.13 Export, version control, testing, review, rollback, and environment promotion are limited or absent.
- P15.14 The platform's abstraction reaches a ceiling before the representative job is complete.
- P15.15 Escaping to custom code removes the safety and simplicity promised by the platform.
- P15.16 Seat, run, connector, task, record, or premium-feature limits appear only after the flow is built.
- P15.17 Accessibility of the builder or generated application is inadequate.
- P15.18 The first automation works but creates an invisible operational dependency no team owns.

### P16. SaaS product with a developer surface

- P16.01 The developer documentation describes a product edition, tenant type, or admin model different from the developer's account.
- P16.02 The API, webhook, SDK, app platform, and marketplace use different authentication and permission models.
- P16.03 An organization administrator must enable developer access or approve the app.
- P16.04 The developer cannot create a realistic sandbox tenant or seed representative SaaS data.
- P16.05 Sandbox and production tenants expose different features, scopes, policies, or data models.
- P16.06 User, organization, workspace, project, and resource identifiers are confused.
- P16.07 The API exposes only part of the action available in the end-user UI.
- P16.08 The UI performs hidden orchestration that the API consumer must recreate.
- P16.09 Webhook events are missing, duplicated, reordered, delayed, versioned, or hard to replay.
- P16.10 App installation succeeds for the developer but not another organization, role, region, or plan.
- P16.11 OAuth review, domain verification, partner approval, security review, or marketplace review blocks distribution.
- P16.12 The integration must support several tenant configurations before any customer can use it.
- P16.13 Rate limits and pagination reflect enterprise data volume even during the first representative sync.
- P16.14 Data deletion, consent, retention, and tenant isolation responsibilities are unclear.
- P16.15 The developer cannot safely test write actions in a tenant that resembles production.
- P16.16 The SaaS vendor's release changes fields, events, scopes, or workflows without a migration path.
- P16.17 Support ownership is ambiguous between the SaaS vendor, app developer, administrator, and end user.
- P16.18 The first API call works, but a useful app requires UI embedding, lifecycle events, billing, installation, and support behavior.

## Cross-platform conditions that can invalidate any neat taxonomy

- The developer is moving through several platform types in one attempt.
- The platform exposes different first miles by language, framework, region, plan, industry, or company size.
- The evaluator, adopter, administrator, operator, payer, and end user are different people.
- The developer succeeds only with employee, partner, consultant, or support assistance.
- The first mile changes after a launch, incident, pricing change, version change, acquisition, policy change, or organizational reorganization.
- The public path differs from the enterprise, partner, marketplace, managed-service, open-source, or internal path.
- The same observed drop can have different causes for different cohorts.
- Several small frictions combine into abandonment even though no single blocker is decisive.
- One upstream blocker prevents later blockers from becoming observable.
- A workaround creates apparent success while moving cost or risk to another team.
- The developer reaches the milestone but decides the platform is not a fit. That can be a successful evaluation first mile, not an onboarding failure.
- The developer does not reach the milestone because the platform correctly blocks an unsafe, unauthorized, illegal, or unsupported action.
- The platform cannot remove the blocker alone because the cause belongs to the developer's organization, ecosystem, network, regulation, or another vendor.
- The platform could remove the blocker but doing so would weaken security, reliability, sustainability, accessibility, or informed consent.
- The blocker is real but rare, and a more frequent blocker deserves the next intervention.
- The blocker is frequent but low consequence, while a rarer blocker stops a strategically important cohort.
- The evidence describes what happened but not why.
- The developer's stated reason is a rationalization, shorthand, or downstream symptom.
- The team has evidence of a cause but not evidence that the proposed intervention changes the outcome.

## Compact workshop use

1. Choose one platform archetype and one developer journey.
2. Complete the first-mile sentence with a developer, meaningful action, representative constraint, and verification signal.
3. Mark the universal and platform-specific blocker IDs that could plausibly stop that exact transition.
4. For each marked reason, write the smallest observation that would distinguish it from the nearest alternative.
5. Route only the smallest supported intervention. If evidence cannot distinguish causes, route to investigation.
