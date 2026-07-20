# Measurement contract (v1.0)

This file defines the units of analysis for the dataset. Every derived artifact
(`ds-quality.json`, `selected-path-heuristic.json`) implements these definitions
through `lib/measure.mjs`. If you analyze the data, read this first.

The dataset is a set of **reconstructed documented journeys**. It is not user
telemetry, not measured conversion, not activation rates, and not observed
time-to-success. Treat every number here as a description of documentation, not of
real developer behavior.

## Unit of analysis

> One platform, one selected surface, one documented route, one research snapshot.

A record is research-complete when it describes a committed route to an observable
terminal. Research-complete does **not** mean globally canonical or directly
comparable to every other record. Comparability is a separate, per-record judgment
recorded in `ds-quality.json`.

## Measurements

These are computed from structured fields (`actor`, `phase`, `interface`,
`required`, `friction_gates[].type`) wherever possible. Free-text regex is a
fallback, and every regex match stores its evidence in `detector_matches`.

### Raw transition

Every object in `primary_path`. This is `raw_transition_count`. It mixes developer
actions, platform events, waits, and the terminal outcome. **Do not use raw
transition count as a difficulty or effort score.**

### Developer action

A transition whose `actor` is `developer` or `administrator`: intentional work the
developer performs. This is `developer_action_count`.

Examples: create an account, authorize GitHub, enter configuration, run a command,
open a deployed application.

By construction:

```
developer_action_count + platform_event_count == raw_transition_count
```

### Documentation navigation

A transition whose `interface` is `documentation` (`documentation_navigation_count`).
Reported separately because opening or reading docs is not a product action. It is
an **overlay**: a subset of developer actions, not a third partition.

### Decision

A step targeted by a friction gate of type `choice` (`decision_count`): a route or
configuration choice such as selecting a service type or deployment method. Overlay
on developer actions.

### Platform event

A transition whose `actor` is `platform`, `system`, or `external-system`
(`platform_event_count`): an automatic system response to a previous developer
action.

Examples: the platform starts a build, provisions an instance, marks a deploy Live,
or returns the terminal response. **Platform events are never counted as developer
actions.**

### Wait or asynchronous dependency

A distinct step in a `wait` phase or targeted by a `wait` friction gate
(`wait_or_async_count`): progress depends on provisioning, deployment, email
delivery, approval, review, or another asynchronous event. Overlay.

### Terminal outcome

The observable completion signal, recorded in
`documented_first_success.observable_completion_signal` and
`boundary_evidence`. The terminal is **not** an extra developer action just because
the platform produces it after the final action. `boundary_evidence.type` records
how strong the terminal evidence is:

- `explicitly-named`: the docs name the milestone.
- `demonstrated-terminal-state`: the docs demonstrate the end state without naming a
  milestone.
- `not-established-by-docs`: the docs do not establish a terminal (not allowed on a
  `complete` record).

A `complete` record's selected-route success fields must describe this terminal
affirmatively. Platform-wide ambiguity belongs in `surface.selection_basis`,
`surface.alternatives_considered`, and `uncertainties`, never in the success fields.

### Required vs optional actions

`required_developer_action_count` and `optional_developer_action_count` split
developer actions by the step's `required` flag. Keep them separate; an optional
step is not the same commitment as a required one.

## High-level task counts require a normalization rule

Step granularity differs by record. Some records split individual form fields into
separate steps; others fold an entire setup flow into one step. Re-researched
records (present in `research/*.json`) tend to be more compact than canonical
records. Because of this:

> A high-level "how many tasks" count cannot be inferred safely from raw path
> length alone. Any cross-platform task comparison needs an explicit normalization
> rule and should filter on `ds-quality.json` (`re_researched`, `execution_environment`,
> `starting_state`, `non_atomic_step_count`) first.

## Worked example: Render

From the current `render.json`:

| measurement | value |
|---|---:|
| raw_transition_count | 25 |
| developer_action_count | 21 |
| required_developer_action_count | 20 |
| optional_developer_action_count | 1 |
| platform_event_count | 4 |

The analysis layer must not present 25 as "25 actions required from the developer."
Four of the 25 transitions are platform events (Render creates the service, runs the
build, marks the deploy Live, serves the response). One developer action is optional
(environment variables). The required developer work is 20 steps.
